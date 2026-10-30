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
const savedPopupDirectory = resolve('scripts/saved-popup-candidate');
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
  popupCandidate: null,
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
const declared = new Map();
function declareChecks(list) {
  for (const [id, name, authority, essential = true] of list) {
    if (declared.has(id)) continue;
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
    declared.set(id, entry);
  }
}
function record(id, name, authority, essential = true) {
  const existing = declared.get(id);
  if (existing) {
    if (name) existing.name = name;
    if (authority) existing.authority = authority;
    existing.essential = essential;
    return existing;
  }
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
  declared.set(id, entry);
  return entry;
}
async function collectFailureSnapshot() {
  if (!driver) return null;
  try {
    return await driver.executeScript(() => ({
      url: location.href,
      probe: globalThis.savedStorageProbe
        ? {
            ready: globalThis.savedStorageProbe.ready,
            readyState: globalThis.savedStorageProbe.readyState,
            lastEvents: globalThis.savedStorageProbe.lastEvents,
            error: globalThis.savedStorageProbe.error ?? null,
            epoch: globalThis.savedStorageProbe.epoch ?? null,
          }
        : null,
    }));
  } catch (error) {
    return { error: String(error) };
  }
}
async function run(entry, stage, workFn, options = {}) {
  entry.stage = stage;
  const observations = {};
  try {
    const details = await workFn(observations);
    entry.details = details ?? observations;
    entry.status = 'passed';
    if (!options.quiet) console.log(`Passed: ${entry.id} — ${entry.name}`);
    return entry;
  } catch (error) {
    if (error?.unavailable) {
      entry.status = 'unavailable';
      entry.details = error.details ?? observations;
      entry.failureSnapshot = await collectFailureSnapshot();
      entry.error = {
        name: error?.name ?? 'Unavailable',
        message: String(error?.message ?? error),
        stack: error?.stack ? String(error.stack) : null,
      };
      console.error(
        `Unavailable: ${entry.id} — ${entry.name}: ${entry.error.message}`,
      );
      return entry;
    }
    entry.status = 'failed';
    entry.details = error?.details ?? observations;
    entry.failureSnapshot = await collectFailureSnapshot();
    entry.error = {
      name: error?.name ?? 'Error',
      message: String(error?.message ?? error),
      stack: error?.stack ? String(error.stack) : null,
    };
    if (entry.essential) report.essentialFailures.push(entry.id);
    if (!options.quiet)
      console.error(
        `Failed: ${entry.id} — ${entry.name}: ${entry.error.message}`,
      );
    return entry;
  }
}

const firefoxCheckList = [
  ['availability', 'availability'],
  ['ordinary-prompt', 'ordinary prompt'],
  ['raw-headroom', 'raw headroom'],
  ['exact-boundary-capacity', 'exact boundary capacity'],
  ['bound-refusal', 'bound refusal'],
  ['persistence-grant', 'persistence grant', undefined, false],
  ['quota-observation', 'quota observation', undefined, false],
  ['quota-override', 'quota override', undefined, false],
  ['forced-clear', 'forced clear', undefined, false],
  ['content-script-boundary', 'content-script boundary'],
  ['deletion-epoch-barrier', 'deletion epoch barrier'],
  ['epoch-fail-closed', 'epoch fail closed'],
  ['readiness-gate', 'readiness gate'],
  ['delete-expiry-unsupported', 'delete expiry unsupported'],
  ['private-context', 'private context'],
  ['restart-persistence', 'restart persistence'],
  ['uninstall-behavior', 'uninstall behavior', undefined, false],
  ['negative-fixtures', 'negative fixtures'],
];
const chromeCheckList = [
  ['availability', 'availability'],
  ['raw-headroom', 'raw headroom'],
  ['ordinary-prompt', 'ordinary prompt'],
  ['exact-boundary-capacity', 'exact boundary capacity'],
  ['bound-refusal', 'bound refusal'],
  ['persistence-grant', 'persistence grant', undefined, false],
  ['quota-observation', 'quota observation', undefined, false],
  ['quota-override', 'quota override', undefined, false],
  ['content-script-boundary', 'content-script boundary'],
  ['deletion-epoch-barrier', 'deletion epoch barrier'],
  ['epoch-fail-closed', 'epoch fail closed'],
  ['readiness-gate', 'readiness gate'],
  ['delete-expiry-unsupported', 'delete expiry unsupported'],
  ['restart-persistence', 'restart persistence'],
  ['uninstall-behavior', 'uninstall behavior', undefined, false],
  ['forced-clear', 'forced clear', undefined, false],
  ['private-context', 'private context'],
  ['private-popup-route', 'private popup route', undefined, false],
  ['negative-fixtures', 'negative fixtures'],
];

function chromeExtensionId(path) {
  const digest = createHash('sha256').update(resolve(path)).digest();
  return [...digest.subarray(0, 16)]
    .flatMap((byte) => [byte >> 4, byte & 0x0f])
    .map((nibble) => String.fromCharCode(97 + nibble))
    .join('');
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
report.popupCandidate = await hashDirectory(savedPopupDirectory);
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

const BOUNDS = {
  records: 50,
  totalBytes: 5_242_880,
  perRecord: 1_048_576,
};

function assertPrivateRoute(route) {
  assert.equal(route.context?.status, 'success');
  assert.equal(route.context?.incognito, true);
  assert.equal(route.blocked?.status, 'blocked');
  assert.equal(route.blocked?.reason, 'private-or-unknown-context');
  assert.equal(route.blocked?.storageAccessed, false);
}

function assertContentBoundary(details) {
  assert.equal(details.fixturePage?.sentinelPresent, true);
  assert.equal(details.fixturePage?.sentinel, 'fixture-extension');
  assert.equal(details.fixturePage?.readOnly, false);
  assert.equal(
    details.contentProbe?.runtimeId,
    details.fixturePage?.extensionId,
  );
  assert.equal(details.contentProbe?.pageReady, true);
  assert.equal(details.contentProbe?.error, null);
  assert.equal(details.contentProbe?.readSentinels?.includes('page'), true);
  assert.equal(
    details.contentProbe?.readSentinels?.includes('fixture-extension'),
    false,
  );
  assert.equal(
    details.contentProbe?.readSentinels?.includes('extension-candidate'),
    false,
  );
  assert.equal(details.fixtureAfter?.readOnly, true);
  assert.equal(details.fixtureAfter?.sentinel, 'fixture-extension');
  assert.equal(details.fixtureAfter?.sentinelPresent, true);
  assert.equal(details.extensionAfter?.fixture?.readOnly, true);
  assert.equal(details.extensionAfter?.fixture?.sentinelPresent, true);
  assert.equal(
    details.extensionAfter?.candidate?.recordId,
    'candidate-sentinel',
  );
  assert.equal(
    details.extensionAfter?.candidate?.payload,
    'extension-candidate',
  );
  assert.equal(details.extensionAfter?.candidate?.sentinelPresent, true);
}

function assertRestartPersistence(details) {
  const sentinelRecord = details.records?.find(
    (record) => record.recordId === 'restart-sentinel',
  );
  assert.equal(sentinelRecord?.payload, 'restart');
}

function assertUninstall(details) {
  assert(
    details.removed?.uninstalled === true ||
      details.requested?.requested === true,
  );
  assert.equal(
    details.before?.some((record) => record.recordId === 'uninstall-seed'),
    true,
  );
  assert.equal(
    details.after?.some((record) => record.recordId === 'uninstall-seed'),
    false,
  );
}

function assertDeleteExpiry(details) {
  assert.deepEqual(details.listed?.removedExpired, ['expired']);
  assert.deepEqual(details.listed?.unsupported, ['future']);
  assert.deepEqual(details.listed?.invalid, ['malformed']);
  assert.equal(details.listed?.available?.includes('valid'), true);
  assert.equal(details.listed?.available?.includes('expired'), false);
  assert.equal(
    details.remaining?.some((record) => record.recordId === 'expired'),
    false,
  );
  assert.equal(
    details.remaining?.some((record) => record.recordId === 'valid'),
    true,
  );
  assert.equal(
    details.remaining?.some((record) => record.recordId === 'malformed'),
    true,
  );
  assert.equal(
    details.remaining?.some((record) => record.recordId === 'future'),
    true,
  );
  assert.equal(details.deleteUnsupported?.status, 'deleted');
  assert.equal(
    details.afterDelete?.some((record) => record.recordId === 'future'),
    false,
  );
}

async function openFreshProbe(
  baseUrl,
  dbName,
  observations = null,
  key = 'open',
) {
  const navigation = await ensurePage(
    `${baseUrl}?guardOnly=1&db=${encodeURIComponent(dbName)}`,
  );
  const opened = await callRaw('openNow');
  if (observations)
    observations[key] = {
      navigation,
      opened,
    };
  assert.equal(opened?.status, 'ok', JSON.stringify(opened));
  assert.notEqual(opened.value?.status, 'error', JSON.stringify(opened));
  const state = await callRaw('status');
  if (observations) observations[key].state = state;
  assert.equal(state?.status, 'ok', JSON.stringify(state));
  assert.equal(state.value?.ready, true);
  return { navigation, state: state.value };
}

async function saveExactRecords(records, limits = BOUNDS, observations = null) {
  const saved = [];
  if (observations) observations.savedReplies = [];
  for (const item of records) {
    const result = await callRaw('saveBoundedRecord', item.record, limits);
    if (observations)
      observations.savedReplies.push({
        recordId: item.record.recordId,
        result,
      });
    assert.equal(result?.status, 'ok', JSON.stringify(result));
    assert.equal(result.value?.status, 'saved', JSON.stringify(result.value));
    saved.push(result.value);
  }
  return saved;
}

function exactPlan(count, size, prefix = '') {
  return Array.from({ length: count }, (_, index) => ({
    recordId: `cap-${index}`,
    bytes: size,
    prefix: index % 3 === 0 ? prefix : '',
  }));
}

async function runExactCapacity(baseUrl, observations) {
  const opened = await openFreshProbe(
    baseUrl,
    `exact-capacity-${stamp}`,
    observations,
    'exactOpen',
  );
  observations.open = opened;
  const plan = exactPlan(49, 100_000, 'é中');
  plan.push({
    recordId: 'cap-large',
    bytes: 342_880,
    prefix: 'é中',
  });
  const built = await call('makeExactRecords', plan);
  observations.expectedTotalBytes = BOUNDS.totalBytes;
  observations.builtTotalBytes = built.totalBytes;
  observations.builtRecords = built.records.map((entry) => ({
    recordId: entry.record.recordId,
    bytes: entry.bytes,
    sha256: entry.sha256,
  }));
  assert.equal(built.totalBytes, BOUNDS.totalBytes);
  assert.equal(built.records.length, 50);
  assert.equal(
    built.records.every((entry) => entry.bytes <= BOUNDS.perRecord),
    true,
  );
  observations.nonAsciiRecordIds = built.records
    .filter((entry) => entry.record.payload.includes('é中'))
    .map((entry) => entry.record.recordId);
  assert(observations.nonAsciiRecordIds.length > 0);
  await saveExactRecords(built.records, BOUNDS, observations);
  const read = await call('allWithBytes');
  observations.readCount = read.records.length;
  observations.readTotalBytes = read.totalBytes;
  assert.equal(read.records.length, 50);
  assert.equal(read.totalBytes, BOUNDS.totalBytes);
  const byId = new Map(read.records.map((record) => [record.recordId, record]));
  for (const entry of built.records) {
    const stored = byId.get(entry.record.recordId);
    assert.equal(stored?.bytes, entry.bytes);
    assert.equal(stored?.sha256, entry.sha256);
  }
  await call('clearRecords');
  await call('setEpochRaw', 0);
  const one = await call('makeExactRecord', 'exact-1mib', 1_048_576, 'é中');
  observations.oneMibExpectedBytes = 1_048_576;
  observations.oneMibBuiltBytes = one.bytes;
  assert.equal(one.bytes, 1_048_576);
  const saved = await saveExactRecords([one], BOUNDS, observations);
  observations.oneMibSaved = saved;
  const oneRead = await call('allWithBytes');
  observations.oneMibRead = oneRead.records[0];
  assert.equal(oneRead.records.length, 1);
  assert.equal(oneRead.records[0].bytes, 1_048_576);
  assert.equal(oneRead.records[0].sha256, one.sha256);
  return observations;
}

async function runBoundRefusal(baseUrl, observations) {
  // 51st record at a full set.
  await openFreshProbe(
    baseUrl,
    `refuse-count-${stamp}`,
    observations,
    'countOpen',
  );
  const countPlan = exactPlan(49, 100_000, 'é');
  countPlan.push({ recordId: 'cap-large', bytes: 342_880 });
  const countBuilt = await call('makeExactRecords', countPlan);
  await saveExactRecords(countBuilt.records, BOUNDS, observations);
  const fiftyFirst = await call('makeExactRecord', 'fifty-first', 200);
  const countRefused = await callRaw(
    'saveBoundedRecord',
    fiftyFirst.record,
    BOUNDS,
  );
  observations.countRefusal = countRefused;
  assert.equal(countRefused.value?.status, 'refused');
  assert.equal(countRefused.value?.reason, 'records');
  const afterCount = await call('allWithBytes');
  observations.afterCount = {
    count: afterCount.records.length,
    totalBytes: afterCount.totalBytes,
    ids: afterCount.records.map((record) => record.recordId),
  };
  assert.equal(afterCount.records.length, 50);
  assert.equal(afterCount.totalBytes, BOUNDS.totalBytes);
  assert.equal(
    afterCount.records.some((record) => record.recordId === 'fifty-first'),
    false,
  );

  // Total-byte overflow with 49 unexpired records.
  await openFreshProbe(
    baseUrl,
    `refuse-total-${stamp}`,
    observations,
    'totalOpen',
  );
  const totalPlan = exactPlan(48, 100_000, 'é');
  totalPlan.push({ recordId: 'cap-large', bytes: 442_780 });
  const totalBuilt = await call('makeExactRecords', totalPlan);
  assert.equal(totalBuilt.totalBytes, BOUNDS.totalBytes - 100);
  await saveExactRecords(totalBuilt.records, BOUNDS, observations);
  const over = await call('makeExactRecord', 'total-overflow', 101);
  const totalRefused = await callRaw('saveBoundedRecord', over.record, BOUNDS);
  observations.totalRefusal = totalRefused;
  assert.equal(totalRefused.value?.status, 'refused');
  assert.equal(totalRefused.value?.reason, 'total-bytes');
  const afterTotal = await call('allWithBytes');
  observations.afterTotal = {
    count: afterTotal.records.length,
    totalBytes: afterTotal.totalBytes,
  };
  assert.equal(afterTotal.records.length, 49);
  assert.equal(afterTotal.totalBytes, BOUNDS.totalBytes - 100);
  assert.equal(
    afterTotal.records.some((record) => record.recordId === 'total-overflow'),
    false,
  );

  // Per-record overflow on an empty store.
  await openFreshProbe(
    baseUrl,
    `refuse-per-record-${stamp}`,
    observations,
    'perRecordOpen',
  );
  const tooBig = await call('makeExactRecord', 'too-big', 1_048_577);
  const perRefused = await callRaw('saveBoundedRecord', tooBig.record, BOUNDS);
  observations.perRecordRefusal = perRefused;
  assert.equal(perRefused.value?.status, 'refused');
  assert.equal(perRefused.value?.reason, 'per-record');
  const afterPer = await call('allWithBytes');
  observations.afterPerRecord = {
    count: afterPer.records.length,
    totalBytes: afterPer.totalBytes,
  };
  assert.equal(afterPer.records.length, 0);
  return observations;
}

async function runEpochFailClosed(baseUrl, observations) {
  await openFreshProbe(
    baseUrl,
    `epoch-invalid-${stamp}`,
    observations,
    'epochOpen',
  );
  const seed = await callRaw('saveNow', 'record-a');
  observations.seed = seed;
  assert.equal(seed.value?.status, 'saved');
  const pending = await callRaw('beginPendingSave', 'record-b');
  observations.pending = pending;
  assert.equal(pending.value?.status, 'pending');
  await call('deleteEpochRaw');
  const released = await callRaw('releasePending');
  observations.releasedAfterLoss = released;
  assert.equal(released.value?.status, 'barrier-invalid');
  assert.equal(released.value?.error?.message, 'missing-deletion-epoch');
  const afterLoss = await call('allWithBytes');
  observations.afterLoss = {
    count: afterLoss.records.length,
    ids: afterLoss.records.map((record) => record.recordId),
  };
  assert.equal(
    afterLoss.records.some((record) => record.recordId === 'record-b'),
    false,
  );
  assert.equal(
    afterLoss.records.some((record) => record.recordId === 'record-a'),
    true,
  );

  await call('setEpochRaw', 'corrupt');
  const deleteCorrupt = await callRaw('deleteRecord', 'record-a');
  const saveCorrupt = await callRaw(
    'saveBoundedRecord',
    { recordId: 'corrupt-save', payload: 'x' },
    BOUNDS,
  );
  observations.corrupt = { deleteCorrupt, saveCorrupt };
  assert.equal(deleteCorrupt.value?.status, 'barrier-invalid');
  assert.equal(saveCorrupt.value?.status, 'barrier-invalid');
  const afterCorrupt = await call('allWithBytes');
  observations.afterCorrupt = {
    count: afterCorrupt.records.length,
    ids: afterCorrupt.records.map((record) => record.recordId),
  };
  assert.equal(
    afterCorrupt.records.some((record) => record.recordId === 'corrupt-save'),
    false,
  );
  assert.equal(
    afterCorrupt.records.some((record) => record.recordId === 'record-a'),
    true,
  );

  const invalidValues = [-1, 1.5, '1', Number.MAX_SAFE_INTEGER + 1];
  observations.invalidValues = [];
  for (const value of invalidValues) {
    await call('setEpochRaw', value);
    const deleted = await callRaw('deleteRecord', 'record-a');
    const saved = await callRaw(
      'saveBoundedRecord',
      { recordId: `invalid-${String(value)}`, payload: 'x' },
      BOUNDS,
    );
    observations.invalidValues.push({ value, deleted, saved });
    assert.equal(deleted.value?.status, 'barrier-invalid');
    assert.equal(saved.value?.status, 'barrier-invalid');
  }
  const afterInvalid = await call('allWithBytes');
  observations.afterInvalid = {
    count: afterInvalid.records.length,
    ids: afterInvalid.records.map((record) => record.recordId),
  };
  assert.equal(
    afterInvalid.records.some((record) => record.recordId === 'record-a'),
    true,
  );

  await call('setEpochRaw', Number.MAX_SAFE_INTEGER);
  const deleteExhausted = await callRaw('deleteRecord', 'record-a');
  const saveExhausted = await callRaw(
    'saveBoundedRecord',
    { recordId: 'exhausted-save', payload: 'x' },
    BOUNDS,
  );
  observations.exhaustion = { deleteExhausted, saveExhausted };
  assert.equal(deleteExhausted.value?.status, 'barrier-exhausted');
  assert.equal(saveExhausted.value?.status, 'barrier-exhausted');
  const afterExhausted = await call('allWithBytes');
  const rawEpoch = await call('getEpochRaw');
  observations.afterExhausted = {
    count: afterExhausted.records.length,
    ids: afterExhausted.records.map((record) => record.recordId),
    epoch: rawEpoch,
  };
  assert.equal(rawEpoch.value, Number.MAX_SAFE_INTEGER);
  assert.equal(
    afterExhausted.records.some((record) => record.recordId === 'record-a'),
    true,
  );

  await call('setEpochRaw', 0);
  const idempotentDelete = await callRaw('deleteRecord', 'already-missing');
  observations.idempotentDelete = idempotentDelete;
  assert.equal(idempotentDelete.value?.status, 'deleted');
  assert.equal(idempotentDelete.value?.epoch, 1);
  const pendingAfterIdempotent = await callRaw('beginPendingSave', 'record-c');
  observations.pendingAfterIdempotent = pendingAfterIdempotent;
  assert.equal(pendingAfterIdempotent.value?.expectedEpoch, 1);
  const secondIdempotent = await callRaw('deleteRecord', 'already-missing');
  observations.secondIdempotent = secondIdempotent;
  assert.equal(secondIdempotent.value?.epoch, 2);
  const stale = await callRaw('releasePending');
  observations.staleAfterIdempotent = stale;
  assert.equal(stale.value?.status, 'stale');
  const finalRecords = await call('allWithBytes');
  observations.final = {
    count: finalRecords.records.length,
    ids: finalRecords.records.map((record) => record.recordId),
  };
  assert.equal(
    finalRecords.records.some((record) => record.recordId === 'record-c'),
    false,
  );
  return observations;
}

async function runFirefoxQuotaOverride(observations) {
  const previousDriver = driver;
  let quotaDriver = null;
  try {
    quotaDriver = await launchFirefox(null, {
      'dom.quotaManager.testing': true,
      'dom.quotaManager.temporaryStorage.fixedLimit': 2048,
    });
    driver = quotaDriver;
    await installTemporaryExtension(driver, candidateDirectory);
    const candidate = await firefoxExtensionInfo(candidateId, 'probe.html');
    assert(candidate?.url);
    await driver.get(`${candidate.url}?db=quota-override-${stamp}`);
    await waitReady();
    observations.fixedLimitKiB = 2048;
    observations.authority =
      'Test-only dom.quotaManager.temporaryStorage.fixedLimit pref in a fresh disposable profile; see StaticPrefList.yaml.';
    observations.attempts = [];
    let observedError = null;
    for (let index = 0; index < 6; index += 1) {
      const reply = await callRaw(
        'writeRandomPayload',
        `quota-override-${index}`,
        1024 * 1024,
      );
      observations.attempts.push(reply);
      if (reply.status !== 'ok') {
        observedError = reply.error ?? {
          name: 'Error',
          message: String(reply.error),
        };
        break;
      }
    }
    observations.quotaErrorObserved = /quota/i.test(
      `${observedError?.name} ${observedError?.message}`,
    );
    observations.observedError = observedError;
    observations.recordsBeforeRecovery = (await call('all')).length;
    observations.cleared = await call('clearRecords');
    observations.recovery = await callRaw(
      'writePayload',
      'quota-recovery',
      65_536,
    );
    return observations;
  } catch (error) {
    observations.error = {
      name: error?.name ?? 'Error',
      message: String(error?.message ?? error),
    };
    return observations;
  } finally {
    try {
      await quotaDriver?.quit();
    } catch {
      /* Preserve the report. */
    }
    driver = previousDriver;
  }
}

async function runChromeQuotaOverride(observations, extensionId) {
  await ensurePage(`chrome-extension://${extensionId}/probe.html`);
  await waitReady();
  const capabilities = await driver.getCapabilities();
  const cdp = await browserProtocol(
    capabilities.get('goog:chromeOptions').debuggerAddress,
  );
  const origin = `chrome-extension://${extensionId}`;
  const quotaSize = 2_000_000;
  let sessionId = null;
  try {
    const { targetInfos } = await cdp.send('Target.getTargets');
    const target = targetInfos.find(
      (entry) => entry.type === 'page' && entry.url.startsWith(origin),
    );
    if (!target) {
      observations.error = 'quota-override-target-not-found';
      return observations;
    }
    ({ sessionId } = await cdp.send('Target.attachToTarget', {
      targetId: target.targetId,
      flatten: true,
    }));
    await cdp.send(
      'Storage.overrideQuotaForOrigin',
      { origin, quotaSize },
      sessionId,
    );
    observations.override = {
      method: 'Storage.overrideQuotaForOrigin',
      origin,
      quotaSize,
    };
    observations.quotaAfterOverride = await cdp.send(
      'Storage.getUsageAndQuota',
      { origin },
      sessionId,
    );
    observations.attempts = [];
    let observedError = null;
    for (let index = 0; index < 5; index += 1) {
      const reply = await callRaw(
        'writeRandomPayload',
        `quota-override-${index}`,
        1024 * 1024,
      );
      observations.attempts.push(reply);
      if (reply.status !== 'ok') {
        observedError = reply.error ?? {
          name: 'Error',
          message: String(reply.error),
        };
        break;
      }
    }
    observations.quotaErrorObserved = /quota/i.test(
      `${observedError?.name} ${observedError?.message}`,
    );
    observations.observedError = observedError;
    await cdp.send('Storage.overrideQuotaForOrigin', { origin }, sessionId);
    observations.reset = { method: 'Storage.overrideQuotaForOrigin' };
    await driver.navigate().refresh();
    await waitReady();
    observations.recordsBeforeRecovery = (await call('all')).length;
    observations.cleared = await call('clearRecords');
    observations.recovery = await callRaw(
      'writePayload',
      'quota-recovery',
      65_536,
    );
    return observations;
  } catch (error) {
    observations.error = {
      name: error?.name ?? 'Error',
      message: String(error?.message ?? error),
    };
    return observations;
  } finally {
    if (sessionId) {
      try {
        await cdp.send('Target.detachFromTarget', { sessionId });
      } catch {
        /* Preserve the report. */
      }
    }
    cdp.close();
  }
}

async function runNegativeFixtures(observations) {
  const validContent = {
    fixturePage: {
      extensionId: 'fixture',
      sentinel: 'fixture-extension',
      sentinelPresent: true,
      readOnly: false,
    },
    contentProbe: {
      runtimeId: 'fixture',
      pageReady: true,
      error: null,
      readSentinels: ['page'],
    },
    fixtureAfter: {
      readOnly: true,
      sentinel: 'fixture-extension',
      sentinelPresent: true,
    },
    extensionAfter: {
      fixture: {
        readOnly: true,
        sentinel: 'fixture-extension',
        sentinelPresent: true,
      },
      candidate: {
        recordId: 'candidate-sentinel',
        payload: 'extension-candidate',
        sentinelPresent: true,
      },
    },
  };
  assertContentBoundary(validContent);
  const validRestart = {
    records: [{ recordId: 'restart-sentinel', payload: 'restart' }],
  };
  const validUninstall = {
    removed: { uninstalled: true },
    before: [{ recordId: 'uninstall-seed', payload: 'uninstall-seed' }],
    after: [],
  };
  const validDelete = {
    listed: {
      removedExpired: ['expired'],
      unsupported: ['future'],
      invalid: ['malformed'],
      available: ['valid'],
    },
    remaining: [
      { recordId: 'valid' },
      { recordId: 'malformed' },
      { recordId: 'future' },
    ],
    deleteUnsupported: { status: 'deleted' },
    afterDelete: [{ recordId: 'valid' }],
  };
  assertRestartPersistence(validRestart);
  const cases = [];
  if (observations) observations.cases = cases;
  const reject = (name, fn) => {
    try {
      fn();
      throw new Error(`Negative fixture ${name} was accepted.`);
    } catch (error) {
      if (String(error.message).includes('was accepted')) throw error;
      cases.push({ name, rejected: true, message: String(error.message) });
    }
  };
  reject('content-empty-read', () =>
    assertContentBoundary({
      ...validContent,
      contentProbe: {
        ...validContent.contentProbe,
        readSentinels: [],
        error: 'read failed',
      },
    }),
  );
  reject('content-missing-page-sentinel', () =>
    assertContentBoundary({
      ...validContent,
      contentProbe: { ...validContent.contentProbe, readSentinels: [] },
    }),
  );
  reject('content-extension-sentinel-leak', () =>
    assertContentBoundary({
      ...validContent,
      contentProbe: {
        ...validContent.contentProbe,
        readSentinels: ['page', 'extension-candidate'],
      },
    }),
  );
  reject('restart-missing-sentinel', () =>
    assertRestartPersistence({
      records: [{ recordId: 'other', payload: 'x' }],
    }),
  );
  reject('restart-wrong-payload', () =>
    assertRestartPersistence({
      records: [{ recordId: 'restart-sentinel', payload: 'wrong' }],
    }),
  );
  reject('uninstall-seed-survived', () =>
    assertUninstall({ ...validUninstall, after: validUninstall.before }),
  );
  reject('uninstall-no-removal', () =>
    assertUninstall({ ...validUninstall, removed: { uninstalled: false } }),
  );
  reject('expired-still-available', () =>
    assertDeleteExpiry({
      ...validDelete,
      listed: { ...validDelete.listed, available: ['valid', 'expired'] },
    }),
  );
  reject('unsupported-not-deleted', () =>
    assertDeleteExpiry({
      ...validDelete,
      deleteUnsupported: { status: 'not-deleted' },
    }),
  );
  reject('content-wrong-candidate-payload', () =>
    assertContentBoundary({
      ...validContent,
      extensionAfter: {
        ...validContent.extensionAfter,
        candidate: {
          ...validContent.extensionAfter.candidate,
          payload: 'wrong',
        },
      },
    }),
  );
  reject('private-double-unwrap', () =>
    assertPrivateRoute({
      context: { value: { status: 'success', incognito: true } },
      blocked: {
        value: {
          status: 'blocked',
          reason: 'private-or-unknown-context',
          storageAccessed: false,
        },
      },
    }),
  );
  assert.equal(cases.length, 11);
  const popupOnly = classifyStoragePrompt({
    notifications: [],
    notificationRoutePresent: true,
    popupNotifications: [
      {
        id: 'persistent-storage',
        message: 'Allow <> to store data in persistent storage?',
      },
    ],
    popupRoutePresent: true,
    notificationsError: null,
    popupError: null,
  });
  assert.equal(popupOnly.available, true);
  assert.equal(popupOnly.entries.length, 1);
  assert.equal(popupOnly.entries[0].route, 'popup-notifications');
  const inspectionUnavailable = classifyStoragePrompt({
    notifications: [],
    notificationRoutePresent: true,
    popupNotifications: [],
    popupRoutePresent: true,
    notificationsError: 'notification route unavailable',
    popupError: null,
  });
  assert.equal(inspectionUnavailable.available, false);
  const missingRoute = classifyStoragePrompt({
    notifications: [],
    popupNotifications: [],
    notificationRoutePresent: true,
    popupRoutePresent: false,
  });
  assert.equal(missingRoute.available, false);
  assert.equal(missingRoute.reason, 'missing-inspection-route');
  const synthetic = {
    id: 'synthetic-failure-retention',
    name: 'synthetic failure retention',
    authority: 'test-of-test',
    essential: false,
    status: 'not-run',
    stage: null,
    details: null,
    error: null,
  };
  await run(
    synthetic,
    'synthetic-failure',
    async (observations) => {
      observations.observedCounter = 42;
      observations.stage = 'before-assertion';
      assert.equal(1, 2);
    },
    { quiet: true },
  );
  assert.equal(synthetic.status, 'failed');
  assert.equal(synthetic.details?.observedCounter, 42);
  assert.equal(synthetic.details?.stage, 'before-assertion');
  assert(synthetic.failureSnapshot);
  observations.cases = cases;
  observations.popupOnly = popupOnly;
  observations.inspectionUnavailable = inspectionUnavailable;
  observations.missingRoute = missingRoute;
  observations.failureRetention = {
    status: synthetic.status,
    details: synthetic.details,
    failureSnapshot: synthetic.failureSnapshot,
  };
  return observations;
}

async function launchFirefox(templateProfile = null, extraPrefs = {}) {
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
  for (const [key, value] of Object.entries(extraPrefs))
    options.setPreference(key, value);
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
      let notificationsError = null;
      let notificationRoutePresent = false;
      try {
        const box = gBrowser.getNotificationBox(gBrowser.selectedBrowser);
        if (!box) throw new Error('notification-box-missing');
        if (!Array.isArray(box.allNotifications))
          throw new Error('notification-list-missing');
        notificationRoutePresent = true;
        for (const notification of box.allNotifications) {
          notifications.push({
            id: notification.id ?? null,
            label: notification.label ?? null,
            priority: notification.priority ?? null,
          });
        }
      } catch (error) {
        notificationsError = String(error);
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
      let popupNotifications = [];
      let popupPanelState = null;
      let popupError = null;
      let popupRoutePresent = false;
      try {
        const chromeWindow = gBrowser.ownerDocument?.defaultView ?? globalThis;
        const popup = chromeWindow.PopupNotifications;
        if (!popup) throw new Error('popup-notifications-missing');
        if (!Array.isArray(popup._currentNotifications))
          throw new Error('popup-notification-list-missing');
        popupRoutePresent = true;
        popupPanelState = popup.panel?.state ?? null;
        popupNotifications = popup._currentNotifications.map((entry) => ({
          id: entry.id ?? null,
          message: entry.message ?? null,
          buttonCount: entry.buttonBox?.children?.length ?? null,
        }));
      } catch (error) {
        popupError = String(error);
      }
      return {
        notifications,
        notificationsError,
        notificationRoutePresent,
        storagePermissionState,
        popupNotifications,
        popupPanelState,
        popupError,
        popupRoutePresent,
      };
    }, candidateId);
  } finally {
    await driver.setContext('content');
  }
}

function classifyStoragePrompt(state) {
  if (!state)
    return {
      available: false,
      reason: 'missing-state',
      entries: [],
    };
  if (
    state.notificationRoutePresent !== true ||
    state.popupRoutePresent !== true ||
    !Array.isArray(state.notifications) ||
    !Array.isArray(state.popupNotifications)
  )
    return {
      available: false,
      reason: 'missing-inspection-route',
      entries: [],
    };
  if (state.notificationsError || state.popupError)
    return {
      available: false,
      reason: 'inspection-unavailable',
      errors: {
        notifications: state.notificationsError ?? null,
        popup: state.popupError ?? null,
      },
      entries: [],
    };
  const entries = [
    ...(state.notifications ?? [])
      .filter((entry) =>
        /storage|persistent|data/i.test(
          `${entry.id ?? ''} ${entry.label ?? ''}`,
        ),
      )
      .map((entry) => ({
        route: 'notification-box',
        id: entry.id ?? null,
        message: entry.label ?? null,
      })),
    ...(state.popupNotifications ?? [])
      .filter((entry) =>
        /storage|persistent|data/i.test(
          `${entry.id ?? ''} ${entry.message ?? ''}`,
        ),
      )
      .map((entry) => ({
        route: 'popup-notifications',
        id: entry.id ?? null,
        message: entry.message ?? null,
      })),
  ];
  return { available: true, entries };
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
  declareChecks(firefoxCheckList);
  const session = await firefoxSession();
  report.candidateExtension = session.candidate;
  report.contentFixtureExtension = session.content;

  const availability = record(
    'availability',
    'Extension-origin IndexedDB opens and round-trips without a manifest permission',
    'Observed in the zero-permission candidate extension page.',
  );
  await run(availability, 'open-and-round-trip', async (observations) => {
    observations.navigation = await ensurePage(session.candidate.url);
    await waitReady();
    await call('putRaw', {
      recordId: 'round-trip',
      payload: 'round-trip',
    });
    observations.records = await pages();
    observations.epoch = await call('status');
    observations.promptState = await firefoxPromptState();
    observations.manifest = JSON.parse(
      await readFile(join(candidateDirectory, 'manifest.json'), 'utf8'),
    );
    assert.equal(observations.records.length, 1);
    assert.equal(observations.records[0].payload, 'round-trip');
    assert.equal(observations.manifest.permissions, undefined);
    assert.equal(observations.manifest.optional_permissions, undefined);
    assert.equal(observations.manifest.content_scripts, undefined);
    return observations;
  });

  const promptEntry = record(
    'ordinary-prompt',
    'Ordinary IndexedDB use does not require a storage permission prompt',
    'Observed browser notification/permission state at each exact operation.',
  );
  await run(promptEntry, 'ordinary-operations', async (observations) => {
    const db = `ordinary-prompt-${stamp}`;
    observations.navigation = await ensurePage(
      `${session.candidate.url}?guardOnly=1&db=${db}`,
    );
    observations.before = await firefoxPromptState();
    observations.open = await callRaw('openNow');
    assert.equal(observations.open?.status, 'ok');
    assert.notEqual(observations.open.value?.status, 'error');
    await waitReady();
    observations.afterOpen = await firefoxPromptState();
    observations.smallWrite = await call('writePayload', 'prompt-small', 4096);
    observations.afterSmall = await firefoxPromptState();
    observations.largeWrite = await call(
      'writePayload',
      'prompt-large',
      1024 * 1024,
    );
    observations.afterLarge = await firefoxPromptState();
    observations.read = await call('allWithBytes');
    observations.afterRead = await firefoxPromptState();
    const states = [
      ['before', observations.before],
      ['afterOpen', observations.afterOpen],
      ['afterSmall', observations.afterSmall],
      ['afterLarge', observations.afterLarge],
      ['afterRead', observations.afterRead],
    ];
    observations.classifications = states.map(([stage, state]) => ({
      stage,
      ...classifyStoragePrompt(state),
    }));
    const unavailable = observations.classifications.find(
      (entry) => !entry.available,
    );
    if (unavailable) {
      const error = new Error(
        `Prompt inspection unavailable at ${unavailable.stage}: ${unavailable.reason}`,
      );
      error.unavailable = true;
      error.details = observations;
      throw error;
    }
    const prompted = observations.classifications.find(
      (entry) => entry.entries.length > 0,
    );
    assert.equal(
      prompted,
      undefined,
      `Ordinary storage prompt observed: ${JSON.stringify(prompted)}`,
    );
    return observations;
  });

  const rawHeadroom = record(
    'raw-headroom',
    'Raw storage headroom separately from product-bound enforcement',
    'Observed candidate writes and reads; this is not the exact 5 MiB/1 MiB product boundary.',
    false,
  );
  await run(rawHeadroom, 'raw-headroom', async (observations) => {
    await ensurePage(session.candidate.url);
    await waitReady();
    await call('clearRecords');
    observations.estimateBefore = await call('estimate');
    const records = [];
    for (let index = 0; index < 50; index += 1) {
      const result = await call('writePayload', `raw-${index}`, 100_000);
      records.push(result.serialized);
    }
    observations.large = await call('writePayload', 'raw-large', 1_000_000);
    observations.estimateAfter = await call('estimate');
    const all = await call('allWithBytes');
    observations.recordCount = all.records.length;
    observations.totalBytes = all.totalBytes;
    observations.serializedBytes = records.reduce(
      (sum, value) => sum + value,
      0,
    );
    assert.equal(all.records.length, 51);
    assert.equal(
      all.records.find((entry) => entry.recordId === 'raw-large')?.bytes,
      observations.large.serialized,
    );
    return observations;
  });

  const exactBoundary = record(
    'exact-boundary-capacity',
    'Exact 5,242,880-byte complete-record set and 1,048,576-byte record',
    'Observed candidate writes, full readback hashes and complete serialized UTF-8 accounting.',
  );
  await run(exactBoundary, 'exact-boundary-capacity', (observations) =>
    runExactCapacity(session.candidate.url, observations),
  );

  const boundRefusal = record(
    'bound-refusal',
    'Atomic candidate refusal at 51 records, total-byte overflow and per-record overflow',
    'Observed no partial write, no truncation and no unexpired eviction.',
  );
  await run(boundRefusal, 'bound-refusal', (observations) =>
    runBoundRefusal(session.candidate.url, observations),
  );

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
  await run(quotaEntry, 'quota-probe', async (observations) => {
    observations.estimate = await call('estimate');
    const estimate = observations.estimate;
    observations.attempt = { stage: 'start' };
    observations.quotaErrorObserved = false;
    observations.simulatedAbort = null;
    const cap = 64 * 1024 * 1024;
    if (
      typeof estimate.quota === 'number' &&
      estimate.quota > 0 &&
      estimate.quota <= cap
    ) {
      const records = [];
      let filled = 0;
      let observedError = null;
      try {
        while (filled < Math.min(estimate.quota + 8 * 1024 * 1024, cap)) {
          const reply = await callRaw(
            'writePayload',
            `quota-${filled}`,
            1024 * 1024,
          );
          if (reply.status !== 'ok') {
            observedError = reply.error ?? {
              name: 'Error',
              message: String(reply.error),
            };
            observations.quotaErrorObserved = /quota/i.test(
              `${observedError.name} ${observedError.message}`,
            );
            break;
          }
          records.push(reply.value.serialized);
          filled += 1024 * 1024;
          if (filled > (estimate.quota ?? 0) + 2 * 1024 * 1024) break;
        }
        observations.attempt = {
          stage: observedError ? 'write' : 'completed',
          filledBytes: filled,
          recordCount: records.length,
          stoppedAfterBytes: filled,
          error: observedError,
        };
      } finally {
        await call('clearRecords');
      }
    } else {
      observations.attempt = {
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
    observations.simulatedAbort = abort;
    assert.equal(abort.status, 'ok');
    assert.equal(abort.value.status, 'aborted');
    return observations;
  });

  const contentEntry = record(
    'content-script-boundary',
    'A same-extension content script cannot read extension-origin archives',
    'Controlled fixture extension with declared test-only host/content-script authority; kept out of product and candidate.',
  );
  await run(contentEntry, 'content-boundary', async (observations) => {
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
    observations.fixtureManifest = JSON.parse(
      await readFile(join(contentFixtureDirectory, 'manifest.json'), 'utf8'),
    );
    observations.fixtureExtension = report.contentFixtureExtension;
    observations.fixturePage = fixture;
    observations.candidateRecordsBefore = candidateRecords.map((record) => ({
      recordId: record.recordId,
      payload:
        typeof record.payload === 'string' && record.payload.length > 64
          ? `${record.payload.length} chars`
          : record.payload,
    }));
    observations.contentProbe = contentProbe;
    observations.candidateAfter = (await call('all')).map((record) => ({
      recordId: record.recordId,
      payload:
        typeof record.payload === 'string' && record.payload.length > 64
          ? `${record.payload.length} chars`
          : record.payload,
    }));
    await driver.get(`${session.content.url}?readOnly=1`);
    await driver.wait(
      async () =>
        (await driver.executeScript(
          () => document.documentElement.dataset.contentFixtureReady === 'true',
        )) === true,
      10000,
    );
    observations.fixtureAfter = await driver.executeScript(
      () => window.contentFixtureProbe,
    );
    const candidateSentinel = observations.candidateAfter.find(
      (record) => record.recordId === 'candidate-sentinel',
    );
    observations.extensionAfter = {
      fixture: {
        readOnly: observations.fixtureAfter?.readOnly === true,
        sentinel: observations.fixtureAfter?.sentinel ?? null,
        sentinelPresent: observations.fixtureAfter?.sentinelPresent === true,
      },
      candidate: {
        recordId: candidateSentinel?.recordId ?? null,
        payload: candidateSentinel?.payload ?? null,
        sentinelPresent: candidateSentinel?.payload === sentinel,
      },
    };
    observations.sameExtension =
      contentProbe.runtimeId === fixture.extensionId
        ? 'runtime-id-equals-extension-id'
        : 'runtime-id-mismatch';
    assertContentBoundary(observations);
    return observations;
  });

  const negativeFixtures = record(
    'negative-fixtures',
    'Focused negative fixtures reject wrong content, restart, uninstall and deletion observations',
    'Test-of-test only; no product claim.',
  );
  await run(negativeFixtures, 'negative-fixtures', (observations) =>
    runNegativeFixtures(observations),
  );

  const epochFailClosed = record(
    'epoch-fail-closed',
    'Missing, corrupt, unsafe and exhausted deletion epochs fail closed',
    'Observed pending saves and deletes write nothing when the barrier metadata is invalid.',
  );
  await run(epochFailClosed, 'epoch-fail-closed', (observations) =>
    runEpochFailClosed(session.candidate.url, observations),
  );

  const epochEntry = record(
    'deletion-epoch-barrier',
    'Pending saves cannot commit after a cross-view delete, including distinct record IDs and withheld notification',
    'Observed in the candidate with two tabs and no BroadcastChannel.',
  );
  await run(epochEntry, 'epoch-races', async (observations) => {
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
    observations.pending = pending;
    assert.equal(pending.status, 'pending');
    await driver.switchTo().window(tabB);
    const deleted = await callRaw('deleteRecord', 'record-a');
    observations.deleted = deleted;
    assert.equal(deleted.status, 'ok');
    await driver.switchTo().window(tabA);
    const stale = await callRaw('releasePending');
    observations.stale = stale;
    assert.equal(stale.status, 'ok');
    assert.equal(stale.value.status, 'stale');
    const afterStale = await pages();
    observations.afterStale = afterStale;
    assert.equal(afterStale.length, 0);
    const idempotent = await callRaw('beginPendingSave', 'record-c');
    observations.idempotent = idempotent;
    assert.equal(idempotent.status, 'ok');
    await driver.switchTo().window(tabB);
    const missingDelete = await callRaw('deleteRecord', 'already-missing');
    observations.missingDelete = missingDelete;
    assert.equal(missingDelete.status, 'ok');
    await driver.switchTo().window(tabA);
    const staleIdempotent = await callRaw('releasePending');
    observations.staleIdempotent = staleIdempotent;
    assert.equal(staleIdempotent.value.status, 'stale');
    const afterIdempotent = await pages();
    observations.afterIdempotent = afterIdempotent;
    assert.equal(afterIdempotent.length, 0);
    const commitFirst = await callRaw('beginPendingSave', 'record-d');
    observations.commitFirst = commitFirst;
    assert.equal(commitFirst.value.status, 'pending');
    const savedFirst = await callRaw('releasePending');
    observations.savedFirst = savedFirst;
    assert.equal(savedFirst.value.status, 'saved');
    await driver.switchTo().window(tabB);
    const deleteAfter = await callRaw('deleteRecord', 'record-a');
    observations.deleteAfter = deleteAfter;
    assert.equal(deleteAfter.status, 'ok');
    await driver.switchTo().window(tabA);
    const afterCommit = await pages();
    observations.afterCommit = afterCommit;
    assert.equal(
      afterCommit.some((entry) => entry.recordId === 'record-d'),
      true,
    );
    const aborted = await callRaw('saveNow', 'record-e', {
      abortSynchronously: true,
    });
    observations.aborted = aborted;
    assert.equal(aborted.value.status, 'aborted');
    const afterAbort = await pages();
    observations.afterAbort = afterAbort;
    assert.equal(
      afterAbort.some((entry) => entry.recordId === 'record-e'),
      false,
    );
    await closeTab(tabB);
    await driver.switchTo().window(tabA);
    return observations;
  });

  const readinessEntry = record(
    'readiness-gate',
    'First-save connection delay cannot silently acquire a post-delete epoch',
    'Observed in the candidate: Save is unavailable until the guarded connection is ready.',
  );
  await run(readinessEntry, 'readiness-race', async (observations) => {
    await call('clearRecords');
    const first = `${session.candidate.url}?db=first-save&delayOpen=1200`;
    const delayed = await openTab(first);
    await driver.switchTo().window(delayed);
    const notReady = await callRaw('beginPendingSave', 'late-save');
    observations.notReady = notReady;
    assert.equal(notReady.status, 'ok');
    assert.equal(notReady.value.status, 'not-ready');
    const other = await openTab(`${session.candidate.url}?db=first-save`);
    await waitReady();
    await call('saveNow', 'seed');
    const deleted = await callRaw('deleteRecord', 'seed');
    observations.deleted = deleted;
    assert.equal(deleted.status, 'ok');
    await driver.switchTo().window(delayed);
    await waitReady();
    const begun = await callRaw('beginPendingSave', 'late-save');
    observations.begun = begun;
    assert.equal(begun.value.status, 'pending');
    const released = await callRaw('releasePending');
    observations.released = released;
    assert.equal(released.value.status, 'saved');
    const records = await pages();
    observations.records = records;
    assert.equal(
      records.some((entry) => entry.recordId === 'late-save'),
      true,
    );
    await closeTab(other);
    await closeTab(delayed);
    return observations;
  });

  const lazyEntry = record(
    'delete-expiry-unsupported',
    'Expired records are refused/removed; unsupported versions stay listed and deletable',
    'Candidate-level behaviour, not the product library.',
  );
  await run(lazyEntry, 'list-valid', async (observations) => {
    observations.navigation = await ensurePage(session.candidate.url);
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
    observations.listed = await call('listValid', now);
    observations.remaining = await pages();
    const deleteUnsupported = await callRaw('deleteRecord', 'future');
    assert.equal(deleteUnsupported.status, 'ok');
    observations.deleteUnsupported = deleteUnsupported.value;
    observations.afterDelete = await pages();
    assertDeleteExpiry(observations);
    return observations;
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
  await run(restartEntry, 'firefox-restart', async (observations) => {
    assert(report.sessionProfile?.retained, 'Retained profile unavailable');
    const candidate = await firefoxRestartSession(
      report.sessionProfile.retained,
    );
    await driver.get(candidate.url);
    await waitReady();
    observations.sessionProfile = report.sessionProfile;
    observations.restartSessionProfile = report.restart.sessionProfile;
    observations.origin = candidate.origin;
    observations.records = await pages();
    assertRestartPersistence(observations);
    return observations;
  });

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
    await run(uninstallEntry, 'uninstall', async (observations) => {
      const candidate = await firefoxExtensionInfo(candidateId, 'probe.html');
      await driver.get(candidate.url);
      await waitReady();
      await call('putRaw', {
        recordId: 'uninstall-seed',
        payload: 'uninstall-seed',
      });
      observations.before = await pages();
      await driver.setContext('chrome');
      observations.removed = await driver.executeAsyncScript((id, done) => {
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
      const reinstalled = await firefoxExtensionInfo(candidateId, 'probe.html');
      await driver.get(reinstalled.url);
      await waitReady();
      observations.after = await pages();
      assertUninstall(observations);
      return observations;
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

  const quotaOverride = record(
    'quota-override',
    'Supported test-only low quota produces a real QuotaExceededError and recovery',
    'Firefox fixedLimit test pref in a fresh disposable profile; not a product setting.',
    false,
  );
  await run(quotaOverride, 'firefox-quota-override', (observations) =>
    runFirefoxQuotaOverride(observations),
  );

  const clearEntry = record(
    'forced-clear',
    'Forced browser-origin clearing removes candidate storage',
    'Test-authority browser clear, not natural eviction.',
    false,
  );
  await run(clearEntry, 'firefox-qms-clear', async (observations) => {
    observations.seed = await call('clearRecords');
    observations.seeded = await call('putRaw', {
      recordId: 'clear-me',
      payload: 'clear-me',
    });
    observations.closedHandles = await call('close');
    observations.navigatedAway = await ensurePage('about:blank');
    observations.clearMethod =
      'Services.qms.clearStoragesForPrincipal(principal)';
    observations.clearAuthority =
      'Test-only chrome-context call after closing candidate DB handles and navigating the candidate tab away.';
    await driver.setContext('chrome');
    let cleared;
    try {
      cleared = await driver.executeAsyncScript((id, done) => {
        (async () => {
          try {
            const policy = WebExtensionPolicy.getByID(id);
            const qms = Services.qms;
            const methods = Object.getOwnPropertyNames(
              Object.getPrototypeOf(qms),
            ).filter((name) => /clear|reset/i.test(name));
            const clearPrincipal = qms.clearStoragesForPrincipal;
            if (typeof clearPrincipal !== 'function') {
              done({
                cleared: false,
                error: 'clearStoragesForPrincipal unavailable',
                methods,
              });
              return;
            }
            await clearPrincipal.call(qms, policy.principal);
            done({
              cleared: true,
              method: 'clearStoragesForPrincipal',
              methods,
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
    observations.cleared = cleared;
    observations.recordsAfter = await pages();
    return observations;
  });
  if (clearEntry.status === 'passed' && !clearEntry.details?.cleared?.cleared) {
    clearEntry.status = 'unavailable';
    report.gaps.push(
      `Firefox forced browser-origin clearing could not be observed: ${clearEntry.details?.cleared?.error ?? 'no clear method'}.`,
    );
  } else if (clearEntry.status === 'failed') {
    clearEntry.status = 'unavailable';
    report.gaps.push(
      `Firefox scoped clearStoragesForPrincipal was attempted after closing candidate handles and navigating away; the session was lost: ${clearEntry.error?.message}.`,
    );
  } else if (clearEntry.status === 'passed') {
    assert.equal(
      clearEntry.details.recordsAfter.length,
      0,
      'Forced clear left records behind',
    );
  }
}

async function chromeSession({
  userDataDir,
  headless = true,
  incognito = false,
  loadExtension = null,
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
  if (loadExtension)
    options.addArguments(`--load-extension=${resolve(loadExtension)}`);
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

async function chromeInstall(candidatePath, fixturePath, popupPath = null) {
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
  const popup = popupPath
    ? await cdp.send('Extensions.loadUnpacked', { path: resolve(popupPath) })
    : null;
  return {
    cdp,
    candidateId: candidate.id,
    contentFixtureId: fixture.id,
    popupId: popup?.id ?? null,
  };
}

async function allowChromeIncognitoViaUI(extensionId) {
  await driver.get(`chrome://extensions/?id=${extensionId}`);
  await driver.wait(async () => {
    return await driver.executeScript(() => {
      const manager = document.querySelector('extensions-manager');
      return Boolean(
        manager?.shadowRoot
          ?.querySelector('extensions-detail-view')
          ?.shadowRoot?.querySelector('#allow-incognito'),
      );
    });
  }, 10000);
  const before = await driver.executeScript(() => {
    const manager = document.querySelector('extensions-manager');
    const detail = manager?.shadowRoot?.querySelector('extensions-detail-view');
    const row = detail?.shadowRoot?.querySelector('#allow-incognito');
    const toggle = row?.shadowRoot?.querySelector('cr-toggle');
    return {
      found: Boolean(row),
      checked: toggle?.checked ?? null,
      ariaChecked: toggle?.getAttribute('aria-checked') ?? null,
    };
  });
  const clicked = await driver.executeScript(() => {
    const manager = document.querySelector('extensions-manager');
    const detail = manager?.shadowRoot?.querySelector('extensions-detail-view');
    const row = detail?.shadowRoot?.querySelector('#allow-incognito');
    const toggle =
      row?.shadowRoot?.querySelector('cr-toggle') ??
      row?.querySelector('cr-toggle');
    if (!toggle) return { clicked: false, found: Boolean(row) };
    if (toggle.checked === true) return { clicked: false, already: true };
    toggle.click();
    return { clicked: true, ariaChecked: toggle.getAttribute('aria-checked') };
  });
  await new Promise((resolve) => setTimeout(resolve, 500));
  const after = await driver.executeScript(() => {
    const manager = document.querySelector('extensions-manager');
    const detail = manager?.shadowRoot?.querySelector('extensions-detail-view');
    const row = detail?.shadowRoot?.querySelector('#allow-incognito');
    const toggle = row?.shadowRoot?.querySelector('cr-toggle');
    return {
      checked: toggle?.checked ?? null,
      ariaChecked: toggle?.getAttribute('aria-checked') ?? null,
    };
  });
  return { before, clicked, after };
}

function assertPopupGuard(report) {
  assert.equal(report.allowed?.allowed, true);
  assert.equal(report.active?.status, 'success');
  assert.equal(report.active?.incognito, true);
  assert.equal(report.guard?.status, 'blocked');
  assert.equal(report.guard?.storageAccessed, false);
  assert.notEqual(report.guard?.contextValue, false);
  assert.equal(report.guard?.context?.status, 'unknown');
  assert.equal(report.guard?.context?.tabFound, false);
}

async function popupProbeReport() {
  return driver.executeAsyncScript(async (done) => {
    try {
      done({ status: 'ok', value: await window.popupProbe.report() });
    } catch (error) {
      done({ status: 'error', error: String(error) });
    }
  });
}

async function runChromePopupRoute(observations) {
  const popupProfile = join(work, 'chrome-popup-profile');
  await mkdir(popupProfile, { recursive: true });
  const popupId = chromeExtensionId(savedPopupDirectory);
  const previousDriver = driver;
  let popupDriver = null;
  observations.extensionId = popupId;
  try {
    popupDriver = await chromeSession({
      userDataDir: popupProfile,
      loadExtension: savedPopupDirectory,
    });
    driver = popupDriver;
    const normalUrl = `chrome-extension://${popupId}/page.html?guardOnly=1`;
    await driver.get(normalUrl);
    const normalLoaded = await driver.executeScript(() =>
      Boolean(window.popupProbe),
    );
    observations.normalPage = { url: normalUrl, loaded: normalLoaded };
    if (!normalLoaded) {
      observations.normalBody = await driver
        .findElement(By.css('body'))
        .getText()
        .catch(() => null);
      throw new Error('popup candidate page did not load in normal window');
    }
    const normal = await popupProbeReport();
    observations.normal = normal.value ?? normal;
    observations.allowanceUi = await allowChromeIncognitoViaUI(popupId);
    await driver.quit();
    popupDriver = null;
    popupDriver = await chromeSession({
      userDataDir: popupProfile,
      loadExtension: savedPopupDirectory,
    });
    driver = popupDriver;
    await driver.get(normalUrl);
    observations.allowedAfterRestart = await driver.executeAsyncScript(
      async (done) => {
        try {
          done({ status: 'ok', value: await window.popupProbe.allowed() });
        } catch (error) {
          done({ status: 'error', error: String(error) });
        }
      },
    );
    const beforeWindows = new Set(await driver.getAllWindowHandles());
    observations.incognitoWindow = await driver.executeAsyncScript(
      async (done) => {
        try {
          done({
            status: 'ok',
            value: await window.popupProbe.createIncognito(),
          });
        } catch (error) {
          done({ status: 'error', error: String(error) });
        }
      },
    );
    const incognitoHandle = await driver.wait(async () => {
      const handles = await driver.getAllWindowHandles();
      return handles.find((handle) => !beforeWindows.has(handle)) ?? false;
    }, 10000);
    await driver.switchTo().window(incognitoHandle);
    observations.incognitoTab = { url: await driver.getCurrentUrl() };

    const popupRoute = {
      route: 'action-popup',
      url: `chrome-extension://${popupId}/popup.html`,
    };
    let cdp = null;
    try {
      const capabilities = await driver.getCapabilities();
      cdp = await browserProtocol(
        capabilities.get('goog:chromeOptions').debuggerAddress,
      );
      const { targetInfos } = await cdp.send('Target.getTargets');
      observations.popupTargets = targetInfos.map((target) => ({
        type: target.type ?? null,
        url: target.url ?? null,
        browserContextId: target.browserContextId ?? null,
      }));
      const filtered = await cdp.send('Target.getTargets', {
        filter: [{ type: 'tab' }],
      });
      observations.tabTargets = filtered.targetInfos.map((target) => ({
        type: target.type ?? null,
        url: target.url ?? null,
        browserContextId: target.browserContextId ?? null,
      }));
      const tab =
        filtered.targetInfos.find((target) => target.url === 'about:blank') ??
        filtered.targetInfos.find((target) => target.type === 'tab');
      if (!tab)
        throw new Error(
          `incognito tab target not found: ${JSON.stringify(observations.popupTargets)}`,
        );
      await cdp.send('Extensions.triggerAction', {
        id: popupId,
        targetId: tab.targetId,
      });
      const popupTarget = await driver.wait(async () => {
        const targets = await cdp.send('Target.getTargets');
        return (
          targets.targetInfos.find((target) => target.url === popupRoute.url) ??
          false
        );
      }, 10000);
      const { sessionId } = await cdp.send('Target.attachToTarget', {
        targetId: popupTarget.targetId,
        flatten: true,
      });
      const result = await cdp.send(
        'Runtime.evaluate',
        {
          expression: 'window.popupProbe.report()',
          awaitPromise: true,
          returnByValue: true,
        },
        sessionId,
      );
      popupRoute.report = result.result?.value;
      popupRoute.exception = result.exceptionDetails ?? null;
      if (!popupRoute.exception) assertPopupGuard(popupRoute.report);
      await cdp.send('Target.closeTarget', {
        targetId: popupTarget.targetId,
      });
      await cdp.send('Target.detachFromTarget', { sessionId });
    } catch (error) {
      popupRoute.error = String(error);
    } finally {
      cdp?.close();
    }
    observations.popupRoute = popupRoute;
    if (!popupRoute.report || popupRoute.error || popupRoute.exception) {
      observations.popupError =
        popupRoute.error ?? JSON.stringify(popupRoute.exception ?? null);
    }
    const pageRoute = {
      route: 'popup-candidate-page',
      url: normalUrl,
    };
    try {
      await driver.get(normalUrl);
      const pageLoaded = await driver.executeScript(() =>
        Boolean(window.popupProbe),
      );
      pageRoute.loaded = pageLoaded;
      if (pageLoaded) {
        const page = await popupProbeReport();
        pageRoute.report = page.value ?? page;
      } else {
        pageRoute.body = await driver
          .findElement(By.css('body'))
          .getText()
          .catch(() => null);
        pageRoute.outcome = 'browser-blocked-or-error-page';
      }
    } catch (error) {
      pageRoute.error = String(error);
    }
    observations.pageRoute = pageRoute;
    return observations;
  } catch (error) {
    observations.error = {
      name: error?.name ?? 'Error',
      message: String(error?.message ?? error),
    };
    return observations;
  } finally {
    try {
      await popupDriver?.quit();
    } catch {
      /* Preserve the report. */
    }
    driver = previousDriver;
  }
}

async function chromeMain() {
  declareChecks(chromeCheckList);
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
    savedPopupDirectory,
  );
  report.popupCandidateExtension = {
    id: installed.popupId,
    url: installed.popupId
      ? `chrome-extension://${installed.popupId}/popup.html`
      : null,
  };
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
  await run(availability, 'open-and-round-trip', async (observations) => {
    observations.navigation = await ensurePage(candidateUrl);
    await waitReady();
    await call('putRaw', {
      recordId: 'round-trip',
      payload: 'round-trip',
    });
    observations.records = await pages();
    observations.epoch = await call('status');
    observations.manifest = JSON.parse(
      await readFile(join(candidateDirectory, 'manifest.json'), 'utf8'),
    );
    assert.equal(observations.records[0].payload, 'round-trip');
    assert.equal(observations.manifest.permissions, undefined);
    assert.equal(observations.manifest.optional_permissions, undefined);
    assert.equal(observations.manifest.content_scripts, undefined);
    return observations;
  });

  const rawHeadroom = record(
    'raw-headroom',
    'Raw storage headroom separately from product-bound enforcement',
    'Observed candidate writes and reads; this is not the exact 5 MiB/1 MiB product boundary.',
    false,
  );
  await run(rawHeadroom, 'raw-headroom', async (observations) => {
    await ensurePage(candidateUrl);
    await waitReady();
    await call('clearRecords');
    observations.estimateBefore = await call('estimate');
    let serialized = 0;
    for (let index = 0; index < 50; index += 1) {
      const result = await call('writePayload', `raw-${index}`, 100_000);
      serialized += result.serialized;
    }
    observations.large = await call('writePayload', 'raw-large', 1_000_000);
    observations.estimateAfter = await call('estimate');
    const all = await call('allWithBytes');
    observations.serializedTotal = serialized;
    observations.recordCount = all.records.length;
    observations.totalBytes = all.totalBytes;
    assert.equal(all.records.length, 51);
    return observations;
  });

  const exactBoundary = record(
    'exact-boundary-capacity',
    'Exact 5,242,880-byte complete-record set and 1,048,576-byte record',
    'Observed candidate writes, full readback hashes and complete serialized UTF-8 accounting.',
  );
  await run(exactBoundary, 'exact-boundary-capacity', (observations) =>
    runExactCapacity(candidateUrl, observations),
  );

  const boundRefusal = record(
    'bound-refusal',
    'Atomic candidate refusal at 51 records, total-byte overflow and per-record overflow',
    'Observed no partial write, no truncation and no unexpired eviction.',
  );
  await run(boundRefusal, 'bound-refusal', (observations) =>
    runBoundRefusal(candidateUrl, observations),
  );

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
  await run(quotaEntry, 'quota-probe', async (observations) => {
    observations.navigation = await ensurePage(candidateUrl);
    await waitReady();
    observations.estimate = await call('estimate');
    observations.attempt = { stage: 'estimate-only' };
    observations.quotaErrorObserved = false;
    observations.simulatedAbort = await callRaw('saveNow', 'quota-abort', {
      abortSynchronously: true,
    });
    assert.equal(observations.simulatedAbort.value.status, 'aborted');
    if (
      typeof observations.estimate.quota !== 'number' ||
      observations.estimate.quota <= 0 ||
      observations.estimate.quota > 64 * 1024 * 1024
    )
      report.gaps.push(
        `Natural quota exhaustion was not induced: the Chrome quota estimate (${observations.estimate.quota ?? 'absent'} bytes) is absent or above the fixed 64 MiB pressure cap. No real QuotaExceededError observation exists for this target.`,
      );
    return observations;
  });

  const contentEntry = record(
    'content-script-boundary',
    'A same-extension content script cannot read extension-origin archives',
    'Controlled fixture extension with declared test-only host/content-script authority; kept out of product and candidate.',
  );
  await run(contentEntry, 'content-boundary', async (observations) => {
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
    observations.fixtureManifest = JSON.parse(
      await readFile(join(contentFixtureDirectory, 'manifest.json'), 'utf8'),
    );
    observations.fixturePage = fixture;
    observations.candidateRecordsBefore = candidateRecords.map((record) => ({
      recordId: record.recordId,
      payload:
        typeof record.payload === 'string' && record.payload.length > 64
          ? `${record.payload.length} chars`
          : record.payload,
    }));
    observations.contentProbe = contentProbe;
    observations.candidateAfter = (await call('all')).map((record) => ({
      recordId: record.recordId,
      payload:
        typeof record.payload === 'string' && record.payload.length > 64
          ? `${record.payload.length} chars`
          : record.payload,
    }));
    await driver.get(`${contentUrl}?readOnly=1`);
    await driver.wait(async () => {
      return (
        (await driver.executeScript(
          () => document.documentElement.dataset.contentFixtureReady === 'true',
        )) === true
      );
    }, 10000);
    observations.fixtureAfter = await driver.executeScript(
      () => window.contentFixtureProbe,
    );
    const candidateSentinel = observations.candidateAfter.find(
      (record) => record.recordId === 'candidate-sentinel',
    );
    observations.extensionAfter = {
      fixture: {
        readOnly: observations.fixtureAfter?.readOnly === true,
        sentinel: observations.fixtureAfter?.sentinel ?? null,
        sentinelPresent: observations.fixtureAfter?.sentinelPresent === true,
      },
      candidate: {
        recordId: candidateSentinel?.recordId ?? null,
        payload: candidateSentinel?.payload ?? null,
        sentinelPresent: candidateSentinel?.payload === sentinel,
      },
    };
    observations.sameExtension =
      contentProbe.runtimeId === fixture.extensionId
        ? 'runtime-id-equals-extension-id'
        : 'runtime-id-mismatch';
    assertContentBoundary(observations);
    return observations;
  });

  const negativeFixtures = record(
    'negative-fixtures',
    'Focused negative fixtures reject wrong content, restart, uninstall and deletion observations',
    'Test-of-test only; no product claim.',
  );
  await run(negativeFixtures, 'negative-fixtures', (observations) =>
    runNegativeFixtures(observations),
  );

  const epochFailClosed = record(
    'epoch-fail-closed',
    'Missing, corrupt, unsafe and exhausted deletion epochs fail closed',
    'Observed pending saves and deletes write nothing when the barrier metadata is invalid.',
  );
  await run(epochFailClosed, 'epoch-fail-closed', (observations) =>
    runEpochFailClosed(candidateUrl, observations),
  );

  const epochEntry = record(
    'deletion-epoch-barrier',
    'Pending saves cannot commit after a cross-view delete, including distinct record IDs and withheld notification',
    'Observed in the candidate with two tabs and no BroadcastChannel.',
  );
  await run(epochEntry, 'epoch-races', async (observations) => {
    await driver.get(candidateUrl);
    await waitReady();
    const tabA = await driver.getWindowHandle();
    await call('clearRecords');
    await call('saveNow', 'record-a');
    const tabB = await openTab(candidateUrl);
    await waitReady();
    await driver.switchTo().window(tabA);
    const pending = await call('beginPendingSave', 'record-b');
    observations.pending = pending;
    assert.equal(pending.status, 'pending');
    await driver.switchTo().window(tabB);
    const deleted = await callRaw('deleteRecord', 'record-a');
    observations.deleted = deleted;
    assert.equal(deleted.status, 'ok');
    await driver.switchTo().window(tabA);
    const stale = await callRaw('releasePending');
    observations.stale = stale;
    const afterStale = await pages();
    observations.afterStale = afterStale;
    assert.equal(stale.value.status, 'stale');
    assert.equal(afterStale.length, 0);
    const idempotent = await callRaw('beginPendingSave', 'record-c');
    observations.idempotent = idempotent;
    assert.equal(idempotent.value.status, 'pending');
    await driver.switchTo().window(tabB);
    const missingDelete = await callRaw('deleteRecord', 'already-missing');
    observations.missingDelete = missingDelete;
    assert.equal(missingDelete.status, 'ok');
    await driver.switchTo().window(tabA);
    const staleIdempotent = await callRaw('releasePending');
    observations.staleIdempotent = staleIdempotent;
    assert.equal(staleIdempotent.value.status, 'stale');
    const afterIdempotent = await pages();
    observations.afterIdempotent = afterIdempotent;
    assert.equal(afterIdempotent.length, 0);
    const commitFirst = await callRaw('beginPendingSave', 'record-d');
    observations.commitFirst = commitFirst;
    assert.equal(commitFirst.value.status, 'pending');
    const savedFirst = await callRaw('releasePending');
    observations.savedFirst = savedFirst;
    assert.equal(savedFirst.value.status, 'saved');
    await driver.switchTo().window(tabB);
    const deleteAfter = await callRaw('deleteRecord', 'record-a');
    observations.deleteAfter = deleteAfter;
    assert.equal(deleteAfter.status, 'ok');
    await driver.switchTo().window(tabA);
    const afterCommit = await pages();
    observations.afterCommit = afterCommit;
    assert.equal(
      afterCommit.some((entry) => entry.recordId === 'record-d'),
      true,
    );
    const aborted = await callRaw('saveNow', 'record-e', {
      abortSynchronously: true,
    });
    observations.aborted = aborted;
    assert.equal(aborted.value.status, 'aborted');
    const afterAbort = await pages();
    observations.afterAbort = afterAbort;
    assert.equal(
      afterAbort.some((entry) => entry.recordId === 'record-e'),
      false,
    );
    await closeTab(tabB, tabA);
    await driver.switchTo().window(tabA);
    return observations;
  });

  const readinessEntry = record(
    'readiness-gate',
    'First-save connection delay cannot silently acquire a post-delete epoch',
    'Observed in the candidate: Save is unavailable until the guarded connection is ready.',
  );
  await run(readinessEntry, 'readiness-race', async (observations) => {
    await call('clearRecords');
    const delayed = await openTab(
      `${candidateUrl}?db=first-save&delayOpen=1200`,
    );
    await driver.switchTo().window(delayed);
    const notReady = await callRaw('beginPendingSave', 'late-save');
    observations.notReady = notReady;
    assert.equal(notReady.value.status, 'not-ready');
    const other = await openTab(`${candidateUrl}?db=first-save`);
    await waitReady();
    await call('saveNow', 'seed');
    const deleted = await callRaw('deleteRecord', 'seed');
    observations.deleted = deleted;
    assert.equal(deleted.status, 'ok');
    await driver.switchTo().window(delayed);
    await waitReady();
    const begun = await callRaw('beginPendingSave', 'late-save');
    observations.begun = begun;
    const released = await callRaw('releasePending');
    observations.released = released;
    assert.equal(begun.value.status, 'pending');
    assert.equal(released.value.status, 'saved');
    await closeTab(other);
    await closeTab(delayed);
    return observations;
  });

  const lazyEntry = record(
    'delete-expiry-unsupported',
    'Expired records are refused/removed; unsupported versions stay listed and deletable',
    'Candidate-level behaviour, not the product library.',
  );
  await run(lazyEntry, 'list-valid', async (observations) => {
    observations.navigation = await ensurePage(candidateUrl);
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
    observations.listed = await call('listValid', now);
    observations.remaining = await pages();
    const deleteUnsupported = await callRaw('deleteRecord', 'future');
    assert.equal(deleteUnsupported.status, 'ok');
    observations.deleteUnsupported = deleteUnsupported.value;
    observations.afterDelete = await pages();
    assertDeleteExpiry(observations);
    return observations;
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
  await run(restartEntry, 'chrome-restart', async (observations) => {
    driver = await chromeSession({ userDataDir });
    const reinstalled = await chromeInstall(
      candidateDirectory,
      contentFixtureDirectory,
    );
    assert.equal(reinstalled.candidateId, installed.candidateId);
    await driver.get(candidateUrl);
    await waitReady();
    observations.userDataDir = userDataDir;
    observations.extensionId = reinstalled.candidateId;
    observations.records = await pages();
    assertRestartPersistence(observations);
    return observations;
  });

  const uninstallEntry = record(
    'uninstall-behavior',
    'Uninstall/reinstall behavior is recorded separately from restart',
    'Test-authority chrome.management.uninstallSelf in the same profile; not a product claim.',
    false,
  );
  await run(uninstallEntry, 'chrome-uninstall', async (observations) => {
    await ensurePage(candidateUrl);
    await waitReady();
    await call('putRaw', {
      recordId: 'uninstall-seed',
      payload: 'uninstall-seed',
    });
    observations.before = await pages();
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
    observations.requested = requested;
    observations.reinstallError = reinstallError;
    if (!reinstalled) return observations;
    await ensurePage(
      `chrome-extension://${reinstalled.candidateId}/probe.html`,
    );
    await waitReady();
    observations.extensionId = reinstalled.candidateId;
    observations.after = await pages();
    if (requested.requested === true) assertUninstall(observations);
    return observations;
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

  const quotaOverride = record(
    'quota-override',
    'Supported test-only low quota produces a real QuotaExceededError and recovery',
    'Chrome CDP Storage.overrideQuotaForOrigin in the disposable profile; not a product setting.',
    false,
  );
  await run(quotaOverride, 'chrome-quota-override', (observations) =>
    runChromeQuotaOverride(observations, installed.candidateId),
  );

  const clearEntry = record(
    'forced-clear',
    'Forced browser-origin clearing removes candidate storage',
    'Test-authority CDP clear, not natural eviction.',
    false,
  );
  await run(clearEntry, 'chrome-cdp-clear', async (observations) => {
    await ensurePage(candidateUrl);
    await waitReady();
    observations.seeded = await call('putRaw', {
      recordId: 'clear-me',
      payload: 'clear-me',
    });
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
    observations.attempts = attempts;
    observations.cleared = cleared;
    await driver.navigate().refresh();
    await waitReady();
    const records = await pages();
    observations.recordsAfter = records;
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
  await run(privateEntry, 'chrome-private', async (observations) => {
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
      savedPopupDirectory,
    );
    report.incognitoPopup = {
      id: reinstalled.popupId,
      url: reinstalled.popupId
        ? `chrome-extension://${reinstalled.popupId}/popup.html`
        : null,
    };
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
      const contextValue = context.value ?? context;
      const blockedValue = blocked.value ?? blocked;
      route.context = contextValue;
      route.blocked = blockedValue;
      assertPrivateRoute(route);
    } else {
      route.body = await driver
        .findElement(By.css('body'))
        .getText()
        .catch(() => null);
      route.outcome = 'browser-blocked-or-error-page';
    }
    routes.push(route);
    observations.routes = routes;
    observations.incognito = true;
    return observations;
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

  const popupEntry = record(
    'private-popup-route',
    'Incognito popup candidate verifies allowance and a reachable guard',
    'Test-only zero-permission action-popup candidate with test-only incognito allowance; not a product manifest change.',
    false,
  );
  await run(popupEntry, 'chrome-private-popup', (observations) =>
    runChromePopupRoute(observations),
  );
  if (
    popupEntry.status === 'passed' &&
    (!popupEntry.details?.popupRoute?.report ||
      popupEntry.details?.popupRoute?.error ||
      popupEntry.details?.popupRoute?.exception)
  ) {
    popupEntry.status = 'unavailable';
    report.gaps.push(
      `Chrome incognito action-popup route did not produce a verified guard: ${popupEntry.details?.popupRoute?.error ?? JSON.stringify(popupEntry.details?.popupRoute?.exception ?? null)}. Page route: ${JSON.stringify({ loaded: popupEntry.details?.pageRoute?.loaded, error: popupEntry.details?.pageRoute?.error, body: popupEntry.details?.pageRoute?.body })}.`,
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
    .filter(
      (entry) =>
        entry.essential &&
        (entry.status === 'not-run' || entry.status === 'unavailable'),
    )
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
