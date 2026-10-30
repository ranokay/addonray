import {
  inspectStoredRecord,
  isExpired,
  type SavedRecord,
} from './saved-record';
import { SavedStoreError, type SavedStore } from './saved-store';
import { normalContext, type SavedBrowser } from './saved-context';

export type SavedLibraryEntry =
  | { key: IDBValidKey; status: 'valid'; record: SavedRecord }
  | { key: IDBValidKey; status: 'unsupported' }
  | { key: IDBValidKey; status: 'invalid' };

export interface SavedLibraryHint {
  subscribe(subscriber: () => void): () => void;
  notify(): void;
  notifyRemote?(): void;
}

export interface SavedLibrarySnapshot {
  phase: 'checking' | 'ready' | 'denied' | 'unavailable';
  entries: readonly SavedLibraryEntry[];
  selected: SavedRecord | null;
  selectedKey: IDBValidKey | null;
  pendingDeleteKey: IDBValidKey | null;
  busy: boolean;
  message: string | null;
}

const deniedMessage =
  'Saved investigations are available only in verified normal windows. No saved record was read.';
const unavailableMessage =
  'Saved storage is unavailable. No saved records are shown.';

export function sameSavedKey(left: IDBValidKey, right: IDBValidKey): boolean {
  if (left === right) return true;
  if (left instanceof Date && right instanceof Date)
    return left.getTime() === right.getTime();
  if (Array.isArray(left) && Array.isArray(right))
    return (
      left.length === right.length &&
      left.every((value, index) => sameSavedKey(value, right[index]!))
    );
  return false;
}

function labelOrder(entry: SavedLibraryEntry) {
  return entry.status === 'valid' ? entry.record.savedAt : -Infinity;
}

function preserveError(error: unknown) {
  return error instanceof SavedStoreError ? error.message : unavailableMessage;
}

export function createSavedLibrary(
  api: SavedBrowser,
  store: SavedStore,
  hint?: SavedLibraryHint,
) {
  let state: SavedLibrarySnapshot = {
    phase: 'checking',
    entries: [],
    selected: null,
    selectedKey: null,
    pendingDeleteKey: null,
    busy: false,
    message: null,
  };
  let live = true;
  let suspended = false;
  let operation = 0;
  let owner: number | null = null;
  let hintRevision = 0;
  let appliedRevision = 0;
  const subscribers = new Set<() => void>();
  const publish = (next: SavedLibrarySnapshot) => {
    state = next;
    subscribers.forEach((subscriber) => subscriber());
  };
  const clear = (phase: 'denied' | 'unavailable', message: string) => {
    operation += 1;
    owner = null;
    publish({
      phase,
      entries: [],
      selected: null,
      selectedKey: null,
      pendingDeleteKey: null,
      busy: false,
      message,
    });
  };
  const deny = () => clear('denied', deniedMessage);
  // A change signal is only a hint. Every refresh rechecks context and re-reads
  // storage before it can replace what this view shows.
  const noteHint = () => {
    if (!live) return;
    hintRevision += 1;
    if (suspended) return;
    operation += 1;
    if (!state.busy) void refresh();
  };
  const removeHint = hint?.subscribe(noteHint) ?? (() => {});

  function afterAction(ticket: number) {
    if (!live) return;
    if (owner === ticket) {
      owner = null;
      if (state.busy) publish({ ...state, busy: false });
    }
    if (owner === null && hintRevision !== appliedRevision) {
      void refresh();
    }
  }

  async function guard(ticket: number) {
    if (!live || suspended || ticket !== operation) return false;
    const normal = await normalContext(api);
    if (!live || suspended || ticket !== operation) return false;
    if (normal) return true;
    deny();
    return false;
  }

  async function refresh() {
    if (!live || suspended || state.busy) return;
    const ticket = ++operation;
    owner = ticket;
    appliedRevision = hintRevision;
    publish({ ...state, busy: true, message: null });
    try {
      if (!(await guard(ticket))) return;
      const stored = await store.list();
      if (!(await guard(ticket))) return;
      const now = Date.now();
      const entries: SavedLibraryEntry[] = [];
      const expired: IDBValidKey[] = [];
      for (const { key, value } of stored) {
        const inspection = inspectStoredRecord(value);
        if (inspection.status === 'valid') {
          if (isExpired(inspection.record, now)) expired.push(key);
          else
            entries.push({ key, status: 'valid', record: inspection.record });
        } else {
          entries.push({ key, status: inspection.status });
        }
      }
      entries.sort((left, right) => labelOrder(right) - labelOrder(left));
      if (expired.length > 0) {
        if (!(await guard(ticket))) return;
        // Expiry is a product-level refusal plus lazy cleanup. The deletion
        // transaction completes before the row leaves the list.
        for (const key of expired) await store.delete(key);
        if (ticket !== operation) return;
        if (!(await guard(ticket))) return;
      }
      const selected = state.selectedKey
        ? entries.some(
            (entry) =>
              entry.status === 'valid' &&
              sameSavedKey(entry.key, state.selectedKey!),
          )
          ? state.selected
          : null
        : null;
      const selectedKey = selected ? state.selectedKey : null;
      const pendingDeleteKey =
        state.pendingDeleteKey &&
        entries.some((entry) =>
          sameSavedKey(entry.key, state.pendingDeleteKey!),
        )
          ? state.pendingDeleteKey
          : null;
      publish({
        phase: 'ready',
        entries,
        selected,
        selectedKey,
        pendingDeleteKey,
        busy: false,
        message: null,
      });
    } catch (error) {
      if (!live || suspended || ticket !== operation) return;
      const normal = await normalContext(api);
      if (!live || suspended || ticket !== operation) return;
      if (!normal) return deny();
      clear('unavailable', preserveError(error));
    } finally {
      afterAction(ticket);
    }
  }

  async function open(key: IDBValidKey) {
    if (!live || suspended || state.busy) return;
    const ticket = ++operation;
    owner = ticket;
    publish({ ...state, busy: true, message: null });
    try {
      if (!(await guard(ticket))) return;
      const raw = await store.get(key);
      if (!(await guard(ticket))) return;
      if (raw === undefined) {
        publish({
          ...state,
          entries: state.entries.filter(
            (entry) => !sameSavedKey(entry.key, key),
          ),
          selected: null,
          selectedKey: null,
          busy: false,
          message:
            'This saved record is no longer available. It may have been deleted or expired.',
        });
        return;
      }
      const inspection = inspectStoredRecord(raw);
      if (inspection.status !== 'valid') {
        publish({
          ...state,
          selected: null,
          selectedKey: null,
          busy: false,
          message:
            inspection.status === 'unsupported'
              ? 'Unsupported saved record. It can only be deleted.'
              : 'This saved record is unreadable. It can only be deleted.',
        });
        return;
      }
      if (isExpired(inspection.record, Date.now())) {
        if (!(await guard(ticket))) return;
        await store.delete(key);
        if (!live || ticket !== operation) return;
        publish({
          ...state,
          entries: state.entries.filter(
            (entry) => !sameSavedKey(entry.key, key),
          ),
          selected: null,
          selectedKey: null,
          busy: false,
          message: 'This saved record has expired and was removed.',
        });
        return;
      }
      publish({
        ...state,
        phase: 'ready',
        selected: inspection.record,
        selectedKey: key,
        pendingDeleteKey: null,
        busy: false,
        message: null,
      });
    } catch (error) {
      if (!live || suspended || ticket !== operation) return;
      const normal = await normalContext(api);
      if (!live || suspended || ticket !== operation) return;
      if (!normal) return deny();
      clear('unavailable', preserveError(error));
    } finally {
      afterAction(ticket);
    }
  }

  return {
    getSnapshot: () => state,
    subscribe(subscriber: () => void) {
      if (!live) return () => {};
      subscribers.add(subscriber);
      return () => subscribers.delete(subscriber);
    },
    start() {
      void refresh();
    },
    refresh,
    open,
    requestDelete(key: IDBValidKey) {
      if (!live || suspended || state.busy) return;
      const present = state.entries.some((entry) =>
        sameSavedKey(entry.key, key),
      );
      if (!present) return;
      publish({ ...state, pendingDeleteKey: key, message: null });
    },
    cancelDelete() {
      if (!live || suspended || state.busy || state.pendingDeleteKey === null)
        return;
      publish({ ...state, pendingDeleteKey: null });
    },
    closeDetail() {
      if (!live || suspended || state.busy || state.selectedKey === null)
        return;
      publish({
        ...state,
        selected: null,
        selectedKey: null,
        pendingDeleteKey: null,
        message: null,
      });
    },
    async delete() {
      const key = state.pendingDeleteKey;
      if (!live || suspended || state.busy || key === null) return;
      const ticket = ++operation;
      owner = ticket;
      publish({ ...state, busy: true, message: null });
      try {
        if (!(await guard(ticket))) return;
        await store.delete(key);
        if (!live || ticket !== operation) return;
        const selected =
          state.selectedKey && sameSavedKey(state.selectedKey, key)
            ? null
            : state.selected;
        const selectedKey = selected ? state.selectedKey : null;
        if (!(await guard(ticket))) return;
        publish({
          phase: 'ready',
          entries: state.entries.filter(
            (entry) => !sameSavedKey(entry.key, key),
          ),
          selected,
          selectedKey,
          pendingDeleteKey: null,
          busy: false,
          message: 'Saved record deleted.',
        });
        hint?.notifyRemote?.();
      } catch (error) {
        if (ticket !== operation) return;
        if (!(await normalContext(api))) return deny();
        publish({
          ...state,
          pendingDeleteKey: null,
          busy: false,
          message: `${preserveError(error)} The record may still exist. Refresh before trying again.`,
        });
      } finally {
        afterAction(ticket);
      }
    },
    suspend() {
      if (!live || suspended) return;
      suspended = true;
      operation += 1;
      owner = null;
      appliedRevision = hintRevision;
      publish({
        phase: 'checking',
        entries: [],
        selected: null,
        selectedKey: null,
        pendingDeleteKey: null,
        busy: false,
        message: 'Saved investigations are revalidated when this page resumes.',
      });
    },
    resume() {
      if (!live || !suspended) return;
      suspended = false;
      void refresh();
    },
    revalidate() {
      if (!live || suspended) return;
      void refresh();
    },
    close() {
      if (!live) return;
      live = false;
      suspended = false;
      operation += 1;
      owner = null;
      removeHint();
      publish({
        phase: 'checking',
        entries: [],
        selected: null,
        selectedKey: null,
        pendingDeleteKey: null,
        busy: false,
        message: null,
      });
      subscribers.clear();
      store.close();
    },
  };
}

export type SavedLibrary = ReturnType<typeof createSavedLibrary>;
