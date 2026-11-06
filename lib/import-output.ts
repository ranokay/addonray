import { createPrintableHtml } from './report-html';
import type { ReportFormat } from './report-download';
import type { ImportedProvenance, ReportImport } from './report-import';
import type { SavedReport } from './saved-record';
import type { SavedBrowser } from './saved-context';
import { normalContext } from './saved-context';

export interface ImportedOutputSnapshot {
  preview: string | null;
  busy: boolean;
  message: string | null;
}

export interface ImportedOutputHandoffs {
  download(text: string, format: Extract<ReportFormat, 'html'>): void;
  print(text: string, format: Extract<ReportFormat, 'html'>): void;
}

interface ImportedPermit {
  report: SavedReport;
  importedAt: number;
  claimedProvenance: ImportedProvenance | null;
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
    publish({ preview: null, busy: false, message });
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
      discard(
        'The imported report changed. Prepare its printable report again.',
      );
  });

  function output(candidate: ImportedPermit) {
    const html = createPrintableHtml(candidate.report, {
      provenance: 'imported',
      ...(candidate.claimedProvenance
        ? { claimedProvenance: candidate.claimedProvenance }
        : {}),
    });
    if (html.status === 'success') return html;
    return {
      ...html,
      reason: `${html.reason} The imported report remains available for inspection or saving.`,
    };
  }

  async function deliver(kind: 'download' | 'print') {
    const candidate = permit;
    if (!live || state.busy || candidate === null || candidate.text === null)
      return;
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
        discard(
          'The imported report changed. Prepare its printable report again.',
        );
        return;
      }
      if (!current(ticket, candidate)) return;
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
        discard('The printable report could not be prepared. Try again.');
    }
  }

  return {
    getSnapshot: () => state,
    subscribe(subscriber: () => void) {
      if (!live) return () => {};
      subscribers.add(subscriber);
      return () => subscribers.delete(subscriber);
    },
    async prepare() {
      const snapshot = source.getSnapshot();
      if (!live || state.busy) return;
      if (snapshot.busy) {
        publish({ preview: null, busy: false, message: busyMessage });
        return;
      }
      if (!snapshot.report || snapshot.importedAt === null) {
        publish({
          preview: null,
          busy: false,
          message:
            'Choose a report file before preparing its printable report.',
        });
        return;
      }
      const ticket = ++operation;
      const candidate: ImportedPermit = {
        report: snapshot.report,
        importedAt: snapshot.importedAt,
        claimedProvenance: snapshot.claimedProvenance,
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
          discard(
            'The imported report changed. Prepare its printable report again.',
          );
          return;
        }
        candidate.text = prepared.value;
        publish({ preview: prepared.value, busy: false, message: null });
      } catch {
        if (current(ticket, candidate))
          discard('The printable report could not be prepared. Try again.');
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

export type ImportOutput = ReturnType<typeof createImportOutput>;
