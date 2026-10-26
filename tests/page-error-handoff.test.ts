import { beforeEach, expect, it, vi } from 'bun:test';
import { runInNewContext } from 'node:vm';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { browser } from './browser';
import { getBrowserContext } from '../lib/browser-target';
import { createInvestigation } from '../lib/investigation';
import {
  createPageErrorCheck,
  type PageErrorDriver,
  type PageErrorOutcome,
  type PageErrorSummary,
} from '../lib/page-error-check';
import {
  createPageErrorHandoff,
  installInvestigationErrorHandoff,
  type PageErrorDestination,
  type PageErrorHandoffBrowser,
  type PageErrorView,
} from '../lib/page-error-handoff';

const summary = (update: Partial<PageErrorSummary> = {}): PageErrorSummary => ({
  scriptErrors: 2,
  unhandledRejections: 1,
  total: 3,
  finish: 'stop',
  observedMs: 1200,
  ...update,
});
const timings = () => ({
  domContentLoaded: { status: 'measured', milliseconds: 12 } as const,
  loadEvent: { status: 'unrecorded' } as const,
  firstContentfulPaint: { status: 'measured', milliseconds: 0 } as const,
});

beforeEach(() => {
  fakeBrowser.reset();
  vi.restoreAllMocks();
  vi.spyOn(browser.permissions.onRemoved, 'addListener').mockImplementation(
    () => {},
  );
  vi.spyOn(browser.permissions.onRemoved, 'removeListener').mockImplementation(
    () => {},
  );
  vi.spyOn(browser.permissions, 'request').mockResolvedValue(true);
  vi.spyOn(browser.management, 'getAll').mockResolvedValue([]);
});

async function fixture(
  options: {
    target?: 'firefox' | 'chrome';
    sourceTabId?: number;
    outcome?: PageErrorOutcome;
    sourcePrivate?: boolean | null;
    receiverPrivate?: boolean | null;
  } = {},
) {
  const context = getBrowserContext(options.target ?? 'firefox');
  const investigation = createInvestigation(browser, context);
  const other = createInvestigation(browser, context);
  const receiverSubscription = investigation.subscribe(vi.fn());
  const otherSubscription = other.subscribe(vi.fn());
  await investigation.captureBefore();
  await other.captureBefore();
  const driver: PageErrorDriver = {
    start: vi.fn<PageErrorDriver['start']>(
      async () => options.outcome ?? { status: 'success', value: summary() },
    ),
    stop: vi.fn(),
  };
  const check = createPageErrorCheck(browser, driver, context);
  check.bindSource(options.sourceTabId ?? 17);
  await check.start();
  const source: PageErrorView = {
    location: { href: 'extension://own/page-error.html' },
  };
  const first: PageErrorView = {
    location: { href: 'extension://own/investigation.html' },
  };
  const second: PageErrorView = {
    location: { href: 'extension://own/investigation.html' },
  };
  const views: unknown[] = [source, first, second];
  function api(privateFlag: boolean | null = false): PageErrorHandoffBrowser {
    return {
      extension: { getViews: vi.fn(() => views) },
      runtime: { getURL: (path) => `extension://own${path}` },
      permissions: { contains: vi.fn(async () => true) },
      tabs: {
        getCurrent: vi.fn(async () =>
          privateFlag === null ? undefined : { incognito: privateFlag },
        ),
      },
    };
  }
  const sourceApi = api(options.sourcePrivate);
  const receiverApi = api(options.receiverPrivate);
  const removeFirst = installInvestigationErrorHandoff(
    receiverApi,
    investigation,
    first,
  );
  const removeSecond = installInvestigationErrorHandoff(
    receiverApi,
    other,
    second,
  );
  const handoff = createPageErrorHandoff(sourceApi, check, source);
  async function selected(): Promise<PageErrorDestination> {
    const result = await handoff.listDestinations();
    if (result.status !== 'success') throw new Error(result.reason);
    const destination = result.value.find(
      (entry) => entry.identity === investigation.identity,
    );
    if (!destination) throw new Error('Missing eligible investigation');
    return destination;
  }
  return {
    investigation,
    other,
    check,
    driver,
    source,
    first,
    second,
    views,
    sourceApi,
    receiverApi,
    handoff,
    selected,
    removeFirst,
    removeSecond,
    close() {
      handoff.dispose();
      removeFirst();
      removeSecond();
      receiverSubscription();
      otherSubscription();
    },
  };
}

for (const target of ['firefox', 'chrome'] as const) {
  it(`discovers only copied metadata and delivers solely to the selected ${target} investigation`, async () => {
    const f = await fixture({ target });
    const first = f.first.addonrayErrorInvestigation;
    const second = f.second.addonrayErrorInvestigation;
    if (!first || !second) throw new Error('Missing endpoints');
    const receive = vi.spyOn(first, 'receive');
    const otherReceive = vi.spyOn(second, 'receive');
    const list = await f.handoff.listDestinations();
    expect(list.status).toBe('success');
    if (list.status !== 'success') throw new Error('Missing metadata');
    expect(list.value).toHaveLength(2);
    expect(Object.keys(list.value[0]!).sort()).toEqual([
      'generation',
      'identity',
      'label',
      'sides',
    ]);
    expect(JSON.stringify(list.value)).not.toContain('sourceTabId');
    expect(JSON.stringify(list.value)).not.toContain('scriptErrors');
    expect(receive).not.toHaveBeenCalled();
    expect(otherReceive).not.toHaveBeenCalled();
    expect(await f.handoff.attach(await f.selected(), 'before')).toEqual({
      status: 'success',
      value: null,
    });
    expect(f.investigation.getSnapshot().errorBefore).toEqual(summary());
    expect(f.other.getSnapshot().errorBefore).toBeNull();
    expect(f.check.isAttachmentUsed()).toBe(true);
    expect(Object.keys(receive.mock.calls[0]![0] as object).sort()).toEqual([
      'actionId',
      'generation',
      'identity',
      'side',
    ]);
    expect(otherReceive).not.toHaveBeenCalled();
    expect(f.driver.start).toHaveBeenCalledTimes(1);
    f.close();
  });

  it(`retains its own ${target} copy after donor reset and disposal without exposing the source ID`, async () => {
    const f = await fixture({ target });
    const capture = f.check.getAttachmentCapture();
    if (!capture) throw new Error('Missing capture');
    await f.handoff.attach(await f.selected(), 'before');
    capture.value.scriptErrors = 99;
    f.check.clear();
    f.handoff.dispose();
    f.views.splice(f.views.indexOf(f.source), 1);
    expect(f.investigation.getSnapshot().errorBefore).toEqual(summary());
    expect(f.investigation.getSnapshot().errorBefore).not.toBe(capture.value);
    expect(JSON.stringify(f.investigation.getSnapshot())).not.toContain(
      'sourceTabId',
    );
    f.close();
  });
}

it.each([
  summary(),
  summary({ finish: 'timeout', observedMs: 30000 }),
  summary({
    scriptErrors: 199,
    total: 200,
    finish: 'limit',
    observedMs: 0.001,
  }),
])(
  'accepts every confirmed completion kind without changing counts or duration',
  async (value) => {
    const f = await fixture({ outcome: { status: 'success', value } });
    expect((await f.handoff.attach(await f.selected(), 'before')).status).toBe(
      'success',
    );
    expect(f.investigation.getSnapshot().errorBefore).toEqual(value);
    f.close();
  },
);

it.each(['denied', 'interrupted', 'invalid-result'] as const)(
  'rejects a %s donor with no confirmed summary',
  async (status) => {
    const f = await fixture({ outcome: { status } });
    expect((await f.handoff.listDestinations()).status).toBe('unavailable');
    expect(f.investigation.getSnapshot().errorBefore).toBeNull();
    f.close();
  },
);

it('never uses an unbound, ready or in-flight check as an error sender', async () => {
  const f = await fixture();
  const selected = await f.selected();
  f.check.clear();
  expect((await f.handoff.listDestinations()).status).toBe('unavailable');
  const result =
    Promise.withResolvers<Awaited<ReturnType<PageErrorDriver['start']>>>();
  vi.spyOn(f.driver, 'start').mockImplementation(() => result.promise);
  const pending = f.check.start();
  expect((await f.handoff.attach(selected, 'before')).status).not.toBe(
    'success',
  );
  f.check.clear();
  result.resolve({ status: 'interrupted' });
  await pending;
  f.check.dispose();
  expect((await f.handoff.listDestinations()).status).toBe('unavailable');
  expect(f.investigation.getSnapshot().errorBefore).toBeNull();
  f.close();
});

it('owns foreign discovery arrays and records after the destination disappears', async () => {
  const f = await fixture();
  const endpoint = f.first.addonrayErrorInvestigation;
  if (!endpoint) throw new Error('Missing endpoint');
  const foreign: unknown = runInNewContext(
    `({identity:${JSON.stringify(f.investigation.identity)},label:${JSON.stringify(f.investigation.label)},generation:0,sides:['before']})`,
  );
  vi.spyOn(endpoint, 'metadata').mockResolvedValue(
    foreign as PageErrorDestination,
  );
  const selected = await f.selected();
  expect(Object.getPrototypeOf(selected)).toBe(Object.prototype);
  expect(Object.getPrototypeOf(selected.sides)).toBe(Array.prototype);
  f.removeFirst();
  expect(selected.sides).toEqual(['before']);
  expect((await f.handoff.attach(selected, 'before')).status).toBe('error');
  expect(f.check.isAttachmentUsed()).toBe(false);
  f.close();
});

it('consumes a completed check once and rejects concurrent or later duplicate confirmation', async () => {
  const f = await fixture();
  const selected = await f.selected();
  const first = f.handoff.attach(selected, 'before');
  const second = f.handoff.attach(selected, 'before');
  expect((await second).status).toBe('error');
  expect((await first).status).toBe('success');
  expect((await f.handoff.attach(selected, 'before')).status).not.toBe(
    'success',
  );
  expect((await f.handoff.listDestinations()).status).toBe('unavailable');
  expect(f.other.getSnapshot().errorBefore).toBeNull();
  expect(f.check.getSnapshot().outcome?.status).toBe('success');
  f.close();
});

for (const action of ['reset', 'reload', 'close'] as const) {
  it(`rejects a ${action} selected investigation without choosing another one`, async () => {
    const f = await fixture();
    const selected = await f.selected();
    if (action === 'reset') {
      f.investigation.startOver();
      await f.investigation.captureBefore();
    } else {
      f.removeFirst();
      f.views.splice(f.views.indexOf(f.first), 1);
      if (action === 'reload') {
        const replacement = createInvestigation(
          browser,
          getBrowserContext('firefox'),
        );
        await replacement.captureBefore();
        const view: PageErrorView = {
          location: { href: f.first.location.href },
        };
        f.views.push(view);
        installInvestigationErrorHandoff(f.receiverApi, replacement, view);
      }
    }
    expect((await f.handoff.attach(selected, 'before')).status).toBe('error');
    expect(f.check.isAttachmentUsed()).toBe(false);
    expect(f.investigation.getSnapshot().errorBefore).toBeNull();
    expect(f.other.getSnapshot().errorBefore).toBeNull();
    f.close();
  });
}

for (const changed of [
  'donor-clear',
  'donor-new-attempt',
  'donor-close',
  'donor-reload',
  'receiver-reset',
  'receiver-close',
] as const) {
  it(`rejects pending work after ${changed} while preserving valid existing observations`, async () => {
    const f = await fixture();
    const selected = await f.selected();
    const grant = Promise.withResolvers<boolean>();
    const entered = Promise.withResolvers<void>();
    vi.spyOn(f.receiverApi.permissions, 'contains').mockImplementation(() => {
      entered.resolve();
      return grant.promise;
    });
    const pending = f.handoff.attach(selected, 'before');
    await entered.promise;
    if (changed === 'donor-clear') f.check.clear();
    if (changed === 'donor-new-attempt') {
      f.check.clear();
      await f.check.start();
    }
    if (changed === 'donor-close') {
      f.handoff.dispose();
      f.views.splice(f.views.indexOf(f.source), 1);
    }
    if (changed === 'donor-reload') {
      f.handoff.dispose();
      const replacement: PageErrorView = {
        location: { href: f.source.location.href },
      };
      f.views.splice(f.views.indexOf(f.source), 1, replacement);
    }
    if (changed === 'receiver-reset') {
      f.investigation.startOver();
      await f.investigation.captureBefore();
    }
    if (changed === 'receiver-close') {
      f.removeFirst();
      f.views.splice(f.views.indexOf(f.first), 1);
    }
    grant.resolve(true);
    expect((await pending).status).not.toBe('success');
    expect(f.investigation.getSnapshot().errorBefore).toBeNull();
    expect(f.other.getSnapshot().before?.status).toBe('success');
    if (changed === 'donor-new-attempt') {
      expect(f.check.getAttachmentCapture()).not.toBeNull();
      expect(f.check.isAttachmentUsed()).toBe(false);
    }
    f.close();
  });
}

it('closes Before after the After inventory starts, even if that capture fails', async () => {
  const f = await fixture();
  const selected = await f.selected();
  vi.spyOn(browser.management, 'getAll').mockRejectedValueOnce(
    new Error('private detail'),
  );
  await f.investigation.captureAfter();
  expect((await f.handoff.attach(selected, 'before')).status).toBe('error');
  expect(f.investigation.getSnapshot().before?.status).toBe('success');
  expect(f.check.isAttachmentUsed()).toBe(false);
  f.close();
});

it('enforces one shared source binding for error-first and timing-first attachment orders', async () => {
  const errorFirst = await fixture();
  await errorFirst.handoff.attach(await errorFirst.selected(), 'before');
  expect(
    errorFirst.investigation.attachTiming('before', 18, timings(), 0).status,
  ).toBe('error');
  expect(
    errorFirst.investigation.attachTiming('before', 17, timings(), 0).status,
  ).toBe('success');
  errorFirst.close();
  const timingFirst = await fixture({ sourceTabId: 18 });
  expect(
    timingFirst.investigation.attachTiming('before', 17, timings(), 0).status,
  ).toBe('success');
  expect(
    (await timingFirst.handoff.attach(await timingFirst.selected(), 'before'))
      .status,
  ).toBe('error');
  expect(timingFirst.investigation.getSnapshot().timingBefore).toEqual(
    timings(),
  );
  expect(timingFirst.investigation.getSnapshot().errorBefore).toBeNull();
  expect(timingFirst.check.isAttachmentUsed()).toBe(false);
  timingFirst.close();
});

it('accepts After only after its inventory and Before error attachment exist', async () => {
  const f = await fixture();
  await f.handoff.attach(await f.selected(), 'before');
  await f.investigation.captureAfter();
  f.check.startOver();
  await f.check.start();
  const selected = await f.selected();
  expect(selected.sides).toEqual(['after']);
  expect((await f.handoff.attach(selected, 'after')).status).toBe('success');
  expect(f.investigation.getSnapshot().errorAfter).toEqual(summary());
  expect(f.investigation.errorSides()).toEqual([]);
  f.close();
});

for (const owner of ['source', 'receiver'] as const) {
  for (const privateFlag of [true, null]) {
    it(`excludes ${privateFlag} ${owner} contexts from discovery and transfer`, async () => {
      const f = await fixture({
        ...(owner === 'source'
          ? { sourcePrivate: privateFlag }
          : { receiverPrivate: privateFlag }),
      });
      const result = await f.handoff.listDestinations();
      if (owner === 'source') expect(result.status).toBe('unavailable');
      else expect(result).toEqual({ status: 'success', value: [] });
      expect(f.investigation.getSnapshot().errorBefore).toBeNull();
      expect(f.check.isAttachmentUsed()).toBe(false);
      f.close();
    });
  }
  it(`bounds ${owner} classification and grant exceptions without leaking details`, async () => {
    const f = await fixture();
    const selected = await f.selected();
    const api = owner === 'source' ? f.sourceApi : f.receiverApi;
    vi.spyOn(api.tabs, 'getCurrent').mockRejectedValue(
      new Error('PRIVATE_CONTEXT_VALUE'),
    );
    const result = await f.handoff.attach(selected, 'before');
    expect(result.status).not.toBe('success');
    expect(JSON.stringify(result)).not.toContain('PRIVATE_CONTEXT_VALUE');
    expect(f.check.isAttachmentUsed()).toBe(false);
    f.close();
  });
}

for (const permission of ['management', 'scripting'] as const) {
  it(`clears investigation copies and invalidates pending actions on ${permission} revocation`, async () => {
    const f = await fixture();
    await f.handoff.attach(await f.selected(), 'before');
    await f.investigation.captureAfter();
    f.investigation.setAssessment('worse');
    const add = vi.spyOn(browser.permissions.onRemoved, 'addListener');
    for (const [listener] of add.mock.calls)
      listener({ permissions: [permission] });
    expect(f.investigation.getSnapshot().before).toBeNull();
    expect(f.investigation.getSnapshot().errorBefore).toBeNull();
    expect(f.investigation.getSnapshot().assessment).toBeNull();
    expect(f.check.getSnapshot().outcome).toBeNull();
    expect(f.check.isAttachmentUsed()).toBe(false);
    f.close();
  });
}

it('rejects unrelated packaged pages, fake non-view senders and unselected requests', async () => {
  const f = await fixture();
  const receiver = f.first.addonrayErrorInvestigation;
  if (!receiver) throw new Error('Missing receiver');
  const senderEndpoint = f.source.addonrayErrorSender;
  if (!senderEndpoint) throw new Error('Missing sender');
  const other: PageErrorView = {
    location: { href: 'extension://own/other.html' },
    addonrayErrorSender: senderEndpoint,
  };
  f.views.push(other);
  const forged: PageErrorView = {
    location: { href: f.source.location.href },
    addonrayErrorSender: senderEndpoint,
  };
  for (const sender of [other, forged]) {
    expect(await receiver.metadata(sender)).toBeNull();
    expect((await receiver.receive({}, sender)).status).not.toBe('success');
  }
  expect(
    (
      await receiver.receive(
        {
          identity: f.investigation.identity,
          generation: 0,
          side: 'before',
          actionId: crypto.randomUUID(),
        },
        f.source,
      )
    ).status,
  ).not.toBe('success');
  expect(f.investigation.getSnapshot().errorBefore).toBeNull();
  expect(f.check.isAttachmentUsed()).toBe(false);
  f.close();
});

it('bounds view discovery, never enumerates source pages and ignores invalid metadata accessors', async () => {
  const f = await fixture();
  const query = vi.spyOn(browser.tabs, 'query');
  const get = vi.spyOn(fakeBrowser.tabs, 'get');
  const execute = vi.spyOn(browser.scripting, 'executeScript');
  const endpoint = f.first.addonrayErrorInvestigation;
  if (!endpoint) throw new Error('Missing endpoint');
  const getter = vi.fn(() => {
    throw new Error('PRIVATE_METADATA');
  });
  vi.spyOn(endpoint, 'metadata').mockResolvedValue(
    Object.defineProperty({}, 'identity', {
      get: getter,
    }) as PageErrorDestination,
  );
  const result = await f.handoff.listDestinations();
  expect(result.status).toBe('success');
  expect(getter).not.toHaveBeenCalled();
  expect(query).not.toHaveBeenCalled();
  expect(get).not.toHaveBeenCalled();
  expect(execute).not.toHaveBeenCalled();
  for (let i = 0; i < 33; i++)
    f.views.push({ location: { href: 'extension://own/other.html' } });
  expect((await f.handoff.listDestinations()).status).toBe('unavailable');
  f.close();
});

it('revokes the action permit after timeout so a late receiver cannot commit or consume the check', async () => {
  const f = await fixture();
  const selected = await f.selected();
  const endpoint = f.first.addonrayErrorInvestigation;
  if (!endpoint) throw new Error('Missing endpoint');
  const original = endpoint.receive;
  const held = Promise.withResolvers<void>();
  let releaseResult: ReturnType<typeof original> | undefined;
  vi.spyOn(endpoint, 'receive').mockImplementation(async (...args) => {
    await held.promise;
    releaseResult = original(...args);
    return releaseResult;
  });
  const result = await f.handoff.attach(selected, 'before');
  expect(result.status).toBe('error');
  expect(f.check.isAttachmentUsed()).toBe(false);
  held.resolve();
  await Promise.resolve();
  await releaseResult;
  expect(f.investigation.getSnapshot().errorBefore).toBeNull();
  expect(f.check.isAttachmentUsed()).toBe(false);
  vi.spyOn(endpoint, 'receive').mockImplementation(original);
  expect((await f.handoff.attach(await f.selected(), 'before')).status).toBe(
    'success',
  );
  f.close();
}, 8000);

it('reports an uncertain used check after acknowledgment loss and cannot duplicate the committed copy', async () => {
  const f = await fixture();
  const selected = await f.selected();
  const endpoint = f.first.addonrayErrorInvestigation;
  if (!endpoint) throw new Error('Missing endpoint');
  const original = endpoint.receive;
  vi.spyOn(endpoint, 'receive').mockImplementation(async (...args) => {
    await original(...args);
    throw new Error('PRIVATE_DEAD_VIEW');
  });
  const result = await f.handoff.attach(selected, 'before');
  expect(result.status).toBe('error');
  if (result.status === 'success')
    throw new Error('Expected uncertain outcome');
  expect(result.reason).toContain('has been used');
  expect(JSON.stringify(result)).not.toContain('PRIVATE_DEAD_VIEW');
  expect(f.investigation.getSnapshot().errorBefore).toEqual(summary());
  expect(f.check.isAttachmentUsed()).toBe(true);
  expect((await f.handoff.attach(selected, 'before')).status).not.toBe(
    'success',
  );
  expect(f.other.getSnapshot().errorBefore).toBeNull();
  f.close();
});

for (const owner of ['source', 'receiver'] as const) {
  for (const changed of ['private', 'unknown', 'exception'] as const) {
    it(`rejects a ${changed} ${owner} classification after an awaited grant`, async () => {
      const f = await fixture();
      const selected = await f.selected();
      const grant = Promise.withResolvers<boolean>();
      const entered = Promise.withResolvers<void>();
      // Hold the destination's own grant recheck after initial normal classifications.
      vi.spyOn(f.receiverApi.permissions, 'contains').mockImplementationOnce(
        () => {
          entered.resolve();
          return grant.promise;
        },
      );
      const pending = f.handoff.attach(selected, 'before');
      await entered.promise;
      const api = owner === 'source' ? f.sourceApi : f.receiverApi;
      const context = vi.spyOn(api.tabs, 'getCurrent');
      if (changed === 'exception')
        context.mockRejectedValue(new Error('PRIVATE_LATE_CONTEXT'));
      else
        context.mockResolvedValue(
          changed === 'private' ? { incognito: true } : undefined,
        );
      grant.resolve(true);
      const result = await pending;
      expect(result.status).not.toBe('success');
      expect(JSON.stringify(result)).not.toContain('PRIVATE_LATE_CONTEXT');
      expect(f.investigation.getSnapshot().errorBefore).toBeNull();
      expect(f.check.isAttachmentUsed()).toBe(false);
      f.close();
    });
  }
  it(`clears only the observed ${owner} owner when its grant confirmation reports access missing`, async () => {
    const f = await fixture();
    const selected = await f.selected();
    const api = owner === 'source' ? f.sourceApi : f.receiverApi;
    vi.spyOn(api.permissions, 'contains').mockResolvedValue(false);
    expect((await f.handoff.attach(selected, 'before')).status).not.toBe(
      'success',
    );
    expect(f.investigation.getSnapshot().errorBefore).toBeNull();
    if (owner === 'source') expect(f.check.getSnapshot().outcome).toBeNull();
    else expect(f.investigation.getSnapshot().before).toBeNull();
    f.close();
  });
}

it('rejects a getter or malformed source summary without consuming or reading raw values', async () => {
  const f = await fixture();
  const selected = await f.selected();
  const sender = f.source.addonrayErrorSender;
  const capture = f.check.getAttachmentCapture();
  if (!sender || !capture) throw new Error('Missing source');
  const getter = vi.fn(() => {
    throw new Error('PRIVATE_ERROR_DETAIL');
  });
  const malicious = Object.defineProperty({ ...capture }, 'value', {
    get: getter,
  });
  vi.spyOn(sender, 'read').mockReturnValue(malicious);
  const result = await f.handoff.attach(selected, 'before');
  expect(result.status).not.toBe('success');
  expect(getter).not.toHaveBeenCalled();
  expect(JSON.stringify(result)).not.toContain('PRIVATE_ERROR_DETAIL');
  expect(f.check.isAttachmentUsed()).toBe(false);
  expect(f.investigation.getSnapshot().errorBefore).toBeNull();
  f.close();
});

for (const owner of ['source', 'receiver'] as const) {
  it(`bounds ${owner} permission API exceptions without a new consent request`, async () => {
    const f = await fixture();
    const selected = await f.selected();
    const requests = vi.spyOn(browser.permissions, 'request');
    const countBefore = requests.mock.calls.length;
    const api = owner === 'source' ? f.sourceApi : f.receiverApi;
    vi.spyOn(api.permissions, 'contains').mockRejectedValue(
      new Error('PRIVATE_PERMISSION_DETAIL'),
    );
    const result = await f.handoff.attach(selected, 'before');
    expect(result.status).not.toBe('success');
    expect(JSON.stringify(result)).not.toContain('PRIVATE_PERMISSION_DETAIL');
    expect(requests.mock.calls.length).toBe(countBefore);
    expect(f.check.isAttachmentUsed()).toBe(false);
    expect(f.investigation.getSnapshot().errorBefore).toBeNull();
    f.close();
  });
}

it('rejects invalid summary invariants at the receiving boundary without consuming the check', async () => {
  const f = await fixture();
  const selected = await f.selected();
  const sender = f.source.addonrayErrorSender;
  const capture = f.check.getAttachmentCapture();
  if (!sender || !capture) throw new Error('Missing source');
  vi.spyOn(sender, 'read').mockReturnValue({
    ...capture,
    value: summary({ total: 99 }),
  });
  expect((await f.handoff.attach(selected, 'before')).status).not.toBe(
    'success',
  );
  expect(f.check.isAttachmentUsed()).toBe(false);
  expect(f.investigation.getSnapshot().errorBefore).toBeNull();
  f.close();
});
