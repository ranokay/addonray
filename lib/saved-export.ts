import type { SavedBrowser } from './saved-context';
import { normalContext } from './saved-context';
import { sameSavedKey, type SavedLibrarySnapshot } from './saved-library';
import {
  byteLength,
  inspectStoredRecord,
  isExpired,
  serializeExchange,
  SAVED_LIMITS,
  type SavedRecord,
} from './saved-record';
import { SavedStoreError, type SavedStore } from './saved-store';

export type SavedExportSelection = Pick<
  SavedLibrarySnapshot,
  'phase' | 'selected' | 'selectedKey' | 'busy'
>;

export interface SavedExportSource {
  getSnapshot(): SavedExportSelection;
  subscribe(subscriber: () => void): () => void;
}

export interface SavedExportSnapshot {
  preview: string | null;
  busy: boolean;
  message: string | null;
}

interface ExportPermit {
  key: IDBValidKey;
  recordId: string;
  text: string | null;
}

const contextMessage =
  'Saved archive export is available only in verified normal windows.';
const busyMessage = 'Another saved-history action is in progress. Try again.';

function storageMessage(error: unknown) {
  return error instanceof SavedStoreError
    ? error.message
    : 'Saved storage is unavailable. No report was prepared or downloaded.';
}

// The library owns selection and storage. This controller only turns one
// selected record into reviewed JSON, re-reading storage at each output action.
export function createSavedExport(
  api: SavedBrowser,
  store: SavedStore,
  source: SavedExportSource,
  handoff: (json: string) => void,
) {
  let state: SavedExportSnapshot = {
    preview: null,
    busy: false,
    message: null,
  };
  let live = true;
  let operation = 0;
  let permit: ExportPermit | null = null;
  const subscribers = new Set<() => void>();
  const publish = (next: SavedExportSnapshot) => {
    state = next;
    subscribers.forEach((subscriber) => subscriber());
  };
  const discard = (message: string | null = null) => {
    operation += 1;
    // Pending storage reads retain no reviewed text after invalidation.
    if (permit) permit.text = null;
    permit = null;
    publish({ preview: null, busy: false, message });
  };
  const matchesSelection = (current: ExportPermit) => {
    const selection = source.getSnapshot();
    return (
      selection.phase === 'ready' &&
      selection.selectedKey !== null &&
      selection.selected?.recordId === current.recordId &&
      sameSavedKey(selection.selectedKey, current.key)
    );
  };
  const current = (ticket: number, candidate: ExportPermit) =>
    live &&
    ticket === operation &&
    permit === candidate &&
    matchesSelection(candidate);
  const selection = () => {
    const snapshot = source.getSnapshot();
    if (
      snapshot.phase !== 'ready' ||
      snapshot.selectedKey === null ||
      snapshot.selected === null
    )
      return null;
    return { key: snapshot.selectedKey, record: snapshot.selected };
  };
  const unsubscribe = source.subscribe(() => {
    if (live && permit && !matchesSelection(permit))
      discard('The saved archive changed. Prepare its JSON report again.');
  });

  const validate = (
    raw: unknown,
    expected: ExportPermit,
  ): SavedRecord | string => {
    if (raw === undefined)
      return 'This saved record is no longer available. It may have been deleted or expired.';
    const inspection = inspectStoredRecord(raw);
    if (inspection.status === 'unsupported')
      return 'Unsupported saved record. It can only be deleted.';
    if (inspection.status === 'invalid')
      return 'This saved record is unreadable. It can only be deleted.';
    if (isExpired(inspection.record, Date.now()))
      return 'This saved record has expired and can no longer be exported.';
    if (inspection.record.recordId !== expected.recordId)
      return 'The saved record changed. Prepare its JSON report again.';
    return inspection.record;
  };

  return {
    getSnapshot: () => state,
    subscribe(subscriber: () => void) {
      if (!live) return () => {};
      subscribers.add(subscriber);
      return () => subscribers.delete(subscriber);
    },
    async prepare() {
      const selected = selection();
      if (!live || state.busy) return;
      if (!selected) {
        publish({
          ...state,
          preview: null,
          busy: false,
          message:
            'Open an available saved record before preparing its report.',
        });
        return;
      }
      if (source.getSnapshot().busy) {
        publish({ ...state, preview: null, busy: false, message: busyMessage });
        return;
      }
      const ticket = ++operation;
      const candidate: ExportPermit = {
        key: selected.key,
        recordId: selected.record.recordId,
        text: null,
      };
      permit = candidate;
      publish({ preview: null, busy: true, message: null });
      try {
        const normal = await normalContext(api);
        if (!current(ticket, candidate)) return;
        if (!normal) {
          discard(contextMessage);
          return;
        }
        const raw = await store.get(candidate.key);
        if (!current(ticket, candidate)) return;
        const checked = validate(raw, candidate);
        if (typeof checked === 'string') {
          discard(checked);
          return;
        }
        const text = serializeExchange(checked);
        if (byteLength(text) > SAVED_LIMITS.jsonBytes) {
          discard(
            'The JSON report exceeds the 1 MiB limit. It cannot be previewed or downloaded.',
          );
          return;
        }
        const finalContext = await normalContext(api);
        if (!current(ticket, candidate)) return;
        if (!finalContext) {
          discard(contextMessage);
          return;
        }
        if (source.getSnapshot().busy) {
          discard(busyMessage);
          return;
        }
        // Expiry and the stored report identity are time/state dependent.
        // Revalidate the held snapshot after the last await and immediately
        // before publishing. The record object cannot mutate in memory; a
        // later storage write is outside this read snapshot and the next
        // output action re-reads storage without needing a delivered hint.
        const finalCheck = validate(checked, candidate);
        if (typeof finalCheck === 'string') {
          discard(finalCheck);
          return;
        }
        if (serializeExchange(finalCheck) !== text) {
          discard('The saved record changed. Prepare its JSON report again.');
          return;
        }
        candidate.text = text;
        publish({ preview: text, busy: false, message: null });
      } catch (error) {
        if (current(ticket, candidate)) discard(storageMessage(error));
      }
    },
    async download() {
      const candidate = permit;
      if (!live || state.busy || candidate === null || candidate.text === null)
        return;
      if (source.getSnapshot().busy) {
        publish({ ...state, busy: false, message: busyMessage });
        return;
      }
      const ticket = ++operation;
      publish({ ...state, busy: true, message: null });
      try {
        const normal = await normalContext(api);
        if (!current(ticket, candidate)) return;
        if (!normal) {
          discard(contextMessage);
          return;
        }
        const raw = await store.get(candidate.key);
        if (!current(ticket, candidate)) return;
        const finalContext = await normalContext(api);
        if (!current(ticket, candidate)) return;
        if (!finalContext) {
          discard(contextMessage);
          return;
        }
        if (source.getSnapshot().busy) {
          publish({
            ...state,
            preview: candidate.text,
            busy: false,
            message: busyMessage,
          });
          return;
        }
        const failure = validate(raw, candidate);
        if (typeof failure === 'string') {
          discard(failure);
          return;
        }
        const reviewed = serializeExchange(failure);
        if (reviewed !== candidate.text) {
          discard('The saved record changed. Prepare its JSON report again.');
          return;
        }
        if (!current(ticket, candidate)) return;
        try {
          // No await separates the final validity check from browser handoff.
          handoff(reviewed);
        } catch {
          if (current(ticket, candidate))
            publish({
              preview: candidate.text,
              busy: false,
              message:
                'The download could not be requested. Try again from this preview.',
            });
          return;
        }
        if (!current(ticket, candidate)) return;
        publish({
          preview: candidate.text,
          busy: false,
          message:
            'Download requested. Check your browser downloads for its outcome.',
        });
      } catch (error) {
        if (current(ticket, candidate)) discard(storageMessage(error));
      }
    },
    cancel: () => discard(),
    dispose() {
      if (!live) return;
      live = false;
      unsubscribe();
      discard();
      subscribers.clear();
    },
  };
}

export type SavedExport = ReturnType<typeof createSavedExport>;
