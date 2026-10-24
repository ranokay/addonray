import { afterEach, expect, it, vi } from 'bun:test';
import type { Browser } from 'wxt/browser';
import {
  installErrorSupervisor,
  observeMainErrors,
} from '../lib/page-error-observer';

function event<Listener extends (...args: never[]) => void>() {
  const listeners = new Set<Listener>();
  return {
    listeners,
    addListener: (listener: Listener) => {
      listeners.add(listener);
    },
    removeListener: (listener: Listener) => {
      listeners.delete(listener);
    },
    hasListener: (listener: Listener) => listeners.has(listener),
    hasListeners: () => listeners.size > 0,
    getRules: async () => [],
    addRules: async () => [],
    removeRules: async () => {},
  };
}

const globals = new Map<string, PropertyDescriptor | undefined>();
const frames: EventTarget[] = [];
function setGlobal(name: string, value: unknown) {
  if (!globals.has(name))
    globals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
  Object.defineProperty(globalThis, name, {
    value,
    configurable: true,
    writable: true,
  });
}

function fixture(useMain = false, privateContext = false) {
  let clock = 1000;
  vi.spyOn(performance, 'now').mockImplementation(() => clock);
  const frame = new EventTarget();
  frames.push(frame);
  Object.defineProperty(frame, 'top', { value: frame });
  const doc = new EventTarget();
  const connects = event<(port: Browser.runtime.Port) => void>();
  const messages =
    event<(message: unknown, port: Browser.runtime.Port) => void>();
  const disconnects = event<(port: Browser.runtime.Port) => void>();
  const sent: unknown[] = [];
  const token = crypto.randomUUID();
  const ownerUrl = 'moz-extension://fixture/page-error.html';
  const port: Browser.runtime.Port = {
    name: token,
    sender: { id: 'fixture', url: ownerUrl },
    postMessage: (message: unknown) => {
      sent.push(message);
    },
    disconnect: () => {},
    onMessage: messages,
    onDisconnect: disconnects,
  };
  setGlobal('window', frame);
  setGlobal('document', doc);
  setGlobal('browser', {
    runtime: { id: 'fixture', onConnect: connects },
    extension: { inIncognitoContext: privateContext },
  });
  const installed = installErrorSupervisor(
    token,
    useMain,
    ownerUrl,
    30_000,
    200,
  );
  return {
    token,
    frame,
    doc,
    port,
    sent,
    installed,
    connects,
    clock: (value: number) => {
      clock = value;
    },
    connect: () => {
      for (const listener of connects.listeners) listener(port);
    },
    message: (message: unknown) => {
      for (const listener of messages.listeners) listener(message, port);
    },
    disconnect: () => {
      for (const listener of disconnects.listeners) listener(port);
    },
    emit: (type: string) => frame.dispatchEvent(new Event(type)),
  };
}

afterEach(() => {
  for (const frame of frames) frame.dispatchEvent(new Event('pagehide'));
  frames.length = 0;
  for (const [key, descriptor] of globals) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else Reflect.deleteProperty(globalThis, key);
  }
  globals.clear();
  vi.restoreAllMocks();
});

it('isolated observation starts only after its own verified connection and explicit start, without reading event payloads', () => {
  const current = fixture();
  expect(current.installed).toEqual({
    installed: true,
    topFrame: true,
    incognito: false,
  });
  current.emit('error');
  current.connect();
  expect(current.sent).toEqual([{ kind: 'supervisor-ready' }]);
  current.message({ kind: 'start' });
  let reads = 0;
  const error = new Event('error');
  Object.defineProperty(error, 'error', {
    get() {
      reads++;
      throw new Error('private');
    },
  });
  current.frame.dispatchEvent(error);
  const rejection = new Event('unhandledrejection');
  Object.defineProperty(rejection, 'reason', {
    get() {
      reads++;
      throw new Error('private');
    },
  });
  current.frame.dispatchEvent(rejection);
  current.clock(2200);
  current.message({ kind: 'stop' });
  expect(current.sent).toEqual([
    { kind: 'supervisor-ready' },
    { kind: 'observing' },
    {
      kind: 'result',
      value: {
        scriptErrors: 1,
        unhandledRejections: 1,
        total: 2,
        finish: 'stop',
        observedMs: 1200,
      },
    },
  ]);
  expect(reads).toBe(0);
  current.emit('error');
  expect(current.sent.length).toBe(3);
  expect(current.connects.hasListeners()).toBe(false);
});

it('isolated callbacks and Stop at the deadline complete as timeout even when the timer has not fired', () => {
  const current = fixture();
  current.connect();
  current.message({ kind: 'start' });
  current.clock(30_999);
  current.emit('error');
  current.clock(31_000);
  current.emit('unhandledrejection');
  current.message({ kind: 'stop' });
  expect(current.sent.at(-1)).toEqual({
    kind: 'result',
    value: {
      scriptErrors: 1,
      unhandledRejections: 0,
      total: 1,
      finish: 'timeout',
      observedMs: 30_000,
    },
  });
});

it('a late isolated Stop without a late event is also timeout', () => {
  const current = fixture();
  current.connect();
  current.message({ kind: 'start' });
  current.clock(31_001);
  current.message({ kind: 'stop' });
  expect(current.sent.at(-1)).toEqual({
    kind: 'result',
    value: {
      scriptErrors: 0,
      unhandledRejections: 0,
      total: 0,
      finish: 'timeout',
      observedMs: 30_000,
    },
  });
});

it('the actual event cap removes listeners at 200 rather than silently overflowing', () => {
  const current = fixture();
  current.connect();
  current.message({ kind: 'start' });
  for (let index = 0; index < 220; index++) current.emit('error');
  expect(current.sent.at(-1)).toEqual({
    kind: 'result',
    value: {
      scriptErrors: 200,
      unhandledRejections: 0,
      total: 200,
      finish: 'limit',
      observedMs: 0,
    },
  });
});

it('disconnect and discard remove the isolated observer without returning retained counts', () => {
  const current = fixture();
  current.connect();
  current.message({ kind: 'start' });
  current.emit('error');
  current.disconnect();
  current.emit('error');
  expect(current.sent).toEqual([
    { kind: 'supervisor-ready' },
    { kind: 'observing' },
  ]);
  expect(current.connects.hasListeners()).toBe(false);
});

it('pagehide signals interruption without treating partial counts as a completed zero or resuming', () => {
  const current = fixture();
  current.connect();
  current.message({ kind: 'start' });
  current.emit('error');
  current.emit('pagehide');
  current.emit('pageshow');
  current.emit('error');
  expect(current.sent).toEqual([
    { kind: 'supervisor-ready' },
    { kind: 'observing' },
    { kind: 'interrupted' },
  ]);
});

it('private contexts cannot begin isolated observation', () => {
  const current = fixture(false, true);
  expect(current.installed).toEqual({ installed: false });
  current.connect();
  current.message({ kind: 'start' });
  expect(current.sent).toEqual([]);
});

for (const sender of [
  { id: 'another-extension', url: 'moz-extension://fixture/page-error.html' },
  { id: 'fixture', url: 'moz-extension://fixture/popup.html' },
]) {
  it(`rejects a connection from the wrong owner ${sender.id}/${sender.url}`, () => {
    const current = fixture();
    current.port.sender = sender;
    current.connect();
    current.message({ kind: 'start' });
    current.emit('error');
    expect(current.sent).toEqual([]);
  });
}

it('MAIN does not install counting listeners when its owner has already disconnected', async () => {
  const current = fixture(true);
  current.connect();
  current.disconnect();
  const add = vi.spyOn(current.frame, 'addEventListener');
  const result = await observeMainErrors(current.token, 30_000, 200);
  expect(result).toEqual(expect.objectContaining({ finish: 'cancelled' }));
  expect(add).not.toHaveBeenCalled();
});

it('MAIN counts future events, reports only the fixed summary, and stops through its existing control connection', async () => {
  const current = fixture(true);
  current.connect();
  const result = observeMainErrors(current.token, 30_000, 200);
  current.emit('error');
  current.emit('unhandledrejection');
  current.clock(2250);
  current.message({ kind: 'stop' });
  expect(await result).toEqual({
    scriptErrors: 1,
    unhandledRejections: 1,
    total: 2,
    finish: 'stop',
    observedMs: 1250,
  });
  current.emit('error');
  expect(current.connects.hasListeners()).toBe(false);
});

it('MAIN applies the deadline before a delayed error callback and before a late Stop', async () => {
  const current = fixture(true);
  current.connect();
  const result = observeMainErrors(current.token, 30_000, 200);
  current.clock(31_000);
  current.emit('error');
  current.message({ kind: 'stop' });
  expect(await result).toEqual({
    scriptErrors: 0,
    unhandledRejections: 0,
    total: 0,
    finish: 'timeout',
    observedMs: 30_000,
  });
});

it('a MAIN Stop after its deadline returns timeout even without another error callback', async () => {
  const current = fixture(true);
  current.connect();
  const result = observeMainErrors(current.token, 30_000, 200);
  current.clock(31_000);
  current.message({ kind: 'stop' });
  expect(await result).toEqual({
    scriptErrors: 0,
    unhandledRejections: 0,
    total: 0,
    finish: 'timeout',
    observedMs: 30_000,
  });
});
