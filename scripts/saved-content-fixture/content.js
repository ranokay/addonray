// Test-only content script. It runs in a page origin on a loopback page and
// attempts to read the same-named database that the fixture extension page
// owns. It must never see extension-origin records.
const DB_NAME = 'addonray-saved-investigations';
const STORE = 'records';

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

function readAll(database) {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE, 'readonly');
    const request = transaction.objectStore(STORE).getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function waitForPage() {
  return new Promise((resolve) => {
    let attempts = 0;
    const check = () => {
      attempts += 1;
      if (
        document.documentElement.dataset.pageDbReady === 'true' ||
        attempts >= 50
      ) {
        resolve();
        return;
      }
      setTimeout(check, 50);
    };
    check();
  });
}

async function main() {
  await waitForPage();
  const result = {
    runtimeId:
      globalThis.browser?.runtime?.id ?? globalThis.chrome?.runtime?.id ?? null,
    pageReady: document.documentElement.dataset.pageDbReady === 'true',
    readSentinels: [],
    databases: [],
    error: null,
  };
  try {
    const database = await openDatabase();
    result.readSentinels = (await readAll(database))
      .map((record) => record.payload)
      .filter((value) => typeof value === 'string');
    database.close();
    const databases =
      typeof indexedDB.databases === 'function'
        ? await indexedDB.databases()
        : [];
    result.databases = databases.map((databaseInfo) => databaseInfo.name);
  } catch (error) {
    result.error = String(error);
  }
  document.documentElement.dataset.addonrayContentProbe =
    JSON.stringify(result);
}

main().catch((error) => {
  document.documentElement.dataset.addonrayContentProbe = JSON.stringify({
    runtimeId:
      globalThis.browser?.runtime?.id ?? globalThis.chrome?.runtime?.id ?? null,
    error: String(error),
  });
});
