// Test-only feasibility candidate. It does not enter the product or source archives.
const parameters = new URLSearchParams(location.search);
const DB_NAME = parameters.get('db') ?? 'addonray-saved-investigations';
const DB_VERSION = 1;
const RECORDS = 'records';
const META = 'meta';
const EPOCH_KEY = 'deletionEpoch';

function failure(error) {
  return {
    name: error?.name ?? 'Error',
    message: error?.message ? String(error.message) : String(error),
  };
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(RECORDS))
        database.createObjectStore(RECORDS, { keyPath: 'recordId' });
      if (!database.objectStoreNames.contains(META))
        database.createObjectStore(META, { keyPath: 'key' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () =>
      reject(new Error('IndexedDB open was blocked by another connection.'));
  });
}

function epochValue(value) {
  const epoch = value?.value;
  return Number.isSafeInteger(epoch) && epoch >= 0 ? epoch : 0;
}

// Calling this creates the readonly transaction synchronously. A later
// readwrite delete transaction over the same stores must wait behind it.
function readEpoch(database) {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(META, 'readonly');
    const request = transaction.objectStore(META).get(EPOCH_KEY);
    request.onsuccess = () => resolve(epochValue(request.result));
    request.onerror = () => reject(request.error);
  });
}

function readAll(database) {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(RECORDS, 'readonly');
    const request = transaction.objectStore(RECORDS).getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function putRawRecord(database, record) {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(RECORDS, 'readwrite');
    transaction.objectStore(RECORDS).put(record);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () =>
      reject(transaction.error ?? new Error('Transaction aborted.'));
  });
}

function deleteWithEpoch(database, recordId) {
  return new Promise((resolve, reject) => {
    const events = {};
    const transaction = database.transaction([RECORDS, META], 'readwrite');
    const records = transaction.objectStore(RECORDS);
    const meta = transaction.objectStore(META);
    const epochRequest = meta.get(EPOCH_KEY);
    let nextEpoch = null;
    epochRequest.onsuccess = () => {
      events.epochReadAt = performance.now();
      nextEpoch = epochValue(epochRequest.result) + 1;
      records.delete(recordId);
      meta.put({ key: EPOCH_KEY, value: nextEpoch });
      events.deleteQueuedAt = performance.now();
    };
    epochRequest.onerror = () => transaction.abort();
    transaction.oncomplete = () => {
      events.completeAt = performance.now();
      resolve({ status: 'deleted', epoch: nextEpoch, events });
    };
    transaction.onabort = () =>
      reject(transaction.error ?? new Error('Delete transaction aborted.'));
    transaction.onerror = () => {
      /* onabort follows. */
    };
  });
}

// One readwrite transaction reads the epoch, compares it, and only then puts
// the record. The transaction callbacks are the only work after enqueueing.
function saveWithEpoch(database, record, expectedEpoch, options = {}) {
  return new Promise((resolve) => {
    const events = { expectedEpoch, recordId: record.recordId };
    let transaction;
    try {
      transaction = database.transaction([RECORDS, META], 'readwrite');
      events.transactionCreatedAt = performance.now();
    } catch (error) {
      resolve({ status: 'error', error: failure(error), events });
      return;
    }
    const records = transaction.objectStore(RECORDS);
    const meta = transaction.objectStore(META);
    const epochRequest = meta.get(EPOCH_KEY);
    let matched = false;
    epochRequest.onsuccess = () => {
      const current = epochValue(epochRequest.result);
      events.epochReadAt = performance.now();
      events.currentEpoch = current;
      if (current !== expectedEpoch) {
        events.mismatch = true;
        return;
      }
      matched = true;
      records.put(record);
      events.putQueuedAt = performance.now();
      if (options.abortSynchronously) {
        events.synchronousAbortAt = performance.now();
        transaction.abort();
      }
    };
    epochRequest.onerror = () => {
      events.epochReadError = failure(epochRequest.error);
      try {
        transaction.abort();
      } catch {
        /* Completion owns the outcome. */
      }
    };
    transaction.oncomplete = () => {
      events.completeAt = performance.now();
      resolve({
        status: matched ? 'saved' : 'stale',
        events,
      });
    };
    transaction.onabort = () => {
      events.abortAt = performance.now();
      resolve({
        status: 'aborted',
        error: failure(transaction.error),
        events,
      });
    };
    transaction.onerror = () => {
      events.errorAt = performance.now();
    };
  });
}

const probe = {
  ready: false,
  readyState: 'opening',
  storageAccesses: 0,
  pending: null,
  lastEvents: null,
  async status() {
    if (probe.readyState !== 'ready')
      return { readyState: probe.readyState, ready: false };
    return {
      readyState: probe.readyState,
      ready: true,
      epoch: await readEpoch(probe.database),
      records: (await readAll(probe.database)).length,
    };
  },
  async all() {
    return readAll(probe.database);
  },
  async putRaw(record) {
    await putRawRecord(probe.database, record);
    return { status: 'saved' };
  },
  // The candidate refuses before reading an epoch while the database is not
  // ready. Product Save uses the same readiness gate, not a delayed open.
  async beginPendingSave(recordId) {
    if (!probe.ready) return { status: 'not-ready' };
    const expectedEpoch = await readEpoch(probe.database);
    probe.pending = { recordId, expectedEpoch };
    return { status: 'pending', expectedEpoch };
  },
  async releasePending(options = {}) {
    const pending = probe.pending;
    probe.pending = null;
    if (!pending) return { status: 'no-pending-save' };
    const result = await saveWithEpoch(
      probe.database,
      { recordId: pending.recordId, payload: `payload-${pending.recordId}` },
      pending.expectedEpoch,
      options,
    );
    probe.lastEvents = result.events;
    return result;
  },
  async saveNow(recordId, options = {}) {
    const begun = await probe.beginPendingSave(recordId);
    if (begun.status !== 'pending') return begun;
    return probe.releasePending(options);
  },
  async deleteRecord(recordId) {
    return deleteWithEpoch(probe.database, recordId);
  },
  async clearRecords() {
    return new Promise((resolve, reject) => {
      const transaction = probe.database.transaction(RECORDS, 'readwrite');
      transaction.objectStore(RECORDS).clear();
      transaction.oncomplete = () => resolve({ status: 'cleared' });
      transaction.onerror = () => reject(transaction.error);
    });
  },
  async close() {
    probe.database?.close();
    probe.database = null;
    probe.ready = false;
    probe.readyState = 'closed';
    return { status: 'closed' };
  },
  async deleteDatabase() {
    probe.database?.close();
    probe.database = null;
    probe.ready = false;
    probe.readyState = 'deleted';
    return new Promise((resolve, reject) => {
      const request = indexedDB.deleteDatabase(DB_NAME);
      request.onsuccess = () => resolve({ status: 'deleted' });
      request.onerror = () => reject(request.error);
      request.onblocked = () =>
        reject(new Error('Database deletion was blocked.'));
    });
  },
  async estimate() {
    const estimate = await navigator.storage.estimate();
    return { usage: estimate.usage ?? null, quota: estimate.quota ?? null };
  },
  async persisted() {
    return { persisted: await navigator.storage.persisted() };
  },
  async persist() {
    return { persisted: await navigator.storage.persist() };
  },
  // persist() can leave a browser prompt open. Keep the page usable and
  // report the exact operation as unresolved instead of hanging the probe.
  async persistBounded(timeoutMs = 5000) {
    return Promise.race([
      navigator.storage.persist().then(
        (persisted) => ({ status: 'resolved', persisted }),
        (error) => ({ status: 'error', error: failure(error) }),
      ),
      new Promise((resolve) => {
        setTimeout(
          () => resolve({ status: 'pending-prompt-or-grant' }),
          timeoutMs,
        );
      }),
    ]);
  },
  async context() {
    try {
      const api = globalThis.browser ?? globalThis.chrome;
      if (!api?.tabs?.getCurrent)
        return {
          status: 'error',
          error: { message: 'tabs.getCurrent is unavailable' },
        };
      const tab = await new Promise((resolve, reject) => {
        try {
          const returned = api.tabs.getCurrent((value) => {
            const lastError = globalThis.chrome?.runtime?.lastError;
            if (lastError) reject(new Error(lastError.message));
            else resolve(value);
          });
          if (returned && typeof returned.then === 'function')
            returned.then(resolve, reject);
        } catch (error) {
          reject(error);
        }
      });
      return {
        status: 'success',
        incognito: typeof tab?.incognito === 'boolean' ? tab.incognito : null,
      };
    } catch (error) {
      return { status: 'error', error: failure(error) };
    }
  },
  // The guard must fail closed before any saved-data read. With guardOnly=1
  // the page does not open storage on load, so storageAccesses proves that.
  async guardedRead(contextValue) {
    if (contextValue !== false)
      return {
        status: 'blocked',
        reason: 'private-or-unknown-context',
        storageAccessed: false,
      };
    probe.storageAccesses += 1;
    if (!probe.database) probe.database = await openDatabase();
    probe.ready = true;
    probe.readyState = 'ready';
    return {
      status: 'read',
      records: await readAll(probe.database),
      storageAccessed: true,
    };
  },
  async writePayload(recordId, bytes) {
    const record = { recordId, payload: 'x'.repeat(bytes) };
    const serialized = JSON.stringify(record).length;
    await putRawRecord(probe.database, record);
    return { status: 'saved', serialized };
  },
  // Candidate-level mirror of the product's lazy list cleanup. It refuses
  // expired version-1 records, lists unsupported versions for deletion and
  // keeps malformed records visible without migration.
  async listValid(now) {
    const records = await readAll(probe.database);
    const available = [];
    const unsupported = [];
    const invalid = [];
    const removedExpired = [];
    for (const record of records) {
      if (record?.schemaVersion !== 1) {
        unsupported.push(record?.recordId ?? null);
        continue;
      }
      if (!Number.isFinite(record.expiresAt)) {
        invalid.push(record.recordId ?? null);
        continue;
      }
      if (record.expiresAt <= now) {
        removedExpired.push(record.recordId);
        continue;
      }
      if (typeof record.recordId !== 'string') {
        invalid.push(record.recordId ?? null);
        continue;
      }
      available.push(record.recordId);
    }
    if (removedExpired.length) {
      await new Promise((resolve, reject) => {
        const transaction = probe.database.transaction(RECORDS, 'readwrite');
        for (const id of removedExpired)
          transaction.objectStore(RECORDS).delete(id);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      });
    }
    return { available, unsupported, invalid, removedExpired };
  },
};

window.savedStorageProbe = probe;

if (parameters.has('guardOnly')) {
  probe.readyState = 'guard-only';
} else {
  const delay = Number(parameters.get('delayOpen') ?? 0);
  setTimeout(() => {
    probe.readyState = 'opening';
    openDatabase()
      .then(async (database) => {
        probe.database = database;
        await readEpoch(database);
        probe.ready = true;
        probe.readyState = 'ready';
      })
      .catch((error) => {
        probe.readyState = 'error';
        probe.error = failure(error);
      });
  }, delay);
}
