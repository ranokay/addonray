import {
  inspectPage,
  loadInventory,
  type ExtensionEntry,
  type InspectorBrowser,
  type PageObservation,
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
  const notify = () => subscribers.forEach((subscriber) => subscriber());

  const clear = () => {
    controller.abort();
    controller = new AbortController();
    generation += 1;
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
      snapshot = { ...snapshot, page: null, pageBusy: true };
      notify();
      const page = await inspectPage(api, controller.signal, context);
      if (started !== generation) return;
      snapshot = { ...snapshot, page, pageBusy: false };
      notify();
    },
  };
}

export type InspectorSession = ReturnType<typeof createSession>;
