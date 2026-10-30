// Test-only feasibility candidate. It does not enter the product or source archives.
const parameters = new URLSearchParams(location.search);
const DB_NAME = parameters.get('db') ?? 'addonray-saved-investigations';
const DB_VERSION = 1;
const RECORDS = 'records';
const META = 'meta';
const EPOCH_KEY = 'deletionEpoch';
const MAX_SAFE = Number.MAX_SAFE_INTEGER;
const encoder = new TextEncoder();

class BarrierStateError extends Error {
  constructor(reason) {
    super(reason);
    this.name = 'BarrierStateError';
  }
}

function failure(error) {
  return {
    name: error?.name ?? 'Error',
    message: error?.message ? String(error.message) : String(error),
  };
}

function canonicalRecord(record) {
  const ordered = {};
  for (const key of Object.keys(record).sort()) ordered[key] = record[key];
  return ordered;
}

function serializedBytes(record) {
  return encoder.encode(JSON.stringify(canonicalRecord(record))).length;
}

function validEpoch(record) {
  if (!record || record.key !== EPOCH_KEY)
    throw new BarrierStateError('missing-deletion-epoch');
  const value = record.value;
  if (!Number.isSafeInteger(value) || value < 0)
    throw new BarrierStateError('invalid-deletion-epoch');
  return value;
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
      // A genuinely new database starts at a valid epoch. Existing metadata is
      // never repaired by an upgrade; invalid state fails closed on read.
      request.transaction.objectStore(META).put({ key: EPOCH_KEY, value: 0 });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () =>
      reject(new Error('IndexedDB open was blocked by another connection.'));
  });
}

function readEpochRecord(database) {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(META, 'readonly');
    const request = transaction.objectStore(META).get(EPOCH_KEY);
    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => reject(request.error);
  });
}

// Calling this creates the readonly transaction synchronously. A later
// readwrite delete transaction over the same stores must wait behind it.
function readEpoch(database) {
  return readEpochRecord(database).then((record) => validEpoch(record));
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
    const request = transaction.objectStore(RECORDS).put(record);
    let requestError = null;
    request.onerror = () => {
      requestError = request.error;
    };
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => {
      /* request.onerror and onabort retain the specific failure. */
    };
    transaction.onabort = () =>
      reject(
        requestError ?? transaction.error ?? new Error('Transaction aborted.'),
      );
  });
}

function deleteWithEpoch(database, recordId) {
  return new Promise((resolve) => {
    const events = {};
    const transaction = database.transaction([RECORDS, META], 'readwrite');
    const records = transaction.objectStore(RECORDS);
    const meta = transaction.objectStore(META);
    const epochRequest = meta.get(EPOCH_KEY);
    let outcome = null;
    let nextEpoch = null;
    epochRequest.onsuccess = () => {
      events.epochReadAt = performance.now();
      try {
        const current = validEpoch(epochRequest.result);
        if (current >= MAX_SAFE) {
          outcome = {
            status: 'barrier-exhausted',
            error: { name: 'BarrierStateError', message: 'epoch-at-max' },
            events,
          };
          transaction.abort();
          return;
        }
        nextEpoch = current + 1;
        records.delete(recordId);
        meta.put({ key: EPOCH_KEY, value: nextEpoch });
        events.deleteQueuedAt = performance.now();
      } catch (error) {
        outcome = {
          status: 'barrier-invalid',
          error: failure(error),
          events,
        };
        transaction.abort();
      }
    };
    epochRequest.onerror = () => {
      outcome = {
        status: 'barrier-invalid',
        error: failure(epochRequest.error),
        events,
      };
      transaction.abort();
    };
    transaction.oncomplete = () => {
      events.completeAt = performance.now();
      resolve({ status: 'deleted', epoch: nextEpoch, events });
    };
    transaction.onabort = () => {
      events.abortAt = performance.now();
      resolve(
        outcome ?? {
          status: 'aborted',
          error: failure(transaction.error),
          events,
        },
      );
    };
    transaction.onerror = () => {
      /* onabort follows. */
    };
  });
}

// One readwrite transaction reads the epoch, compares it, checks optional
// bounds against complete serialized records, and only then puts the record.
function saveWithEpoch(database, record, expectedEpoch, options = {}) {
  return new Promise((resolve) => {
    const events = {
      expectedEpoch,
      recordId: record.recordId,
      recordBytes: serializedBytes(record),
    };
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
    let outcome = null;
    epochRequest.onsuccess = () => {
      events.epochReadAt = performance.now();
      try {
        const current = validEpoch(epochRequest.result);
        events.currentEpoch = current;
        if (current >= MAX_SAFE) {
          events.limit = 'barrier-exhausted';
          outcome = {
            status: 'barrier-exhausted',
            events,
          };
          transaction.abort();
          return;
        }
        if (current !== expectedEpoch) {
          events.mismatch = true;
          outcome = { status: 'stale', events };
          return;
        }
        if (!options.limits) {
          records.put(record);
          events.putQueuedAt = performance.now();
          if (options.abortSynchronously) {
            events.synchronousAbortAt = performance.now();
            transaction.abort();
          }
          return;
        }
        const allRequest = records.getAll();
        allRequest.onsuccess = () => {
          const existing = allRequest.result;
          const total = existing.reduce(
            (sum, entry) => sum + serializedBytes(entry),
            0,
          );
          events.existingRecords = existing.length;
          events.existingBytes = total;
          if (existing.length >= options.limits.records) {
            events.limit = 'records';
            outcome = { status: 'refused', reason: 'records', events };
            return;
          }
          if (events.recordBytes > options.limits.perRecord) {
            events.limit = 'per-record';
            outcome = { status: 'refused', reason: 'per-record', events };
            return;
          }
          if (total + events.recordBytes > options.limits.totalBytes) {
            events.limit = 'total-bytes';
            outcome = { status: 'refused', reason: 'total-bytes', events };
            return;
          }
          records.put(record);
          events.putQueuedAt = performance.now();
          if (options.abortSynchronously) {
            events.synchronousAbortAt = performance.now();
            transaction.abort();
          }
        };
        allRequest.onerror = () => {
          outcome = {
            status: 'error',
            error: failure(allRequest.error),
            events,
          };
          transaction.abort();
        };
      } catch (error) {
        outcome = {
          status: 'barrier-invalid',
          error: failure(error),
          events,
        };
        transaction.abort();
      }
    };
    epochRequest.onerror = () => {
      events.epochReadError = failure(epochRequest.error);
      outcome = {
        status: 'barrier-invalid',
        error: failure(epochRequest.error),
        events,
      };
      try {
        transaction.abort();
      } catch {
        /* Completion owns the outcome. */
      }
    };
    transaction.oncomplete = () => {
      events.completeAt = performance.now();
      resolve(outcome ?? { status: 'saved', events });
    };
    transaction.onabort = () => {
      events.abortAt = performance.now();
      resolve(outcome ?? { status: 'aborted', events });
    };
    transaction.onerror = () => {
      events.errorAt = performance.now();
    };
  });
}

function makeExactRecord(recordId, targetBytes, prefix = '') {
  const base = { recordId, payload: prefix };
  const baseBytes = serializedBytes(base);
  if (!Number.isSafeInteger(targetBytes) || targetBytes < baseBytes)
    throw new Error(
      `Target ${targetBytes} is smaller than the ${baseBytes}-byte record base.`,
    );
  const record = {
    recordId,
    payload: prefix + 'x'.repeat(targetBytes - baseBytes),
  };
  const bytes = serializedBytes(record);
  if (bytes !== targetBytes)
    throw new Error(`Expected ${targetBytes} bytes, built ${bytes}.`);
  return { record, bytes };
}

async function digest(record) {
  const bytes = encoder.encode(JSON.stringify(canonicalRecord(record)));
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(hash)]
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
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
  async allWithBytes() {
    const records = await readAll(probe.database);
    return {
      records: await Promise.all(
        records.map(async (record) => ({
          recordId: record.recordId,
          bytes: serializedBytes(record),
          sha256: await digest(record),
          payloadLength:
            typeof record.payload === 'string' ? record.payload.length : null,
        })),
      ),
      totalBytes: records.reduce(
        (sum, record) => sum + serializedBytes(record),
        0,
      ),
    };
  },
  async getEpochRaw() {
    return readEpochRecord(probe.database);
  },
  async deleteEpochRaw() {
    return new Promise((resolve, reject) => {
      const transaction = probe.database.transaction(META, 'readwrite');
      transaction.objectStore(META).delete(EPOCH_KEY);
      transaction.oncomplete = () => resolve({ status: 'deleted' });
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () =>
        reject(transaction.error ?? new Error('Metadata transaction aborted.'));
    });
  },
  async setEpochRaw(value) {
    return new Promise((resolve, reject) => {
      const transaction = probe.database.transaction(META, 'readwrite');
      const meta = transaction.objectStore(META);
      if (value === undefined) meta.delete(EPOCH_KEY);
      else meta.put({ key: EPOCH_KEY, value });
      transaction.oncomplete = () => resolve({ status: 'set' });
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () =>
        reject(transaction.error ?? new Error('Metadata transaction aborted.'));
    });
  },
  async openNow() {
    if (!probe.database) {
      try {
        probe.database = await openDatabase();
        await readEpoch(probe.database);
        probe.ready = true;
        probe.readyState = 'ready';
        return { status: 'opened' };
      } catch (error) {
        probe.readyState = 'error';
        probe.error = failure(error);
        return { status: 'error', error: failure(error) };
      }
    }
    return { status: 'already-ready' };
  },
  async putRaw(record) {
    await putRawRecord(probe.database, record);
    return { status: 'saved', bytes: serializedBytes(record) };
  },
  // The candidate refuses before reading an epoch while the database is not
  // ready. Product Save uses the same readiness gate, not a delayed open.
  async beginPendingSave(recordId) {
    if (!probe.ready) return { status: 'not-ready' };
    try {
      const expectedEpoch = await readEpoch(probe.database);
      probe.pending = {
        record: { recordId, payload: `payload-${recordId}` },
        expectedEpoch,
      };
      return { status: 'pending', expectedEpoch };
    } catch (error) {
      return { status: 'barrier-invalid', error: failure(error) };
    }
  },
  async beginPendingRecord(record) {
    if (!probe.ready) return { status: 'not-ready' };
    try {
      const expectedEpoch = await readEpoch(probe.database);
      probe.pending = { record, expectedEpoch };
      return {
        status: 'pending',
        expectedEpoch,
        recordBytes: serializedBytes(record),
      };
    } catch (error) {
      return { status: 'barrier-invalid', error: failure(error) };
    }
  },
  async releasePending(options = {}) {
    const pending = probe.pending;
    probe.pending = null;
    if (!pending) return { status: 'no-pending-save' };
    const result = await saveWithEpoch(
      probe.database,
      pending.record,
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
  async saveBoundedRecord(record, limits, options = {}) {
    if (!probe.ready) return { status: 'not-ready' };
    let expectedEpoch;
    try {
      expectedEpoch = await readEpoch(probe.database);
    } catch (error) {
      return { status: 'barrier-invalid', error: failure(error) };
    }
    const result = await saveWithEpoch(probe.database, record, expectedEpoch, {
      ...options,
      limits,
    });
    probe.lastEvents = result.events;
    return result;
  },
  async makeExactRecord(recordId, targetBytes, prefix = '') {
    const built = makeExactRecord(recordId, targetBytes, prefix);
    return {
      record: built.record,
      bytes: built.bytes,
      sha256: await digest(built.record),
    };
  },
  async makeExactRecords(plan) {
    const records = [];
    for (const item of plan) {
      const built = makeExactRecord(
        item.recordId,
        item.bytes,
        item.prefix ?? '',
      );
      records.push({
        record: built.record,
        bytes: built.bytes,
        sha256: await digest(built.record),
      });
    }
    return {
      records,
      totalBytes: records.reduce((sum, item) => sum + item.bytes, 0),
    };
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
    const serialized = serializedBytes(record);
    await putRawRecord(probe.database, record);
    return { status: 'saved', serialized };
  },
  async writeRandomPayload(recordId, bytes) {
    let payload = '';
    while (payload.length < bytes) {
      const chunk = new Uint8Array(Math.min(65536, bytes - payload.length));
      crypto.getRandomValues(chunk);
      payload += [...chunk]
        .map((value) => value.toString(16).padStart(2, '0'))
        .join('');
    }
    const record = { recordId, payload };
    const serialized = serializedBytes(record);
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
