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
import { createPrintableHtml } from './report-html';
import type { Result } from './inspector';
import type { ReportFormat } from './report-download';
import { SavedStoreError, type SavedStore } from './saved-store';

export type SavedExportFormat = Extract<ReportFormat, 'json' | 'html'>;

export type SavedExportSelection = Pick<
  SavedLibrarySnapshot,
  'phase' | 'selected' | 'selectedKey' | 'busy'
>;

export interface SavedExportSource {
  getSnapshot(): SavedExportSelection;
  subscribe(subscriber: () => void): () => void;
}

export interface SavedExportSnapshot {
  format: SavedExportFormat;
  preview: string | null;
  busy: boolean;
  message: string | null;
}

export interface SavedExportHandoffs {
  download(text: string, format: SavedExportFormat): void;
  print(text: string, format: SavedExportFormat): void;
}

interface ExportPermit {
  key: IDBValidKey;
  recordId: string;
  format: SavedExportFormat;
  text: string | null;
}

const contextMessage =
  'Saved archive export is available only in verified normal windows.';
const busyMessage = 'Another saved-history action is in progress. Try again.';
const downloadMessage =
  'Download requested. Check your browser downloads for its outcome.';
const printMessage =
  'Print dialog requested. AddonRay cannot observe whether it was printed, cancelled or saved as a PDF.';

function storageMessage(error: unknown) {
  return error instanceof SavedStoreError
    ? error.message
    : 'Saved storage is unavailable. No report was prepared or downloaded.';
}

function createSavedOutput(
  record: SavedRecord,
  format: SavedExportFormat,
): Result<string> {
  if (format === 'html') {
    const html = createPrintableHtml(record.report, {
      provenance: record.origin,
    });
    if (html.status === 'success') return html;
    return {
      ...html,
      reason: `${html.reason} JSON remains available if it fits its own limit.`,
    };
  }
  const text = serializeExchange(record);
  if (byteLength(text) > SAVED_LIMITS.jsonBytes)
    return {
      status: 'error',
      reason:
        'The JSON report exceeds the 1 MiB limit. It cannot be previewed or downloaded.',
    };
  return { status: 'success', value: text };
}

// The library owns selection and storage. This controller only turns one
// selected record into reviewed JSON, re-reading storage at each output action.
export function createSavedExport(
  api: SavedBrowser,
  store: SavedStore,
  source: SavedExportSource,
  handoffs: SavedExportHandoffs,
) {
  let state: SavedExportSnapshot = {
    format: 'json',
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
    publish({ format: state.format, preview: null, busy: false, message });
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
      discard('The saved archive changed. Prepare its report again.');
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
      return 'The saved record changed. Prepare its report again.';
    return inspection.record;
  };

  async function deliver(kind: 'download' | 'print') {
    const candidate = permit;
    if (!live || state.busy || candidate === null || candidate.text === null)
      return;
    if (kind === 'print' && candidate.format !== 'html') return;
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
      // A first read establishes storage reachability before the final context
      // check. The authoritative read follows that check: a delete, delete-all
      // or replacement can complete while the context promise is pending without
      // a delivered notification.
      await store.get(candidate.key);
      if (!current(ticket, candidate)) return;
      const finalContext = await normalContext(api);
      if (!current(ticket, candidate)) return;
      if (!finalContext) {
        discard(contextMessage);
        return;
      }
      const raw = await store.get(candidate.key);
      if (!current(ticket, candidate)) return;
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
      const fresh = createSavedOutput(failure, candidate.format);
      if (fresh.status !== 'success') {
        discard(fresh.reason);
        return;
      }
      if (fresh.value !== candidate.text) {
        discard('The saved record changed. Prepare its report again.');
        return;
      }
      if (!current(ticket, candidate)) return;
      try {
        // No await separates the final validity check from browser handoff.
        handoffs[kind](fresh.value, candidate.format);
      } catch {
        if (current(ticket, candidate))
          publish({
            ...state,
            preview: candidate.text,
            busy: false,
            message:
              kind === 'download'
                ? 'The download could not be requested. Try again from this preview.'
                : 'The print dialog could not be requested. Try again from this preview.',
          });
        return;
      }
      if (!current(ticket, candidate)) return;
      publish({
        ...state,
        preview: candidate.text,
        busy: false,
        message: kind === 'download' ? downloadMessage : printMessage,
      });
    } catch (error) {
      if (current(ticket, candidate)) discard(storageMessage(error));
    }
  }

  return {
    getSnapshot: () => state,
    subscribe(subscriber: () => void) {
      if (!live) return () => {};
      subscribers.add(subscriber);
      return () => subscribers.delete(subscriber);
    },
    setFormat(format: SavedExportFormat) {
      if (!live || state.busy || format === state.format) return;
      discard();
      publish({ ...state, format });
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
        format: state.format,
        text: null,
      };
      permit = candidate;
      publish({ ...state, preview: null, busy: true, message: null });
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
        const output = createSavedOutput(checked, candidate.format);
        if (output.status !== 'success') {
          discard(output.reason);
          return;
        }
        const finalContext = await normalContext(api);
        if (!current(ticket, candidate)) return;
        if (!finalContext) {
          discard(contextMessage);
          return;
        }
        // The final context check can wait while another view deletes, delete-alls
        // or replaces the record without a delivered notification. Read storage
        // again after that wait and trust only this authoritative snapshot. No
        // await follows this read before publication.
        const finalRaw = await store.get(candidate.key);
        if (!current(ticket, candidate)) return;
        if (source.getSnapshot().busy) {
          discard(busyMessage);
          return;
        }
        const finalCheck = validate(finalRaw, candidate);
        if (typeof finalCheck === 'string') {
          discard(finalCheck);
          return;
        }
        if (serializeExchange(finalCheck) !== serializeExchange(checked)) {
          discard('The saved record changed. Prepare its report again.');
          return;
        }
        const finalOutput = createSavedOutput(finalCheck, candidate.format);
        if (finalOutput.status !== 'success') {
          discard(finalOutput.reason);
          return;
        }
        if (finalOutput.value !== output.value) {
          discard('The saved record changed. Prepare its report again.');
          return;
        }
        candidate.text = output.value;
        publish({
          format: state.format,
          preview: output.value,
          busy: false,
          message: null,
        });
      } catch (error) {
        if (current(ticket, candidate)) discard(storageMessage(error));
      }
    },
    async download() {
      await deliver('download');
    },
    async print() {
      await deliver('print');
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
