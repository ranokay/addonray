/* global WebExtensionPolicy */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { Builder } from 'selenium-webdriver';
import firefox from 'selenium-webdriver/firefox.js';
import { installTemporaryExtension } from './firefox-install.mjs';
import { chromeExtensionId, launchChrome } from './chrome-session.mjs';

const target = process.argv[2];
assert(
  target === 'firefox' || target === 'chrome',
  'Usage: bun scripts/saved-store-checks.mjs firefox|chrome',
);
const requestedVersion =
  target === 'firefox' ? (process.env.FIREFOX_VERSION ?? '158.0.1') : null;
if (requestedVersion)
  assert.match(requestedVersion, /^\d+\.\d+(?:\.\d+)?(?:esr)?$/);
process.env.SE_AVOID_STATS = 'true';
process.env.SE_SKIP_DRIVER_IN_PATH = 'true';
process.env.SE_SKIP_BROWSER_IN_PATH = 'true';
if (target === 'firefox') process.env.SE_DRIVER_VERSION = '0.37.1';

const fixtureDirectory = resolve('.scratch/saved-store-fixture');
const fixtureId = 'saved-store-fixture@addonray.test';
const dbName = 'addonray-saved-investigations';
await rm(fixtureDirectory, { recursive: true, force: true });
await mkdir(join(fixtureDirectory, 'core'), { recursive: true });

const transpiler = new Bun.Transpiler({ loader: 'ts', target: 'browser' });
for (const name of [
  'browser-target',
  'comparison',
  'inspector',
  'page-error-check',
  'saved-record',
  'saved-store',
]) {
  const source = await readFile(`lib/${name}.ts`, 'utf8');
  const js = transpiler
    .transformSync(source)
    .replace(/from (["'])\.\/([a-z-]+)\1/g, 'from "./$2.js"');
  await writeFile(join(fixtureDirectory, 'core', `${name}.js`), js);
}

await writeFile(
  join(fixtureDirectory, 'manifest.json'),
  JSON.stringify({
    manifest_version: 3,
    name: 'Saved-store production adapter fixture',
    version: '1.0',
    ...(target === 'firefox'
      ? {
          browser_specific_settings: {
            gecko: {
              id: fixtureId,
              data_collection_permissions: { required: ['none'] },
            },
          },
        }
      : {}),
  }),
);
await writeFile(
  join(fixtureDirectory, 'probe.html'),
  '<!doctype html><title>Saved-store adapter probe</title><script type="module" src="probe.js"></script>',
);
await writeFile(
  join(fixtureDirectory, 'probe.js'),
  `import { createIndexedDbSavedStore } from './core/saved-store.js';
import { inspectStoredRecord, storedRecordBytes, exchangeBytes, SAVED_LIMITS } from './core/saved-record.js';

const dbName = ${JSON.stringify(dbName)};
const stores = new Map();
const now = Date.now();

function makeRecord(id, name = 'fixture') {
  return {
    schemaVersion: 1,
    recordId: id,
    origin: 'captured',
    savedAt: now,
    expiresAt: now + 30 * 24 * 60 * 60 * 1000,
    report: {
      before: { extensions: [{ name, version: '1', enabled: true }] },
      after: { extensions: [] },
      changes: [],
      assessment: null,
      timing: { before: null, after: null },
      pageErrors: { before: null, after: null },
      observationLimits: {
        pageErrorWindowMs: 30000,
        pageErrorEvents: 200,
        pageErrorSummaryBytes: 1024,
      },
    },
  };
}

function deleteDatabase() {
  return new Promise((resolveDelete, reject) => {
    const request = indexedDB.deleteDatabase(dbName);
    const timer = setTimeout(() => reject(new Error('deleteDatabase timeout')), 5000);
    request.onsuccess = () => { clearTimeout(timer); resolveDelete(); };
    request.onerror = () => { clearTimeout(timer); reject(request.error); };
    request.onblocked = () => { clearTimeout(timer); reject(new Error('deleteDatabase blocked')); };
  });
}

async function reset() {
  for (const store of stores.values()) store.close();
  stores.clear();
  await deleteDatabase();
  return true;
}

async function open(name) {
  const store = createIndexedDbSavedStore();
  stores.set(name, store);
  return store.ready();
}

async function seed(name, record) {
  const store = stores.get(name);
  const expected = await store.readState();
  return store.save(record, expected);
}

async function barrierCapture(name) {
  const store = stores.get(name);
  const events = [];
  const original = IDBDatabase.prototype.transaction;
  IDBDatabase.prototype.transaction = function (storesArg, mode) {
    events.push({ mode, stores: Array.isArray(storesArg) ? [...storesArg] : String(storesArg) });
    return original.apply(this, arguments);
  };
  try {
    const promise = store.readState();
    const immediate = events.length;
    const state = await promise;
    return { immediate, events, state };
  } finally {
    IDBDatabase.prototype.transaction = original;
  }
}

async function barrierDelete(first, second, key, record) {
  const store = stores.get(first);
  const other = stores.get(second);
  const expected = await store.readState();
  await other.delete(key);
  const result = await store.save(record, expected);
  return { expected, result, list: await store.list(), get: await store.get(key) };
}

async function deleteTwice(name, key) {
  const store = stores.get(name);
  const before = await store.readState();
  await store.delete(key);
  await store.delete(key);
  return { before, after: await store.readState(), list: await store.list() };
}

async function recreated(oldState, first, second) {
  const store = stores.get(first);
  await store.close();
  stores.delete(first);
  await deleteDatabase();
  const state = await open(second);
  const record = makeRecord(second);
  const result = await stores.get(second).save(record, oldState);
  const fresh = await stores.get(second).save(record, state);
  return { state, oldState, result, fresh, list: await stores.get(second).list() };
}

async function duplicate(name) {
  const store = stores.get(name);
  const first = makeRecord('11111111-1111-1111-1111-111111111111', 'first');
  const replacement = makeRecord(first.recordId, 'second');
  const seeded = await seed(name, first);
  const expected = await store.readState();
  const result = await store.save(replacement, expected);
  return { seeded, result, get: await store.get(first.recordId), list: await store.list() };
}

async function abortedSave(name) {
  const store = stores.get(name);
  const expected = await store.readState();
  const record = makeRecord('22222222-2222-2222-2222-222222222222');
  const controller = new AbortController();
  const promise = store.save(record, expected, controller.signal);
  controller.abort();
  const result = await promise;
  return { result, get: await store.get(record.recordId), list: await store.list() };
}


function invalidRecord() {
  const record = makeRecord('33333333-3333-3333-3333-333333333333');
  record.report.before.extensions = Array.from({ length: 300 }, () => ({
    name: 'x'.repeat(4096),
    version: '1',
    enabled: true,
  }));
  return {
    status: inspectStoredRecord(record).status,
    storedBytes: storedRecordBytes(record),
    exchangeBytes: exchangeBytes(record),
    limit: SAVED_LIMITS.recordBytes,
  };
}

async function barrierTimeout(name) {
  const store = stores.get(name);
  const originalGet = IDBObjectStore.prototype.get;
  IDBObjectStore.prototype.get = function (...args) {
    if (this.name === 'meta') return { onsuccess: null, onerror: null };
    return originalGet.apply(this, args);
  };
  const started = performance.now();
  let error = null;
  try {
    await store.readState();
  } catch (caught) {
    error = String(caught);
  }
  const elapsedMs = performance.now() - started;
  IDBObjectStore.prototype.get = originalGet;
  const state = await store.readState();
  const saved = await store.save(makeRecord('55555555-5555-5555-5555-555555555555'), state);
  return { error, elapsedMs, state, saved, list: await store.list() };
}

async function notReady() {
  const store = createIndexedDbSavedStore();
  stores.set('not-ready', store);
  const record = makeRecord('44444444-4444-4444-4444-444444444444');
  let readStateError = null;
  try { await store.readState(); } catch (error) { readStateError = String(error); }
  const saveBefore = await store.save(record, { storeId: 'missing', epoch: -1 });
  const state = await store.ready();
  const expected = await store.readState();
  const saveAfter = await store.save(record, expected);
  return { readStateError, saveBefore, state, saveAfter };
}

function openRawDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName, 1);
    request.onupgradeneeded = () => {};
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// A held cursor keeps one readwrite transaction open while product save and
// deletion calls queue behind it. Releasing the cursor proves the actual
// ordering on either side of commit, not a model-only approximation.
async function holdRecordsTransaction() {
  const database = await openRawDatabase();
  const transaction = database.transaction('records', 'readwrite');
  const request = transaction.objectStore('records').openCursor();
  await new Promise((resolve, reject) => {
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
  const cursor = request.result;
  if (!cursor) throw new Error('held cursor was not created');
  let released = false;
  return {
    database,
    release() {
      if (released) return;
      released = true;
      cursor.continue();
    },
  };
}

async function saveThenDeleteAll(name, record) {
  const store = stores.get(name);
  const expected = await store.readState();
  const hold = await holdRecordsTransaction();
  const saving = store.save(record, expected);
  const deleting = store.deleteAll();
  hold.release();
  const [saveResult, deleteResult] = await Promise.all([saving, deleting]);
  await hold.database.close();
  return {
    saveResult,
    deleteResult,
    state: await store.readState(),
    list: await store.list(),
  };
}

async function deleteAllThenSave(name, record) {
  const store = stores.get(name);
  const expected = await store.readState();
  const hold = await holdRecordsTransaction();
  const deleting = store.deleteAll();
  const saving = store.save(record, expected);
  hold.release();
  const [deleteResult, saveResult] = await Promise.all([deleting, saving]);
  await hold.database.close();
  return {
    deleteResult,
    saveResult,
    state: await store.readState(),
    list: await store.list(),
  };
}

async function saveThenDeleteMany(name, key, record) {
  const store = stores.get(name);
  const expected = await store.readState();
  const hold = await holdRecordsTransaction();
  const saving = store.save(record, expected);
  const deleting = store.deleteMany([key]);
  hold.release();
  const [saveResult, deleteResult] = await Promise.all([saving, deleting]);
  await hold.database.close();
  return {
    saveResult,
    deleteResult,
    state: await store.readState(),
    list: await store.list(),
  };
}

async function deleteManyThenSave(name, key, record) {
  const store = stores.get(name);
  const expected = await store.readState();
  const hold = await holdRecordsTransaction();
  const deleting = store.deleteMany([key]);
  const saving = store.save(record, expected);
  hold.release();
  const [deleteResult, saveResult] = await Promise.all([deleting, saving]);
  await hold.database.close();
  return {
    deleteResult,
    saveResult,
    state: await store.readState(),
    list: await store.list(),
  };
}

async function deleteAllTwice(name) {
  const store = stores.get(name);
  const before = await store.readState();
  await store.deleteAll();
  await store.deleteAll();
  return { before, after: await store.readState(), list: await store.list() };
}

globalThis.savedStoreProbe = {
  reset,
  open,
  seed,
  barrierCapture,
  barrierDelete,
  deleteTwice,
  recreated,
  duplicate,
  abortedSave,
  invalidRecord,
  notReady,
  barrierTimeout,
  saveThenDeleteAll,
  deleteAllThenSave,
  saveThenDeleteMany,
  deleteManyThenSave,
  deleteAllTwice,
  makeRecord,
};
`,
);

const report = {
  timestamp: new Date().toISOString(),
  target,
  distribution: target === 'firefox' ? 'Firefox' : 'Chrome for Testing',
  requestedVersion: requestedVersion ?? null,
  source: {
    commit: execFileSync('git', ['rev-parse', 'HEAD'], {
      encoding: 'utf8',
    }).trim(),
    dirty: Boolean(
      execFileSync('git', ['status', '--porcelain'], {
        encoding: 'utf8',
      }).trim(),
    ),
  },
  browserVersion: null,
  driverVersion: null,
  fixture: { path: fixtureDirectory },
  checks: [],
  gaps: [
    'One OS/architecture and exact local pins only; retail installs remain unqualified.',
    'The fixture compiles the production saved-store/saved-record sources into a test-only extension. It is not a product package.',
    'This probe exercises storage ordering, add-only saves, bounds and abort handling, not native UI or collection permissions.',
  ],
};

function passed(name, details = {}) {
  report.checks.push({ name, status: 'passed', ...details });
  console.log(`Passed: ${name}`);
}

async function call(driver, method, ...args) {
  const result = await driver.executeAsyncScript(
    (method, args, done) => {
      Promise.resolve(globalThis.savedStoreProbe[method](...args)).then(
        (value) => done({ ok: true, value }),
        (error) => done({ ok: false, error: String(error) }),
      );
    },
    method,
    args,
  );
  assert.equal(result.ok, true, String(result.error));
  return result.value;
}

let driver;
try {
  if (target === 'firefox') {
    const options = new firefox.Options().addArguments('-headless');
    if (requestedVersion) options.setBrowserVersion(requestedVersion);
    options.setPreference('xpinstall.signatures.required', false);
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
    await installTemporaryExtension(driver, fixtureDirectory);
    await driver.setContext('chrome');
    const url = await driver.executeScript(
      (id) => WebExtensionPolicy.getByID(id).getURL('probe.html'),
      fixtureId,
    );
    await driver.setContext('content');
    await driver.get(url);
  } else {
    const session = await launchChrome({
      loadExtensions: [fixtureDirectory],
    });
    driver = session.driver;
    report.browserVersion = session.version;
    report.driverVersion = session.driverVersion;
    await driver.get(
      `chrome-extension://${chromeExtensionId(fixtureDirectory)}/probe.html`,
    );
    session.cdp.close();
  }
  await driver.wait(
    () => driver.executeScript(() => Boolean(globalThis.savedStoreProbe)),
    10000,
  );

  await call(driver, 'reset');
  const first = await call(driver, 'notReady');
  assert.match(first.readStateError, /not open/i);
  assert.equal(first.saveBefore, 'unavailable');
  assert.equal(first.saveAfter, 'saved');
  passed('not-ready and first-connection refusal, then explicit ready', first);

  await call(driver, 'reset');
  await call(driver, 'open', 'timeout');
  const timeout = await call(driver, 'barrierTimeout', 'timeout');
  assert.match(timeout.error, /timed out/i);
  assert(timeout.elapsedMs >= 4500, JSON.stringify(timeout));
  assert.equal(timeout.saved, 'saved');
  assert.equal(timeout.list.length, 1);
  passed(
    'bounded barrier timeout rejects then permits a later explicit save',
    timeout,
  );

  await call(driver, 'reset');
  await call(driver, 'open', 'a');
  await call(driver, 'open', 'b');
  await call(driver, 'seed', 'a', {
    ...(await call(
      driver,
      'makeRecord',
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      'first',
    )),
  });
  const barrier = await call(driver, 'barrierCapture', 'a');
  assert.equal(barrier.immediate, 1, JSON.stringify(barrier));
  assert(barrier.events[0]?.mode === 'readonly');
  assert.equal(barrier.events[0]?.stores, 'meta');
  passed('readState synchronously enqueues the metadata barrier', barrier);

  const deletion = await call(
    driver,
    'barrierDelete',
    'a',
    'b',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    await call(
      driver,
      'makeRecord',
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      'second',
    ),
  );
  assert.equal(deletion.result, 'stale');
  assert.equal(deletion.get, null);
  assert.equal(deletion.list.length, 0);
  passed(
    'delete after the captured barrier rejects the pending save',
    deletion,
  );

  await call(driver, 'reset');
  await call(driver, 'open', 'delete');
  await call(driver, 'seed', 'delete', {
    ...(await call(
      driver,
      'makeRecord',
      'cccccccc-cccc-cccc-cccc-cccccccccccc',
    )),
  });
  const idempotent = await call(
    driver,
    'deleteTwice',
    'delete',
    'cccccccc-cccc-cccc-cccc-cccccccccccc',
  );
  assert.equal(idempotent.list.length, 0);
  assert.equal(idempotent.after.epoch, idempotent.before.epoch + 2);
  passed('single delete is idempotent and increments the epoch', idempotent);

  await call(driver, 'reset');
  await call(driver, 'open', 'ordering');
  const orderingSeed = await call(
    driver,
    'makeRecord',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'seed',
  );
  await call(driver, 'seed', 'ordering', orderingSeed);
  const saveThenAll = await call(
    driver,
    'saveThenDeleteAll',
    'ordering',
    await call(
      driver,
      'makeRecord',
      'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
      'save-first',
    ),
  );
  assert.equal(saveThenAll.saveResult, 'saved');
  assert.equal(saveThenAll.list.length, 0);
  assert.equal(saveThenAll.state.epoch, 1);
  passed(
    'delete-all commits after a queued save and clears its committed record',
    saveThenAll,
  );

  await call(driver, 'reset');
  await call(driver, 'open', 'ordering');
  await call(driver, 'seed', 'ordering', orderingSeed);
  const allThenSave = await call(
    driver,
    'deleteAllThenSave',
    'ordering',
    await call(
      driver,
      'makeRecord',
      'ffffffff-ffff-ffff-ffff-ffffffffffff',
      'save-last',
    ),
  );
  assert.equal(allThenSave.deleteResult, null);
  assert.equal(allThenSave.saveResult, 'stale');
  assert.equal(allThenSave.list.length, 0);
  assert.equal(allThenSave.state.epoch, 1);
  passed(
    'delete-all before a queued save rejects the stale save with no resurrection',
    allThenSave,
  );

  await call(driver, 'reset');
  await call(driver, 'open', 'ordering');
  await call(driver, 'seed', 'ordering', orderingSeed);
  const saveThenMany = await call(
    driver,
    'saveThenDeleteMany',
    'ordering',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    await call(
      driver,
      'makeRecord',
      '99999999-9999-9999-9999-999999999999',
      'save-first',
    ),
  );
  assert.equal(saveThenMany.saveResult, 'saved');
  assert.deepEqual(
    saveThenMany.list.map((entry) => entry.value.recordId),
    ['99999999-9999-9999-9999-999999999999'],
  );
  assert.equal(saveThenMany.state.epoch, 1);
  passed(
    'selected deletion commits after a queued save and removes only its target',
    saveThenMany,
  );

  await call(driver, 'reset');
  await call(driver, 'open', 'ordering');
  await call(driver, 'seed', 'ordering', orderingSeed);
  const manyThenSave = await call(
    driver,
    'deleteManyThenSave',
    'ordering',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    await call(
      driver,
      'makeRecord',
      '88888888-8888-8888-8888-888888888888',
      'save-last',
    ),
  );
  assert.equal(manyThenSave.deleteResult, null);
  assert.equal(manyThenSave.saveResult, 'stale');
  assert.equal(manyThenSave.list.length, 0);
  assert.equal(manyThenSave.state.epoch, 1);
  passed(
    'selected deletion before a queued save rejects the stale save with no resurrection',
    manyThenSave,
  );

  await call(driver, 'reset');
  await call(driver, 'open', 'empty-delete-all');
  await call(driver, 'seed', 'empty-delete-all', orderingSeed);
  const emptyDeleteAll = await call(
    driver,
    'deleteAllTwice',
    'empty-delete-all',
  );
  assert.equal(emptyDeleteAll.list.length, 0);
  assert.equal(emptyDeleteAll.after.epoch, emptyDeleteAll.before.epoch + 2);
  passed(
    'delete-all advances the epoch even when no records remain',
    emptyDeleteAll,
  );

  await call(driver, 'reset');
  const oldState = await call(driver, 'open', 'old');
  await call(driver, 'seed', 'old', {
    ...(await call(
      driver,
      'makeRecord',
      'dddddddd-dddd-dddd-dddd-dddddddddddd',
    )),
  });
  const recreated = await call(driver, 'recreated', oldState, 'old', 'new');
  assert.notEqual(recreated.state.storeId, oldState.storeId);
  assert.equal(recreated.result, 'stale-store');
  assert.equal(recreated.fresh, 'saved');
  passed('recreated store identity rejects the old permit', recreated);

  await call(driver, 'reset');
  await call(driver, 'open', 'duplicate');
  const duplicate = await call(driver, 'duplicate', 'duplicate');
  assert.equal(duplicate.result, 'duplicate');
  assert.equal(duplicate.get.report.before.extensions[0].name, 'first');
  assert.equal(duplicate.list.length, 1);
  passed(
    'duplicate record ID cannot overwrite the existing archive',
    duplicate,
  );

  await call(driver, 'reset');
  await call(driver, 'open', 'abort');
  const aborted = await call(driver, 'abortedSave', 'abort');
  assert.equal(aborted.result, 'cancelled');
  assert.equal(aborted.get, null);
  assert.equal(aborted.list.length, 0);
  passed('pending write observes the cancellation signal', aborted);

  const invalid = await call(driver, 'invalidRecord');
  assert.equal(invalid.status, 'invalid');
  assert(invalid.storedBytes > invalid.limit);
  passed('oversized structurally valid row is unreadable', invalid);

  report.result = 'passed';
} catch (error) {
  report.result = 'failed';
  report.failure = String(error);
  process.exitCode = 1;
  console.error(error);
} finally {
  if (driver) {
    try {
      await driver.quit();
    } catch (error) {
      report.cleanupFailure = String(error);
      process.exitCode = 1;
    }
  }
  await writeFile(
    `.scratch/saved-store-checks-${target}.json`,
    `${JSON.stringify(report, null, 2)}\n`,
  );
  console.log(
    `Saved-store result: ${report.result}; ${report.checks.length} checks.`,
  );
  console.log(`Report: .scratch/saved-store-checks-${target}.json`);
}
