// Test-only zero-permission incognito popup/page candidate. It records its own
// context and refuses any saved-data read unless the context is explicitly
// normal (incognito === false). Unknown is blocked, never normal.
const DB_NAME = 'addonray-saved-investigations';
const STORE = 'records';
const api = globalThis.chrome;
const probe = {
  storageAccesses: 0,
  inIncognitoContext:
    typeof api?.extension?.inIncognitoContext === 'boolean'
      ? api.extension.inIncognitoContext
      : null,
  isAllowedIncognitoAccess: null,
};

function callbackValue(invoke) {
  return new Promise((resolve) => {
    try {
      invoke((value) => {
        const lastError = api.runtime?.lastError;
        resolve(
          lastError
            ? { status: 'error', error: lastError.message ?? String(lastError) }
            : value,
        );
      });
    } catch (error) {
      resolve({ status: 'error', error: String(error) });
    }
  });
}

probe.currentTab = () =>
  callbackValue((done) => {
    api.tabs.getCurrent((tab) => {
      if (typeof tab?.incognito !== 'boolean')
        done({ status: 'unknown', incognito: null, tabFound: !!tab });
      else done({ status: 'success', incognito: tab.incognito });
    });
  });

probe.queryActive = () =>
  callbackValue((done) => {
    api.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs?.[0];
      if (typeof tab?.incognito !== 'boolean')
        done({ status: 'unknown', incognito: null, tabFound: !!tab });
      else done({ status: 'success', incognito: tab.incognito });
    });
  });

probe.createIncognito = () =>
  callbackValue((done) => {
    api.windows.create({ incognito: true, url: 'about:blank' }, (created) => {
      done({
        windowId: created?.id ?? null,
        incognito: created?.incognito ?? null,
        tabs: (created?.tabs ?? []).map((tab) => ({
          id: tab.id ?? null,
          incognito: tab.incognito ?? null,
        })),
      });
    });
  });

probe.allowed = () =>
  callbackValue((done) => {
    api.extension.isAllowedIncognitoAccess((allowed) => {
      probe.isAllowedIncognitoAccess = allowed;
      done({ allowed });
    });
  });

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

// The guard refuses before opening or reading the database for any context
// other than an explicit normal tab. tabs.getCurrent() returning undefined is
// unknown, not normal.
probe.guardedRead = async () => {
  const current = await probe.currentTab();
  const active = await probe.queryActive();
  const contextValue =
    current.status === 'success'
      ? current.incognito
      : active.status === 'success'
        ? active.incognito
        : null;
  if (contextValue !== false)
    return {
      status: 'blocked',
      reason: 'private-or-unknown-context',
      contextValue,
      storageAccessed: false,
      context: current,
      active,
    };
  probe.storageAccesses += 1;
  const database = await openDatabase();
  const records = await readAll(database);
  database.close();
  return {
    status: 'read',
    contextValue,
    storageAccessed: true,
    records,
  };
};

probe.report = async () => {
  const current = await probe.currentTab();
  const active = await probe.queryActive();
  const allowed = await probe.allowed();
  const guard = await probe.guardedRead();
  return {
    current,
    active,
    allowed,
    guard,
    inIncognitoContext: probe.inIncognitoContext,
    storageAccesses: probe.storageAccesses,
    page: location.pathname,
  };
};

window.popupProbe = probe;

const parameters = new URLSearchParams(location.search);
if (!parameters.has('guardOnly')) {
  probe.report().then((result) => {
    document.documentElement.dataset.popupProbe = JSON.stringify(result);
  });
}
