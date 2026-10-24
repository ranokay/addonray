import type { browser, Browser } from 'wxt/browser';

type ContentApi = Pick<typeof browser, 'runtime' | 'extension'>;

// Both injected functions are serialized by the browser and must stay self-contained.
export function installErrorSupervisor(
  token: string,
  useMain: boolean,
  ownerUrl: string,
  durationMs: number,
  cap: number,
) {
  const api: ContentApi | undefined =
    Reflect.get(globalThis, 'browser') ?? Reflect.get(globalThis, 'chrome');
  if (
    !api?.runtime?.onConnect ||
    api.extension?.inIncognitoContext !== false ||
    window !== window.top ||
    !/^[a-f0-9-]{36}$/.test(token) ||
    !Number.isSafeInteger(durationMs) ||
    durationMs <= 0 ||
    durationMs > 30_000 ||
    !Number.isSafeInteger(cap) ||
    cap <= 0 ||
    cap > 200
  )
    return { installed: false };

  const now = performance.now.bind(performance);
  const requestName = `addonray-error-request-${token}`;
  const controlName = `addonray-error-control-${token}`;
  let port: Browser.runtime.Port | null = null;
  let connected = false;
  let ended = false;
  let active = false;
  let start = 0;
  let deadline = 0;
  let scriptErrors = 0;
  let unhandledRejections = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let connectionTimer: ReturnType<typeof setTimeout> | undefined;
  const send = (message: unknown) => {
    try {
      port?.postMessage(message);
    } catch {
      // A closed owner must not turn page cleanup into an exception.
    }
  };
  const control = (value: 'alive' | 'stop' | 'discard') =>
    document.dispatchEvent(new CustomEvent(controlName, { detail: value }));

  function finish(
    reason: 'stop' | 'timeout' | 'limit' | 'cancelled' | 'interrupted',
    deliver = true,
  ) {
    if (ended) return;
    if (!useMain && active && reason === 'stop' && now() >= deadline)
      reason = 'timeout';
    ended = true;
    active = false;
    clearTimeout(timer);
    clearTimeout(connectionTimer);
    timer = undefined;
    connectionTimer = undefined;
    window.removeEventListener('error', onError);
    window.removeEventListener('unhandledrejection', onRejection);
    window.removeEventListener('pagehide', onHide);
    document.removeEventListener(requestName, onRequest);
    api?.runtime.onConnect.removeListener(onConnect);
    if (useMain) control(reason === 'stop' ? 'stop' : 'discard');
    if (!useMain && deliver)
      send({
        kind: 'result',
        value: {
          scriptErrors,
          unhandledRejections,
          total: scriptErrors + unhandledRejections,
          finish: reason,
          observedMs:
            reason === 'timeout'
              ? durationMs
              : Math.max(0, Math.min(durationMs, now() - start)),
        },
      });
  }

  function increment(kind: 'error' | 'rejection') {
    if (!active || ended) return;
    if (now() >= deadline) {
      finish('timeout');
      return;
    }
    if (kind === 'error') scriptErrors++;
    else unhandledRejections++;
    if (scriptErrors + unhandledRejections === cap) finish('limit');
  }
  function onError() {
    increment('error');
  }
  function onRejection() {
    increment('rejection');
  }
  function onHide() {
    finish('interrupted', false);
    send({ kind: 'interrupted' });
    try {
      port?.disconnect();
    } catch {
      // The document may already be detaching its connection.
    }
  }
  function onRequest(event: Event) {
    if (!('detail' in event) || typeof event.detail !== 'string') return;
    if (event.detail === 'preflight') {
      if (connected && !ended) control('alive');
    } else if (event.detail === 'ready') {
      if (!connected || ended) {
        control('discard');
        return;
      }
      if (active) return;
      active = true;
      send({ kind: 'observing' });
    }
  }
  function onConnect(value: Browser.runtime.Port) {
    if (
      ended ||
      connected ||
      value.name !== token ||
      value.sender?.id !== api?.runtime.id ||
      value.sender?.url !== ownerUrl
    )
      return;
    port = value;
    connected = true;
    clearTimeout(connectionTimer);
    connectionTimer = undefined;
    port.onMessage.addListener((message: unknown) => {
      if (
        typeof message !== 'object' ||
        message === null ||
        !('kind' in message)
      )
        return;
      if (message.kind === 'stop') finish('stop');
      else if (message.kind === 'discard') finish('cancelled', false);
      else if (message.kind === 'start' && !useMain && !active && !ended) {
        active = true;
        start = now();
        deadline = start + durationMs;
        window.addEventListener('error', onError);
        window.addEventListener('unhandledrejection', onRejection);
        timer = setTimeout(() => finish('timeout'), durationMs);
        send({ kind: 'observing' });
      }
    });
    port.onDisconnect.addListener(() => {
      connected = false;
      finish('cancelled', false);
    });
    send({ kind: 'supervisor-ready' });
  }

  api.runtime.onConnect.addListener(onConnect);
  document.addEventListener(requestName, onRequest);
  window.addEventListener('pagehide', onHide);
  connectionTimer = setTimeout(() => finish('cancelled', false), 3000);
  return { installed: true, topFrame: true, incognito: false };
}

export function observeMainErrors(
  token: string,
  durationMs: number,
  cap: number,
) {
  if (
    window !== window.top ||
    !/^[a-f0-9-]{36}$/.test(token) ||
    !Number.isSafeInteger(durationMs) ||
    durationMs <= 0 ||
    durationMs > 30_000 ||
    !Number.isSafeInteger(cap) ||
    cap <= 0 ||
    cap > 200
  )
    return Promise.resolve({ finish: 'cancelled' });

  const now = performance.now.bind(performance);
  const add = window.addEventListener.bind(window);
  const remove = window.removeEventListener.bind(window);
  const listen = document.addEventListener.bind(document);
  const unlisten = document.removeEventListener.bind(document);
  const dispatch = document.dispatchEvent.bind(document);
  const schedule = setTimeout.bind(window);
  const cancel = clearTimeout.bind(window);
  return new Promise((resolve) => {
    const requestName = `addonray-error-request-${token}`;
    const controlName = `addonray-error-control-${token}`;
    let alive = false;
    let active = false;
    let finished = false;
    let scriptErrors = 0;
    let unhandledRejections = 0;
    let start = 0;
    let deadline = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const request = (value: 'preflight' | 'ready') =>
      dispatch(new CustomEvent(requestName, { detail: value }));

    function finish(
      reason: 'stop' | 'timeout' | 'limit' | 'cancelled' | 'interrupted',
    ) {
      if (finished) return;
      if (active && reason === 'stop' && now() >= deadline) reason = 'timeout';
      finished = true;
      active = false;
      remove('error', onError);
      remove('unhandledrejection', onRejection);
      remove('pagehide', onHide);
      unlisten(controlName, onControl);
      cancel(timer);
      timer = undefined;
      resolve({
        scriptErrors,
        unhandledRejections,
        total: scriptErrors + unhandledRejections,
        finish: reason,
        observedMs:
          reason === 'timeout'
            ? durationMs
            : Math.max(0, Math.min(durationMs, now() - start)),
      });
    }
    function increment(kind: 'error' | 'rejection') {
      if (!active || finished) return;
      if (now() >= deadline) {
        finish('timeout');
        return;
      }
      if (kind === 'error') scriptErrors++;
      else unhandledRejections++;
      if (scriptErrors + unhandledRejections === cap) finish('limit');
    }
    function onError() {
      increment('error');
    }
    function onRejection() {
      increment('rejection');
    }
    function onHide() {
      finish('interrupted');
    }
    function onControl(event: Event) {
      if (!('detail' in event)) return;
      if (event.detail === 'alive') alive = true;
      else if (event.detail === 'stop') finish('stop');
      else if (event.detail === 'discard') finish('cancelled');
    }

    listen(controlName, onControl);
    request('preflight');
    if (!alive || finished) {
      finish('cancelled');
      return;
    }
    start = now();
    deadline = start + durationMs;
    active = true;
    add('error', onError);
    add('unhandledrejection', onRejection);
    add('pagehide', onHide);
    timer = schedule(() => finish('timeout'), durationMs);
    request('ready');
  });
}
