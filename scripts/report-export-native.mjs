/* global WebExtensionPolicy */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  access,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  writeFile,
} from 'node:fs/promises';
import { arch, platform, tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { Builder, By, until } from 'selenium-webdriver';
import firefox from 'selenium-webdriver/firefox.js';
import { checkPackage, sha256 } from './check-package.mjs';
import { installChromeExtension, launchChrome } from './chrome-session.mjs';
import { installTemporaryExtension } from './firefox-install.mjs';
import { packagePaths } from './package-paths.mjs';

function help() {
  console.log(
    [
      'Usage: mise exec -- bun scripts/report-export-native.mjs firefox|chrome',
      'Build/package separately before launch. This helper never rebuilds.',
      'Commands: snapshot, verify-download, revoke-management, finish.',
      'Use native controls for consent, captures, assessment, preview and download.',
      'After reviewing the preview, run snapshot before downloading.',
      'Download settings are test-controlled; native Save As behavior is not qualified.',
      'Do not edit source or rebuild while the retained session is open.',
    ].join('\n'),
  );
}

if (process.argv.includes('--help')) {
  help();
  process.exit(0);
}
const target = process.argv[2];
assert(['firefox', 'chrome'].includes(target), 'Choose firefox or chrome.');
const repo = resolve(import.meta.dirname, '..');
process.chdir(repo);
assert.equal(Bun.revision, '963452075e9d7e2a47a482f297143af5ed4f76c0');
await mkdir('.scratch', { recursive: true });
const work = await mkdtemp(resolve(`.scratch/report-export-native-${target}-`));
const output = join(work, 'report.json');
const downloads = join(work, 'downloads');
await mkdir(downloads);
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
const exists = async (path) => {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
};
const report = {
  timestamp: new Date().toISOString(),
  distribution: target === 'firefox' ? 'Firefox' : 'Chrome for Testing',
  sourceCommit: git('rev-parse', 'HEAD'),
  sourceDirty: Boolean(git('status', '--porcelain')),
  os: `${platform()} ${arch()}`,
  runtime: { bun: Bun.version, revision: Bun.revision },
  helperSha256: sha256(await readFile(import.meta.filename)),
  authority: {
    product: 'Unmodified validated package in a disposable visible profile.',
    route:
      'Driver opens investigation.html directly. The separate popup.html tab is a read-only own-view control. Neither route qualifies native toolbar launch.',
    consent:
      'No optional product permission is pre-granted. Human/computer use must approve the real management prompt through the unmodified capture controls.',
    downloads:
      'Firefox preferences or Chrome Browser.setDownloadBehavior direct automatic downloads to this helper-owned directory. File bytes/completion are observed externally, never by product code.',
    snapshots:
      'Driver reads own-view DOM and retains controlled fixture observations in ignored local evidence. No product hooks or API stubs are installed.',
    revocation:
      'The explicit revoke-management command calls the real product permissions.remove API. This is driver API evidence, not native browser-settings usability.',
  },
  checks: [],
  snapshots: [],
  commands: [],
  gaps: [
    'Native consent, keyboard, preview readability and usability require a separate human/computer-use record. This helper issues no native UI verdict.',
    'No default Save As, download cancellation, immediate-close/reload survival, private/unknown context, other OS, retail installation, store or signing qualification.',
  ],
  cleanup: {},
  result: 'pending',
};
let driver, cdp, input, controlHandle, profilePath;
let initialPackage;
let lastObservedPreview = null;
let finished = false;
const passed = (name, detail) =>
  report.checks.push({ name, status: 'passed', detail });
const persist = () => writeFile(output, `${JSON.stringify(report, null, 2)}\n`);

async function snapshot() {
  await driver.switchTo().window(controlHandle);
  return driver.executeAsyncScript(async (done) => {
    try {
      const api = globalThis.browser ?? globalThis.chrome;
      const route = api.runtime.getURL('investigation.html');
      const investigations = [];
      for (const view of api.extension.getViews({ type: 'tab' })) {
        try {
          if (view.location.href !== route) continue;
          const doc = view.document;
          const preview = doc.querySelector('#report-text');
          const text = (selector) =>
            doc.querySelector(selector)?.textContent?.trim() ?? null;
          investigations.push({
            label: text('#investigation-label'),
            bodyText: doc.body.textContent,
            beforeInventory: Boolean(
              doc.querySelector('[data-testid="before-snapshot"]'),
            ),
            afterInventory: Boolean(
              doc.querySelector('[data-testid="after-snapshot"]'),
            ),
            beforeText: text('[data-testid="before-snapshot"]'),
            afterText: text('[data-testid="after-snapshot"]'),
            assessment:
              doc.querySelector('input[name="page-assessment"]:checked')
                ?.value ?? null,
            preview: preview?.value ?? null,
            readOnly: preview?.readOnly ?? null,
            prepareDisabled:
              doc.querySelector('#report-prepare')?.disabled ?? null,
            downloadDisabled:
              doc.querySelector('#report-download')?.disabled ?? null,
            reportText: text('[aria-labelledby="report-heading"]'),
            focus: {
              id: doc.activeElement?.id ?? null,
              tag: doc.activeElement?.tagName ?? null,
              documentHasFocus: doc.hasFocus(),
            },
          });
        } catch {
          // A view may close between enumeration and its DOM read.
        }
      }
      done({ investigations, grants: await api.permissions.getAll() });
    } catch (error) {
      done({ failure: String(error) });
    }
  });
}

async function recordSnapshot() {
  const value = await snapshot();
  const timestamp = new Date().toISOString();
  report.snapshots.push({ timestamp, value });
  assert.equal(value.failure, undefined);
  const previews = value.investigations.filter(
    (entry) => entry.preview !== null,
  );
  if (previews.length === 1) {
    assert.equal(previews[0].readOnly, true);
    lastObservedPreview = {
      timestamp,
      label: previews[0].label,
      text: previews[0].preview,
    };
  }
  console.log(JSON.stringify({ command: 'snapshot', ...value }));
}

async function verifyDownload() {
  assert(
    lastObservedPreview,
    'Review the preview and run snapshot before verifying its download.',
  );
  const expected = Buffer.from(lastObservedPreview.text, 'utf8');
  const observation = {
    previewSnapshotAt: lastObservedPreview.timestamp,
    reviewedMarkdown: lastObservedPreview.text,
    reviewedBytes: expected.length,
    reviewedSha256: sha256(expected),
  };
  report.downloadObservation = observation;
  const result = await driver.wait(
    async () => {
      const entries = await readdir(downloads, { withFileTypes: true });
      observation.entries = entries.map((entry) => entry.name);
      assert(entries.every((entry) => entry.isFile()));
      const complete = entries.filter((entry) => entry.name.endsWith('.md'));
      assert(
        complete.length <= 1,
        'Use one download per native session to avoid ambiguous preview matching.',
      );
      if (entries.length !== 1 || complete.length !== 1) return false;
      const path = join(downloads, complete[0].name);
      let bytes;
      try {
        bytes = await readFile(path);
      } catch (error) {
        if (error.code === 'ENOENT') return false;
        throw error;
      }
      Object.assign(observation, {
        path,
        filename: complete[0].name,
        downloadedBytes: bytes.length,
        downloadedSha256: sha256(bytes),
        downloadedMarkdown: bytes.toString('utf8'),
        exactUtf8Match: bytes.equals(expected),
      });
      return bytes.length === expected.length && { bytes, path };
    },
    15000,
    'No complete Markdown file of the last observed preview size appeared.',
  );
  assert.equal(observation.filename, 'addonray-investigation.md');
  assert.deepEqual(result.bytes, expected);
  passed(
    'External downloaded UTF-8 bytes match the last explicit preview snapshot',
    {
      ...observation,
      completionAuthority:
        'External filesystem only; no native or product save-completion verdict.',
    },
  );
  console.log(JSON.stringify({ command: 'verify-download', ...observation }));
}

async function revokeManagement() {
  const observation = { status: 'checking', afterPolls: 0 };
  (report.revocations ??= []).push(observation);
  try {
    const before = await snapshot();
    observation.before = before;
    assert.equal(before.failure, undefined);
    const populated = before.investigations.filter(
      (entry) =>
        entry.beforeInventory && entry.afterInventory && entry.preview !== null,
    );
    assert(
      populated.length,
      'Leave a populated pair and prepared preview open.',
    );
    const removed = await driver.executeAsyncScript(async (done) => {
      const observation = {};
      try {
        const api = globalThis.browser ?? globalThis.chrome;
        const request = { permissions: ['management'] };
        observation.granted = await api.permissions.contains(request);
        observation.removed =
          observation.granted && (await api.permissions.remove(request));
        observation.stillGranted = await api.permissions.contains(request);
      } catch (error) {
        observation.failure = String(error);
      }
      done(observation);
    });
    observation.permissionRemoval = removed;
    assert.equal(removed.failure, undefined);
    assert.equal(removed.granted, true);
    assert.equal(removed.removed, true);
    assert.equal(removed.stillGranted, false);
    let after;
    await driver.wait(
      async () => {
        after = await snapshot();
        observation.after = after;
        observation.afterPolls += 1;
        assert.equal(after.failure, undefined);
        return populated.every((prior) => {
          const entry = after.investigations.find(
            (value) => value.label === prior.label,
          );
          return (
            entry &&
            !entry.beforeInventory &&
            !entry.afterInventory &&
            entry.assessment === null &&
            entry.preview === null &&
            entry.downloadDisabled === null &&
            entry.prepareDisabled === true
          );
        });
      },
      10000,
      'Actual management removal did not clear the populated investigation and preview.',
    );
    observation.status = 'verified';
    passed(
      'Actual optional management removal clears the populated pair, assessment and preview',
      {
        before,
        after,
        permissionRemoval: removed,
      },
    );
    console.log(
      JSON.stringify({
        command: 'revoke-management',
        permissionRemoval: removed,
        after,
      }),
    );
  } catch (error) {
    observation.status = 'failed';
    observation.failure = String(error);
    throw error;
  }
}

async function finishIdentity() {
  const current = await checkPackage(target);
  assert.equal(
    git('rev-parse', 'HEAD'),
    report.sourceCommit,
    'Source HEAD changed.',
  );
  assert.equal(
    current.extension.sha256,
    initialPackage.extension.sha256,
    'Product archive changed.',
  );
  assert.equal(
    current.sources.sha256,
    initialPackage.sources.sha256,
    'Production source archive changed.',
  );
  assert.equal(
    sha256(await readFile(import.meta.filename)),
    report.helperSha256,
    'Native helper changed.',
  );
  report.endingSourceCommit = git('rev-parse', 'HEAD');
  report.endingSourceDirty = Boolean(git('status', '--porcelain'));
  report.identityVerifiedAtFinish = true;
}

async function cleanupProfile() {
  if (!profilePath) return;
  report.cleanup.profilePath = profilePath;
  report.cleanup.profileRemovedAfterDriverQuit = !(await exists(profilePath));
  if (await exists(profilePath)) {
    assert.equal(report.cleanup.browserClosed, true);
    assert.match(
      basename(profilePath),
      /^(?:rust_mozprofile|org\.chromium\.Chromium\.scoped_dir\.)/,
    );
    assert.equal(
      await realpath(dirname(profilePath)),
      await realpath(tmpdir()),
    );
    const active = execFileSync('ps', ['-axo', 'pid,ppid,command'], {
      encoding: 'utf8',
    })
      .split('\n')
      .filter(
        (line) =>
          line.includes(profilePath) &&
          /(?:firefox|Firefox|Chrome|Chromium)/.test(line),
      );
    assert.deepEqual(
      active,
      [],
      'The owned disposable profile is still in use.',
    );
    const stat = await lstat(profilePath);
    assert(stat.isDirectory() && !stat.isSymbolicLink());
    await rm(profilePath, { recursive: true, force: false });
    report.cleanup.exactOwnedProfileRemoved = true;
  }
  report.cleanup.profileRemoved = !(await exists(profilePath));
  assert.equal(report.cleanup.profileRemoved, true);
}

try {
  initialPackage = await checkPackage(target);
  const { extension, sources } = initialPackage;
  const manifest = JSON.parse(extension.files.get('manifest.json').toString());
  assert.deepEqual(manifest.permissions, ['activeTab']);
  assert.deepEqual([...manifest.optional_permissions].sort(), [
    'management',
    'scripting',
  ]);
  report.installation = {
    mode:
      target === 'firefox'
        ? 'temporary-unmodified-retained-xpi'
        : 'unmodified-unpacked-from-validated-zip',
    artifactSha256: extension.sha256,
    sourceArchiveSha256: sources.sha256,
  };
  report.productionInputs = Object.fromEntries(
    [...sources.files].map(([path, bytes]) => [path, sha256(bytes)]),
  );
  const fixture = join(work, 'fixture');
  await mkdir(fixture);
  const fixtureManifest = {
    manifest_version: 3,
    name: 'Controlled report export fixture',
    version: '1.0',
    permissions: ['storage'],
    ...(target === 'firefox'
      ? {
          browser_specific_settings: {
            gecko: { id: 'report-export-native-fixture@fixture.invalid' },
          },
        }
      : {}),
  };
  await writeFile(
    join(fixture, 'manifest.json'),
    JSON.stringify(fixtureManifest, null, 2),
  );
  report.fixture = {
    manifest: fixtureManifest,
    sha256: sha256(await readFile(join(fixture, 'manifest.json'))),
  };
  let baseUrl;
  if (target === 'firefox') {
    if (process.env.FIREFOX_VERSION)
      assert.equal(process.env.FIREFOX_VERSION, '158.0.1');
    process.env.SE_AVOID_STATS = 'true';
    process.env.SE_DRIVER_VERSION = '0.37.1';
    process.env.SE_SKIP_DRIVER_IN_PATH = 'true';
    process.env.SE_SKIP_BROWSER_IN_PATH = 'true';
    const retained = join(work, 'product.xpi');
    await writeFile(
      retained,
      await readFile(packagePaths(target).extensionArchive),
    );
    assert.equal(sha256(await readFile(retained)), extension.sha256);
    driver = await new Builder()
      .forBrowser('firefox')
      .setFirefoxService(
        new firefox.ServiceBuilder().addArguments('--allow-system-access'),
      )
      .setFirefoxOptions(
        new firefox.Options()
          .setBrowserVersion('158.0.1')
          .setPreference('browser.download.folderList', 2)
          .setPreference('browser.download.dir', downloads)
          .setPreference('browser.download.useDownloadDir', true)
          .setPreference(
            'browser.download.always_ask_before_handling_new_types',
            false,
          )
          .setPreference(
            'browser.helperApps.neverAsk.saveToDisk',
            'text/markdown,text/plain,application/octet-stream',
          ),
      )
      .build();
    const capabilities = await driver.getCapabilities();
    report.browserVersion = capabilities.get('browserVersion');
    report.driverVersion = capabilities.get('moz:geckodriverVersion');
    profilePath = capabilities.get('moz:profile');
    assert.equal(report.browserVersion, '158.0.1');
    assert.equal(report.driverVersion, '0.37.1');
    await installTemporaryExtension(driver, fixture);
    await installTemporaryExtension(driver, retained);
    await driver.setContext('chrome');
    try {
      baseUrl = await driver.executeScript(
        (id) => WebExtensionPolicy.getByID(id).getURL(''),
        manifest.browser_specific_settings.gecko.id,
      );
    } finally {
      await driver.setContext('content');
    }
  } else {
    const product = join(work, 'product');
    for (const [path, bytes] of extension.files) {
      const destination = join(product, path);
      await mkdir(dirname(destination), { recursive: true });
      await writeFile(destination, bytes);
    }
    let session;
    process.chdir(work);
    try {
      session = await launchChrome({ headless: false });
    } finally {
      process.chdir(repo);
    }
    driver = session.driver;
    cdp = session.cdp;
    report.browserVersion = session.version;
    report.driverVersion = session.driverVersion;
    profilePath = (await driver.getCapabilities()).get('chrome').userDataDir;
    await cdp.send('Browser.setDownloadBehavior', {
      behavior: 'allow',
      downloadPath: downloads,
      eventsEnabled: true,
    });
    await installChromeExtension(cdp, fixture);
    const productId = await installChromeExtension(cdp, product);
    baseUrl = `chrome-extension://${productId}/`;
  }
  await driver.manage().setTimeouts({ script: 10000, pageLoad: 30000 });
  await driver.get(`${baseUrl}popup.html`);
  controlHandle = await driver.getWindowHandle();
  report.initialGrants = await driver.executeAsyncScript((done) =>
    (globalThis.browser ?? globalThis.chrome).permissions.getAll().then(done),
  );
  assert.deepEqual(report.initialGrants.origins ?? [], []);
  for (const permission of ['management', 'scripting'])
    assert.equal(report.initialGrants.permissions.includes(permission), false);
  await driver.switchTo().newWindow('tab');
  report.investigationRoute = `${baseUrl}investigation.html`;
  await driver.get(report.investigationRoute);
  await driver.wait(until.elementLocated(By.id('capture-before')), 10000);
  input = createInterface({ input: process.stdin, output: process.stdout });
  await persist();
  console.log(
    JSON.stringify({
      ready: true,
      target,
      distribution: report.distribution,
      browserVersion: report.browserVersion,
      driverVersion: report.driverVersion,
      sourceCommit: report.sourceCommit,
      sourceDirty: report.sourceDirty,
      artifactSha256: extension.sha256,
      investigationRoute: report.investigationRoute,
      reportPath: output,
      downloadDirectory: downloads,
    }),
  );
  help();
  for await (const line of input) {
    const command = line.trim();
    if (command === 'finish') {
      finished = true;
      break;
    }
    const entry = {
      timestamp: new Date().toISOString(),
      command,
      status: 'pending',
    };
    report.commands.push(entry);
    try {
      if (command === 'snapshot') await recordSnapshot();
      else if (command === 'verify-download') await verifyDownload();
      else if (command === 'revoke-management') await revokeManagement();
      else
        throw new Error(
          'Use snapshot, verify-download, revoke-management or finish.',
        );
      entry.status = 'passed';
    } catch (error) {
      entry.status = 'failed';
      entry.failure = String(error);
      console.error(entry.failure);
    }
    await persist();
  }
  assert(finished, 'Input ended before an explicit finish command.');
  await finishIdentity();
  assert(
    report.commands.every((entry) => entry.status === 'passed'),
    'A helper command failed; inspect its recorded evidence.',
  );
  report.result = report.checks.length
    ? 'passed-requested-driver-checks-with-native-gaps'
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
    await cleanupProfile();
  } catch (error) {
    report.cleanup.failure = String(error);
    report.result = 'failed';
    process.exitCode = 1;
  }
  report.cleanup.retainedControlledEvidenceDirectory = work;
  await persist();
  console.log(
    JSON.stringify({
      nativeHelperReport: output,
      result: report.result,
      cleanup: report.cleanup,
    }),
  );
}
