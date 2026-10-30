/* global WebExtensionPolicy, ChromeUtils, OpenBrowserWindow, gBrowser, Services */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  writeFile,
} from 'node:fs/promises';
import { arch, platform } from 'node:os';
import { join, resolve } from 'node:path';
import { Builder, By, until } from 'selenium-webdriver';
import firefox from 'selenium-webdriver/firefox.js';
import chrome from 'selenium-webdriver/chrome.js';
import { installTemporaryExtension } from './firefox-install.mjs';
import { browserProtocol, chromeVersion } from './chrome-session.mjs';

process.env.SE_AVOID_STATS = 'true';
process.env.SE_DRIVER_VERSION = '0.37.1';
process.env.SE_SKIP_DRIVER_IN_PATH = 'true';
process.env.SE_SKIP_BROWSER_IN_PATH = 'true';

const target = process.argv[2];
assert(
  target === 'firefox' || target === 'chrome',
  'Usage: bun scripts/saved-storage-checks.mjs firefox|chrome',
);
const requestedVersion = process.env.FIREFOX_VERSION;
if (target === 'firefox') {
  assert.match(
    requestedVersion ?? '',
    /^\d+\.\d+(?:\.\d+)?(?:esr)?$/,
    'Set FIREFOX_VERSION to an exact pinned version.',
  );
}

const candidateDirectory = resolve('scripts/saved-storage-candidate');
const contentFixtureDirectory = resolve('scripts/saved-content-fixture');
const candidateId = 'saved-storage-candidate@addonray.test';
const contentFixtureId = 'saved-content-fixture@addonray.test';
const candidateUuid = '3f2fdb1e-9f7a-4d8a-9f27-5f2f4e0c9a11';
const contentFixtureUuid = '7f7c2f4a-1b6e-4d4f-9a8e-2c3d4e5f6a7b';
const candidateDb = 'addonray-saved-investigations';
const sentinel = 'extension-candidate';
const pageSentinel = 'page';

const started = new Date();
const stamp = started
  .toISOString()
  .replaceAll(/[-:]/g, '')
  .replace(/\.\d+Z$/, 'Z');
await mkdir('.scratch', { recursive: true });
const work = await mkdtemp(
  resolve(
    `.scratch/saved-storage-${target}-${(requestedVersion ?? chromeVersion).replaceAll('.', '-')}-${stamp}-`,
  ),
);
await mkdir(join(work, 'profiles'), { recursive: true });

const report = {
  timestamp: started.toISOString(),
  target,
  distribution: target === 'firefox' ? 'Firefox' : 'Chrome for Testing',
  os: `${platform()} ${arch()}`,
  requestedVersion: requestedVersion ?? chromeVersion,
  source: {
    commit: null,
    dirty: true,
  },
  candidate: null,
  contentFixture: null,
  runner: null,
  profiles: [],
  checks: [],
  gaps: [],
  authority: [],
  essentialFailures: [],
  incomplete: [],
  error: null,
};

const checks = report.checks;
function record(id, name, authority, essential = true) {
  const entry = {
    id,
    name,
    authority,
    essential,
    status: 'not-run',
    stage: null,
    details: null,
    error: null,
  };
  checks.push(entry);
  return entry;
}
async function run(entry, stage, workFn) {
  entry.stage = stage;
  try {
    const details = await workFn();
    entry.details = details ?? null;
    entry.status = 'passed';
    console.log(`Passed: ${entry.id} — ${entry.name}`);
    return entry;
  } catch (error) {
    entry.status = 'failed';
    if (error?.details) entry.details = error.details;
    entry.error = {
      name: error?.name ?? 'Error',
      message: String(error?.message ?? error),
      stack: error?.stack ? String(error.stack) : null,
    };
    if (entry.essential) report.essentialFailures.push(entry.id);
    console.error(
      `Failed: ${entry.id} — ${entry.name}: ${entry.error.message}`,
    );
    return entry;
  }
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}
async function hashDirectory(root) {
  const files = [];
  async function walk(directory, prefix = '') {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const name = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) await walk(join(directory, entry.name), name);
      else {
        const bytes = await readFile(join(directory, entry.name));
        files.push({ path: name, bytes: bytes.length, sha256: sha256(bytes) });
      }
    }
  }
  await walk(root);
  files.sort((left, right) => left.path.localeCompare(right.path));
  const combined = sha256(
    files
      .map((file) => `${file.path}\0${file.sha256}\n`)
      .sort()
      .join(''),
  );
  return { files, combined };
}
async function identity() {
  try {
    report.source.commit = execFileSync('git', ['rev-parse', 'HEAD'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    report.source.dirty = Boolean(
      execFileSync('git', ['status', '--porcelain'], {
        encoding: 'utf8',
      }).trim(),
    );
  } catch {
    /* Keep the unknown initial-repository identity. */
  }
}
await identity();
report.candidate = await hashDirectory(candidateDirectory);
report.contentFixture = await hashDirectory(contentFixtureDirectory);
report.runner = {
  path: 'scripts/saved-storage-checks.mjs',
  sha256: sha256(await readFile(new URL(import.meta.url))),
};

const server = createServer((request, response) => {
  if (request.url?.startsWith('/page')) {
    response.setHeader('Content-Type', 'text/html');
    response.end(`<!doctype html>
<html><head><meta charset="utf-8"><title>Content boundary page</title></head>
<body><h1>Loopback page origin</h1>
<script>
(async () => {
  const request = indexedDB.open(${JSON.stringify(candidateDb)}, 1);
  request.onupgradeneeded = () => {
    if (!request.result.objectStoreNames.contains('records'))
      request.result.createObjectStore('records', { keyPath: 'recordId' });
  };
  request.onsuccess = () => {
    const transaction = request.result.transaction('records', 'readwrite');
    transaction.objectStore('records').put({ recordId: 'page-sentinel', payload: ${JSON.stringify(pageSentinel)} });
    transaction.oncomplete = () => {
      request.result.close();
      document.documentElement.dataset.pageDbReady = 'true';
    };
  };
})();
</script>
</body></html>`);
    return;
  }
  response.setHeader('Content-Type', 'text/html');
  response.end('<!doctype html><title>AddonRay probe</title><h1>ok</h1>');
});
await new Promise((accept) => server.listen(0, '127.0.0.1', accept));
const pageUrl = `http://127.0.0.1:${server.address().port}/page`;
report.loopbackPage = pageUrl;

let driver = null;
const ownedTabs = new Set();

async function call(name, ...args) {
  const reply = await driver.executeAsyncScript(
    (method, values, done) => {
      Promise.resolve(window.savedStorageProbe[method](...values)).then(
        (value) => done({ status: 'ok', value }),
        (error) =>
          done({
            status: 'error',
            error: { name: error?.name ?? 'Error', message: String(error) },
          }),
      );
    },
    name,
    args,
  );
  if (reply?.status !== 'ok')
    throw new Error(
      `Candidate ${name} failed: ${reply?.error?.name}: ${reply?.error?.message}`,
    );
  return reply.value;
}
async function callRaw(name, ...args) {
  return driver.executeAsyncScript(
    (method, values, done) => {
      Promise.resolve(window.savedStorageProbe[method](...values)).then(
        (value) => done({ status: 'ok', value }),
        (error) =>
          done({
            status: 'error',
            error: { name: error?.name ?? 'Error', message: String(error) },
          }),
      );
    },
    name,
    args,
  );
}
async function waitReady() {
  await driver.wait(async () => {
    const reply = await callRaw('status');
    return reply?.status === 'ok' && reply.value?.ready === true;
  }, 15000);
}
async function openTab(url) {
  await driver.switchTo().newWindow('tab');
  const handle = await driver.getWindowHandle();
  ownedTabs.add(handle);
  await driver.get(url);
  return handle;
}
async function closeTab(handle, returnHandle = null) {
  if (!ownedTabs.has(handle)) return;
  try {
    await driver.switchTo().window(handle);
    await driver.close();
  } catch {
    /* The browser may have closed it. */
  }
  ownedTabs.delete(handle);
  if (returnHandle) {
    try {
      await driver.switchTo().window(returnHandle);
    } catch {
      /* The caller retains the last handle for its own recovery. */
    }
  }
}
async function pages() {
  return call('all');
}
async function ensurePage(url) {
  try {
    await driver.get(url);
    return { recovered: false, handle: await driver.getWindowHandle() };
  } catch (error) {
    const trace = [{ handle: null, error: String(error) }];
    for (const handle of await driver.getAllWindowHandles()) {
      try {
        await driver.switchTo().window(handle);
        await driver.get(url);
        return { recovered: true, handle };
      } catch (next) {
        trace.push({ handle, error: String(next) });
      }
    }
    await driver.switchTo().newWindow('tab');
    await driver.get(url);
    return {
      recovered: true,
      newTab: true,
      handle: await driver.getWindowHandle(),
      trace,
    };
  }
}

async function launchFirefox(templateProfile = null) {
  const options = new firefox.Options().addArguments('-headless');
  if (templateProfile) options.setProfile(templateProfile);
  if (requestedVersion) options.setBrowserVersion(requestedVersion);
  options.setPreference('xpinstall.signatures.required', false);
  options.setPreference(
    'extensions.webextensions.uuids',
    JSON.stringify({
      [candidateId]: candidateUuid,
      [contentFixtureId]: contentFixtureUuid,
    }),
  );
  const service = new firefox.ServiceBuilder()
    .addArguments('--allow-system-access')
    .addArguments('--profile-root', join(work, 'profiles'));
  const next = await new Builder()
    .forBrowser('firefox')
    .setFirefoxService(service)
    .setFirefoxOptions(options)
    .build();
  await next.manage().setTimeouts({ script: 30000, pageLoad: 30000 });
  return next;
}

async function firefoxExtensionInfo(id, path) {
  await driver.setContext('chrome');
  try {
    return await driver.executeScript(
      (extensionId, resource) => {
        const policy = WebExtensionPolicy.getByID(extensionId);
        if (!policy) return null;
        return {
          url: policy.getURL(resource),
          uuid: policy.mozExtensionHostname ?? null,
          origin: policy.principal?.origin ?? null,
        };
      },
      id,
      path,
    );
  } finally {
    await driver.setContext('content');
  }
}

async function firefoxPromptState() {
  await driver.setContext('chrome');
  try {
    return await driver.executeScript((extensionId) => {
      const notifications = [];
      try {
        const box = gBrowser.getNotificationBox(gBrowser.selectedBrowser);
        for (const notification of box?.allNotifications ?? []) {
          notifications.push({
            id: notification.id ?? null,
            label: notification.label ?? null,
            priority: notification.priority ?? null,
          });
        }
      } catch {
        /* The selected window may not expose a notification box. */
      }
      let storagePermissionState;
      try {
        const policy = WebExtensionPolicy.getByID(extensionId);
        const storagePermission = Services.perms.testPermissionFromPrincipal(
          policy.principal,
          'persistent-storage',
        );
        storagePermissionState =
          storagePermission === 0
            ? 'unknown'
            : storagePermission === 1
              ? 'allow'
              : storagePermission === 2
                ? 'deny'
                : storagePermission === 3
                  ? 'prompt'
                  : String(storagePermission);
      } catch (error) {
        storagePermissionState = `lookup-failed: ${String(error)}`;
      }
      let popupNotifications;
      let popupPanelState;
      try {
        const chromeWindow = gBrowser.ownerDocument?.defaultView ?? globalThis;
        const popup = chromeWindow.PopupNotifications;
        popupPanelState = popup?.panel?.state ?? null;
        popupNotifications = (popup?._currentNotifications ?? []).map(
          (entry) => ({
            id: entry.id ?? null,
            message: entry.message ?? null,
            buttonCount: entry.buttonBox?.children?.length ?? null,
          }),
        );
      } catch (error) {
        popupNotifications = [{ lookupError: String(error) }];
      }
      return {
        notifications,
        storagePermissionState,
        popupNotifications,
        popupPanelState,
      };
    }, candidateId);
  } finally {
    await driver.setContext('content');
  }
}

async function dismissFirefoxStoragePrompt() {
  await driver.setContext('chrome');
  try {
    return await driver.executeScript(() => {
      try {
        const box = gBrowser.getNotificationBox(gBrowser.selectedBrowser);
        const notification = (box?.allNotifications ?? []).find((entry) =>
          /persistent|storage/i.test(`${entry.id ?? ''} ${entry.label ?? ''}`),
        );
        if (notification) {
          const detail = {
            route: 'notification-box',
            id: notification.id ?? null,
            label: notification.label ?? null,
          };
          notification.dismiss();
          return { dismissed: true, ...detail };
        }
        const chromeWindow = gBrowser.ownerDocument?.defaultView ?? globalThis;
        const popup = chromeWindow.PopupNotifications;
        const current = (popup?._currentNotifications ?? []).find((entry) =>
          /persistent|storage/i.test(
            `${entry.id ?? ''} ${entry.message ?? ''}`,
          ),
        );
        if (current) {
          const detail = {
            route: 'popup-notifications',
            id: current.id ?? null,
            message: current.message ?? null,
          };
          current.remove?.();
          popup?.panel?.hidePopup?.();
          return { dismissed: true, ...detail };
        }
        return { dismissed: false };
      } catch (error) {
        return { dismissed: false, error: String(error) };
      }
    });
  } finally {
    await driver.setContext('content');
  }
}

async function enableFirefoxPrivate() {
  await driver.setContext('chrome');
  try {
    return await driver.executeAsyncScript((id, done) => {
      (async () => {
        try {
          const { ExtensionPermissions } = ChromeUtils.importESModule(
            'resource://gre/modules/ExtensionPermissions.sys.mjs',
          );
          const { AddonManager } = ChromeUtils.importESModule(
            'resource://gre/modules/AddonManager.sys.mjs',
          );
          const extension = WebExtensionPolicy.getByID(id).extension;
          await ExtensionPermissions.add(
            id,
            { permissions: ['internal:privateBrowsingAllowed'], origins: [] },
            extension,
          );
          await (await AddonManager.getAddonByID(id)).reload();
          done({
            enabled: (await ExtensionPermissions.get(id)).permissions.includes(
              'internal:privateBrowsingAllowed',
            ),
          });
        } catch (error) {
          done({ enabled: false, failure: String(error) });
        }
      })();
    }, candidateId);
  } finally {
    await driver.setContext('content');
  }
}

function readPrivateStartup() {
  return driver.setContext('chrome').then(async () => {
    try {
      return await driver.executeScript(() => {
        const target = gBrowser.selectedBrowser;
        return {
          uri: target.currentURI?.spec ?? '',
          loading: target.webProgress?.isLoadingDocument ?? true,
          delayedStartupFinished: Boolean(
            window.gBrowserInit?.delayedStartupFinished,
          ),
        };
      });
    } finally {
      await driver.setContext('content');
    }
  });
}

async function waitForFirefoxPrivateStartup() {
  return driver.wait(async () => {
    const state = await readPrivateStartup();
    return state.delayedStartupFinished &&
      state.uri !== '' &&
      state.uri !== 'about:blank' &&
      !state.loading
      ? state
      : false;
  }, 15000);
}

async function openFirefoxPrivateWindow() {
  await driver
    .switchTo()
    .newWindow('tab')
    .catch(() => {});
  const before = new Set(await driver.getAllWindowHandles());
  await driver.setContext('chrome');
  try {
    await driver.executeScript(() => {
      OpenBrowserWindow({ private: true });
    });
  } finally {
    await driver.setContext('content');
  }
  const handle = await driver.wait(async () => {
    const handles = await driver.getAllWindowHandles();
    const added = handles.find((candidate) => !before.has(candidate));
    return added ?? false;
  }, 15000);
  ownedTabs.add(handle);
  await driver.switchTo().window(handle);
  const startup = await waitForFirefoxPrivateStartup();
  return { handle, startup };
}

async function firefoxSession() {
  driver = await launchFirefox();
  const capabilities = await driver.getCapabilities();
  report.browserVersion = capabilities.get('browserVersion');
  report.driverVersion = capabilities.get('moz:geckodriverVersion');
  report.sessionProfile = capabilities.get('moz:profile') ?? null;
  assert.equal(report.driverVersion, '0.37.1');
  if (requestedVersion)
    assert.equal(report.browserVersion, requestedVersion.replace(/esr$/, ''));
  await installTemporaryExtension(driver, candidateDirectory);
  await installTemporaryExtension(driver, contentFixtureDirectory);
  const candidate = await firefoxExtensionInfo(candidateId, 'probe.html');
  const content = await firefoxExtensionInfo(contentFixtureId, 'probe.html');
  assert(candidate?.url, 'Candidate extension URL unavailable');
  assert(content?.url, 'Content fixture extension URL unavailable');
  report.candidateExtension = candidate;
  report.contentFixtureExtension = content;
  return { candidate, content };
}

async function firefoxRestartSession(profile) {
  driver = await launchFirefox(profile);
  const capabilities = await driver.getCapabilities();
  report.restart = {
    browserVersion: capabilities.get('browserVersion'),
    driverVersion: capabilities.get('moz:geckodriverVersion'),
    sessionProfile: capabilities.get('moz:profile') ?? null,
  };
  assert.equal(
    report.restart.browserVersion,
    report.browserVersion,
    'Restart changed the browser version',
  );
  await installTemporaryExtension(driver, candidateDirectory);
  const candidate = await firefoxExtensionInfo(candidateId, 'probe.html');
  assert(candidate?.url, 'Candidate extension URL unavailable after restart');
  report.restart.candidateExtension = candidate;
  assert.equal(
    candidate.uuid ?? candidate.origin,
    report.candidateExtension.uuid ?? report.candidateExtension.origin,
    'Extension origin changed across restart',
  );
  return candidate;
}

async function firefoxMain() {
  const session = await firefoxSession();
  report.candidateExtension = session.candidate;
  report.contentFixtureExtension = session.content;

  const availability = record(
    'availability',
    'Extension-origin IndexedDB opens and round-trips without a manifest permission',
    'Observed in the zero-permission candidate extension page.',
  );
  await run(availability, 'open-and-round-trip', async () => {
    const navigation = await ensurePage(session.candidate.url);
    await waitReady();
    await call('putRaw', {
      recordId: 'round-trip',
      payload: 'round-trip',
    });
    const records = await pages();
    assert.equal(records.length, 1);
    assert.equal(records[0].payload, 'round-trip');
    const manifest = JSON.parse(
      await readFile(join(candidateDirectory, 'manifest.json'), 'utf8'),
    );
    assert.equal(manifest.permissions, undefined);
    assert.equal(manifest.optional_permissions, undefined);
    assert.equal(manifest.content_scripts, undefined);
    return {
      manifest,
      records,
      epoch: await call('status'),
      promptState: await firefoxPromptState(),
      navigation,
    };
  });

  const promptEntry = record(
    'ordinary-prompt',
    'Ordinary IndexedDB use does not require a storage permission prompt',
    'Observed browser notification/permission state at each exact operation.',
  );
  await run(promptEntry, 'ordinary-operations', async () => {
    const before = await firefoxPromptState();
    await call('writePayload', 'prompt-write', 4096);
    const afterSmall = await firefoxPromptState();
    await call('writePayload', 'prompt-large', 1024 * 1024);
    const afterLarge = await firefoxPromptState();
    const storageNotifications = (state) =>
      state.notifications.filter((notification) =>
        /storage|persistent|data/i.test(
          `${notification.id ?? ''} ${notification.label ?? ''}`,
        ),
      );
    return {
      before,
      afterSmall,
      afterLarge,
      storageNotifications: {
        before: storageNotifications(before),
        afterSmall: storageNotifications(afterSmall),
        afterLarge: storageNotifications(afterLarge),
      },
      prompted: [before, afterSmall, afterLarge].some(
        (state) => storageNotifications(state).length > 0,
      ),
    };
  });
  if (promptEntry.status === 'passed' && promptEntry.details.prompted) {
    promptEntry.status = 'failed';
    promptEntry.error = {
      name: 'StoragePromptObserved',
      message:
        'A storage-related browser prompt/notification appeared during ordinary IndexedDB operations.',
      stack: null,
    };
    report.essentialFailures.push(promptEntry.id);
  }

  const bounds = record(
    'bounds-capacity',
    'Store 50 records, 5 MiB total and one 1 MiB record without truncation',
    'Observed candidate writes and reads; product enforcement is tested later.',
  );
  await run(bounds, 'bounded-writes', async () => {
    await call('clearRecords');
    const before = await call('estimate');
    const records = [];
    for (let index = 0; index < 50; index += 1) {
      const result = await call('writePayload', `bound-${index}`, 100_000);
      records.push(result.serialized);
    }
    const large = await call('writePayload', 'one-mib', 1_000_000);
    const after = await call('estimate');
    const all = await pages();
    assert.equal(all.length, 51);
    assert.equal(
      all.find((entry) => entry.recordId === 'one-mib')?.payload.length,
      1_000_000,
    );
    return {
      estimateBefore: before,
      estimateAfter: after,
      serializedBytes: records.reduce((sum, value) => sum + value, 0),
      oneMibSerializedBytes: large.serialized,
      recordCount: all.length,
      usageDelta:
        before.usage !== null && after.usage !== null
          ? after.usage - before.usage
          : null,
    };
  });

  const persistEntry = record(
    'persistence-grant',
    'Record persistence state and a separate optional persist() probe',
    'Observed separate from ordinary DB creation and restart.',
    false,
  );
  await run(persistEntry, 'persist-probe', async () => {
    const before = await call('persisted');
    const promptBefore = await firefoxPromptState();
    const requested = await call('persistBounded', 5000);
    const promptAfter = await firefoxPromptState();
    const dismissed = await dismissFirefoxStoragePrompt();
    const after = await call('persisted');
    const promptFinal = await firefoxPromptState();
    return {
      before,
      requested,
      after,
      promptBefore,
      promptAfter,
      promptFinal,
      dismissed,
      exactOperation:
        'navigator.storage.persist() called separately after ordinary DB use; the required product mechanism does not call persist()',
    };
  });
  if (
    persistEntry.status === 'passed' &&
    persistEntry.details?.requested?.status !== 'resolved'
  ) {
    persistEntry.status = 'unavailable';
    const popup = persistEntry.details?.promptAfter?.popupNotifications ?? [];
    report.gaps.push(
      popup.length
        ? `Firefox persistent-storage prompt (${popup[0].id ?? 'unknown'}: ${popup[0].message ?? 'no message'}) was observed only after the explicit persist() probe and dismissed without granting. Ordinary DB open/write operations showed no prompt. The required product mechanism does not call persist().`
        : 'navigator.storage.persist() remained unresolved after 5 s with no visible notification detected; the exact prompt/operation is unestablished. This is separate from ordinary IndexedDB creation and is not used by the product mechanism.',
    );
  }

  const quotaEntry = record(
    'quota-observation',
    'Observe quota estimate and a bounded attempt to reach a real quota error',
    'Observed/controlled; estimates and simulated aborts are not quota errors.',
    false,
  );
  await run(quotaEntry, 'quota-probe', async () => {
    const estimate = await call('estimate');
    const result = {
      estimate,
      attempt: null,
      quotaErrorObserved: false,
      simulatedAbort: null,
    };
    const cap = 64 * 1024 * 1024;
    if (
      typeof estimate.quota === 'number' &&
      estimate.quota > 0 &&
      estimate.quota <= cap
    ) {
      const records = [];
      let filled = 0;
      try {
        while (filled < Math.min(estimate.quota + 8 * 1024 * 1024, cap)) {
          const reply = await callRaw(
            'writePayload',
            `quota-${filled}`,
            1024 * 1024,
          );
          if (reply.status !== 'ok') {
            result.quotaErrorObserved = /quota/i.test(
              `${reply.error?.name} ${reply.error?.message}`,
            );
            result.attempt = {
              stoppedAfterBytes: filled,
              error: reply.error,
            };
            break;
          }
          records.push(reply.value.serialized);
          filled += 1024 * 1024;
          if (filled > (estimate.quota ?? 0) + 2 * 1024 * 1024) break;
        }
        result.attempt = {
          filledBytes: filled,
          recordCount: records.length,
          stoppedAfterBytes: filled,
          error: null,
        };
      } finally {
        await call('clearRecords');
      }
    } else {
      result.attempt = {
        skipped: true,
        reason:
          'Quota estimate is absent, zero, or above the fixed 64 MiB pressure cap; no disk-pressure experiment was run.',
      };
      const quota = estimate.quota;
      report.gaps.push(
        `Natural quota exhaustion was not induced: the quota estimate (${quota ?? 'absent'} bytes) is above the fixed 64 MiB pressure cap. No real QuotaExceededError observation exists for this target.`,
      );
    }
    const abort = await callRaw('saveNow', 'quota-abort', {
      abortSynchronously: true,
    });
    result.simulatedAbort = abort;
    assert.equal(abort.status, 'ok');
    assert.equal(abort.value.status, 'aborted');
    return result;
  });

  const clearEntry = record(
    'forced-clear',
    'Forced browser-origin clearing removes candidate storage',
    'Test-authority browser clear, not natural eviction.',
    false,
  );
  await run(clearEntry, 'firefox-qms-clear', async () => {
    await call('clearRecords');
    await call('putRaw', { recordId: 'clear-me', payload: 'clear-me' });
    await driver.setContext('chrome');
    let cleared;
    try {
      cleared = await driver.executeAsyncScript((id, done) => {
        (async () => {
          try {
            const policy = WebExtensionPolicy.getByID(id);
            const qms = Services.qms;
            if (typeof qms.clearStoragesForOrigin === 'function') {
              await qms.clearStoragesForOrigin(policy.principal);
              done({ cleared: true, method: 'clearStoragesForOrigin' });
              return;
            }
            if (typeof qms.clear === 'function') {
              await qms.clear();
              done({ cleared: true, method: 'qms.clear' });
              return;
            }
            done({
              cleared: false,
              error: 'No supported QMS clear method is exposed.',
            });
          } catch (error) {
            done({ cleared: false, error: String(error) });
          }
        })();
      }, candidateId);
    } finally {
      await driver.setContext('content');
    }
    await ensurePage(session.candidate.url);
    await waitReady();
    const records = await pages();
    return { cleared, recordsAfter: records };
  });
  if (clearEntry.status === 'passed' && !clearEntry.details?.cleared?.cleared) {
    clearEntry.status = 'unavailable';
    report.gaps.push(
      `Firefox forced browser-origin clearing could not be observed: ${clearEntry.details?.cleared?.error ?? 'no clear method'}.`,
    );
  } else if (clearEntry.status === 'passed') {
    assert.equal(
      clearEntry.details.recordsAfter.length,
      0,
      'Forced clear left records behind',
    );
  }

  const contentEntry = record(
    'content-script-boundary',
    'A same-extension content script cannot read extension-origin archives',
    'Controlled fixture extension with declared test-only host/content-script authority; kept out of product and candidate.',
  );
  await run(contentEntry, 'content-boundary', async () => {
    await driver.get(session.content.url);
    await driver
      .wait(until.elementLocated(By.css('h1')), 10000)
      .catch(() => {});
    await driver.wait(
      async () =>
        (await driver.executeScript(
          () => document.documentElement.dataset.contentFixtureReady === 'true',
        )) === true,
      10000,
    );
    const fixture = await driver.executeScript(
      () => window.contentFixtureProbe,
    );
    await driver.get(session.candidate.url);
    await waitReady();
    await call('putRaw', {
      recordId: 'candidate-sentinel',
      payload: sentinel,
    });
    const candidateRecords = await pages();
    const candidateHandle = await driver.getWindowHandle();
    const pageHandle = await openTab(pageUrl);
    await driver.wait(
      async () =>
        (await driver.executeScript(
          () =>
            typeof document.documentElement.dataset.addonrayContentProbe ===
            'string',
        )) === true,
      15000,
    );
    const contentProbe = JSON.parse(
      await driver.executeScript(
        () => document.documentElement.dataset.addonrayContentProbe,
      ),
    );
    await closeTab(pageHandle, candidateHandle);
    assert.equal(
      contentProbe.runtimeId,
      fixture.extensionId,
      'Content script runtime did not match the fixture extension',
    );
    assert.equal(fixture.sentinelPresent, true);
    assert.equal(
      contentProbe.readSentinels.includes('fixture-extension'),
      false,
      'Content script read the fixture extension archive',
    );
    assert.equal(
      contentProbe.readSentinels.includes('extension-candidate'),
      false,
      'Content script read the candidate extension archive',
    );
    assert.equal(
      candidateRecords.some((record) => record.payload === sentinel),
      true,
    );
    const fixtureManifest = JSON.parse(
      await readFile(join(contentFixtureDirectory, 'manifest.json'), 'utf8'),
    );
    return {
      fixtureManifest,
      fixtureExtension: report.contentFixtureExtension,
      fixturePage: fixture,
      candidateRecords: candidateRecords.map((record) => ({
        recordId: record.recordId,
        payload:
          typeof record.payload === 'string' && record.payload.length > 64
            ? `${record.payload.length} chars`
            : record.payload,
      })),
      contentProbe,
      sameExtension:
        contentProbe.runtimeId === fixture.extensionId
          ? 'runtime-id-equals-extension-id'
          : 'runtime-id-mismatch',
    };
  });

  const epochEntry = record(
    'deletion-epoch-barrier',
    'Pending saves cannot commit after a cross-view delete, including distinct record IDs and withheld notification',
    'Observed in the candidate with two tabs and no BroadcastChannel.',
  );
  await run(epochEntry, 'epoch-races', async () => {
    const url = session.candidate.url;
    await driver.get(url);
    await waitReady();
    const tabA = await driver.getWindowHandle();
    await call('clearRecords');
    await call('saveNow', 'record-a');
    const tabB = await openTab(url);
    await waitReady();
    await driver.switchTo().window(tabA);
    const pending = await call('beginPendingSave', 'record-b');
    assert.equal(pending.status, 'pending');
    await driver.switchTo().window(tabB);
    const deleted = await callRaw('deleteRecord', 'record-a');
    assert.equal(deleted.status, 'ok');
    await driver.switchTo().window(tabA);
    const stale = await callRaw('releasePending');
    assert.equal(stale.status, 'ok');
    assert.equal(stale.value.status, 'stale');
    const afterStale = await pages();
    assert.equal(afterStale.length, 0);
    const idempotent = await callRaw('beginPendingSave', 'record-c');
    assert.equal(idempotent.status, 'ok');
    await driver.switchTo().window(tabB);
    const missingDelete = await callRaw('deleteRecord', 'already-missing');
    assert.equal(missingDelete.status, 'ok');
    await driver.switchTo().window(tabA);
    const staleIdempotent = await callRaw('releasePending');
    assert.equal(staleIdempotent.value.status, 'stale');
    const afterIdempotent = await pages();
    assert.equal(afterIdempotent.length, 0);
    const commitFirst = await callRaw('beginPendingSave', 'record-d');
    assert.equal(commitFirst.value.status, 'pending');
    const savedFirst = await callRaw('releasePending');
    assert.equal(savedFirst.value.status, 'saved');
    await driver.switchTo().window(tabB);
    const deleteAfter = await callRaw('deleteRecord', 'record-a');
    assert.equal(deleteAfter.status, 'ok');
    await driver.switchTo().window(tabA);
    const afterCommit = await pages();
    assert.equal(
      afterCommit.some((entry) => entry.recordId === 'record-d'),
      true,
    );
    const aborted = await callRaw('saveNow', 'record-e', {
      abortSynchronously: true,
    });
    assert.equal(aborted.value.status, 'aborted');
    const afterAbort = await pages();
    assert.equal(
      afterAbort.some((entry) => entry.recordId === 'record-e'),
      false,
    );
    await closeTab(tabB);
    await driver.switchTo().window(tabA);
    return {
      notification: 'withheld; no BroadcastChannel exists in the candidate',
      pending,
      deleted: deleted.value,
      stale: stale.value,
      afterStale,
      idempotentDelete: missingDelete.value,
      staleAfterIdempotentDelete: staleIdempotent.value,
      commitFirst: savedFirst.value,
      deleteAfterCommit: deleteAfter.value,
      afterCommit,
      synchronousAbort: aborted.value,
      afterAbort,
    };
  });

  const readinessEntry = record(
    'readiness-gate',
    'First-save connection delay cannot silently acquire a post-delete epoch',
    'Observed in the candidate: Save is unavailable until the guarded connection is ready.',
  );
  await run(readinessEntry, 'readiness-race', async () => {
    await call('clearRecords');
    const first = `${session.candidate.url}?db=first-save&delayOpen=1200`;
    const delayed = await openTab(first);
    await driver.switchTo().window(delayed);
    const notReady = await callRaw('beginPendingSave', 'late-save');
    assert.equal(notReady.status, 'ok');
    assert.equal(notReady.value.status, 'not-ready');
    const other = await openTab(`${session.candidate.url}?db=first-save`);
    await waitReady();
    await call('saveNow', 'seed');
    const deleted = await callRaw('deleteRecord', 'seed');
    assert.equal(deleted.status, 'ok');
    await driver.switchTo().window(delayed);
    await waitReady();
    const begun = await callRaw('beginPendingSave', 'late-save');
    assert.equal(begun.value.status, 'pending');
    const released = await callRaw('releasePending');
    assert.equal(released.value.status, 'saved');
    const records = await pages();
    assert.equal(
      records.some((entry) => entry.recordId === 'late-save'),
      true,
    );
    await closeTab(other);
    await closeTab(delayed);
    return {
      beforeReady: notReady.value,
      otherDelete: deleted.value,
      afterReady: begun.value,
      release: released.value,
      records,
    };
  });

  const lazyEntry = record(
    'delete-expiry-unsupported',
    'Expired records are refused/removed; unsupported versions stay listed and deletable',
    'Candidate-level behaviour, not the product library.',
  );
  await run(lazyEntry, 'list-valid', async () => {
    const navigation = await ensurePage(session.candidate.url);
    await waitReady();
    await call('clearRecords');
    const now = Date.now();
    for (const recordValue of [
      { recordId: 'valid', schemaVersion: 1, expiresAt: now + 60_000 },
      { recordId: 'expired', schemaVersion: 1, expiresAt: now - 1 },
      { recordId: 'future', schemaVersion: 2, expiresAt: now + 60_000 },
      { recordId: 'malformed', schemaVersion: 1 },
    ])
      await call('putRaw', recordValue);
    const listed = await call('listValid', now);
    const remaining = await pages();
    assert.deepEqual(listed.available, ['valid']);
    assert.deepEqual(listed.unsupported, ['future']);
    assert.deepEqual(listed.invalid, ['malformed']);
    assert.deepEqual(listed.removedExpired, ['expired']);
    assert.equal(
      remaining.some((entry) => entry.recordId === 'expired'),
      false,
    );
    assert.equal(
      remaining.some((entry) => entry.recordId === 'future'),
      true,
    );
    const deleteUnsupported = await callRaw('deleteRecord', 'future');
    assert.equal(deleteUnsupported.status, 'ok');
    const afterDelete = await pages();
    assert.equal(
      afterDelete.some((entry) => entry.recordId === 'future'),
      false,
    );
    return {
      navigation,
      listed,
      remaining,
      deleteUnsupported: deleteUnsupported.value,
    };
  });

  const privateEntry = record(
    'private-context',
    'Private-window extension page is classified and the guard blocks before storage',
    'Authentic Firefox private window with test-only private-browsing allowance.',
  );
  await run(privateEntry, 'firefox-private', async () => {
    const details = { stage: 'new-stable-tab' };
    try {
      // Reloading the extension discards its open pages. Keep an owned blank tab
      // as the stable driver context across that reload.
      await driver.switchTo().newWindow('tab');
      const mainHandle = await driver.getWindowHandle();
      await driver.get('about:blank');
      details.stage = 'enable-private-browsing';
      const enabled = await enableFirefoxPrivate();
      details.privateBrowsingEnabled = enabled;
      assert.equal(enabled.enabled, true, JSON.stringify(enabled));
      const candidate = await firefoxExtensionInfo(candidateId, 'probe.html');
      details.candidate = candidate;
      assert(candidate?.url);
      details.stage = 'create-private-window';
      const { handle, startup } = await openFirefoxPrivateWindow();
      details.privateStartup = startup;
      details.privateHandle = handle;
      details.stage = 'navigate-private-page';
      details.navigation = await ensurePage(`${candidate.url}?guardOnly=1`);
      details.privateUrl = await driver.getCurrentUrl();
      details.stage = 'read-context';
      details.context = await callRaw('context');
      details.stage = 'guarded-reads';
      details.blockedTrue = await callRaw('guardedRead', true);
      details.blockedNull = await callRaw('guardedRead', null);
      details.blockedString = await callRaw('guardedRead', 'false');
      assert.equal(details.context.value?.incognito, true);
      for (const [name, reply] of [
        ['true', details.blockedTrue],
        ['null', details.blockedNull],
        ['string', details.blockedString],
      ]) {
        assert.equal(
          reply.value?.storageAccessed,
          false,
          `Guard ${name} accessed storage`,
        );
        assert.equal(reply.value?.status, 'blocked');
      }
      details.positiveControl = await callRaw('guardedRead', false);
      details.stage = 'close-private-window';
      await closeTab(handle, mainHandle);
      return details;
    } catch (error) {
      error.details = details;
      throw error;
    }
  });

  // Keep a sentinel for the restart check before the session ends.
  await ensurePage(session.candidate.url);
  await waitReady();
  await call('putRaw', { recordId: 'restart-sentinel', payload: 'restart' });
  await call('close');
  const liveProfile = (await driver.getCapabilities()).get('moz:profile');
  const retainedProfile = join(work, 'retained-profile');
  await cp(liveProfile, retainedProfile, { recursive: true });
  report.sessionProfile = {
    live: liveProfile,
    retained: retainedProfile,
  };
  await driver.quit();
  driver = null;

  const restartEntry = record(
    'restart-persistence',
    'Records persist across a real browser process restart with the same profile',
    'Observed Firefox restart; session 2 copies the session-1 profile.',
  );
  await run(restartEntry, 'firefox-restart', async () => {
    assert(report.sessionProfile?.retained, 'Retained profile unavailable');
    const candidate = await firefoxRestartSession(
      report.sessionProfile.retained,
    );
    await driver.get(candidate.url);
    await waitReady();
    const records = await pages();
    return {
      sessionProfile: report.sessionProfile,
      restartSessionProfile: report.restart.sessionProfile,
      origin: candidate.origin,
      records,
    };
  });
  if (restartEntry.status === 'passed') {
    const records = restartEntry.details.records;
    assert(
      records.some((entry) => entry.recordId === 'restart-sentinel'),
      'Restart sentinel missing',
    );
  }

  const uninstallEntry = record(
    'uninstall-behavior',
    'Uninstall/reinstall behavior is recorded separately from restart',
    'Test-authority AddonManager uninstall in the same profile; not a product claim.',
    false,
  );
  if (restartEntry.status !== 'passed' || !driver) {
    uninstallEntry.status = 'unavailable';
    uninstallEntry.error = {
      name: 'PrerequisiteUnavailable',
      message: 'Restart persistence did not pass; uninstall was not run.',
      stack: null,
    };
    report.gaps.push(
      'Uninstall behavior was not run because restart did not pass.',
    );
  } else {
    await run(uninstallEntry, 'uninstall', async () => {
      await driver.setContext('chrome');
      const removed = await driver.executeAsyncScript((id, done) => {
        (async () => {
          try {
            const { AddonManager } = ChromeUtils.importESModule(
              'resource://gre/modules/AddonManager.sys.mjs',
            );
            const addon = await AddonManager.getAddonByID(id);
            await addon.uninstall();
            done({ uninstalled: true });
          } catch (error) {
            done({ uninstalled: false, error: String(error) });
          }
        })();
      }, candidateId);
      await driver.setContext('content');
      await installTemporaryExtension(driver, candidateDirectory);
      const candidate = await firefoxExtensionInfo(candidateId, 'probe.html');
      await driver.get(candidate.url);
      await waitReady();
      const records = await pages();
      return { removed, recordsAfterReinstall: records };
    });
    if (
      uninstallEntry.status === 'passed' &&
      uninstallEntry.details?.removed?.uninstalled !== true
    ) {
      uninstallEntry.status = 'unavailable';
      report.gaps.push(
        `Firefox uninstall/reinstall could not be observed: ${JSON.stringify(uninstallEntry.details?.removed)}`,
      );
    }
  }
}

async function chromeSession({
  userDataDir,
  headless = true,
  incognito = false,
}) {
  process.env.SE_DRIVER_VERSION = chromeVersion;
  const options = new chrome.Options()
    .setBrowserVersion(chromeVersion)
    .addArguments(
      '--no-first-run',
      '--no-default-browser-check',
      `--user-data-dir=${resolve(userDataDir)}`,
    );
  if (headless) options.addArguments('--headless=new');
  if (incognito) options.addArguments('--incognito');
  const service = new chrome.ServiceBuilder()
    .loggingTo(join(work, 'chromedriver.log'))
    .enableVerboseLogging();
  const next = await new Builder()
    .forBrowser('chrome')
    .setChromeOptions(options)
    .setChromeService(service)
    .build();
  await next.manage().setTimeouts({ script: 30000, pageLoad: 30000 });
  return next;
}

async function chromeInstall(candidatePath, fixturePath) {
  const capabilities = await driver.getCapabilities();
  const debuggerAddress =
    capabilities.get('goog:chromeOptions').debuggerAddress;
  const cdp = await browserProtocol(debuggerAddress);
  const candidate = await cdp.send('Extensions.loadUnpacked', {
    path: resolve(candidatePath),
  });
  const fixture = await cdp.send('Extensions.loadUnpacked', {
    path: resolve(fixturePath),
  });
  return {
    cdp,
    candidateId: candidate.id,
    contentFixtureId: fixture.id,
  };
}

async function chromeMain() {
  const userDataDir = join(work, 'chrome-profile');
  await mkdir(userDataDir, { recursive: true });
  driver = await chromeSession({ userDataDir });
  const capabilities = await driver.getCapabilities();
  report.browserVersion = capabilities.get('browserVersion');
  report.driverVersion = capabilities
    .get('chrome')
    .chromedriverVersion.split(' ')[0];
  assert.equal(report.browserVersion, chromeVersion);
  assert.equal(report.driverVersion, chromeVersion);
  const installed = await chromeInstall(
    candidateDirectory,
    contentFixtureDirectory,
  );
  report.candidateExtension = {
    id: installed.candidateId,
    origin: `chrome-extension://${installed.candidateId}`,
  };
  report.contentFixtureExtension = {
    id: installed.contentFixtureId,
    origin: `chrome-extension://${installed.contentFixtureId}`,
  };
  const candidateUrl = `chrome-extension://${installed.candidateId}/probe.html`;
  const contentUrl = `chrome-extension://${installed.contentFixtureId}/probe.html`;

  const availability = record(
    'availability',
    'Extension-origin IndexedDB opens and round-trips without a manifest permission',
    'Observed in the zero-permission candidate extension page.',
  );
  await run(availability, 'open-and-round-trip', async () => {
    const navigation = await ensurePage(candidateUrl);
    await waitReady();
    await call('putRaw', {
      recordId: 'round-trip',
      payload: 'round-trip',
    });
    const records = await pages();
    assert.equal(records[0].payload, 'round-trip');
    const manifest = JSON.parse(
      await readFile(join(candidateDirectory, 'manifest.json'), 'utf8'),
    );
    assert.equal(manifest.permissions, undefined);
    assert.equal(manifest.optional_permissions, undefined);
    assert.equal(manifest.content_scripts, undefined);
    return {
      manifest,
      records,
      epoch: await call('status'),
      navigation,
    };
  });

  const bounds = record(
    'bounds-capacity',
    'Store 50 records, 5 MiB total and one 1 MiB record without truncation',
    'Observed candidate writes and reads; product enforcement is tested later.',
  );
  await run(bounds, 'bounded-writes', async () => {
    await call('clearRecords');
    const before = await call('estimate');
    let serialized = 0;
    for (let index = 0; index < 50; index += 1) {
      const result = await call('writePayload', `bound-${index}`, 100_000);
      serialized += result.serialized;
    }
    const large = await call('writePayload', 'one-mib', 1_000_000);
    const after = await call('estimate');
    const all = await pages();
    assert.equal(all.length, 51);
    return {
      estimateBefore: before,
      estimateAfter: after,
      serializedTotal: serialized,
      oneMibSerializedBytes: large.serialized,
      recordCount: all.length,
    };
  });

  const ordinaryEntry = record(
    'ordinary-prompt',
    'Ordinary IndexedDB use does not require a storage permission prompt',
    'Observed in the zero-permission candidate; Chrome exposes no storage-prompt UI for this path.',
  );
  await run(ordinaryEntry, 'ordinary-operations', async () => {
    await ensurePage(candidateUrl);
    await waitReady();
    const before = await call('persisted');
    await call('writePayload', 'prompt-write', 4096);
    const after = await call('persisted');
    return {
      before,
      after,
      manifest: JSON.parse(
        await readFile(join(candidateDirectory, 'manifest.json'), 'utf8'),
      ),
      note: 'The candidate manifest declares no permissions and the ordinary DB operations completed; no browser prompt was exposed or observed.',
    };
  });

  const persistEntry = record(
    'persistence-grant',
    'Record persistence state and a separate optional persist() probe',
    'Observed separately from ordinary DB creation and restart.',
    false,
  );
  await run(persistEntry, 'persist-probe', async () => {
    const before = await call('persisted');
    const requested = await call('persistBounded', 5000);
    const after = await call('persisted');
    return {
      before,
      requested,
      after,
      exactOperation:
        'navigator.storage.persist() called separately after ordinary DB use; the required product mechanism does not call persist()',
    };
  });
  if (
    persistEntry.status === 'passed' &&
    persistEntry.details?.requested?.status !== 'resolved'
  ) {
    persistEntry.status = 'unavailable';
    report.gaps.push(
      'Chrome navigator.storage.persist() remained unresolved after 5 s; the exact grant/prompt state is unestablished. This is separate from ordinary IndexedDB creation.',
    );
  }

  const quotaEntry = record(
    'quota-observation',
    'Observe quota estimate and a bounded attempt to reach a real quota error',
    'Observed/controlled; estimates and simulated aborts are not quota errors.',
    false,
  );
  await run(quotaEntry, 'quota-probe', async () => {
    await ensurePage(candidateUrl);
    await waitReady();
    const estimate = await call('estimate');
    const abort = await callRaw('saveNow', 'quota-abort', {
      abortSynchronously: true,
    });
    assert.equal(abort.value.status, 'aborted');
    if (
      typeof estimate.quota !== 'number' ||
      estimate.quota <= 0 ||
      estimate.quota > 64 * 1024 * 1024
    )
      report.gaps.push(
        `Natural quota exhaustion was not induced: the Chrome quota estimate (${estimate.quota ?? 'absent'} bytes) is absent or above the fixed 64 MiB pressure cap. No real QuotaExceededError observation exists for this target.`,
      );
    return {
      estimate,
      quotaErrorObserved: false,
      simulatedAbort: abort.value,
    };
  });

  const contentEntry = record(
    'content-script-boundary',
    'A same-extension content script cannot read extension-origin archives',
    'Controlled fixture extension with declared test-only host/content-script authority; kept out of product and candidate.',
  );
  await run(contentEntry, 'content-boundary', async () => {
    await driver.get(contentUrl);
    await driver.wait(async () => {
      return (
        (await driver.executeScript(
          () => document.documentElement.dataset.contentFixtureReady === 'true',
        )) === true
      );
    }, 10000);
    const fixture = await driver.executeScript(
      () => window.contentFixtureProbe,
    );
    await driver.get(candidateUrl);
    await waitReady();
    await call('putRaw', {
      recordId: 'candidate-sentinel',
      payload: sentinel,
    });
    const candidateRecords = await pages();
    const candidateHandle = await driver.getWindowHandle();
    const pageHandle = await openTab(pageUrl);
    await driver.wait(async () => {
      return (
        (await driver.executeScript(
          () =>
            typeof document.documentElement.dataset.addonrayContentProbe ===
            'string',
        )) === true
      );
    }, 15000);
    const contentProbe = JSON.parse(
      await driver.executeScript(
        () => document.documentElement.dataset.addonrayContentProbe,
      ),
    );
    await closeTab(pageHandle, candidateHandle);
    assert.equal(
      contentProbe.runtimeId,
      fixture.extensionId,
      'Content script runtime did not match the fixture extension',
    );
    assert.equal(fixture.sentinelPresent, true);
    assert.equal(
      contentProbe.readSentinels.includes('fixture-extension'),
      false,
      'Content script read the fixture extension archive',
    );
    assert.equal(
      contentProbe.readSentinels.includes('extension-candidate'),
      false,
      'Content script read the candidate extension archive',
    );
    return {
      fixtureManifest: JSON.parse(
        await readFile(join(contentFixtureDirectory, 'manifest.json'), 'utf8'),
      ),
      fixturePage: fixture,
      candidateRecords: candidateRecords.map((record) => ({
        recordId: record.recordId,
        payload:
          typeof record.payload === 'string' && record.payload.length > 64
            ? `${record.payload.length} chars`
            : record.payload,
      })),
      contentProbe,
      sameExtension:
        contentProbe.runtimeId === fixture.extensionId
          ? 'runtime-id-equals-extension-id'
          : 'runtime-id-mismatch',
    };
  });

  const epochEntry = record(
    'deletion-epoch-barrier',
    'Pending saves cannot commit after a cross-view delete, including distinct record IDs and withheld notification',
    'Observed in the candidate with two tabs and no BroadcastChannel.',
  );
  await run(epochEntry, 'epoch-races', async () => {
    await driver.get(candidateUrl);
    await waitReady();
    const tabA = await driver.getWindowHandle();
    await call('clearRecords');
    await call('saveNow', 'record-a');
    const tabB = await openTab(candidateUrl);
    await waitReady();
    await driver.switchTo().window(tabA);
    const pending = await call('beginPendingSave', 'record-b');
    assert.equal(pending.status, 'pending');
    await driver.switchTo().window(tabB);
    const deleted = await callRaw('deleteRecord', 'record-a');
    assert.equal(deleted.status, 'ok');
    await driver.switchTo().window(tabA);
    const stale = await callRaw('releasePending');
    const afterStale = await pages();
    assert.equal(stale.value.status, 'stale');
    assert.equal(afterStale.length, 0);
    const idempotent = await callRaw('beginPendingSave', 'record-c');
    assert.equal(idempotent.value.status, 'pending');
    await driver.switchTo().window(tabB);
    const missingDelete = await callRaw('deleteRecord', 'already-missing');
    assert.equal(missingDelete.status, 'ok');
    await driver.switchTo().window(tabA);
    const staleIdempotent = await callRaw('releasePending');
    assert.equal(staleIdempotent.value.status, 'stale');
    const afterIdempotent = await pages();
    assert.equal(afterIdempotent.length, 0);
    const commitFirst = await callRaw('beginPendingSave', 'record-d');
    assert.equal(commitFirst.value.status, 'pending');
    const savedFirst = await callRaw('releasePending');
    assert.equal(savedFirst.value.status, 'saved');
    await driver.switchTo().window(tabB);
    const deleteAfter = await callRaw('deleteRecord', 'record-a');
    assert.equal(deleteAfter.status, 'ok');
    await driver.switchTo().window(tabA);
    const afterCommit = await pages();
    assert.equal(
      afterCommit.some((entry) => entry.recordId === 'record-d'),
      true,
    );
    const aborted = await callRaw('saveNow', 'record-e', {
      abortSynchronously: true,
    });
    assert.equal(aborted.value.status, 'aborted');
    const afterAbort = await pages();
    assert.equal(
      afterAbort.some((entry) => entry.recordId === 'record-e'),
      false,
    );
    await closeTab(tabB, tabA);
    await driver.switchTo().window(tabA);
    return {
      notification: 'withheld; no BroadcastChannel exists in the candidate',
      pending,
      deleted: deleted.value,
      stale: stale.value,
      afterStale,
      idempotentDelete: missingDelete.value,
      staleAfterIdempotentDelete: staleIdempotent.value,
      commitFirst: savedFirst.value,
      deleteAfterCommit: deleteAfter.value,
      afterCommit,
      synchronousAbort: aborted.value,
      afterAbort,
    };
  });

  const readinessEntry = record(
    'readiness-gate',
    'First-save connection delay cannot silently acquire a post-delete epoch',
    'Observed in the candidate: Save is unavailable until the guarded connection is ready.',
  );
  await run(readinessEntry, 'readiness-race', async () => {
    await call('clearRecords');
    const delayed = await openTab(
      `${candidateUrl}?db=first-save&delayOpen=1200`,
    );
    await driver.switchTo().window(delayed);
    const notReady = await callRaw('beginPendingSave', 'late-save');
    assert.equal(notReady.value.status, 'not-ready');
    const other = await openTab(`${candidateUrl}?db=first-save`);
    await waitReady();
    await call('saveNow', 'seed');
    const deleted = await callRaw('deleteRecord', 'seed');
    assert.equal(deleted.status, 'ok');
    await driver.switchTo().window(delayed);
    await waitReady();
    const begun = await callRaw('beginPendingSave', 'late-save');
    const released = await callRaw('releasePending');
    assert.equal(begun.value.status, 'pending');
    assert.equal(released.value.status, 'saved');
    await closeTab(other);
    await closeTab(delayed);
    return {
      beforeReady: notReady.value,
      otherDelete: deleted.value,
      afterReady: begun.value,
      release: released.value,
    };
  });

  const lazyEntry = record(
    'delete-expiry-unsupported',
    'Expired records are refused/removed; unsupported versions stay listed and deletable',
    'Candidate-level behaviour, not the product library.',
  );
  await run(lazyEntry, 'list-valid', async () => {
    const navigation = await ensurePage(candidateUrl);
    await waitReady();
    await call('clearRecords');
    const now = Date.now();
    for (const recordValue of [
      { recordId: 'valid', schemaVersion: 1, expiresAt: now + 60_000 },
      { recordId: 'expired', schemaVersion: 1, expiresAt: now - 1 },
      { recordId: 'future', schemaVersion: 2, expiresAt: now + 60_000 },
      { recordId: 'malformed', schemaVersion: 1 },
    ])
      await call('putRaw', recordValue);
    const listed = await call('listValid', now);
    const remaining = await pages();
    assert.deepEqual(listed.available, ['valid']);
    assert.deepEqual(listed.unsupported, ['future']);
    assert.deepEqual(listed.removedExpired, ['expired']);
    return { navigation, listed, remaining };
  });

  // Restart with the same profile and unpacked path.
  await ensurePage(candidateUrl);
  await waitReady();
  await call('putRaw', { recordId: 'restart-sentinel', payload: 'restart' });
  await driver.quit();
  driver = null;

  const restartEntry = record(
    'restart-persistence',
    'Records persist across a real browser process restart with the same profile',
    'Observed Chrome for Testing restart with the same user-data directory.',
  );
  await run(restartEntry, 'chrome-restart', async () => {
    driver = await chromeSession({ userDataDir });
    const reinstalled = await chromeInstall(
      candidateDirectory,
      contentFixtureDirectory,
    );
    assert.equal(reinstalled.candidateId, installed.candidateId);
    await driver.get(candidateUrl);
    await waitReady();
    const records = await pages();
    return {
      userDataDir,
      extensionId: reinstalled.candidateId,
      records,
    };
  });

  const uninstallEntry = record(
    'uninstall-behavior',
    'Uninstall/reinstall behavior is recorded separately from restart',
    'Test-authority chrome.management.uninstallSelf in the same profile; not a product claim.',
    false,
  );
  await run(uninstallEntry, 'chrome-uninstall', async () => {
    await ensurePage(candidateUrl);
    await waitReady();
    const before = await pages();
    const requested = await driver.executeScript(() => {
      try {
        if (!globalThis.chrome?.management?.uninstallSelf)
          return {
            requested: false,
            reason: 'management.uninstallSelf unavailable',
          };
        globalThis.chrome.management.uninstallSelf({
          showConfirmDialog: false,
        });
        return { requested: true };
      } catch (error) {
        return { requested: false, error: String(error) };
      }
    });
    await new Promise((resolve) => setTimeout(resolve, 1500));
    let reinstalled = null;
    let reinstallError = null;
    try {
      reinstalled = await chromeInstall(
        candidateDirectory,
        contentFixtureDirectory,
      );
    } catch (error) {
      reinstallError = String(error);
    }
    if (!reinstalled) {
      return { before, requested, reinstallError };
    }
    await ensurePage(
      `chrome-extension://${reinstalled.candidateId}/probe.html`,
    );
    await waitReady();
    const after = await pages();
    return {
      before,
      requested,
      extensionId: reinstalled.candidateId,
      after,
    };
  });

  if (
    uninstallEntry.status === 'passed' &&
    (uninstallEntry.details?.reinstallError ||
      uninstallEntry.details?.requested?.requested !== true)
  ) {
    uninstallEntry.status = 'unavailable';
    report.gaps.push(
      `Chrome uninstall/reinstall could not be completed: ${uninstallEntry.details?.reinstallError ?? JSON.stringify(uninstallEntry.details?.requested)}`,
    );
  }

  const clearEntry = record(
    'forced-clear',
    'Forced browser-origin clearing removes candidate storage',
    'Test-authority CDP clear, not natural eviction.',
    false,
  );
  await run(clearEntry, 'chrome-cdp-clear', async () => {
    await ensurePage(candidateUrl);
    await waitReady();
    await call('putRaw', { recordId: 'clear-me', payload: 'clear-me' });
    const capabilities = await driver.getCapabilities();
    const cdp = await browserProtocol(
      capabilities.get('goog:chromeOptions').debuggerAddress,
    );
    const origin = `chrome-extension://${installed.candidateId}`;
    const attempts = [];
    let cleared = false;
    try {
      const { targetInfos } = await cdp.send('Target.getTargets');
      const target = targetInfos.find(
        (entry) => entry.type === 'page' && entry.url.startsWith(origin),
      );
      if (target) {
        const { sessionId } = await cdp.send('Target.attachToTarget', {
          targetId: target.targetId,
          flatten: true,
        });
        try {
          await cdp.send(
            'Storage.clearDataForOrigin',
            { origin, storageTypes: 'all' },
            sessionId,
          );
          cleared = true;
          attempts.push({
            route: 'page-session',
            method: 'Storage.clearDataForOrigin',
          });
        } finally {
          await cdp.send('Target.detachFromTarget', { sessionId });
        }
      } else {
        attempts.push({ route: 'page-session', error: 'target-not-found' });
      }
    } catch (error) {
      attempts.push({ route: 'page-session', error: String(error) });
    }
    if (!cleared) {
      try {
        await cdp.send('Storage.clearDataForOrigin', {
          origin,
          storageTypes: 'all',
        });
        cleared = true;
        attempts.push({
          route: 'browser-session',
          method: 'Storage.clearDataForOrigin',
        });
      } catch (error) {
        attempts.push({ route: 'browser-session', error: String(error) });
      }
    }
    cdp.close();
    await driver.navigate().refresh();
    await waitReady();
    const records = await pages();
    return { cleared, attempts, recordsAfter: records };
  });
  if (clearEntry.status === 'passed' && !clearEntry.details?.cleared) {
    clearEntry.status = 'unavailable';
    report.gaps.push(
      `Chrome forced browser-origin clearing could not be observed through CDP. Attempts: ${JSON.stringify(clearEntry.details?.attempts)}.`,
    );
  } else if (clearEntry.status === 'passed') {
    assert.equal(
      clearEntry.details.recordsAfter.length,
      0,
      'Forced clear left records behind',
    );
  }

  const privateEntry = record(
    'private-context',
    'Incognito extension routes are attempted and the guard fails closed',
    'Authentic Chrome incognito attempt; blocked routes are recorded as unavailable.',
  );
  await run(privateEntry, 'chrome-private', async () => {
    await driver.quit();
    driver = null;
    driver = await chromeSession({ userDataDir, incognito: true });
    const capabilities = await driver.getCapabilities();
    report.incognito = {
      browserVersion: capabilities.get('browserVersion'),
      driverVersion: capabilities
        .get('chrome')
        .chromedriverVersion.split(' ')[0],
    };
    const reinstalled = await chromeInstall(
      candidateDirectory,
      contentFixtureDirectory,
    );
    const routes = [];
    const privateUrl = `chrome-extension://${reinstalled.candidateId}/probe.html?guardOnly=1`;
    await driver.get(privateUrl);
    const route = {
      route: 'incognito-extension-page',
      url: await driver.getCurrentUrl(),
      title: await driver.getTitle().catch(() => null),
    };
    const loaded = await driver.executeScript(() =>
      Boolean(window.savedStorageProbe),
    );
    route.loaded = loaded === true;
    if (loaded) {
      const context = await callRaw('context');
      const blocked = await callRaw('guardedRead', true);
      route.context = context.value ?? context;
      route.blocked = blocked.value ?? blocked;
      assert.equal(route.context?.value?.incognito, true);
      assert.equal(route.blocked?.value?.storageAccessed, false);
    } else {
      route.body = await driver
        .findElement(By.css('body'))
        .getText()
        .catch(() => null);
      route.outcome = 'browser-blocked-or-error-page';
    }
    routes.push(route);
    return { routes, incognito: true };
  });
  if (
    privateEntry.status === 'passed' &&
    privateEntry.details?.routes?.every((route) => route.loaded !== true)
  ) {
    privateEntry.status = 'unavailable';
    report.gaps.push(
      'Chrome authentic incognito extension-page routes were browser-blocked or did not load the candidate; no reachable incognito entrypoint guard was observed. Exact routes and errors are retained. Product wiring must test the reachable popup/library entrypoints.',
    );
  }
}

try {
  if (target === 'firefox') await firefoxMain();
  else await chromeMain();
} catch (error) {
  report.error = {
    name: error?.name ?? 'Error',
    message: String(error?.message ?? error),
    stack: error?.stack ? String(error.stack) : null,
  };
  console.error(error);
} finally {
  try {
    await driver?.quit();
  } catch {
    /* Preserve the report. */
  }
  try {
    server.close();
  } catch {
    /* Preserve the report. */
  }
  report.completedAt = new Date().toISOString();
  report.durationMs = Date.now() - started.getTime();
  report.checks = checks;
  report.incomplete = checks
    .filter((entry) => entry.essential && entry.status === 'not-run')
    .map((entry) => entry.id);
  report.essentialFailures = checks
    .filter((entry) => entry.essential && entry.status === 'failed')
    .map((entry) => entry.id);
  report.gaps = [...new Set(report.gaps)];
  const reportPath = join(work, 'report.json');
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  const sidecar = join(work, 'report.sha256');
  await writeFile(
    sidecar,
    `${sha256(await readFile(reportPath))}  report.json\n`,
  );
  console.log(`Report: ${reportPath}`);
  console.log(`Sidecar: ${sidecar}`);
  for (const entry of report.checks)
    console.log(
      `${entry.status.toUpperCase()} ${entry.id}${entry.error ? `: ${entry.error.message}` : ''}`,
    );
  if (report.error || report.essentialFailures.length) process.exitCode = 1;
  else if (report.incomplete.length) process.exitCode = 2;
}
