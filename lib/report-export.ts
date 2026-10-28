import type { Browser } from 'wxt/browser';
import type { Investigation } from './investigation';
import { createInvestigationReport } from './investigation-report';

export interface ReportBrowser {
  tabs: {
    getCurrent(): Promise<Pick<Browser.tabs.Tab, 'incognito'> | undefined>;
  };
  permissions: {
    contains(permissions: Browser.permissions.Permissions): Promise<boolean>;
  };
}

interface ExportSnapshot {
  preview: string | null;
  busy: boolean;
  message: string | null;
}

interface ReportPermit {
  snapshot: ReturnType<Investigation['getSnapshot']> | null;
  generation: number;
  text: string | null;
}

// The document owns this controller. It never sends report data to another view.
export function createReportExport(
  api: ReportBrowser,
  investigation: Investigation,
  handoff: (markdown: string) => void,
) {
  let state: ExportSnapshot = { preview: null, busy: false, message: null };
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
    publish({ preview: null, busy: false, message });
  };
  const current = (ticket: number, permit: ReportPermit) =>
    live &&
    ticket === operation &&
    source === permit &&
    permit.snapshot === investigation.getSnapshot() &&
    permit.generation === investigation.getGeneration();

  async function verify(ticket: number, permit: ReportPermit) {
    if (!current(ticket, permit)) return false;
    const tab = await api.tabs.getCurrent();
    if (!current(ticket, permit)) return false;
    if (tab?.incognito !== false) {
      discard('Report export is available only in verified normal windows.');
      return false;
    }
    // An inventory-only report does not require a never-granted page permission.
    const hasPageData = !!(
      permit.snapshot?.timingBefore ||
      permit.snapshot?.timingAfter ||
      permit.snapshot?.errorBefore ||
      permit.snapshot?.errorAfter
    );
    const granted = await api.permissions.contains({
      permissions: hasPageData ? ['management', 'scripting'] : ['management'],
    });
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
    async prepare() {
      if (!live || state.busy || subscribers.size === 0) return;
      discard();
      const permit: ReportPermit = {
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
          preview: null,
          busy: false,
          message: 'Capture both inventories before previewing a report.',
        });
        return;
      }
      source = permit;
      const ticket = operation;
      publish({ preview: null, busy: true, message: null });
      try {
        if (!(await verify(ticket, permit)) || !permit.snapshot) return;
        const result = createInvestigationReport(permit.snapshot);
        if (!current(ticket, permit)) return;
        if (result.status !== 'success') {
          discard(result.reason);
          return;
        }
        permit.text = result.value;
        publish({ preview: permit.text, busy: false, message: null });
      } catch {
        if (current(ticket, permit)) {
          discard(
            'The report could not be prepared. Preview it again to retry.',
          );
        }
      }
    },
    async download() {
      const permit = source;
      if (!live || state.busy || subscribers.size === 0 || permit?.text == null)
        return;
      const ticket = ++operation;
      publish({ preview: permit.text, busy: true, message: null });
      try {
        if (!(await verify(ticket, permit))) return;
        if (!current(ticket, permit) || permit.text === null) return;
        // No await separates the final validity check from browser handoff.
        handoff(permit.text);
        if (!current(ticket, permit)) return;
        publish({
          preview: permit.text,
          busy: false,
          message:
            'Download requested. Check your browser downloads for its outcome.',
        });
      } catch {
        if (current(ticket, permit)) {
          publish({
            preview: permit.text,
            busy: false,
            message:
              'The download could not be requested. Try again from this preview.',
          });
        }
      }
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
