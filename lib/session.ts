import {
  capturePage,
  loadInventory,
  type ExtensionEntry,
  type InspectorBrowser,
  type PageObservation,
  type TimingSnapshot,
  type Result,
} from './inspector';
import { firefoxContext, type BrowserContext } from './browser-target';

interface Snapshot {
  inventory: Result<ExtensionEntry[]> | null;
  page: Result<PageObservation> | null;
  inventoryBusy: boolean;
  pageBusy: boolean;
}

function emptySnapshot(): Snapshot {
  return { inventory: null, page: null, inventoryBusy: false, pageBusy: false };
}

export function createSession(
  api: InspectorBrowser,
  context: BrowserContext = firefoxContext,
) {
  let snapshot = emptySnapshot();
  let generation = 0;
  let controller = new AbortController();
  const subscribers = new Set<() => void>();
  let captureId = 0;
  let capture: {
    id: number;
    sourceTabId: number;
    incognito: boolean | null;
    timings: TimingSnapshot;
  } | null = null;
  let consumed = false;
  const notify = () => subscribers.forEach((subscriber) => subscriber());

  const clear = () => {
    controller.abort();
    controller = new AbortController();
    generation += 1;
    capture = null;
    consumed = false;
    snapshot = emptySnapshot();
    notify();
  };

  const onRemoved: Parameters<
    typeof api.permissions.onRemoved.addListener
  >[0] = (removed) => {
    if (
      removed.permissions?.some((permission) =>
        ['management', 'scripting'].includes(permission),
      )
    ) {
      clear();
    }
  };

  return {
    context,
    getSnapshot: () => snapshot,
    getTimingCapture: () => capture,
    isTimingCaptureCurrent: (id: number) =>
      capture?.id === id && !consumed && !snapshot.pageBusy,
    consumeTimingCapture(id: number, sourceTabId: number) {
      if (
        capture?.id !== id ||
        capture.sourceTabId !== sourceTabId ||
        capture.incognito !== false ||
        consumed ||
        snapshot.pageBusy
      )
        return false;
      consumed = true;
      snapshot = { ...snapshot };
      notify();
      return true;
    },
    clear,
    subscribe(subscriber: () => void) {
      if (subscribers.size === 0)
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
    async loadInventory() {
      if (snapshot.inventoryBusy) return;
      const started = generation;
      snapshot = { ...snapshot, inventory: null, inventoryBusy: true };
      notify();
      const inventory = await loadInventory(api, controller.signal, context);
      if (started !== generation) return;
      snapshot = { ...snapshot, inventory, inventoryBusy: false };
      notify();
    },
    async inspectPage() {
      if (snapshot.pageBusy) return;
      const started = generation;
      capture = null;
      consumed = false;
      const id = ++captureId;
      snapshot = { ...snapshot, page: null, pageBusy: true };
      notify();
      const result = await capturePage(api, controller.signal, context);
      if (started !== generation) return;
      const page: Result<PageObservation> =
        result.status === 'success'
          ? { status: 'success', value: result.value.observation }
          : result;
      if (result.status === 'success') {
        capture = {
          id,
          sourceTabId: result.value.sourceTabId,
          incognito: result.value.incognito,
          timings: result.value.observation.timings,
        };
      }
      snapshot = { ...snapshot, page, pageBusy: false };
      notify();
    },
  };
}

export type InspectorSession = ReturnType<typeof createSession>;
