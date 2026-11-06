import { createPrintableHtml } from './report-html';
import {
  CLIPBOARD_ERROR_MESSAGE,
  type ClipboardOutcome,
} from './report-clipboard';
import { createReportMarkdown } from './report-markdown';
import type { ReportFormat } from './report-download';
import type { ImportedProvenance, ReportImport } from './report-import';
import type { SavedReport } from './saved-record';
import type { SavedBrowser } from './saved-context';
import { normalContext } from './saved-context';

export type ImportedOutputFormat = 'markdown' | 'html';

export interface ImportedOutputSnapshot {
  format: ImportedOutputFormat;
  preview: string | null;
  busy: boolean;
  message: string | null;
}

export interface ImportedOutputHandoffs {
  download(text: string, format: Extract<ReportFormat, 'html'>): void;
  print(text: string, format: Extract<ReportFormat, 'html'>): void;
  copy(text: string): Promise<ClipboardOutcome>;
}

interface ImportedPermit {
  report: SavedReport;
  importedAt: number;
  claimedProvenance: ImportedProvenance | null;
  format: ImportedOutputFormat;
  text: string | null;
}

const contextMessage =
  'Imported reports are available only in verified normal windows.';
const busyMessage = 'Another imported-report action is in progress. Try again.';
const downloadMessage =
  'Download requested. Check your browser downloads for its outcome.';
const printMessage =
  'Print dialog requested. AddonRay cannot observe whether it was printed, cancelled or saved as a PDF.';

// The imported view owns untrusted file content in memory. This controller only
// turns that held content into an exact printable representation; it never
// reads storage, collects observations or requests a permission.
export function createImportOutput(
  api: SavedBrowser,
  source: Pick<ReportImport, 'getSnapshot' | 'subscribe'>,
  handoffs: ImportedOutputHandoffs,
) {
  let state: ImportedOutputSnapshot = {
    format: 'html',
    preview: null,
    busy: false,
    message: null,
  };
  let live = true;
  let operation = 0;
  let permit: ImportedPermit | null = null;
  const subscribers = new Set<() => void>();
  const publish = (next: ImportedOutputSnapshot) => {
    state = next;
    subscribers.forEach((subscriber) => subscriber());
  };
  const discard = (message: string | null = null) => {
    operation += 1;
    if (permit) permit.text = null;
    permit = null;
    publish({ ...state, preview: null, busy: false, message });
  };
  const matches = (candidate: ImportedPermit) => {
    const snapshot = source.getSnapshot();
    return (
      snapshot.report === candidate.report &&
      snapshot.importedAt === candidate.importedAt
    );
  };
  const current = (ticket: number, candidate: ImportedPermit) =>
    live && ticket === operation && permit === candidate && matches(candidate);
  const unsubscribe = source.subscribe(() => {
    if (live && permit && !matches(permit))
      discard('The imported report changed. Prepare its report again.');
  });

  function output(candidate: ImportedPermit) {
    const options = {
      provenance: 'imported' as const,
      ...(candidate.claimedProvenance
        ? { claimedProvenance: candidate.claimedProvenance }
        : {}),
    };
    const value =
      candidate.format === 'markdown'
        ? createReportMarkdown(candidate.report, options)
        : createPrintableHtml(candidate.report, options);
    if (value.status === 'success') return value;
    return {
      ...value,
      reason: `${value.reason} The imported report remains available for inspection or saving.`,
    };
  }

  async function deliver(kind: 'download' | 'print' | 'copy') {
    const candidate = permit;
    if (!live || state.busy || candidate === null || candidate.text === null)
      return;
    if (kind === 'print' && candidate.format !== 'html') return;
    if (kind === 'copy' && candidate.format !== 'markdown') return;
    // Markdown is the reviewed clipboard representation in this slice. It does
    // not add an imported Markdown download.
    if (kind === 'download' && candidate.format !== 'html') return;
    const snapshot = source.getSnapshot();
    if (snapshot.busy) {
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
      if (source.getSnapshot().busy) {
        publish({
          ...state,
          preview: candidate.text,
          busy: false,
          message: busyMessage,
        });
        return;
      }
      const fresh = output(candidate);
      if (fresh.status !== 'success') {
        discard(fresh.reason);
        return;
      }
      if (fresh.value !== candidate.text) {
        discard('The imported report changed. Prepare its report again.');
        return;
      }
      if (!current(ticket, candidate)) return;
      if (kind === 'copy') {
        const text = fresh.value;
        let outcome: ClipboardOutcome;
        try {
          outcome = await handoffs.copy(text);
        } catch {
          if (current(ticket, candidate))
            publish({
              ...state,
              preview: text,
              busy: false,
              message: CLIPBOARD_ERROR_MESSAGE,
            });
          return;
        }
        // The write may be irrevocable. A replacement, clear, suspension or
        // context loss during it suppresses success and content restoration.
        if (!current(ticket, candidate)) return;
        publish({
          ...state,
          preview: text,
          busy: false,
          message: outcome.message,
        });
        return;
      }
      try {
        // No await separates the final validity check from browser handoff.
        const handoff =
          kind === 'download' ? handoffs.download : handoffs.print;
        handoff(fresh.value, 'html');
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
    } catch {
      if (current(ticket, candidate))
        discard('The report could not be prepared. Try again.');
    }
  }

  return {
    getSnapshot: () => state,
    subscribe(subscriber: () => void) {
      if (!live) return () => {};
      subscribers.add(subscriber);
      return () => subscribers.delete(subscriber);
    },
    setFormat(format: ImportedOutputFormat) {
      if (!live || state.busy || format === state.format) return;
      discard();
      publish({ ...state, format });
    },
    async prepare() {
      const snapshot = source.getSnapshot();
      if (!live || state.busy) return;
      if (snapshot.busy) {
        publish({ ...state, preview: null, busy: false, message: busyMessage });
        return;
      }
      if (!snapshot.report || snapshot.importedAt === null) {
        publish({
          ...state,
          preview: null,
          busy: false,
          message: 'Choose a report file before preparing its report.',
        });
        return;
      }
      const ticket = ++operation;
      const candidate: ImportedPermit = {
        report: snapshot.report,
        importedAt: snapshot.importedAt,
        claimedProvenance: snapshot.claimedProvenance,
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
        const prepared = output(candidate);
        if (prepared.status !== 'success') {
          discard(prepared.reason);
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
        const finalOutput = output(candidate);
        if (finalOutput.status !== 'success') {
          discard(finalOutput.reason);
          return;
        }
        if (finalOutput.value !== prepared.value) {
          discard('The imported report changed. Prepare its report again.');
          return;
        }
        candidate.text = prepared.value;
        publish({
          ...state,
          preview: prepared.value,
          busy: false,
          message: null,
        });
      } catch {
        if (current(ticket, candidate))
          discard('The report could not be prepared. Try again.');
      }
    },
    async download() {
      await deliver('download');
    },
    async print() {
      await deliver('print');
    },
    async copy() {
      await deliver('copy');
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

export type ImportOutput = ReturnType<typeof createImportOutput>;
