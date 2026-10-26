/* global WebExtensionPolicy, gBrowser */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { arch, platform, tmpdir } from 'node:os';
import { createInterface } from 'node:readline/promises';
import { Builder, By, until } from 'selenium-webdriver';
import firefox from 'selenium-webdriver/firefox.js';
import { checkPackage, sha256 } from './check-package.mjs';
import { packagePaths } from './package-paths.mjs';
import { installTemporaryExtension } from './firefox-install.mjs';
import {
  extractChromePackage,
  installChromeExtension,
  launchChrome,
} from './chrome-session.mjs';
import { pageErrorFixtureHandler } from './page-error-fixture.mjs';

const target = process.argv[2];
assert(['firefox', 'chrome'].includes(target), 'Choose firefox or chrome.');
await mkdir('.scratch', { recursive: true });
const output = resolve(`.scratch/p2d-native-${target}.json`);
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
const report = {
  timestamp: new Date().toISOString(),
  sourceCommit: git('rev-parse', 'HEAD'),
  sourceDirty: Boolean(git('status', '--porcelain')),
  distribution: target === 'firefox' ? 'Firefox' : 'Chrome for Testing',
  os: `${platform()} ${arch()}`,
  runtime: { bun: Bun.version, revision: Bun.revision },
  helperSha256: sha256(await readFile(import.meta.filename)),
  authority:
    'Unmodified validated product in a disposable visible profile. Driver reads own extension DOM and removes optional grants after native use. The explicit Firefox driver-launch command supplies toolbar setup only; native observations remain separate.',
  checks: [],
  snapshots: [],
  gaps: [
    'Native popup, consent, selection, confirmation, keyboard and usability observations require a separate computer-use record. This helper issues no native UI verdict.',
    'The read-only control is popup.html hosted in a browser tab, not an actual toolbar popup. It performs no collection, grants, captures, attachments or page reproduction.',
    'No private/unknown context, other OS, retail installation, store or signing qualification is supplied.',
  ],
  cleanup: { browserClosed: false, serverClosed: false },
  result: 'pending',
};
let driver, cdp, server, input;
let sourceHandle, controlHandle, productId, sourceUrl;
let lastPopulatedSnapshot = null;
const passed = (name, details) =>
  report.checks.push({ name, status: 'passed', ...details });

async function snapshot() {
  await driver.switchTo().window(controlHandle);
  return driver.executeScript(() => {
    const api = globalThis.browser ?? globalThis.chrome;
    const investigationRoute = api.runtime.getURL('investigation.html');
    const checkRoute = api.runtime.getURL('page-error.html');
    const value = { investigations: [], checks: [] };
    for (const view of api.extension.getViews({ type: 'tab' })) {
      try {
        const doc = view.document;
        const text = (selector) =>
          doc.querySelector(selector)?.textContent?.trim().slice(0, 500) ??
          null;
        if (view.location.href === investigationRoute) {
          const cells = (selector) =>
            Array.from(doc.querySelectorAll(selector), (cell) =>
              cell.textContent.trim(),
            );
          value.investigations.push({
            label: text('#investigation-label'),
            beforeInventory: Boolean(
              doc.querySelector('[data-testid="before-snapshot"]'),
            ),
            afterInventory: Boolean(
              doc.querySelector('[data-testid="after-snapshot"]'),
            ),
            assessment:
              doc.querySelector('input[name="page-assessment"]:checked')
                ?.value ?? null,
            errorBefore: cells('.error-comparison td[data-side="before"]'),
            errorAfter: cells('.error-comparison td[data-side="after"]'),
            timingBefore: cells('.timing-comparison td[data-side="before"]'),
            timingAfter: cells('.timing-comparison td[data-side="after"]'),
          });
        } else if (view.location.href === checkRoute) {
          value.checks.push({
            label: text('#page-error-check-label'),
            phase:
              doc.querySelector('#page-error-status')?.dataset.phase ?? null,
            counts: doc.querySelector('#page-error-summary')
              ? {
                  scriptErrors: text('#page-error-script-errors'),
                  unhandledRejections: text('#page-error-rejections'),
                  total: text('#page-error-total'),
                }
              : null,
            attachmentStatus: text('#page-error-attachment-status'),
          });
        }
      } catch {
        // A view can disappear between getViews and its DOM read.
      }
    }
    return value;
  });
}

function populatedInvestigations(value) {
  return value.investigations.filter(
    (entry) =>
      entry.beforeInventory &&
      entry.errorBefore.length === 5 &&
      entry.errorAfter.length === 5 &&
      [...entry.errorBefore, ...entry.errorAfter].some(
        (cell) => cell !== 'Not attached',
      ),
  );
}

async function returnToSource() {
  try {
    await driver.switchTo().window(sourceHandle);
  } catch {
    // Closing the original source is a permitted native lifetime observation.
  }
}

async function launchFirefoxCheck() {
  assert.equal(target, 'firefox', 'This setup fallback is Firefox-only.');
  await driver.switchTo().window(controlHandle);
  await driver.setContext('chrome');
  try {
    await driver.executeScript((url) => {
      const source = [...gBrowser.tabs].find(
        (tab) => tab.linkedBrowser.currentURI.spec === url,
      );
      if (!source) throw new Error('Controlled source is absent.');
      gBrowser.selectedTab = source;
    }, sourceUrl);
    await driver.findElement(By.id('unified-extensions-button')).click();
    await driver
      .findElement(
        By.css(
          `[data-extensionid="${productId}"] .unified-extensions-item-action-button`,
        ),
      )
      .click();
    await driver.wait(
      until.elementLocated(By.css('.webextension-popup-browser')),
      10000,
    );
  } finally {
    await driver.setContext('content');
  }
  await driver.executeScript(() => {
    const api = globalThis.browser ?? globalThis.chrome;
    const popup = api.extension
      .getViews({ type: 'popup' })
      .find((view) => view.location.href === api.runtime.getURL('/popup.html'));
    const button = popup?.document.querySelector('#new-page-error-check');
    if (!button) throw new Error('Actual product popup launcher is absent.');
    button.click();
  });
  await driver.wait(
    () =>
      driver.executeAsyncScript(async (done) => {
        try {
          const api = globalThis.browser ?? globalThis.chrome;
          const owner = api.extension
            .getViews({ type: 'tab' })
            .find(
              (view) =>
                view.location.href === api.runtime.getURL('/page-error.html') &&
                view.document.querySelector('#page-error-status')?.dataset
                  .phase === 'ready',
            );
          done(
            !!owner &&
              (await (owner.browser ?? owner.chrome).tabs.getCurrent())
                ?.active === true,
          );
        } catch {
          done(false);
        }
      }),
    10000,
  );
  passed(
    'Driver-triggered actual Firefox toolbar launch opens a ready unmodified check without starting observation',
    {},
  );
  report.gaps.push(
    'Firefox driver-launch invoked the actual toolbar action and unchanged product launcher as setup. It does not qualify native toolbar scrolling, keyboard or launch usability. Check-tab native interactions are recorded separately.',
  );
  console.log(
    'Actual Firefox toolbar setup opened a ready check. Select its tab natively; Start remains explicit.',
  );
}

async function revoke(permission) {
  assert(
    lastPopulatedSnapshot,
    'Run snapshot with a populated investigation before each revocation.',
  );
  const before = await snapshot();
  const populated = populatedInvestigations(before);
  assert(populated.length, 'Leave an accepted error copy in an investigation.');
  for (const prior of populatedInvestigations(lastPopulatedSnapshot)) {
    assert(
      populated.some((entry) => entry.label === prior.label),
      'The previously snapshotted populated investigation must remain open.',
    );
  }
  const confirmedChecks = before.checks.filter(
    (entry) => entry.counts !== null,
  );
  assert(
    confirmedChecks.length,
    'Leave a confirmed check open so revocation can qualify its clearing too.',
  );
  const removed = await driver.executeAsyncScript((name, done) => {
    const api = globalThis.browser ?? globalThis.chrome;
    api.permissions
      .contains({ permissions: ['management', 'scripting'] })
      .then(async (granted) => {
        if (!granted) return done({ granted: false, removed: false });
        const removed = await api.permissions.remove({ permissions: [name] });
        const stillGranted = await api.permissions.contains({
          permissions: [name],
        });
        done({ granted, removed, stillGranted });
      })
      .catch(() => done({ failed: true }));
  }, permission);
  lastPopulatedSnapshot = null;
  assert.equal(
    removed.granted,
    true,
    'Both optional grants must precede revocation.',
  );
  assert.equal(
    removed.removed,
    true,
    'The actual optional grant must be removed.',
  );
  assert.equal(removed.stillGranted, false);
  let after;
  await driver.wait(
    async () => {
      after = await snapshot();
      const investigationsCleared = populated.every((prior) => {
        const current = after.investigations.find(
          (entry) => entry.label === prior.label,
        );
        return (
          current &&
          !current.beforeInventory &&
          !current.afterInventory &&
          current.assessment === null &&
          current.errorBefore.length === 5 &&
          current.errorAfter.length === 5 &&
          current.timingBefore.length === 3 &&
          current.timingAfter.length === 3 &&
          [
            ...current.errorBefore,
            ...current.errorAfter,
            ...current.timingBefore,
            ...current.timingAfter,
          ].every((cell) => cell === 'Not attached')
        );
      });
      const checksCleared = confirmedChecks.every((prior) => {
        const current = after.checks.find(
          (entry) => entry.label === prior.label,
        );
        return (
          current &&
          current.counts === null &&
          ['ready', 'unbound'].includes(current.phase)
        );
      });
      return investigationsCleared && checksCleared;
    },
    10000,
    'Actual revocation did not clear all populated views.',
  );
  passed(
    `Actual optional ${permission} removal clears populated investigations and confirmed checks`,
    { before, after, permissionRemoval: removed },
  );
  console.log(
    `${permission} revocation assertions passed. Refill manually before another revocation.`,
  );
}

try {
  const { extension, sources } = await checkPackage(target);
  const manifest = JSON.parse(extension.files.get('manifest.json').toString());
  assert.deepEqual(manifest.permissions, ['activeTab']);
  assert.deepEqual([...manifest.optional_permissions].sort(), [
    'management',
    'scripting',
  ]);
  report.installation = {
    mode:
      target === 'firefox'
        ? 'temporary-unmodified-unsigned-xpi'
        : 'unmodified-unpacked-from-validated-zip',
    artifactSha256: extension.sha256,
    sourceArchiveSha256: sources.sha256,
  };
  report.productionInputs = Object.fromEntries(
    [...sources.files].map(([path, bytes]) => [path, sha256(bytes)]),
  );
  server = createServer((request, response) => {
    if (!pageErrorFixtureHandler(request, response)) {
      response.writeHead(404);
      response.end();
    }
  });
  await new Promise((done, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.removeListener('error', reject);
      done();
    });
  });
  sourceUrl = `http://127.0.0.1:${server.address().port}/page-errors/source`;
  let popupUrl;
  if (target === 'firefox') {
    report.gaps.push(
      'Firefox driver system access supplies own-extension URL lookup and the explicit driver-launch toolbar setup. It is test authority, not an extension permission.',
    );
    const version = '158.0.1';
    if (process.env.FIREFOX_VERSION)
      assert.equal(process.env.FIREFOX_VERSION, version);
    process.env.SE_AVOID_STATS = 'true';
    process.env.SE_DRIVER_VERSION = '0.37.1';
    process.env.SE_SKIP_DRIVER_IN_PATH = 'true';
    process.env.SE_SKIP_BROWSER_IN_PATH = 'true';
    driver = await new Builder()
      .forBrowser('firefox')
      .setFirefoxOptions(new firefox.Options().setBrowserVersion(version))
      .setFirefoxService(
        new firefox.ServiceBuilder().addArguments('--allow-system-access'),
      )
      .build();
    const capabilities = await driver.getCapabilities();
    report.browserVersion = capabilities.get('browserVersion');
    report.driverVersion = capabilities.get('moz:geckodriverVersion');
    assert.equal(report.browserVersion, version);
    assert.equal(report.driverVersion, '0.37.1');
    productId = manifest.browser_specific_settings.gecko.id;
    assert.equal(productId, 'addonray@ranokay.dev');
    await installTemporaryExtension(
      driver,
      packagePaths('firefox').extensionArchive,
    );
    await driver.setContext('chrome');
    try {
      popupUrl = await driver.executeScript(
        (id) => WebExtensionPolicy.getByID(id).getURL('popup.html'),
        productId,
      );
    } finally {
      await driver.setContext('content');
    }
  } else {
    const work = await mkdtemp(join(tmpdir(), 'addonray-p2d-native-'));
    const product = join(work, 'product');
    const extracted = await extractChromePackage(product);
    assert.equal(extracted.sha256, extension.sha256);
    const session = await launchChrome({ headless: false });
    driver = session.driver;
    cdp = session.cdp;
    report.browserVersion = session.version;
    report.driverVersion = session.driverVersion;
    productId = await installChromeExtension(cdp, product);
    popupUrl = `chrome-extension://${productId}/popup.html`;
  }
  report.productId = productId;
  await driver.manage().setTimeouts({ script: 10000 });
  await driver.get(sourceUrl);
  sourceHandle = await driver.getWindowHandle();
  await driver.switchTo().newWindow('tab');
  controlHandle = await driver.getWindowHandle();
  await driver.get(popupUrl);
  await driver.wait(
    () =>
      driver.executeScript(() =>
        Boolean(document.querySelector('#new-page-error-check')),
      ),
    10000,
  );
  report.initialGrants = await driver.executeAsyncScript((done) => {
    (globalThis.browser ?? globalThis.chrome).permissions
      .getAll()
      .then(done, () => done(null));
  });
  assert(report.initialGrants, 'Initial optional grants could not be read.');
  assert.deepEqual(report.initialGrants.origins ?? [], []);
  for (const name of ['management', 'scripting']) {
    assert.equal(
      report.initialGrants.permissions.includes(name),
      false,
      `A fresh native profile must start without optional ${name} access.`,
    );
  }
  await returnToSource();
  console.log(
    `Disposable unmodified ${report.distribution} ${report.browserVersion} ready.`,
  );
  console.log(
    `Product: ${productId}; popup/control: ${popupUrl}; source: ${sourceUrl}`,
  );
  console.log(
    'Use the actual toolbar popup and native controls for all captures, checks and attachments. No build or source edits while this session remains open.',
  );
  console.log(
    'Commands: snapshot, driver-launch (Firefox setup only), revoke-scripting, revoke-management, finish. Revocation requires a fresh populated snapshot and a confirmed check left open.',
  );
  input = createInterface({ input: process.stdin, output: process.stdout });
  for await (const line of input) {
    const command = line.trim();
    if (command === 'finish') break;
    if (command === 'driver-launch') {
      await launchFirefoxCheck();
    } else if (command === 'snapshot') {
      const value = await snapshot();
      report.snapshots.push({ timestamp: new Date().toISOString(), value });
      lastPopulatedSnapshot = populatedInvestigations(value).length
        ? value
        : null;
      console.log(JSON.stringify(value));
    } else if (
      command === 'revoke-scripting' ||
      command === 'revoke-management'
    ) {
      await revoke(command.slice('revoke-'.length));
    } else {
      console.log(
        'Unknown command. Use snapshot, revoke-scripting, revoke-management or finish.',
      );
    }
    await returnToSource();
  }
  report.endingSourceCommit = git('rev-parse', 'HEAD');
  report.endingSourceDirty = Boolean(git('status', '--porcelain'));
  assert.equal(
    report.endingSourceCommit,
    report.sourceCommit,
    'Source commit changed during native session.',
  );
  const finalPackage = await checkPackage(target);
  assert.equal(
    finalPackage.extension.sha256,
    extension.sha256,
    'Product artifact changed during native session.',
  );
  assert.equal(
    finalPackage.sources.sha256,
    sources.sha256,
    'Production inputs changed during native session.',
  );
  report.result = report.checks.length
    ? 'passed-post-native-api-with-qualification-gaps'
    : 'setup-and-cleanup-only';
} catch (error) {
  report.result = 'failed';
  report.failure = String(error);
  process.exitCode = 1;
  console.error(error);
} finally {
  input?.close();
  process.stdin.pause();
  cdp?.close();
  try {
    if (driver) {
      await driver.quit();
      report.cleanup.browserClosed = true;
    }
  } catch (error) {
    report.cleanup.browserFailure = String(error);
    report.result = 'failed';
    process.exitCode = 1;
  }
  if (server) {
    await new Promise((done) => {
      server.closeAllConnections();
      server.close(done);
    });
    report.cleanup.serverClosed = true;
  }
  await writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Native setup/API report: ${output}`);
}
