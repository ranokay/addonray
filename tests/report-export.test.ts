import { afterEach, beforeEach, expect, it, vi } from 'bun:test';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { browser } from './browser';
import { firefoxContext } from '../lib/browser-target';
import { createInvestigation } from '../lib/investigation';
import { createReportExport, type ReportBrowser } from '../lib/report-export';

const cleanup: Array<() => void> = [];
let onRemoved:
  Parameters<typeof browser.permissions.onRemoved.addListener>[0] | undefined;
beforeEach(() => {
  fakeBrowser.reset();
  vi.restoreAllMocks();
  onRemoved = undefined;
  vi.spyOn(browser.permissions.onRemoved, 'addListener').mockImplementation(
    (listener) => {
      onRemoved = listener;
    },
  );
  vi.spyOn(browser.permissions.onRemoved, 'removeListener').mockImplementation(
    () => {},
  );
  vi.spyOn(browser.management, 'getAll').mockResolvedValue([]);
});
afterEach(() => cleanup.splice(0).forEach((dispose) => dispose()));

async function fixture({
  complete = true,
  timing = false,
  beforeEntries,
  afterEntries,
}: {
  complete?: boolean;
  timing?: boolean;
  beforeEntries?: Awaited<ReturnType<typeof browser.management.getAll>>;
  afterEntries?: Awaited<ReturnType<typeof browser.management.getAll>>;
} = {}) {
  const request = vi
    .spyOn(browser.permissions, 'request')
    .mockResolvedValue(true);
  const model = createInvestigation(browser, firefoxContext);
  const api = {
    tabs: {
      getCurrent: vi.fn<ReportBrowser['tabs']['getCurrent']>(async () => ({
        incognito: false,
      })),
    },
    permissions: {
      contains: vi.fn<ReportBrowser['permissions']['contains']>(
        async () => true,
      ),
    },
  };
  const handoff = vi.fn((_text: string, _format: 'markdown' | 'json') => {});
  const exporter = createReportExport(api, model, handoff);
  const unsubscribe = exporter.subscribe(() => {});
  cleanup.push(() => {
    exporter.dispose();
    unsubscribe();
  });
  if (complete) {
    const getAll = browser.management
      .getAll as typeof browser.management.getAll & {
      mockResolvedValue(
        value: Awaited<ReturnType<typeof browser.management.getAll>>,
      ): void;
    };
    if (beforeEntries) getAll.mockResolvedValue(beforeEntries);
    await model.captureBefore();
    if (timing) {
      model.attachTiming(
        'before',
        42,
        {
          domContentLoaded: { status: 'measured', milliseconds: 10 },
          loadEvent: { status: 'unrecorded' },
          firstContentfulPaint: { status: 'unavailable' },
        },
        model.getGeneration(),
      );
    }
    if (afterEntries) getAll.mockResolvedValue(afterEntries);
    await model.captureAfter();
  }
  return { api, model, handoff, exporter, request, unsubscribe };
}

it('starts empty without inspecting context or requesting a download', async () => {
  const { api, handoff, exporter } = await fixture();
  expect(exporter.getSnapshot()).toEqual({
    format: 'markdown',
    preview: null,
    busy: false,
    message: null,
  });
  expect(api.tabs.getCurrent).not.toHaveBeenCalled();
  expect(api.permissions.contains).not.toHaveBeenCalled();
  await exporter.download();
  expect(handoff).not.toHaveBeenCalled();
});

it('requires two successful inventories, including valid empty inventories', async () => {
  const { api, model, exporter } = await fixture({ complete: false });
  await exporter.prepare();
  expect(exporter.getSnapshot().preview).toBeNull();
  expect(api.tabs.getCurrent).not.toHaveBeenCalled();
  await model.captureBefore();
  await exporter.prepare();
  expect(exporter.getSnapshot().preview).toBeNull();
  await model.captureAfter();
  await exporter.prepare();
  expect(exporter.getSnapshot().preview).toContain('# AddonRay');
});

it('hands off exactly the reviewed text only after a separate action and new checks', async () => {
  const { api, exporter, handoff, request } = await fixture();
  const requests = request.mock.calls.length;
  await exporter.prepare();
  const reviewed = exporter.getSnapshot().preview;
  expect(reviewed).not.toBeNull();
  if (reviewed === null) throw new Error('Missing report preview');
  expect(handoff).not.toHaveBeenCalled();
  expect(api.permissions.contains).toHaveBeenLastCalledWith({
    permissions: ['management'],
  });
  await exporter.download();
  expect(handoff.mock.calls).toEqual([[reviewed, 'markdown']]);
  expect(api.tabs.getCurrent).toHaveBeenCalledTimes(2);
  expect(api.permissions.contains).toHaveBeenCalledTimes(2);
  expect(browser.permissions.request).toHaveBeenCalledTimes(requests);
  expect(exporter.getSnapshot().message).toContain('Download requested');
  expect(exporter.getSnapshot().preview).toBe(reviewed);
});

it('prepares and hands off the exact schema JSON only after its own checks', async () => {
  const { api, exporter, handoff, request } = await fixture();
  const requests = request.mock.calls.length;
  exporter.setFormat('json');
  await exporter.prepare();
  const reviewed = exporter.getSnapshot().preview;
  if (reviewed === null) throw new Error('Missing JSON preview');
  expect(exporter.getSnapshot().format).toBe('json');
  expect(JSON.parse(reviewed)).toEqual({
    schemaVersion: 1,
    provenance: 'captured',
    report: {
      before: { extensions: [] },
      after: { extensions: [] },
      changes: [],
      assessment: null,
      timing: { before: null, after: null },
      pageErrors: { before: null, after: null },
      observationLimits: {
        pageErrorWindowMs: 30000,
        pageErrorEvents: 200,
        pageErrorSummaryBytes: 1024,
      },
    },
  });
  expect(handoff).not.toHaveBeenCalled();
  expect(api.permissions.contains).toHaveBeenLastCalledWith({
    permissions: ['management'],
  });
  await exporter.download();
  expect(handoff.mock.calls).toEqual([[reviewed, 'json']]);
  expect(api.tabs.getCurrent).toHaveBeenCalledTimes(2);
  expect(browser.permissions.request).toHaveBeenCalledTimes(requests);
  expect(exporter.getSnapshot().message).toContain('Download requested');
  expect(exporter.getSnapshot().preview).toBe(reviewed);
});

it('includes attached diagnostics in JSON and keeps the page-data permission guard', async () => {
  const { api, exporter, handoff } = await fixture({ timing: true });
  exporter.setFormat('json');
  await exporter.prepare();
  expect(api.permissions.contains).toHaveBeenLastCalledWith({
    permissions: ['management', 'scripting'],
  });
  const reviewed = exporter.getSnapshot().preview;
  if (reviewed === null) throw new Error('Missing JSON preview');
  const report = JSON.parse(reviewed).report;
  expect(report.timing.before).toEqual({
    domContentLoaded: { status: 'measured', milliseconds: 10 },
    loadEvent: { status: 'unrecorded' },
    firstContentfulPaint: { status: 'unavailable' },
  });
  expect(report.timing.after).toBeNull();
  expect(report.pageErrors).toEqual({ before: null, after: null });
  await exporter.download();
  expect(handoff.mock.calls).toEqual([[reviewed, 'json']]);
});

it('discards a Markdown preview when the selected format changes', async () => {
  const { exporter, handoff } = await fixture();
  await exporter.prepare();
  expect(exporter.getSnapshot().preview).toContain('# AddonRay');
  exporter.setFormat('json');
  expect(exporter.getSnapshot()).toMatchObject({
    format: 'json',
    preview: null,
    busy: false,
    message: null,
  });
  await exporter.download();
  expect(handoff).not.toHaveBeenCalled();
  exporter.setFormat('markdown');
  await exporter.prepare();
  expect(exporter.getSnapshot().preview).toContain('# AddonRay');
});

it('refuses over-limit JSON without truncation and keeps the live pair', async () => {
  const entries = Array.from({ length: 1000 }, (_, index) => ({
    id: `entry-${index}@test`,
    name: 'x'.repeat(4096),
    version: '1',
    enabled: true,
    type: 'extension' as const,
  })) as unknown as Awaited<ReturnType<typeof browser.management.getAll>>;
  const { exporter, model, handoff } = await fixture({
    beforeEntries: entries,
    afterEntries: entries,
  });
  exporter.setFormat('json');
  await exporter.prepare();
  expect(exporter.getSnapshot().busy).toBe(false);
  expect(exporter.getSnapshot().preview).toBeNull();
  expect(exporter.getSnapshot().message).toContain('1 MiB');
  expect(model.getSnapshot().before?.status).toBe('success');
  await exporter.download();
  expect(handoff).not.toHaveBeenCalled();
});

for (const context of [true, undefined]) {
  it(`rejects ${context === true ? 'private' : 'unclassified'} contexts without losing the investigation`, async () => {
    const { api, model, handoff, exporter } = await fixture();
    api.tabs.getCurrent.mockResolvedValue(
      context === undefined ? undefined : { incognito: context },
    );
    await exporter.prepare();
    expect(exporter.getSnapshot().preview).toBeNull();
    expect(exporter.getSnapshot().message).toContain('verified normal windows');
    expect(model.getSnapshot().after?.status).toBe('success');
    expect(api.permissions.contains).not.toHaveBeenCalled();
    await exporter.download();
    expect(handoff).not.toHaveBeenCalled();
  });
}

it('fails closed for a rejected context check without exposing raw diagnostics', async () => {
  const { api, exporter } = await fixture();
  api.tabs.getCurrent.mockRejectedValue(new Error('SECRET_CONTEXT_ERROR'));
  await exporter.prepare();
  expect(exporter.getSnapshot().busy).toBe(false);
  expect(exporter.getSnapshot().preview).toBeNull();
  expect(exporter.getSnapshot().message).not.toContain('SECRET');
});

it('clears results if the inventory grant has disappeared before preparation', async () => {
  const { api, model, exporter } = await fixture();
  api.permissions.contains.mockResolvedValue(false);
  await exporter.prepare();
  expect(model.getSnapshot().before).toBeNull();
  expect(exporter.getSnapshot().preview).toBeNull();
  expect(exporter.getSnapshot().message).toContain('Access changed');
});

it('requires page access only when the report contains attached page data', async () => {
  const { api, exporter } = await fixture({ timing: true });
  await exporter.prepare();
  expect(api.permissions.contains).toHaveBeenLastCalledWith({
    permissions: ['management', 'scripting'],
  });
  expect(exporter.getSnapshot().preview).not.toBeNull();
  api.permissions.contains.mockResolvedValue(false);
  await exporter.download();
  expect(exporter.getSnapshot().preview).toBeNull();
});

it('invalidates an assessment edit even though reset generation did not change', async () => {
  const { model, exporter, handoff } = await fixture();
  await exporter.prepare();
  const generation = model.getGeneration();
  model.setAssessment('worse');
  expect(model.getGeneration()).toBe(generation);
  expect(exporter.getSnapshot().preview).toBeNull();
  await exporter.download();
  expect(handoff).not.toHaveBeenCalled();
  await exporter.prepare();
  expect(exporter.getSnapshot().preview).toContain('Worse');
});

it('invalidates a later attachment without changing reset generation', async () => {
  const { model, exporter } = await fixture({ timing: true });
  await exporter.prepare();
  const generation = model.getGeneration();
  expect(
    model.attachTiming(
      'after',
      42,
      {
        domContentLoaded: { status: 'measured', milliseconds: 5 },
        loadEvent: { status: 'unrecorded' },
        firstContentfulPaint: { status: 'unavailable' },
      },
      generation,
    ).status,
  ).toBe('success');
  expect(model.getGeneration()).toBe(generation);
  expect(exporter.getSnapshot().preview).toBeNull();
});

for (const change of ['cancel', 'reset', 'assessment', 'dispose'] as const) {
  it(`discards pending preparation after ${change}`, async () => {
    const { api, model, exporter } = await fixture();
    const held =
      Promise.withResolvers<
        Awaited<ReturnType<ReportBrowser['tabs']['getCurrent']>>
      >();
    api.tabs.getCurrent.mockReturnValue(held.promise);
    const pending = exporter.prepare();
    expect(exporter.getSnapshot().busy).toBe(true);
    if (change === 'cancel') exporter.cancel();
    if (change === 'reset') model.startOver();
    if (change === 'assessment') model.setAssessment('better');
    if (change === 'dispose') exporter.dispose();
    held.resolve({ incognito: false });
    await pending;
    expect(exporter.getSnapshot().preview).toBeNull();
    expect(exporter.getSnapshot().busy).toBe(false);
    expect(api.permissions.contains).not.toHaveBeenCalled();
  });
}

for (const boundary of ['context', 'permission'] as const) {
  it(`rejects a stale preview while download ${boundary} revalidation is pending`, async () => {
    const { api, model, exporter, handoff } = await fixture();
    await exporter.prepare();
    const held = Promise.withResolvers<boolean>();
    const started = Promise.withResolvers<void>();
    if (boundary === 'context') {
      api.tabs.getCurrent.mockImplementation(async () => {
        started.resolve();
        await held.promise;
        return { incognito: false };
      });
    } else {
      api.permissions.contains.mockImplementation(async () => {
        started.resolve();
        return held.promise;
      });
    }
    const pending = exporter.download();
    await started.promise;
    model.setAssessment('unchanged');
    held.resolve(true);
    await pending;
    expect(handoff).not.toHaveBeenCalled();
    expect(exporter.getSnapshot().preview).toBeNull();
    expect(exporter.getSnapshot().busy).toBe(false);
  });
}

for (const permission of ['management', 'scripting'] as const) {
  it(`erases the preview on an actual ${permission} removal event`, async () => {
    const { model, exporter, handoff } = await fixture();
    await exporter.prepare();
    const listener = onRemoved;
    if (!listener) throw new Error('Missing permission listener');
    listener({ permissions: [permission] });
    expect(model.getSnapshot().before).toBeNull();
    expect(exporter.getSnapshot().preview).toBeNull();
    await exporter.download();
    expect(handoff).not.toHaveBeenCalled();
  });
}

it('rejects a reset while a JSON download revalidation is pending', async () => {
  const { api, model, exporter, handoff } = await fixture();
  exporter.setFormat('json');
  await exporter.prepare();
  const held =
    Promise.withResolvers<
      Awaited<ReturnType<ReportBrowser['tabs']['getCurrent']>>
    >();
  const started = Promise.withResolvers<void>();
  api.tabs.getCurrent.mockImplementation(async () => {
    started.resolve();
    return held.promise;
  });
  const pending = exporter.download();
  await started.promise;
  model.startOver();
  held.resolve({ incognito: false });
  await pending;
  expect(handoff).not.toHaveBeenCalled();
  expect(exporter.getSnapshot().preview).toBeNull();
  expect(exporter.getSnapshot().busy).toBe(false);
});

it('coalesces overlapping actions and permits only deliberate later download attempts', async () => {
  const { api, exporter, handoff } = await fixture();
  const held =
    Promise.withResolvers<
      Awaited<ReturnType<ReportBrowser['tabs']['getCurrent']>>
    >();
  api.tabs.getCurrent.mockReturnValue(held.promise);
  const pending = exporter.prepare();
  await exporter.prepare();
  expect(api.tabs.getCurrent).toHaveBeenCalledTimes(1);
  held.resolve({ incognito: false });
  await pending;
  api.tabs.getCurrent.mockResolvedValue({ incognito: false });
  await Promise.all([exporter.download(), exporter.download()]);
  expect(handoff).toHaveBeenCalledTimes(1);
  await exporter.download();
  expect(handoff).toHaveBeenCalledTimes(2);
});

it('retains reviewed text after a handoff failure with no automatic retry', async () => {
  const { exporter, handoff } = await fixture();
  await exporter.prepare();
  const preview = exporter.getSnapshot().preview;
  handoff.mockImplementation(() => {
    throw new Error('SECRET_DOWNLOAD_ERROR');
  });
  await exporter.download();
  expect(handoff).toHaveBeenCalledTimes(1);
  expect(exporter.getSnapshot().preview).toBe(preview);
  expect(exporter.getSnapshot().busy).toBe(false);
  expect(exporter.getSnapshot().message).not.toContain('SECRET');
});

it('does not repopulate cleared state after synchronous browser handoff', async () => {
  const { model, exporter, handoff } = await fixture();
  await exporter.prepare();
  handoff.mockImplementation(() => model.startOver());
  await exporter.download();
  expect(handoff).toHaveBeenCalledTimes(1);
  expect(exporter.getSnapshot().preview).toBeNull();
  expect(exporter.getSnapshot().message).not.toContain('Download requested');
});

it('forgets previews and pending ownership when its last subscriber leaves', async () => {
  const { api, model, exporter, handoff, unsubscribe } = await fixture();
  await exporter.prepare();
  unsubscribe();
  expect(exporter.getSnapshot()).toEqual({
    format: 'markdown',
    preview: null,
    busy: false,
    message: null,
  });
  await exporter.prepare();
  await exporter.download();
  expect(api.tabs.getCurrent).toHaveBeenCalledTimes(1);
  expect(handoff).not.toHaveBeenCalled();
  expect(model.getSnapshot().before).toBeNull();
});
