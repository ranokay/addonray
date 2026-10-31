import {
  planSave,
  SAVED_LIMITS,
  storedRecordBytes,
  type SavedRecord,
} from './saved-record';

export interface SavedStoreState {
  storeId: string;
  epoch: number;
}

export interface SavedStoreEntry {
  key: IDBValidKey;
  value: unknown;
}

export type SavedStoreSaveResult =
  | 'saved'
  | 'stale'
  | 'stale-store'
  | 'exhausted'
  | 'records'
  | 'record'
  | 'total'
  | 'quota'
  | 'timeout'
  | 'cancelled'
  | 'duplicate'
  | 'unavailable';

export type SavedStoreErrorCode =
  | 'unavailable'
  | 'timeout'
  | 'blocked'
  | 'invalid-metadata'
  | 'quota'
  | 'cancelled'
  | 'duplicate';

export class SavedStoreError extends Error {
  constructor(
    readonly code: SavedStoreErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'SavedStoreError';
  }
}

export interface SavedStore {
  ready(): Promise<SavedStoreState>;
  readState(): Promise<SavedStoreState>;
  list(): Promise<SavedStoreEntry[]>;
  get(key: IDBValidKey): Promise<unknown | undefined>;
  save(
    record: SavedRecord,
    expected: SavedStoreState,
    signal?: AbortSignal,
  ): Promise<SavedStoreSaveResult>;
  delete(key: IDBValidKey): Promise<void>;
  close(): void;
}

const DB_NAME = 'addonray-saved-investigations';
const DB_VERSION = 1;
const RECORDS = 'records';
const META = 'meta';
const STATE_KEY = 'state';
const TIMEOUT_MS = 5000;

function errorName(error: unknown) {
  return typeof error === 'object' && error !== null && 'name' in error
    ? String(error.name)
    : '';
}

function failure(error: unknown, fallback: SavedStoreErrorCode) {
  if (error instanceof SavedStoreError) return error;
  if (errorName(error) === 'QuotaExceededError')
    return new SavedStoreError('quota', 'Browser storage quota was exceeded.');
  return new SavedStoreError(fallback, 'Saved storage is unavailable.');
}

function validState(value: unknown): SavedStoreState {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('storeId' in value) ||
    typeof value.storeId !== 'string' ||
    value.storeId.length < 16 ||
    !('epoch' in value) ||
    !Number.isSafeInteger(value.epoch) ||
    (value.epoch as number) < 0
  )
    throw new SavedStoreError(
      'invalid-metadata',
      'Saved storage metadata is missing or corrupt.',
    );
  return { storeId: value.storeId, epoch: value.epoch as number };
}

function readStateRequest(transaction: IDBTransaction) {
  return transaction.objectStore(META).get(STATE_KEY);
}

function stateFromResult(request: IDBRequest) {
  try {
    return validState(
      typeof request.result === 'object' &&
        request.result !== null &&
        'value' in request.result
        ? request.result.value
        : undefined,
    );
  } catch (error) {
    throw failure(error, 'invalid-metadata');
  }
}

function readStateInTransaction(transaction: IDBTransaction) {
  return new Promise<SavedStoreState>((resolve, reject) => {
    const request = readStateRequest(transaction);
    request.onsuccess = () => {
      try {
        resolve(stateFromResult(request));
      } catch (error) {
        reject(error);
      }
    };
    request.onerror = () => reject(failure(request.error, 'unavailable'));
  });
}

function requestValue<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(failure(request.error, 'unavailable'));
  });
}

function open(factory: IDBFactory, onClosed: (database: IDBDatabase) => void) {
  return new Promise<IDBDatabase>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new SavedStoreError('timeout', 'Saved storage did not open.'));
    }, TIMEOUT_MS);
    let request: IDBOpenDBRequest;
    try {
      request = factory.open(DB_NAME, DB_VERSION);
    } catch (error) {
      clearTimeout(timer);
      reject(failure(error, 'unavailable'));
      return;
    }
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(RECORDS))
        database.createObjectStore(RECORDS, { keyPath: 'recordId' });
      if (!database.objectStoreNames.contains(META))
        database.createObjectStore(META, { keyPath: 'key' });
      const transaction = request.transaction;
      if (!transaction) return;
      transaction.objectStore(META).put({
        key: STATE_KEY,
        value: { storeId: crypto.randomUUID(), epoch: 0 },
      });
    };
    request.onblocked = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new SavedStoreError('blocked', 'Saved storage is blocked.'));
    };
    request.onerror = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(failure(request.error, 'unavailable'));
    };
    request.onsuccess = () => {
      if (settled) {
        request.result.close();
        return;
      }
      settled = true;
      clearTimeout(timer);
      const database = request.result;
      const closed = () => {
        database.onversionchange = null;
        database.onclose = null;
        onClosed(database);
        database.close();
      };
      database.onversionchange = closed;
      database.onclose = closed;
      resolve(database);
    };
  });
}

function transactionFrom<T>(
  current: IDBTransaction,
  work: (transaction: IDBTransaction) => Promise<T> | T,
  signal?: AbortSignal,
  abortFailure?: () => SavedStoreError,
) {
  return new Promise<T>((resolve, reject) => {
    if (signal?.aborted)
      return reject(new SavedStoreError('unavailable', 'Save cancelled.'));
    let settled = false;
    let completed = false;
    let workDone = false;
    let workValue: T;
    let cancelled = false;
    const finish = (action: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      action();
    };
    const settleIfReady = () => {
      if (completed && workDone) finish(() => resolve(workValue));
    };
    const abort = () => {
      try {
        current.abort();
      } catch {
        /* The transaction may already be complete. */
      }
    };
    const cancel = () => {
      cancelled = true;
      abort();
    };
    const timer = setTimeout(() => {
      abort();
      finish(() =>
        reject(new SavedStoreError('timeout', 'Saved storage timed out.')),
      );
    }, TIMEOUT_MS);
    current.oncomplete = () => {
      completed = true;
      settleIfReady();
    };
    current.onabort = () =>
      finish(() =>
        reject(
          cancelled
            ? new SavedStoreError('cancelled', 'The save was cancelled.')
            : (abortFailure?.() ?? failure(current.error, 'unavailable')),
        ),
      );
    current.onerror = () => {
      /* onabort owns the failure. */
    };
    signal?.addEventListener('abort', cancel, { once: true });
    let pending: Promise<T>;
    try {
      pending = Promise.resolve(work(current));
    } catch (error) {
      pending = Promise.reject(error);
    }
    pending.then(
      (value) => {
        workDone = true;
        workValue = value;
        settleIfReady();
      },
      (error) => {
        abort();
        finish(() => reject(error));
      },
    );
  });
}

function transaction<T>(
  database: IDBDatabase,
  mode: IDBTransactionMode,
  stores: string[],
  work: (transaction: IDBTransaction) => Promise<T> | T,
  signal?: AbortSignal,
) {
  let current: IDBTransaction;
  try {
    current = database.transaction(stores, mode);
  } catch (error) {
    return Promise.reject(failure(error, 'unavailable'));
  }
  return transactionFrom(current, work, signal);
}

function isLostConnection(error: unknown) {
  return (
    errorName(error) === 'InvalidStateError' ||
    (error instanceof SavedStoreError && error.code === 'unavailable')
  );
}

export function createIndexedDbSavedStore(
  factory: IDBFactory = indexedDB,
): SavedStore {
  let database: IDBDatabase | null = null;
  let opening: Promise<IDBDatabase> | null = null;
  let live = true;
  const current = () => database;

  async function connection() {
    if (!live)
      throw new SavedStoreError('unavailable', 'Saved storage is closed.');
    if (!database) {
      opening ??= open(factory, (closed) => {
        if (database === closed) database = null;
      });
      try {
        database = await opening;
      } catch (error) {
        opening = null;
        throw error;
      } finally {
        opening = null;
      }
    }
    return database;
  }

  // A database connection can be closed by another view's upgrade or deletion.
  // Reopen once instead of reusing a dead handle.
  async function withConnection<T>(
    work: (database: IDBDatabase) => Promise<T>,
  ) {
    for (let attempt = 0; ; attempt += 1) {
      const db = await connection();
      try {
        return await work(db);
      } catch (error) {
        if (attempt > 0 || db !== current() || !isLostConnection(error))
          throw error;
        database = null;
      }
    }
  }

  async function readStateOf(db: IDBDatabase) {
    return transaction(db, 'readonly', [META], (tx) =>
      readStateInTransaction(tx),
    );
  }

  return {
    ready() {
      return withConnection(readStateOf);
    },
    readState() {
      if (!live)
        return Promise.reject(
          new SavedStoreError('unavailable', 'Saved storage is closed.'),
        );
      const db = database;
      if (!db)
        return Promise.reject(
          new SavedStoreError('unavailable', 'Saved storage is not open.'),
        );
      let current: IDBTransaction;
      try {
        // This transaction is created synchronously at the call site so a
        // concurrent delete cannot slip in before the barrier is captured.
        current = db.transaction(META, 'readonly');
      } catch (error) {
        if (database === db) database = null;
        return Promise.reject(failure(error, 'unavailable'));
      }
      return transactionFrom(current, (tx) => readStateInTransaction(tx));
    },
    list() {
      return withConnection((db) =>
        transaction(db, 'readonly', [RECORDS], (tx) => {
          return new Promise<SavedStoreEntry[]>((resolve, reject) => {
            const entries: SavedStoreEntry[] = [];
            const request = tx.objectStore(RECORDS).openCursor();
            request.onsuccess = () => {
              const cursor = request.result;
              if (!cursor) {
                resolve(entries);
                return;
              }
              entries.push({
                key: cursor.primaryKey,
                value: cursor.value,
              });
              cursor.continue();
            };
            request.onerror = () =>
              reject(failure(request.error, 'unavailable'));
          });
        }),
      );
    },
    get(key) {
      return withConnection((db) =>
        transaction(db, 'readonly', [RECORDS], (tx) =>
          requestValue<unknown | undefined>(tx.objectStore(RECORDS).get(key)),
        ),
      );
    },
    save(record, expected, signal) {
      if (!live) return Promise.resolve('unavailable');
      const db = database;
      if (!db) return Promise.resolve('unavailable');
      if (signal?.aborted) return Promise.resolve('cancelled');
      let current: IDBTransaction;
      try {
        current = db.transaction([RECORDS, META], 'readwrite');
      } catch {
        if (database === db) database = null;
        return Promise.resolve('unavailable');
      }
      let requestFailure: SavedStoreError | null = null;
      return transactionFrom(
        current,
        async (tx) => {
          const state = await readStateInTransaction(tx);
          if (state.storeId !== expected.storeId) return 'stale-store';
          if (state.epoch !== expected.epoch) return 'stale';
          if (state.epoch >= Number.MAX_SAFE_INTEGER) return 'exhausted';
          const existing = await requestValue<unknown | undefined>(
            tx.objectStore(RECORDS).get(record.recordId),
          );
          if (existing !== undefined) return 'duplicate';
          const records = await requestValue<unknown[]>(
            tx.objectStore(RECORDS).getAll(),
          );
          const bytes = storedRecordBytes(record);
          const plan = planSave(records, bytes, Date.now());
          for (const recordId of plan.cleanupIds)
            tx.objectStore(RECORDS).delete(recordId);
          if (plan.outcome !== 'ok') return plan.outcome;
          if (bytes > SAVED_LIMITS.recordBytes) return 'record';
          // add() fails the transaction rather than replacing an existing key.
          const request = tx.objectStore(RECORDS).add(record);
          await new Promise<void>((resolve, reject) => {
            request.onsuccess = () => resolve();
            request.onerror = () => {
              requestFailure = failure(request.error, 'unavailable');
              reject(requestFailure);
            };
          });
          return 'saved';
        },
        signal,
        () => requestFailure ?? failure(current.error, 'unavailable'),
      ).then(
        (result) => result,
        (error) => {
          if (signal?.aborted) return 'cancelled';
          if (error instanceof SavedStoreError) {
            if (error.code === 'quota') return 'quota';
            if (error.code === 'timeout') return 'timeout';
            if (error.code === 'cancelled') return 'cancelled';
            if (error.code === 'duplicate') return 'duplicate';
          }
          if (errorName(error) === 'QuotaExceededError') return 'quota';
          if (errorName(error) === 'ConstraintError') return 'duplicate';
          return 'unavailable';
        },
      );
    },
    async delete(key) {
      await this.ready();
      await withConnection((db) =>
        transaction(db, 'readwrite', [RECORDS, META], async (tx) => {
          const state = await readStateInTransaction(tx);
          if (state.epoch >= Number.MAX_SAFE_INTEGER)
            throw new SavedStoreError(
              'invalid-metadata',
              'The saved-record deletion counter is exhausted.',
            );
          tx.objectStore(RECORDS).delete(key);
          tx.objectStore(META).put({
            key: STATE_KEY,
            value: { storeId: state.storeId, epoch: state.epoch + 1 },
          });
        }),
      );
    },
    close() {
      live = false;
      database?.close();
      database = null;
      opening = null;
    },
  };
}
