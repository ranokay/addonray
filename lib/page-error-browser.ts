import type { Browser } from 'wxt/browser';
import type { BrowserContext } from './browser-target';
import {
  copyPageErrorSummary,
  pageErrorLimits,
  type PageErrorDriver,
  type PageErrorFailure,
  type PageErrorOutcome,
  type PageErrorSummary,
} from './page-error-check';
import {
  installErrorSupervisor,
  observeMainErrors,
} from './page-error-observer';

type TabIdentity = { id?: number | undefined; incognito?: boolean | undefined };

type SupervisorInjection = {
  target: { tabId: number; frameIds: number[] };
  world: 'ISOLATED';
  func: typeof installErrorSupervisor;
  args: [string, boolean, string, number, number];
};
type MainInjection = {
  target: { tabId: number; frameIds: number[] };
  world: 'MAIN';
  func: typeof observeMainErrors;
  args: [string, number, number];
};
export type PageErrorInjection = SupervisorInjection | MainInjection;
export interface PageErrorFrame {
  frameId: number;
  result?: unknown;
}

export interface PageErrorPort {
  postMessage: (message: unknown) => void;
  disconnect: () => void;
  onMessage: {
    addListener: (listener: (message: unknown) => void) => void;
    removeListener: (listener: (message: unknown) => void) => void;
  };
  onDisconnect: {
    addListener: (listener: () => void) => void;
    removeListener: (listener: () => void) => void;
  };
}

export interface PageErrorBrowserApi {
  permissions: {
    request: (permissions: Browser.permissions.Permissions) => Promise<boolean>;
    contains: (
      permissions: Browser.permissions.Permissions,
    ) => Promise<boolean>;
  };
  tabs: {
    get: (tabId: number) => Promise<TabIdentity>;
    getCurrent: () => Promise<TabIdentity | undefined>;
    connect: (
      tabId: number,
      options: { frameId: number; name: string },
    ) => PageErrorPort;
  };
  scripting?: {
    executeScript: (injection: PageErrorInjection) => Promise<PageErrorFrame[]>;
  };
  runtime: { getURL: (path: '/page-error.html') => string };
}

interface ActiveRun {
  closed: boolean;
  observing: boolean;
  stopRequested: boolean;
  port: PageErrorPort | null;
}

function tabIdentity(tab: TabIdentity | undefined) {
  return { id: tab?.id, incognito: tab?.incognito };
}

function dataField(input: unknown, key: string): unknown {
  if (typeof input !== 'object' || input === null) return undefined;
  const descriptor = Object.getOwnPropertyDescriptor(input, key);
  return descriptor && 'value' in descriptor ? descriptor.value : undefined;
}

function frameResult(results: unknown): { value: unknown } | null {
  if (!Array.isArray(results) || results.length !== 1) return null;
  const frame: unknown = results[0];
  return dataField(frame, 'frameId') === 0
    ? { value: dataField(frame, 'result') }
    : null;
}

export function createPageErrorDriver(
  api: PageErrorBrowserApi,
  context: BrowserContext,
): PageErrorDriver {
  let active: ActiveRun | null = null;

  return {
    start(sourceTabId, signal, onObserving) {
      if (signal.aborted) return Promise.resolve({ status: 'interrupted' });
      if (!Number.isSafeInteger(sourceTabId) || sourceTabId < 0)
        return Promise.resolve({ status: 'source-unavailable' });
      if (active && !active.closed)
        return Promise.resolve({ status: 'connection-failed' });

      const run: ActiveRun = {
        closed: false,
        observing: false,
        stopRequested: false,
        port: null,
      };
      active = run;
      const token = crypto.randomUUID();
      const completion = Promise.withResolvers<PageErrorOutcome>();
      const useMain = context.target === 'chrome';
      let setupTimer: ReturnType<typeof setTimeout> | undefined;
      let deliveryTimer: ReturnType<typeof setTimeout> | undefined;
      let observationRequested = false;
      let supervisorReady = false;
      let accepting = false;
      let bufferedSummary: PageErrorSummary | null = null;
      const current = () => active === run && !run.closed && !signal.aborted;

      function closePort(port: PageErrorPort) {
        try {
          port.onMessage.removeListener(onMessage);
          port.onDisconnect.removeListener(onDisconnect);
        } catch {
          // Current-run checks still reject callbacks from an invalidated API.
        }
        try {
          port.postMessage({ kind: 'discard' });
        } catch {
          // A detached source still needs a bounded local outcome.
        }
        try {
          port.disconnect();
        } catch {
          // The browser may have disconnected the source first.
        }
      }
      function settle(outcome: PageErrorOutcome) {
        if (run.closed) return;
        run.closed = true;
        bufferedSummary = null;
        clearTimeout(setupTimer);
        clearTimeout(deliveryTimer);
        signal.removeEventListener('abort', onAbort);
        const port = run.port;
        run.port = null;
        if (port) closePort(port);
        if (active === run) active = null;
        completion.resolve(outcome);
      }
      const fail = (status: PageErrorFailure) => settle({ status });
      function onAbort() {
        fail('interrupted');
      }
      function onDisconnect() {
        fail('interrupted');
      }

      async function verifyAccess(): Promise<PageErrorFailure | null> {
        let source: ReturnType<typeof tabIdentity>;
        try {
          source = tabIdentity(await api.tabs.get(sourceTabId));
        } catch {
          return 'source-unavailable';
        }
        if (!current()) return 'interrupted';
        const owner = tabIdentity(await api.tabs.getCurrent());
        if (!current()) return 'interrupted';
        if (
          source.id !== sourceTabId ||
          typeof owner.id !== 'number' ||
          !Number.isSafeInteger(owner.id) ||
          owner.id < 0 ||
          owner.id === sourceTabId
        )
          return 'source-unavailable';
        if (source.incognito !== false || owner.incognito !== false)
          return 'normal-window-required';
        const granted = await api.permissions.contains({
          permissions: ['scripting'],
        });
        if (!current()) return 'interrupted';
        return granted ? null : 'interrupted';
      }

      async function finishAccepted(summary: PageErrorSummary) {
        if (!current()) return;
        if (summary.finish === 'stop' && !run.stopRequested) {
          fail('interrupted');
          return;
        }
        const failure = await verifyAccess();
        if (!current()) return;
        if (failure) fail(failure);
        else settle({ status: 'success', value: summary });
      }

      async function accept(input: unknown) {
        if (!current() || accepting) return;
        accepting = true;
        const summary = copyPageErrorSummary(input);
        if (!current()) return;
        if (!summary) {
          const finish = dataField(input, 'finish');
          if (!current()) return;
          fail(
            finish === 'interrupted' ||
              finish === 'navigation' ||
              finish === 'cancelled'
              ? 'interrupted'
              : 'invalid-result',
          );
          return;
        }
        if (!run.observing) {
          // MAIN completion and isolated readiness use different browser channels.
          // Retain only validated counts until the same run's acknowledgment.
          if (useMain && observationRequested) bufferedSummary = summary;
          else fail('interrupted');
          return;
        }
        await finishAccepted(summary);
      }

      async function beginObservation() {
        const failure = await verifyAccess();
        if (!current()) return;
        if (failure) {
          fail(failure);
          return;
        }
        observationRequested = true;
        if (useMain) {
          const results = await api.scripting?.executeScript({
            target: { tabId: sourceTabId, frameIds: [0] },
            world: 'MAIN',
            func: observeMainErrors,
            args: [token, pageErrorLimits.durationMs, pageErrorLimits.events],
          });
          if (!current()) return;
          const frame = frameResult(results);
          if (!current()) return;
          if (!frame) fail('invalid-result');
          else await accept(frame.value);
        } else {
          run.port?.postMessage({ kind: 'start' });
        }
      }

      function onMessage(message: unknown) {
        if (!current()) return;
        try {
          const kind = dataField(message, 'kind');
          if (!current()) return;
          if (kind === 'supervisor-ready' && !supervisorReady) {
            supervisorReady = true;
            void beginObservation().catch(() => {
              if (current()) fail('interrupted');
            });
          } else if (kind === 'observing' && observationRequested) {
            if (run.observing) return;
            run.observing = true;
            clearTimeout(setupTimer);
            deliveryTimer = setTimeout(
              () => fail('interrupted'),
              pageErrorLimits.durationMs + 3000,
            );
            onObserving();
            const pending = bufferedSummary;
            bufferedSummary = null;
            if (pending && current())
              void finishAccepted(pending).catch(() => {
                if (current()) fail('interrupted');
              });
          } else if (kind === 'interrupted') {
            fail('interrupted');
          } else if (kind === 'result' && !useMain) {
            const value = dataField(message, 'value');
            if (!current()) return;
            void accept(value).catch(() => {
              if (current()) fail('interrupted');
            });
          } else if (kind !== 'supervisor-ready') {
            fail('invalid-result');
          }
        } catch {
          if (current()) fail('invalid-result');
        }
      }

      signal.addEventListener('abort', onAbort, { once: true });
      let consent: Promise<boolean>;
      try {
        // This request must remain in the caller's Start gesture.
        consent = api.permissions.request({ permissions: ['scripting'] });
      } catch {
        fail('unsupported');
        return completion.promise;
      }
      void (async () => {
        const granted = await consent;
        if (!current()) return;
        if (!granted) {
          fail('denied');
          return;
        }
        // Optional namespaces may appear only after the browser grants access.
        if (!api.scripting?.executeScript || !api.tabs.connect) {
          fail('unsupported');
          return;
        }
        setupTimer = setTimeout(() => fail('connection-failed'), 5000);
        const failure = await verifyAccess();
        if (!current()) return;
        if (failure) {
          fail(failure);
          return;
        }
        const ownerUrl = api.runtime.getURL('/page-error.html');
        const results = await api.scripting.executeScript({
          target: { tabId: sourceTabId, frameIds: [0] },
          world: 'ISOLATED',
          func: installErrorSupervisor,
          args: [
            token,
            useMain,
            ownerUrl,
            pageErrorLimits.durationMs,
            pageErrorLimits.events,
          ],
        });
        if (!current()) return;
        const frame = frameResult(results);
        if (
          !frame ||
          dataField(frame.value, 'installed') !== true ||
          dataField(frame.value, 'topFrame') !== true ||
          dataField(frame.value, 'incognito') !== false
        ) {
          if (current()) fail('invalid-result');
          return;
        }
        if (!current()) return;
        const port = api.tabs.connect(sourceTabId, { frameId: 0, name: token });
        if (!current()) {
          closePort(port);
          return;
        }
        run.port = port;
        port.onMessage.addListener(onMessage);
        if (!current()) return;
        port.onDisconnect.addListener(onDisconnect);
      })().catch(() => {
        if (current()) fail('connection-failed');
      });
      return completion.promise;
    },
    stop() {
      const run = active;
      if (!run || run.closed || !run.observing || run.stopRequested) return;
      run.stopRequested = true;
      run.port?.postMessage({ kind: 'stop' });
    },
  };
}
