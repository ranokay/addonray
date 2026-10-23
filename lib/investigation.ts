import { loadInventory, type InventoryBrowser, type Result } from './inspector';
import type { BrowserContext } from './browser-target';
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
}

function emptySnapshot(): Snapshot {
  return { before: null, after: null, busy: null, assessment: null };
}

export function createInvestigation(
  api: InventoryBrowser,
  context: BrowserContext,
) {
  let snapshot = emptySnapshot();
  let generation = 0;
  let controller = new AbortController();
  const subscribers = new Set<() => void>();
  const notify = () => subscribers.forEach((subscriber) => subscriber());

  const startOver = () => {
    controller.abort();
    controller = new AbortController();
    generation += 1;
    snapshot = emptySnapshot();
    notify();
  };

  const onRemoved: Parameters<
    typeof api.permissions.onRemoved.addListener
  >[0] = (removed) => {
    if (removed.permissions?.includes('management')) startOver();
  };

  async function capture(slot: 'before' | 'after') {
    if (snapshot.busy || snapshot[slot]?.status === 'success') return;
    if (slot === 'after' && snapshot.before?.status !== 'success') return;
    const started = generation;
    snapshot = { ...snapshot, [slot]: null, busy: slot };
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
