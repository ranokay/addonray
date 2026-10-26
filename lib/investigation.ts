import {
  copyTimingSnapshot,
  loadInventory,
  type InventoryBrowser,
  type Result,
  type TimingSnapshot,
} from './inspector';
import type { BrowserContext } from './browser-target';
import {
  copyPageErrorSummary,
  type PageErrorSummary,
} from './page-error-check';
import {
  pageAssessments,
  type InventorySnapshot,
  type PageAssessment,
} from './comparison';

interface Snapshot {
  before: Result<InventorySnapshot> | null;
  after: Result<InventorySnapshot> | null;
  busy: 'before' | 'after' | null;
  assessment: PageAssessment | null;
  timingBefore: TimingSnapshot | null;
  timingAfter: TimingSnapshot | null;
  errorBefore: PageErrorSummary | null;
  errorAfter: PageErrorSummary | null;
  afterStarted: boolean;
}

function emptySnapshot(): Snapshot {
  return {
    before: null,
    after: null,
    busy: null,
    assessment: null,
    timingBefore: null,
    timingAfter: null,
    errorBefore: null,
    errorAfter: null,
    afterStarted: false,
  };
}

export function createInvestigation(
  api: InventoryBrowser,
  context: BrowserContext,
) {
  let snapshot = emptySnapshot();
  let generation = 0;
  let sourceTabId: number | null = null;
  const identity = crypto.randomUUID();
  let controller = new AbortController();
  const subscribers = new Set<() => void>();
  const notify = () => subscribers.forEach((subscriber) => subscriber());
  const matchesSource = (tabId: number) =>
    Number.isSafeInteger(tabId) &&
    tabId >= 0 &&
    (sourceTabId === null || sourceTabId === tabId);
  const eligible = (kind: 'timing' | 'error', slot: 'before' | 'after') =>
    !snapshot.busy &&
    snapshot.before?.status === 'success' &&
    (slot === 'before'
      ? !snapshot.afterStarted &&
        !snapshot[kind === 'timing' ? 'timingBefore' : 'errorBefore']
      : snapshot.after?.status === 'success' &&
        !!snapshot[kind === 'timing' ? 'timingBefore' : 'errorBefore'] &&
        !snapshot[kind === 'timing' ? 'timingAfter' : 'errorAfter']);

  const startOver = () => {
    controller.abort();
    controller = new AbortController();
    generation += 1;
    sourceTabId = null;
    snapshot = emptySnapshot();
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
      startOver();
  };

  async function capture(slot: 'before' | 'after') {
    if (snapshot.busy || snapshot[slot]?.status === 'success') return;
    if (slot === 'after' && snapshot.before?.status !== 'success') return;
    const started = generation;
    snapshot = {
      ...snapshot,
      [slot]: null,
      busy: slot,
      afterStarted: snapshot.afterStarted || slot === 'after',
    };
    notify();
    const result = await loadInventory(api, controller.signal, context);
    if (started !== generation) return;
    // Retain only the fields displayed by this comparison, never permission/host metadata.
    const retained: Result<InventorySnapshot> =
      result.status === 'success'
        ? {
            status: 'success',
            value: result.value.map(({ id, name, version, enabled }) => ({
              id,
              name,
              version,
              enabled,
            })),
          }
        : result;
    snapshot = { ...snapshot, [slot]: retained, busy: null };
    notify();
  }

  return {
    context,
    identity,
    label: `Investigation ${identity.slice(0, 8)}`,
    getGeneration: () => generation,
    timingSides() {
      return (['before', 'after'] as const).filter((side) =>
        eligible('timing', side),
      );
    },
    errorSides() {
      return (['before', 'after'] as const).filter((side) =>
        eligible('error', side),
      );
    },
    attachError(
      slot: 'before' | 'after',
      tabId: number,
      input: unknown,
      expectedGeneration: number,
      commitSource: (commitDestination: () => boolean) => boolean,
    ): Result<null> {
      const current = () =>
        expectedGeneration === generation &&
        eligible('error', slot) &&
        matchesSource(tabId);
      if (!current())
        return {
          status: 'error',
          reason:
            'That error side changed, is filled, or requires the same browser tab. Discover destinations again.',
        };
      const summary = copyPageErrorSummary(input);
      if (!summary || !current())
        return {
          status: 'error',
          reason: 'The error attachment is invalid or no longer available.',
        };
      let accepting = true;
      let committed = false;
      try {
        commitSource(() => {
          if (!accepting || committed || !current()) return false;
          // Only private writes occur here. Source consumption precedes notifications.
          sourceTabId = tabId;
          snapshot = {
            ...snapshot,
            [slot === 'before' ? 'errorBefore' : 'errorAfter']: summary,
          };
          committed = true;
          return true;
        });
      } catch {
        // A dead sender cannot turn an already accepted copy into another transfer.
      } finally {
        accepting = false;
      }
      if (!committed)
        return {
          status: 'cancelled',
          reason: 'This check or investigation changed. Choose again.',
        };
      try {
        notify();
      } catch {
        /* Acceptance must survive a subscriber failure. */
      }
      return { status: 'success', value: null };
    },
    attachTiming(
      slot: 'before' | 'after',
      tabId: number,
      input: unknown,
      expectedGeneration: number,
      consume?: () => boolean,
    ): Result<null> {
      if (expectedGeneration !== generation)
        return {
          status: 'error',
          reason:
            'This investigation was reset. Choose its current destination again.',
        };
      if (!eligible('timing', slot))
        return {
          status: 'error',
          reason:
            'That timing side is unavailable or already filled. Start over for another attempt.',
        };
      if (!matchesSource(tabId))
        return {
          status: 'error',
          reason:
            'Capture timings from the same browser tab as the existing attachments. Its URL and title are not collected.',
        };
      const timings = copyTimingSnapshot(input);
      if (
        !timings ||
        expectedGeneration !== generation ||
        !eligible('timing', slot) ||
        !matchesSource(tabId)
      )
        return {
          status: 'error',
          reason: 'The timing attachment is invalid or unavailable.',
        };
      if (consume && !consume())
        return {
          status: 'cancelled',
          reason:
            'The page capture was cleared, replaced, or already attached.',
        };
      if (
        expectedGeneration !== generation ||
        !eligible('timing', slot) ||
        !matchesSource(tabId)
      )
        return {
          status: 'cancelled',
          reason: 'This investigation was cleared.',
        };
      sourceTabId = tabId;
      snapshot = {
        ...snapshot,
        [slot === 'before' ? 'timingBefore' : 'timingAfter']: timings,
      };
      notify();
      return { status: 'success', value: null };
    },
    getSnapshot: () => snapshot,
    startOver,
    subscribe(subscriber: () => void) {
      if (subscribers.size === 0)
        api.permissions.onRemoved.addListener(onRemoved);
      subscribers.add(subscriber);
      return () => {
        subscribers.delete(subscriber);
        if (subscribers.size === 0) {
          api.permissions.onRemoved.removeListener(onRemoved);
          startOver();
        }
      };
    },
    captureBefore: () => capture('before'),
    captureAfter: () => capture('after'),
    setAssessment(value: PageAssessment) {
      if (
        snapshot.before?.status !== 'success' ||
        snapshot.after?.status !== 'success' ||
        !pageAssessments.includes(value)
      )
        return;
      snapshot = { ...snapshot, assessment: value };
      notify();
    },
  };
}

export type Investigation = ReturnType<typeof createInvestigation>;
