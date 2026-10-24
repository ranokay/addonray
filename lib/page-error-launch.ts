import type { Browser } from 'wxt/browser';
import type { Result } from './inspector';
import type { PageErrorCheck } from './page-error-check';

interface TabContext {
  id?: number | undefined;
  incognito?: boolean | undefined;
  active?: boolean | undefined;
}
export interface PageErrorLaunchBrowser {
  extension: { getViews(query: { type: 'tab' | 'popup' }): unknown[] };
  runtime: { getURL(path: '/popup.html' | '/page-error.html'): string };
  tabs: {
    query(query: Browser.tabs.QueryInfo): Promise<TabContext[]>;
    create(options: Browser.tabs.CreateProperties): Promise<TabContext>;
    update(
      tabId: number,
      options: Browser.tabs.UpdateProperties,
    ): Promise<unknown>;
    getCurrent(): Promise<TabContext | undefined>;
  };
}
interface Source {
  sourceTabId: number;
  normal: true;
  launchId: string;
}
interface CheckEndpoint {
  matches(ownerTabId: number, sender: ErrorLaunchView): Promise<boolean>;
  bind(
    ownerTabId: number,
    sourceTabId: number,
    sender: ErrorLaunchView,
  ): Promise<boolean>;
}
export interface ErrorLaunchView {
  location: { href: string };
  addonrayErrorSource?: { current(): Source | null };
  addonrayErrorCheck?: CheckEndpoint;
}

function isView(value: unknown): value is ErrorLaunchView {
  if (typeof value !== 'object' || value === null || !('location' in value))
    return false;
  const location: unknown = value.location;
  return (
    typeof location === 'object' &&
    location !== null &&
    'href' in location &&
    typeof location.href === 'string'
  );
}

function popupSource(
  api: PageErrorLaunchBrowser,
  sender: ErrorLaunchView,
): Source | null {
  if (
    !api.extension.getViews({ type: 'popup' }).includes(sender) ||
    sender.location.href !== api.runtime.getURL('/popup.html')
  )
    return null;
  const value = sender.addonrayErrorSource?.current();
  const id = value?.sourceTabId;
  const launchId = value?.launchId;
  return value?.normal === true &&
    typeof id === 'number' &&
    Number.isSafeInteger(id) &&
    id >= 0 &&
    typeof launchId === 'string' &&
    /^[a-f0-9-]{36}$/.test(launchId)
    ? { sourceTabId: id, normal: true, launchId }
    : null;
}

function sameSource(left: Source | null, right: Source) {
  return (
    left?.sourceTabId === right.sourceTabId && left.launchId === right.launchId
  );
}

export function installPageErrorBinding(
  api: PageErrorLaunchBrowser,
  check: PageErrorCheck,
  view: ErrorLaunchView,
) {
  let live = true;
  const endpoint: CheckEndpoint = {
    async matches(ownerTabId, sender) {
      try {
        const source = popupSource(api, sender);
        if (
          !live ||
          !Number.isSafeInteger(ownerTabId) ||
          ownerTabId < 0 ||
          source === null ||
          check.getSnapshot().phase !== 'unbound' ||
          view.location.href !== api.runtime.getURL('/page-error.html')
        )
          return false;
        const { id, active, incognito } = (await api.tabs.getCurrent()) ?? {};
        return (
          live &&
          check.getSnapshot().phase === 'unbound' &&
          id === ownerTabId &&
          active === false &&
          incognito === false &&
          sameSource(popupSource(api, sender), source)
        );
      } catch {
        return false;
      }
    },
    async bind(ownerTabId, sourceTabId, sender) {
      try {
        const source = popupSource(api, sender);
        if (
          !Number.isSafeInteger(sourceTabId) ||
          sourceTabId < 0 ||
          sourceTabId === ownerTabId ||
          source?.sourceTabId !== sourceTabId ||
          !(await endpoint.matches(ownerTabId, sender))
        )
          return false;
        if (!live || !sameSource(popupSource(api, sender), source))
          return false;
        return check.bindSource(sourceTabId);
      } catch {
        return false;
      }
    },
  };
  view.addonrayErrorCheck = endpoint;
  return () => {
    live = false;
    if (view.addonrayErrorCheck === endpoint) delete view.addonrayErrorCheck;
  };
}

export function createPageErrorLauncher(
  api: PageErrorLaunchBrowser,
  view: ErrorLaunchView,
) {
  let live = true;
  let busy = false;
  let activating = false;
  let generation = 0;
  let cancelLaunch: (() => void) | null = null;
  let source: Source | null = null;
  const endpoint = { current: () => (live && source ? { ...source } : null) };
  view.addonrayErrorSource = endpoint;
  const unavailable = (): Result<null> => ({
    status: 'unavailable',
    reason:
      'The page-error check could not bind its source. Open a fresh check from the page you want to test.',
  });

  return {
    async open(): Promise<Result<null>> {
      if (!live || busy) return unavailable();
      busy = true;
      activating = false;
      source = null;
      const started = ++generation;
      const current = () => live && started === generation;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const cancelled = new Promise<Result<null>>((resolve) => {
        cancelLaunch = () => {
          if (started === generation) {
            generation++;
            source = null;
          }
          resolve(unavailable());
        };
        timer = setTimeout(cancelLaunch, 5000);
      });
      const work = async (): Promise<Result<null>> => {
        const selected = await api.tabs
          .query({ active: true, currentWindow: true })
          .then(([tab]) => ({ id: tab?.id, incognito: tab?.incognito }));
        if (!current()) return unavailable();
        if (selected.incognito !== false)
          return {
            status: 'unavailable',
            reason:
              'Page-error checks require verified normal browser windows. Private or unclassifiable windows are excluded.',
          };
        if (
          typeof selected.id !== 'number' ||
          !Number.isSafeInteger(selected.id) ||
          selected.id < 0
        )
          return unavailable();
        source = {
          sourceTabId: selected.id,
          normal: true,
          launchId: crypto.randomUUID(),
        };
        const created = await api.tabs
          .create({
            url: api.runtime.getURL('/page-error.html'),
            active: false,
          })
          .then(({ id, active }) => ({ id, active }));
        if (
          !current() ||
          created.active !== false ||
          typeof created.id !== 'number' ||
          !Number.isSafeInteger(created.id) ||
          created.id < 0
        )
          return unavailable();
        while (current()) {
          for (const candidate of api.extension
            .getViews({ type: 'tab' })
            .slice(0, 64)) {
            if (!current()) return unavailable();
            let verifying = false;
            try {
              if (
                !isView(candidate) ||
                candidate.location.href !==
                  api.runtime.getURL('/page-error.html')
              )
                continue;
              const receiver = candidate.addonrayErrorCheck;
              if (!receiver) continue;
              verifying = true;
              const matched = await receiver.matches(created.id, view);
              // Window proxies can survive a reload while their endpoint changes.
              // Never bind a replacement document under an earlier launch.
              if (candidate.addonrayErrorCheck !== receiver)
                return unavailable();
              if (!matched) continue;
              if (
                !current() ||
                !(await receiver.bind(created.id, selected.id, view)) ||
                candidate.addonrayErrorCheck !== receiver ||
                !current()
              )
                return unavailable();
              // Activation closes the popup only after the receiver owns its binding.
              activating = true;
              await api.tabs.update(created.id, { active: true });
              return { status: 'success', value: null };
            } catch {
              if (verifying) return unavailable();
              // A dead view without a discovered endpoint is not a destination.
            }
          }
          await new Promise((resolve) => setTimeout(resolve, 20));
        }
        return unavailable();
      };
      try {
        return await Promise.race([work(), cancelled]);
      } catch {
        return unavailable();
      } finally {
        clearTimeout(timer);
        cancelLaunch = null;
        if (started === generation) generation++;
        source = null;
        activating = false;
        busy = false;
      }
    },
    dispose() {
      live = false;
      if (!activating) cancelLaunch?.();
      source = null;
      if (view.addonrayErrorSource === endpoint)
        delete view.addonrayErrorSource;
    },
  };
}
