// Test-only extension page. It owns an extension-origin database with the same
// name as the product archive and must stay unreadable from the content script.
const DB_NAME = 'addonray-saved-investigations';
const STORE = 'records';
const SENTINEL = 'fixture-extension';

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE))
        request.result.createObjectStore(STORE, { keyPath: 'recordId' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function write(database, value) {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE, 'readwrite');
    transaction.objectStore(STORE).put({
      recordId: 'archive-sentinel',
      payload: value,
    });
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

function read(database) {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE, 'readonly');
    const request = transaction.objectStore(STORE).getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function main() {
  const database = await openDatabase();
  await write(database, SENTINEL);
  const records = await read(database);
  window.contentFixtureProbe = {
    extensionId:
      globalThis.browser?.runtime?.id ?? globalThis.chrome?.runtime?.id,
    sentinel: records[0]?.payload ?? null,
    sentinelPresent: records.some((record) => record.payload === SENTINEL),
  };
  document.documentElement.dataset.contentFixtureReady = 'true';
}

main().catch((error) => {
  document.documentElement.dataset.contentFixtureError = String(error);
});
