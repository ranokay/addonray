import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { By, until } from 'selenium-webdriver';
import { CLIPBOARD_RESTORE_SCOPE } from './clipboard-guard.ts';
import {
  writeFixtures,
  writeReader,
} from './clipboard-feasibility-fixtures.mjs';
import { startSession } from './clipboard-feasibility-session.mjs';
import { clipboardIO } from './clipboard-feasibility-io.mjs';
import {
  createEvidence,
  writeEvidence,
} from './clipboard-feasibility-evidence.mjs';

// Permission-free clipboard feasibility for #11. This probe is test-only: the
// writer fixture declares no clipboard permission and the separate reader
// fixture declares test-only clipboardRead authority. Neither fixture, nor its
// manifest, is part of the product package.
process.env.SE_AVOID_STATS = 'true';
process.env.SE_DRIVER_VERSION = process.env.SE_DRIVER_VERSION ?? '0.37.1';
process.env.SE_SKIP_DRIVER_IN_PATH = 'true';
process.env.SE_SKIP_BROWSER_IN_PATH = 'true';

const mib = 1024 * 1024;
const expectedMib = 'x'.repeat(mib);
const expectedMibHash = createHash('sha256')
  .update(Buffer.from(expectedMib, 'utf8'))
  .digest('hex');
const sha256 = (value) =>
  createHash('sha256').update(value, 'utf8').digest('hex');

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
const report = createEvidence(target, requestedVersion);
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
  ({ writerHandle, readerHandle } = await startSession({
    target,
    requestedVersion,
    writer,
    reader,
    report,
    onDriver: (value) => {
      driver = value;
    },
  }));
  await driver.wait(until.elementLocated(By.css('h1')), 10000);
  assert.equal(
    await driver.findElement(By.css('h1')).getText(),
    'Clipboard reader',
  );

  const clipboard = clipboardIO(driver, writerHandle, readerHandle);
  const readClipboard = clipboard.readClipboard;
  restoreClipboard = clipboard.restoreClipboard;

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
  assert.equal(
    initial.status,
    'resolved',
    'Initial clipboard must be readable before any write',
  );
  assert.equal(
    typeof initial.text,
    'string',
    'Initial clipboard must be retained for restoration',
  );
  initialClipboardText = initial.text;
  restore = true;

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
      report.restoredScope = CLIPBOARD_RESTORE_SCOPE;
      report.restoredClipboard =
        restored.read.status === 'resolved' &&
        restored.write.status === 'resolved' &&
        restored.read.hash === report.initialClipboard.hash;
      checked(
        report.restoredClipboard,
        'Initial clipboard text restored exactly',
      );
    } catch (error) {
      report.restoredClipboard = false;
      report.restoreError = String(error?.message ?? error);
      failed('Initial clipboard text restored exactly');
    }
  }
  try {
    await driver?.quit();
  } catch {
    /* The report already records the browser outcome. */
  }
}
if (!(await writeEvidence(report, target, requestedVersion)))
  process.exitCode = 1;
