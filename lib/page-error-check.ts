import type { BrowserContext } from './browser-target';
import type { InspectorBrowser } from './inspector';

export const pageErrorLimits = {
  durationMs: 30_000,
  events: 200,
  summaryBytes: 1024,
} as const;

export interface PageErrorSummary {
  scriptErrors: number;
  unhandledRejections: number;
  total: number;
  finish: 'stop' | 'timeout' | 'limit';
  observedMs: number;
}

export interface PageErrorCapture {
  identity: string;
  generation: number;
  sourceTabId: number;
  value: PageErrorSummary;
}

export type PageErrorFailure =
  | 'denied'
  | 'unsupported'
  | 'source-unavailable'
  | 'normal-window-required'
  | 'interrupted'
  | 'invalid-result'
  | 'connection-failed';

export type PageErrorOutcome =
  { status: 'success'; value: PageErrorSummary } | { status: PageErrorFailure };

export interface PageErrorDriver {
  // Arm cancellation before awaiting work. Abort discards; Stop retains a summary.
  start: (
    sourceTabId: number,
    signal: AbortSignal,
    onObserving: () => void,
  ) => Promise<
    { status: 'success'; value: unknown } | { status: PageErrorFailure }
  >;
  stop: () => void;
}

interface Snapshot {
  phase:
    'unbound' | 'ready' | 'starting' | 'observing' | 'stopping' | 'finished';
  outcome: PageErrorOutcome | null;
}

export const pageErrorFailureMessages: Record<PageErrorFailure, string> = {
  denied: 'Page-inspection access was declined. No check result was collected.',
  unsupported: 'The required page-error observation APIs are unavailable.',
  'source-unavailable':
    'The original source tab is unavailable. Open a fresh check from the page you want to test.',
  'normal-window-required':
    'Page-error checks require a verified normal browser window. Private or unclassifiable windows are excluded.',
  interrupted:
    'The observation was interrupted. No confirmed error counts are available. Reloading or leaving the document ends this attempt.',
  'invalid-result':
    'The page returned an invalid or incomplete observation. No error counts are shown.',
  'connection-failed':
    'The check could not establish or finish its observation connection. No confirmed error counts are available.',
};

export function copyPageErrorSummary(input: unknown): PageErrorSummary | null {
  try {
    if (typeof input !== 'object' || input === null || Array.isArray(input))
      return null;
    const fields = Object.getOwnPropertyDescriptors(input);
    const keys = [
      'scriptErrors',
      'unhandledRejections',
      'total',
      'finish',
      'observedMs',
    ];
    if (
      Reflect.ownKeys(input).length !== keys.length ||
      keys.some((key) => !fields[key] || !('value' in fields[key]))
    )
      return null;
    const scriptErrors: unknown = fields.scriptErrors?.value;
    const unhandledRejections: unknown = fields.unhandledRejections?.value;
    const total: unknown = fields.total?.value;
    const finish: unknown = fields.finish?.value;
    const observedMs: unknown = fields.observedMs?.value;
    const count = (value: unknown): value is number =>
      typeof value === 'number' &&
      Number.isSafeInteger(value) &&
      value >= 0 &&
      value <= pageErrorLimits.events;
    if (
      !count(scriptErrors) ||
      !count(unhandledRejections) ||
      !count(total) ||
      total !== scriptErrors + unhandledRejections ||
      (finish !== 'stop' && finish !== 'timeout' && finish !== 'limit') ||
      typeof observedMs !== 'number' ||
      !Number.isFinite(observedMs) ||
      observedMs < 0 ||
      observedMs > pageErrorLimits.durationMs ||
      (finish === 'limit' && total !== pageErrorLimits.events) ||
      (total === pageErrorLimits.events && finish !== 'limit') ||
      (finish === 'timeout' && observedMs !== pageErrorLimits.durationMs) ||
      (finish === 'stop' && observedMs === pageErrorLimits.durationMs)
    )
      return null;
    const result: PageErrorSummary = {
      scriptErrors,
      unhandledRejections,
      total,
      finish,
      observedMs,
    };
    return new TextEncoder().encode(JSON.stringify(result)).length <=
      pageErrorLimits.summaryBytes
      ? result
      : null;
  } catch {
    return null;
  }
}

export function createPageErrorCheck(
  api: Pick<InspectorBrowser, 'permissions'>,
  driver: PageErrorDriver,
  context: BrowserContext,
) {
  let sourceTabId: number | null = null;
  let generation = 0;
  let disposed = false;
  let attachmentUsed = false;
  let attachmentReservation: symbol | null = null;
  let controller = new AbortController();
  let snapshot: Snapshot = { phase: 'unbound', outcome: null };
  const subscribers = new Set<() => void>();
  const notify = () => subscribers.forEach((subscriber) => subscriber());

  const clear = () => {
    generation += 1;
    attachmentUsed = false;
    attachmentReservation = null;
    controller.abort();
    controller = new AbortController();
    snapshot = {
      phase: sourceTabId === null ? 'unbound' : 'ready',
      outcome: null,
    };
    notify();
  };
  const onRemoved: Parameters<
    typeof api.permissions.onRemoved.addListener
  >[0] = (removed) => {
    if (
      removed.permissions?.some((name) =>
        ['management', 'scripting'].includes(name),
      )
    )
      clear();
  };

  const identity = crypto.randomUUID();
  const matchesAttachment = (
    captureIdentity: string,
    expectedGeneration: number,
    tabId: number,
  ) =>
    !disposed &&
    captureIdentity === identity &&
    expectedGeneration === generation &&
    tabId === sourceTabId &&
    snapshot.phase === 'finished' &&
    snapshot.outcome?.status === 'success' &&
    !attachmentUsed;
  const isAttachmentCurrent = (
    captureIdentity: string,
    expectedGeneration: number,
    tabId: number,
  ) =>
    attachmentReservation === null &&
    matchesAttachment(captureIdentity, expectedGeneration, tabId);

  return {
    context,
    identity,
    label: `Page-error check ${identity.slice(0, 8)}`,
    getSnapshot: () => snapshot,
    getGeneration: () => generation,
    isAttachmentUsed: () => attachmentUsed,
    isAttachmentCurrent,
    getAttachmentCapture(): PageErrorCapture | null {
      const expectedGeneration = generation;
      const tabId = sourceTabId;
      const outcome = snapshot.outcome;
      if (
        tabId === null ||
        outcome?.status !== 'success' ||
        !isAttachmentCurrent(identity, expectedGeneration, tabId)
      )
        return null;
      const value = copyPageErrorSummary(outcome.value);
      if (
        !value ||
        snapshot.outcome !== outcome ||
        !isAttachmentCurrent(identity, expectedGeneration, tabId)
      )
        return null;
      return {
        identity,
        generation: expectedGeneration,
        sourceTabId: tabId,
        value,
      };
    },
    // The callback must commit synchronously and consult its guard immediately
    // before writing. A retained guard expires when this call returns.
    commitAttachment(
      captureIdentity: string,
      expectedGeneration: number,
      tabId: number,
      commitDestination: (stillCurrent: () => boolean) => boolean,
    ): boolean {
      if (
        typeof commitDestination !== 'function' ||
        !isAttachmentCurrent(captureIdentity, expectedGeneration, tabId)
      )
        return false;
      const outcome = snapshot.outcome;
      const reservation = Symbol();
      attachmentReservation = reservation;
      const stillCurrent = () =>
        attachmentReservation === reservation &&
        snapshot.outcome === outcome &&
        matchesAttachment(captureIdentity, expectedGeneration, tabId);
      let committed: boolean;
      try {
        committed = commitDestination(stillCurrent) === true;
      } catch {
        return false;
      } finally {
        if (attachmentReservation === reservation) attachmentReservation = null;
      }
      if (
        committed &&
        snapshot.outcome === outcome &&
        matchesAttachment(captureIdentity, expectedGeneration, tabId)
      ) {
        attachmentUsed = true;
        snapshot = { ...snapshot };
        for (const subscriber of [...subscribers]) {
          try {
            subscriber();
          } catch {
            // Acceptance has committed; a view subscriber cannot make it reusable.
          }
        }
      }
      return committed;
    },
    bindSource(tabId: number) {
      if (
        disposed ||
        sourceTabId !== null ||
        !Number.isSafeInteger(tabId) ||
        tabId < 0
      )
        return false;
      sourceTabId = tabId;
      snapshot = { phase: 'ready', outcome: null };
      notify();
      return true;
    },
    async start() {
      if (disposed || sourceTabId === null || snapshot.phase !== 'ready')
        return;
      const started = generation;
      const signal = controller.signal;
      snapshot = { phase: 'starting', outcome: null };
      notify();
      if (disposed || started !== generation || signal.aborted) return;
      let result: Awaited<ReturnType<PageErrorDriver['start']>>;
      try {
        result = await driver.start(sourceTabId, signal, () => {
          if (
            !disposed &&
            started === generation &&
            !signal.aborted &&
            snapshot.phase === 'starting'
          ) {
            snapshot = { phase: 'observing', outcome: null };
            notify();
          }
        });
      } catch {
        result = { status: 'connection-failed' };
      }
      if (disposed || started !== generation || signal.aborted) return;
      const status = result.status;
      const value =
        status === 'success' ? copyPageErrorSummary(result.value) : null;
      if (disposed || started !== generation || signal.aborted) return;
      const outcome: PageErrorOutcome =
        status !== 'success'
          ? { status }
          : value
            ? { status: 'success', value }
            : { status: 'invalid-result' };
      snapshot = { phase: 'finished', outcome };
      notify();
    },
    stop() {
      if (disposed || snapshot.phase !== 'observing') return;
      const started = generation;
      const activeController = controller;
      snapshot = { phase: 'stopping', outcome: null };
      notify();
      if (disposed || started !== generation || activeController.signal.aborted)
        return;
      try {
        driver.stop();
      } catch {
        if (
          disposed ||
          started !== generation ||
          activeController.signal.aborted
        )
          return;
        activeController.abort();
        if (disposed || started !== generation) return;
        snapshot = {
          phase: 'finished',
          outcome: { status: 'connection-failed' },
        };
        notify();
      }
    },
    clear,
    startOver: clear,
    dispose() {
      disposed = true;
      sourceTabId = null;
      clear();
      api.permissions.onRemoved.removeListener(onRemoved);
    },
    subscribe(subscriber: () => void) {
      if (!disposed && subscribers.size === 0)
        api.permissions.onRemoved.addListener(onRemoved);
      subscribers.add(subscriber);
      return () => {
        subscribers.delete(subscriber);
        if (subscribers.size === 0) {
          api.permissions.onRemoved.removeListener(onRemoved);
          clear();
        }
      };
    },
  };
}

export type PageErrorCheck = ReturnType<typeof createPageErrorCheck>;
