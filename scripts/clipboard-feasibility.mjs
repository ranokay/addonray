/* global WebExtensionPolicy */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { arch, platform } from 'node:os';
import { Builder, By, until } from 'selenium-webdriver';
import firefox from 'selenium-webdriver/firefox.js';
import { installTemporaryExtension } from './firefox-install.mjs';
import { launchChrome, installChromeExtension } from './chrome-session.mjs';

// Permission-free clipboard feasibility for #11. This probe is test-only: the
// writer fixture declares no clipboard permission and the separate reader
// fixture declares test-only clipboardRead authority. Neither fixture, nor its
// manifest, is part of the product package.
process.env.SE_AVOID_STATS = 'true';
process.env.SE_DRIVER_VERSION = process.env.SE_DRIVER_VERSION ?? '0.37.1';
process.env.SE_SKIP_DRIVER_IN_PATH = 'true';
process.env.SE_SKIP_BROWSER_IN_PATH = 'true';

const mib = 1024 * 1024;
// Local probe commands resolve through a fixed, non-user-writable PATH.
const commandEnv = { PATH: '/usr/bin:/bin:/usr/sbin:/sbin' };
const writerId = 'clipboard-feasibility-writer@addonray.test';
const readerId = 'clipboard-feasibility-reader@addonray.test';
const expectedMib = 'x'.repeat(mib);
const expectedMibHash = createHash('sha256')
  .update(Buffer.from(expectedMib, 'utf8'))
  .digest('hex');
const sha256 = (value) =>
  createHash('sha256').update(value, 'utf8').digest('hex');

const writerPage = `<!doctype html>
<html><head><meta charset="utf-8"><title>Clipboard writer</title></head>
<body>
<h1>Clipboard writer</h1>
<button id="write-now">Write immediately</button>
<button id="write-guarded">Write after guards</button>
<button id="write-mib">Write 1 MiB</button>
<button id="write-exec">execCommand copy</button>
<input id="restore-text" aria-label="Clipboard text to restore">
<button id="restore">Restore clipboard</button>
<pre id="result">idle</pre>
<script src="writer.js"></script>
</body></html>`;

const writerScript = `const marker = 'addonray-feasibility-immediate';
const guardedMarker = 'addonray-feasibility-guarded';
const results = {};
window.__clipboardResults = results;
const detail = () => ({
  hasFocus: document.hasFocus(),
  activation: navigator.userActivation?.isActive ?? null,
  hasClipboard: Boolean(navigator.clipboard),
});
function record(name, value) {
  results[name] = value;
  document.getElementById('result').textContent = JSON.stringify(results);
}
async function write(name, text) {
  const before = detail();
  const started = performance.now();
  try {
    await navigator.clipboard.writeText(text);
    record(name, { status: 'resolved', before, elapsedMs: performance.now() - started });
  } catch (error) {
    record(name, {
      status: 'rejected',
      before,
      elapsedMs: performance.now() - started,
      error: { name: error?.name ?? null, message: String(error?.message ?? error) },
    });
  }
}
document.getElementById('write-now').addEventListener('click', () => {
  void write('immediate', marker);
});
document.getElementById('write-guarded').addEventListener('click', () => {
  void (async () => {
    const before = detail();
    const started = performance.now();
    try {
      const api = globalThis.browser ?? globalThis.chrome;
      // Simulate product revalidation: current-tab classification, a storage-like
      // await, and a final eligibility check before the write.
      await api.tabs.getCurrent();
      await Promise.resolve();
      await new Promise((resolve) => setTimeout(resolve, 250));
      await api.tabs.getCurrent();
      await navigator.clipboard.writeText(guardedMarker);
      record('guarded', { status: 'resolved', before, elapsedMs: performance.now() - started });
    } catch (error) {
      record('guarded', {
        status: 'rejected',
        before,
        elapsedMs: performance.now() - started,
        error: { name: error?.name ?? null, message: String(error?.message ?? error) },
      });
    }
  })();
});
document.getElementById('write-mib').addEventListener('click', () => {
  void write('mib', 'x'.repeat(${mib}));
});
document.getElementById('write-exec').addEventListener('click', () => {
  const before = detail();
  const area = document.createElement('textarea');
  area.value = 'addonray-feasibility-exec';
  area.setAttribute('readonly', 'readonly');
  area.style.position = 'fixed';
  area.style.left = '-1000px';
  area.style.top = '0';
  document.body.append(area);
  area.select();
  let copied = false;
  try {
    copied = document.execCommand('copy');
  } catch (error) {
    record('exec', { status: 'rejected', before, error: { name: error?.name ?? null, message: String(error?.message ?? error) } });
    area.remove();
    return;
  }
  area.remove();
  record('exec', { status: copied ? 'resolved' : 'rejected', before });
});
document.getElementById('restore').addEventListener('click', () => {
  void write('restore', document.getElementById('restore-text').value);
});
window.__writeWithoutActivation = async () => {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await write('no-activation', 'addonray-feasibility-no-activation');
};
`;

const readerPage = `<!doctype html>
<html><head><meta charset="utf-8"><title>Clipboard reader</title></head>
<body>
<h1>Clipboard reader</h1>
<button id="read">Read clipboard</button>
<pre id="result">idle</pre>
<script src="reader.js"></script>
</body></html>`;

const readerScript = `window.__clipboardRead = async () => {
  try {
    const text = await navigator.clipboard.readText();
    const bytes = new TextEncoder().encode(text);
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    const hash = [...new Uint8Array(digest)]
      .map((value) => value.toString(16).padStart(2, '0'))
      .join('');
    const result = {
      status: 'resolved',
      length: text.length,
      bytes: bytes.length,
      hash,
      text: text.length <= 65536 ? text : null,
      prefix: text.slice(0, 64),
      suffix: text.slice(-64),
    };
    window.__clipboardReadResult = result;
    document.getElementById('result').textContent = JSON.stringify(result);
    return result;
  } catch (error) {
    const result = {
      status: 'rejected',
      error: { name: error?.name ?? null, message: String(error?.message ?? error) },
    };
    window.__clipboardReadResult = result;
    document.getElementById('result').textContent = JSON.stringify(result);
    return result;
  }
};
document.getElementById('read').addEventListener('click', () => {
  void window.__clipboardRead();
});
`;

async function writeFixtures(directory) {
  await mkdir(directory, { recursive: true });
  await writeFile(
    join(directory, 'manifest.json'),
    JSON.stringify({
      manifest_version: 3,
      name: 'AddonRay clipboard feasibility writer',
      version: '1.0',
      browser_specific_settings: {
        gecko: {
          id: writerId,
          data_collection_permissions: { required: ['none'] },
        },
      },
      permissions: [],
    }),
  );
  await writeFile(join(directory, 'writer.html'), writerPage);
  await writeFile(join(directory, 'writer.js'), writerScript);
  return directory;
}

async function writeReader(directory) {
  await mkdir(directory, { recursive: true });
  await writeFile(
    join(directory, 'manifest.json'),
    JSON.stringify({
      manifest_version: 3,
      name: 'AddonRay clipboard feasibility reader',
      version: '1.0',
      browser_specific_settings: {
        gecko: {
          id: readerId,
          data_collection_permissions: { required: ['none'] },
        },
      },
      // Test-only authority. The writer fixture and product manifest never
      // declare clipboardRead or clipboardWrite.
      permissions: ['clipboardRead'],
    }),
  );
  await writeFile(join(directory, 'reader.html'), readerPage);
  await writeFile(join(directory, 'reader.js'), readerScript);
  return directory;
}

const requestedVersion = process.env.FIREFOX_VERSION;
if (requestedVersion)
  assert.match(requestedVersion, /^\d+\.\d+(?:\.\d+)?(?:esr)?$/);
const target = process.argv[2] ?? 'firefox';
assert(['firefox', 'chrome'].includes(target));

await mkdir('.scratch', { recursive: true });
const work = await mkdtemp(
  resolve(`.scratch/clipboard-feasibility-${target}-`),
);
const writer = await writeFixtures(join(work, 'writer'));
const reader = await writeReader(join(work, 'reader'));
const report = {
  target,
  timestamp: new Date().toISOString(),
  os: `${platform()} ${arch()}`,
  sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], {
    encoding: 'utf8',
    env: commandEnv,
  }).trim(),
  sourceDirty: Boolean(
    execFileSync('git', ['status', '--porcelain'], {
      encoding: 'utf8',
      env: commandEnv,
    }).trim(),
  ),
  requestedVersion: requestedVersion ?? null,
  writer: { id: writerId, manifestPermissions: [], clipboardPermission: false },
  reader: {
    id: readerId,
    manifestPermissions: ['clipboardRead'],
    authority: 'test-only readback; not part of the product or source package',
  },
  browserVersion: null,
  driverVersion: null,
  checks: [],
  policy: {},
  gaps: [
    'This probe records only the exact browser/OS/architecture it runs on.',
    'The reader fixture uses test-only clipboardRead authority to read exact bytes. It is separate from the writer and product manifests.',
    'The no-activation case records browser policy; it is not a product requirement or a substitute for deterministic rejection tests.',
    'A 1 MiB clipboard write establishes this distribution accepts the bound; it does not establish every OS clipboard consumer handles it.',
  ],
};
const passed = (name, detail = {}) => {
  report.checks.push({ name, status: 'passed', ...detail });
  console.log(`Passed: ${name}`);
};
const failed = (name, detail = {}) => {
  report.checks.push({ name, status: 'failed', ...detail });
  console.error(`Failed: ${name}`);
};
const checked = (condition, name, detail = {}) => {
  if (condition) passed(name, detail);
  else failed(name, detail);
  return Boolean(condition);
};
let driver;
let readerHandle;
let writerHandle;
let restore;
let restoreClipboard = null;
let initialClipboardText = '';
try {
  if (target === 'firefox') {
    const options = new firefox.Options().addArguments('-headless');
    if (requestedVersion) options.setBrowserVersion(requestedVersion);
    driver = await new Builder()
      .forBrowser('firefox')
      .setFirefoxService(
        new firefox.ServiceBuilder().addArguments('--allow-system-access'),
      )
      .setFirefoxOptions(options)
      .build();
    await driver.manage().setTimeouts({ script: 30000, pageLoad: 30000 });
    report.browserVersion = (await driver.getCapabilities()).get(
      'browserVersion',
    );
    report.driverVersion = (await driver.getCapabilities()).get(
      'moz:geckodriverVersion',
    );
    if (requestedVersion)
      assert.equal(report.browserVersion, requestedVersion.replace(/esr$/, ''));
    await installTemporaryExtension(driver, writer);
    await installTemporaryExtension(driver, reader);
    async function extensionUrl(id, path) {
      await driver.setContext('chrome');
      const url = await driver.executeScript(
        (extensionId, resource) =>
          WebExtensionPolicy.getByID(extensionId).getURL(resource),
        id,
        path,
      );
      await driver.setContext('content');
      return url;
    }
    writerHandle = await driver.getWindowHandle();
    await driver.get(await extensionUrl(writerId, 'writer.html'));
    await driver.switchTo().newWindow('tab');
    readerHandle = await driver.getWindowHandle();
    await driver.get(await extensionUrl(readerId, 'reader.html'));
  } else {
    const session = await launchChrome();
    driver = session.driver;
    report.browserVersion = session.version;
    report.driverVersion = session.driverVersion;
    const fixtureWriterId = await installChromeExtension(session.cdp, writer);
    const fixtureReaderId = await installChromeExtension(session.cdp, reader);
    report.writer.id = fixtureWriterId;
    report.reader.id = fixtureReaderId;
    writerHandle = await driver.getWindowHandle();
    await driver.get(`chrome-extension://${fixtureWriterId}/writer.html`);
    await driver.switchTo().newWindow('tab');
    readerHandle = await driver.getWindowHandle();
    await driver.get(`chrome-extension://${fixtureReaderId}/reader.html`);
  }
  await driver.wait(until.elementLocated(By.css('h1')), 10000);
  assert.equal(
    await driver.findElement(By.css('h1')).getText(),
    'Clipboard reader',
  );

  async function readClipboard() {
    await driver.switchTo().window(readerHandle);
    await driver.executeScript(() => {
      globalThis.__clipboardReadResult = null;
    });
    await driver.findElement(By.id('read')).click();
    const result = await driver.wait(
      async () => {
        const value = await driver.executeScript(
          () => globalThis.__clipboardReadResult ?? null,
        );
        return value ?? false;
      },
      15000,
      'The test-only reader did not return a clipboard result',
    );
    return result;
  }
  restoreClipboard = async (text) => {
    await driver.switchTo().window(writerHandle);
    if (text) await driver.findElement(By.id('restore-text')).sendKeys(text);
    await driver.findElement(By.id('restore')).click();
    const result = await driver.wait(async () => {
      const value = await driver.executeScript(
        () => globalThis.__clipboardResults?.restore ?? null,
      );
      return value ?? false;
    }, 15000);
    return { write: result, read: await readClipboard() };
  };

  await driver.switchTo().window(writerHandle);
  const writerManifest = await driver.executeScript(() => {
    const api = globalThis.browser ?? globalThis.chrome;
    return api.runtime.getManifest();
  });
  checked(
    !writerManifest.permissions?.includes('clipboardWrite') &&
      !writerManifest.permissions?.includes('clipboardRead'),
    'Writer fixture declares no clipboard permission',
    { permissions: writerManifest.permissions },
  );
  const initial = await readClipboard();
  // The preexisting clipboard is retained only in memory for restoration. Its
  // content never enters the report or any durable evidence.
  report.initialClipboard =
    initial.status === 'resolved'
      ? { status: initial.status, bytes: initial.bytes, hash: initial.hash }
      : initial;
  initialClipboardText = initial.text ?? '';
  restore = initial.status === 'resolved';

  await driver.switchTo().window(writerHandle);
  await driver.findElement(By.id('write-now')).click();
  const immediate = await driver.wait(async () => {
    const value = await driver.executeScript(
      () => globalThis.__clipboardResults?.immediate ?? null,
    );
    return value ?? false;
  }, 15000);
  const immediateRead = await readClipboard();
  checked(
    immediate.status === 'resolved' &&
      immediateRead.status === 'resolved' &&
      immediateRead.text === 'addonray-feasibility-immediate' &&
      immediateRead.hash === sha256('addonray-feasibility-immediate'),
    'Permission-free immediate trusted-click write resolves exactly',
    { write: immediate, read: immediateRead },
  );

  await driver.switchTo().window(writerHandle);
  await driver.findElement(By.id('write-guarded')).click();
  const guarded = await driver.wait(async () => {
    const value = await driver.executeScript(
      () => globalThis.__clipboardResults?.guarded ?? null,
    );
    return value ?? false;
  }, 15000);
  const guardedRead = await readClipboard();
  checked(
    guarded.status === 'resolved' &&
      guardedRead.status === 'resolved' &&
      guardedRead.text === 'addonray-feasibility-guarded' &&
      guardedRead.hash === sha256('addonray-feasibility-guarded'),
    'Permission-free write after asynchronous guard flow resolves exactly',
    { write: guarded, read: guardedRead },
  );

  await new Promise((resolve) => setTimeout(resolve, 6000));
  await driver.switchTo().window(writerHandle);
  await driver.executeScript(() => {
    void globalThis.__writeWithoutActivation();
  });
  const noActivation = await driver.wait(async () => {
    const value = await driver.executeScript(
      () => globalThis.__clipboardResults?.['no-activation'] ?? null,
    );
    return value ?? false;
  }, 15000);
  const noActivationRead = await readClipboard();
  report.policy.noActivation = {
    write: noActivation,
    clipboardChanged:
      noActivationRead.status === 'resolved' &&
      noActivationRead.text === 'addonray-feasibility-no-activation',
  };
  passed('Recorded no-activation browser policy', report.policy.noActivation);

  await driver.switchTo().window(writerHandle);
  await driver.findElement(By.id('write-mib')).click();
  const mibResult = await driver.wait(async () => {
    const value = await driver.executeScript(
      () => globalThis.__clipboardResults?.mib ?? null,
    );
    return value ?? false;
  }, 30000);
  const mibRead = await readClipboard();
  checked(
    mibResult.status === 'resolved' &&
      mibRead.status === 'resolved' &&
      mibRead.bytes === mib &&
      mibRead.hash === expectedMibHash,
    'Permission-free 1 MiB UTF-8 clipboard write resolves exactly',
    {
      write: mibResult,
      read: {
        status: mibRead.status,
        bytes: mibRead.bytes,
        hash: mibRead.hash,
      },
    },
  );

  await driver.switchTo().window(writerHandle);
  await driver.findElement(By.id('write-exec')).click();
  const execResult = await driver.wait(async () => {
    const value = await driver.executeScript(
      () => globalThis.__clipboardResults?.exec ?? null,
    );
    return value ?? false;
  }, 15000);
  const execRead = await readClipboard();
  report.policy.execCommand = {
    write: execResult,
    read: execRead,
    exact:
      execRead.status === 'resolved' &&
      execRead.text === 'addonray-feasibility-exec',
  };
  passed('Recorded execCommand copy policy', {
    write: execResult,
    exact: report.policy.execCommand.exact,
  });
} catch (error) {
  report.error = {
    name: error?.name ?? null,
    message: String(error?.message ?? error),
  };
  failed('Feasibility probe completed without an unexpected error', {
    error: report.error,
  });
} finally {
  if (driver && restore && report.initialClipboard.status === 'resolved') {
    try {
      const restored = await restoreClipboard(initialClipboardText);
      report.restoredClipboard =
        restored.read.status === 'resolved' &&
        restored.read.hash === report.initialClipboard.hash;
    } catch (error) {
      report.restoredClipboard = false;
      report.restoreError = String(error?.message ?? error);
    }
  }
  try {
    await driver?.quit();
  } catch {
    /* The report already records the browser outcome. */
  }
}
const failures = report.checks.filter((check) => check.status === 'failed');
report.result = failures.length === 0 ? 'passed' : 'failed';
let reportName = 'clipboard-feasibility-firefox.json';
if (target === 'chrome') reportName = 'clipboard-feasibility-chrome.json';
else if (requestedVersion === '140.0')
  reportName = 'clipboard-feasibility-firefox-140.0.json';
else if (requestedVersion === '153.5.1esr')
  reportName = 'clipboard-feasibility-firefox-153.5.1esr.json';
else if (requestedVersion === '158.0.1')
  reportName = 'clipboard-feasibility-firefox-158.0.1.json';
const reportPath = resolve('.scratch', reportName);
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(`Report: ${reportPath}`);
if (failures.length) process.exitCode = 1;
