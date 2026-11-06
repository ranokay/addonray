import type { Browser } from 'wxt/browser';
import type { Investigation } from './investigation';
import { createInvestigationReport } from './investigation-report';
import { createPrintableHtml } from './report-html';
import type { ReportFormat } from './report-download';
import {
  CLIPBOARD_COMPLETED_STALE_MESSAGE,
  CLIPBOARD_ERROR_MESSAGE,
  type ClipboardOutcome,
} from './report-clipboard';
import { createExchangeJson, createSavedReport } from './saved-record';

export interface ReportBrowser {
  tabs: {
    getCurrent(): Promise<Pick<Browser.tabs.Tab, 'incognito'> | undefined>;
  };
  permissions: {
    contains(permissions: Browser.permissions.Permissions): Promise<boolean>;
  };
}

export interface ReportHandoffs {
  download(text: string, format: ReportFormat): void;
  print(text: string, format: ReportFormat): void;
  copy(text: string): Promise<ClipboardOutcome>;
}

interface ExportSnapshot {
  format: ReportFormat;
  preview: string | null;
  busy: boolean;
  message: string | null;
}

interface ReportPermit {
  format: ReportFormat;
  snapshot: ReturnType<Investigation['getSnapshot']> | null;
  generation: number;
  text: string | null;
}

const downloadMessage =
  'Download requested. Check your browser downloads for its outcome.';
const printMessage =
  'Print dialog requested. AddonRay cannot observe whether it was printed, cancelled or saved as a PDF.';

function createLivePrintableHtml(
  snapshot: ReturnType<Investigation['getSnapshot']>,
) {
  const report = createSavedReport(snapshot);
  if (report.status !== 'success') return report;
  const html = createPrintableHtml(report.value, { provenance: 'captured' });
  if (html.status === 'success') return html;
  return {
    ...html,
    reason: `${html.reason} JSON and Markdown remain available if they fit their own limits.`,
  };
}

// The document owns this controller. It never sends report data to another view.
export function createReportExport(
  api: ReportBrowser,
  investigation: Investigation,
  handoffs: ReportHandoffs,
) {
  let state: ExportSnapshot = {
    format: 'markdown',
    preview: null,
    busy: false,
    message: null,
  };
  let source: ReportPermit | null = null;
  let operation = 0;
  let live = true;
  let unsubscribe: (() => void) | null = null;
  const subscribers = new Set<() => void>();
  const publish = (next: ExportSnapshot) => {
    state = next;
    subscribers.forEach((subscriber) => subscriber());
  };
  const discard = (message: string | null = null) => {
    operation += 1;
    // Pending browser promises retain only this clearable permit, not old data.
    if (source) {
      source.snapshot = null;
      source.text = null;
    }
    source = null;
    publish({ ...state, preview: null, busy: false, message });
  };
  const current = (ticket: number, permit: ReportPermit) =>
    live &&
    ticket === operation &&
    source === permit &&
    permit.snapshot === investigation.getSnapshot() &&
    permit.generation === investigation.getGeneration();

  function requiredPermissions(
    permit: ReportPermit,
  ): Parameters<ReportBrowser['permissions']['contains']>[0] {
    // An inventory-only report does not require a never-granted page permission.
    const hasPageData = !!(
      permit.snapshot?.timingBefore ||
      permit.snapshot?.timingAfter ||
      permit.snapshot?.errorBefore ||
      permit.snapshot?.errorAfter
    );
    return {
      permissions: hasPageData ? ['management', 'scripting'] : ['management'],
    };
  }

  async function verify(ticket: number, permit: ReportPermit) {
    if (!current(ticket, permit)) return false;
    const tab = await api.tabs.getCurrent();
    if (!current(ticket, permit)) return false;
    if (tab?.incognito !== false) {
      discard('Report export is available only in verified normal windows.');
      return false;
    }
    const granted = await api.permissions.contains(requiredPermissions(permit));
    if (!current(ticket, permit)) return false;
    if (!granted) {
      investigation.startOver();
      discard(
        'Access changed. The investigation and report preview were cleared.',
      );
      return false;
    }
    return true;
  }

  const locallyCurrent = (ticket: number, permit: ReportPermit) =>
    live && ticket === operation && source === permit;

  // A resolved platform write is not proof that the live view is still eligible.
  // Recheck authoritative context and permission state before success, with the
  // operation check after every await. Local generation alone cannot observe a
  // permission removal that arrives without a notification.
  async function postWriteEligible(
    ticket: number,
    permit: ReportPermit,
  ): Promise<'valid' | 'stale' | 'cancelled'> {
    if (!locallyCurrent(ticket, permit)) return 'cancelled';
    if (!current(ticket, permit)) return 'stale';
    const tab = await api.tabs.getCurrent();
    if (!locallyCurrent(ticket, permit)) return 'cancelled';
    if (!current(ticket, permit)) return 'stale';
    if (tab?.incognito !== false) return 'stale';
    const granted = await api.permissions.contains(requiredPermissions(permit));
    if (!locallyCurrent(ticket, permit)) return 'cancelled';
    if (!current(ticket, permit)) return 'stale';
    if (!granted) {
      investigation.startOver();
      return 'stale';
    }
    return 'valid';
  }

  // Download, print and clipboard copy share the same permit, lease and
  // freshness checks. Print is available only for the HTML frame and clipboard
  // copy only for the reviewed Markdown text. Clipboard success waits for the
  // platform write; it is never inferred from the click.
  async function deliver(kind: 'download' | 'print' | 'copy') {
    const permit = source;
    if (!live || state.busy || subscribers.size === 0 || permit?.text == null)
      return;
    if (kind === 'print' && permit.format !== 'html') return;
    if (kind === 'copy' && permit.format !== 'markdown') return;
    const lease = investigation.activity.tryBegin('report');
    if (!lease) {
      publish({
        ...state,
        preview: permit.text,
        busy: false,
        message: 'Another action is in progress. Try again.',
      });
      return;
    }
    try {
      const ticket = ++operation;
      publish({ ...state, preview: permit.text, busy: true, message: null });
      try {
        if (!(await verify(ticket, permit))) return;
        if (!current(ticket, permit) || permit.text === null) return;
        if (kind === 'print' && permit.format !== 'html') return;
        if (kind === 'copy' && permit.format !== 'markdown') return;
        if (kind === 'copy') {
          const text = permit.text;
          const outcome = await handoffs.copy(text);
          if (!locallyCurrent(ticket, permit)) return;
          if (outcome.status !== 'success') {
            if (!current(ticket, permit)) {
              discard(outcome.message);
              return;
            }
            publish({
              ...state,
              preview: text,
              busy: false,
              message: outcome.message,
            });
            return;
          }
          // The platform write may be irrevocable. If the live view is stale,
          // suppress success and content restoration, but do not claim the
          // completed write did not happen.
          if (!current(ticket, permit)) {
            discard(CLIPBOARD_COMPLETED_STALE_MESSAGE);
            return;
          }
          let eligibility: 'valid' | 'stale' | 'cancelled';
          try {
            eligibility = await postWriteEligible(ticket, permit);
          } catch {
            if (locallyCurrent(ticket, permit))
              discard(CLIPBOARD_COMPLETED_STALE_MESSAGE);
            return;
          }
          if (eligibility === 'cancelled') return;
          if (eligibility === 'stale') {
            discard(CLIPBOARD_COMPLETED_STALE_MESSAGE);
            return;
          }
          publish({
            ...state,
            preview: text,
            busy: false,
            message: outcome.message,
          });
          return;
        }
        // No await separates the final validity check from browser handoff.
        const handoff =
          kind === 'download' ? handoffs.download : handoffs.print;
        handoff(permit.text, permit.format);
        if (!current(ticket, permit)) return;
        publish({
          ...state,
          preview: permit.text,
          busy: false,
          message: kind === 'download' ? downloadMessage : printMessage,
        });
      } catch {
        if (current(ticket, permit)) {
          publish({
            ...state,
            preview: permit.text,
            busy: false,
            message:
              kind === 'copy'
                ? CLIPBOARD_ERROR_MESSAGE
                : kind === 'download'
                  ? 'The download could not be requested. Try again from this preview.'
                  : 'The print dialog could not be requested. Try again from this preview.',
          });
        }
      }
    } finally {
      lease.release();
    }
  }

  return {
    getSnapshot: () => state,
    subscribe(subscriber: () => void) {
      if (!live) return () => {};
      if (subscribers.size === 0) {
        unsubscribe = investigation.subscribe(() => {
          if (source && source.snapshot !== investigation.getSnapshot()) {
            discard('The investigation changed. Preview the report again.');
          }
        });
      }
      subscribers.add(subscriber);
      return () => {
        subscribers.delete(subscriber);
        if (subscribers.size === 0) {
          unsubscribe?.();
          unsubscribe = null;
          discard();
        }
      };
    },
    setFormat(format: ReportFormat) {
      if (!live || state.busy || format === state.format) return;
      discard();
      publish({ ...state, format });
    },
    async prepare() {
      if (!live || state.busy || subscribers.size === 0) return;
      const lease = investigation.activity.tryBegin('report');
      if (!lease) {
        publish({
          ...state,
          preview: null,
          busy: false,
          message: 'Another action is in progress. Try again.',
        });
        return;
      }
      try {
        discard();
        const permit: ReportPermit = {
          format: state.format,
          snapshot: investigation.getSnapshot(),
          generation: investigation.getGeneration(),
          text: null,
        };
        if (
          permit.snapshot?.busy ||
          permit.snapshot?.before?.status !== 'success' ||
          permit.snapshot?.after?.status !== 'success'
        ) {
          publish({
            ...state,
            preview: null,
            busy: false,
            message: 'Capture both inventories before previewing a report.',
          });
          return;
        }
        source = permit;
        const ticket = operation;
        publish({ ...state, preview: null, busy: true, message: null });
        try {
          if (!(await verify(ticket, permit)) || !permit.snapshot) return;
          const result =
            permit.format === 'json'
              ? createExchangeJson(permit.snapshot)
              : permit.format === 'html'
                ? createLivePrintableHtml(permit.snapshot)
                : createInvestigationReport(permit.snapshot);
          if (!current(ticket, permit)) return;
          if (result.status !== 'success') {
            discard(result.reason);
            return;
          }
          permit.text = result.value;
          publish({
            ...state,
            preview: permit.text,
            busy: false,
            message: null,
          });
        } catch {
          if (current(ticket, permit)) {
            discard(
              'The report could not be prepared. Preview it again to retry.',
            );
          }
        }
      } finally {
        lease.release();
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
      unsubscribe?.();
      unsubscribe = null;
      discard();
      subscribers.clear();
    },
  };
}

export type ReportExport = ReturnType<typeof createReportExport>;
