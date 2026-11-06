import { beforeEach, expect, it, vi } from 'bun:test';
import { createImportOutput } from '../lib/import-output';
import type { ReportImportSnapshot } from '../lib/report-import';
import type { SavedBrowser } from '../lib/saved-context';
import { exampleReport } from './saved-report-fixture';

function fixture({
  normal = true,
  snapshot = {},
}: {
  normal?: boolean;
  snapshot?: Partial<ReportImportSnapshot>;
} = {}) {
  let state: ReportImportSnapshot = {
    report: exampleReport(),
    claimedProvenance: 'captured',
    importedAt: 1_800_000_000_000,
    busy: false,
    saveable: true,
    retentionDays: 30,
    message: null,
    ...snapshot,
  };
  const subscribers = new Set<() => void>();
  const source = {
    getSnapshot: () => state,
    subscribe(subscriber: () => void) {
      subscribers.add(subscriber);
      return () => subscribers.delete(subscriber);
    },
  };
  const publish = (partial: Partial<ReportImportSnapshot>) => {
    state = { ...state, ...partial };
    for (const subscriber of subscribers) subscriber();
  };
  const context = { normal };
  const getCurrent = vi.fn<SavedBrowser['tabs']['getCurrent']>(async () =>
    context.normal ? { incognito: false } : { incognito: true },
  );
  const api: SavedBrowser = { tabs: { getCurrent } };
  const handoff = vi.fn<(text: string, format: 'html') => void>();
  const printHandoff = vi.fn<(text: string, format: 'html') => void>();
  const output = createImportOutput(api, source, {
    download: handoff,
    print: printHandoff,
  });
  return {
    api,
    getCurrent,
    context,
    source,
    publish,
    handoff,
    printHandoff,
    output,
  };
}

beforeEach(() => vi.restoreAllMocks());

it('prepares, downloads and prints exact imported HTML with honest provenance', async () => {
  const { getCurrent, handoff, printHandoff, output } = fixture();
  await output.prepare();
  const reviewed = output.getSnapshot().preview;
  if (reviewed === null) throw new Error('Missing imported HTML preview');
  expect(reviewed.startsWith('<!doctype html>')).toBe(true);
  expect(reviewed).toContain('Imported report');
  expect(reviewed).toContain('did not observe this content');
  expect(reviewed).toContain('claims provenance');
  expect(reviewed).toContain('not authenticated');
  expect(reviewed).not.toContain('recordId');
  expect(reviewed).not.toContain('importedAt');
  expect(reviewed).not.toContain('<script');
  expect(handoff).not.toHaveBeenCalled();
  expect(printHandoff).not.toHaveBeenCalled();

  await output.download();
  expect(handoff.mock.calls).toEqual([[reviewed, 'html']]);
  expect(output.getSnapshot().message).toContain('Download requested');

  await output.print();
  expect(printHandoff.mock.calls).toEqual([[reviewed, 'html']]);
  expect(output.getSnapshot().message).toContain('Print dialog requested');
  expect(output.getSnapshot().message).not.toContain('printed successfully');
  expect(getCurrent).toHaveBeenCalledTimes(4);
});

it('omits a file provenance claim that was not supplied', async () => {
  const { output } = fixture({
    snapshot: { claimedProvenance: null },
  });
  await output.prepare();
  const reviewed = output.getSnapshot().preview;
  if (reviewed === null) throw new Error('Missing imported HTML preview');
  expect(reviewed).toContain('Imported report');
  expect(reviewed).not.toContain('claims provenance');
});

it('discards the preview when the import is replaced, cleared or suspended', async () => {
  for (const change of ['replace', 'clear', 'suspend'] as const) {
    const { output, publish } = fixture();
    await output.prepare();
    expect(output.getSnapshot().preview).not.toBeNull();
    if (change === 'replace')
      publish({
        report: exampleReport({ assessment: 'better' }),
        importedAt: 1_800_000_000_111,
      });
    if (change === 'clear') publish({ report: null, importedAt: null });
    if (change === 'suspend')
      publish({
        report: null,
        importedAt: null,
        message: 'Imported report cleared because this page was suspended.',
      });
    expect(output.getSnapshot()).toMatchObject({
      preview: null,
      busy: false,
    });
    expect(output.getSnapshot().message).toContain('changed');
  }
});

it('fails closed in a private or unknown context before producing a preview', async () => {
  for (const context of ['private', 'unknown'] as const) {
    const { getCurrent, output, handoff } = fixture();
    getCurrent.mockResolvedValue(
      context === 'private' ? { incognito: true } : undefined,
    );
    await output.prepare();
    expect(output.getSnapshot().preview).toBeNull();
    expect(output.getSnapshot().message).toContain('verified normal windows');
    await output.download();
    expect(handoff).not.toHaveBeenCalled();
  }
});

it('does not publish a preview after a replacement during the deferred context check', async () => {
  const { getCurrent, output, publish } = fixture();
  const held =
    Promise.withResolvers<
      Awaited<ReturnType<SavedBrowser['tabs']['getCurrent']>>
    >();
  const started = Promise.withResolvers<void>();
  getCurrent.mockImplementation(async () => {
    started.resolve();
    return held.promise;
  });
  const pending = output.prepare();
  await started.promise;
  publish({
    report: exampleReport({ assessment: 'better' }),
    importedAt: 1_800_000_000_111,
  });
  held.resolve({ incognito: false });
  await pending;
  expect(output.getSnapshot()).toMatchObject({ preview: null, busy: false });
});

it('does not hand off when the import changes during a print revalidation', async () => {
  const { getCurrent, output, printHandoff, publish } = fixture();
  await output.prepare();
  const held =
    Promise.withResolvers<
      Awaited<ReturnType<SavedBrowser['tabs']['getCurrent']>>
    >();
  const started = Promise.withResolvers<void>();
  getCurrent.mockImplementation(async () => {
    started.resolve();
    return held.promise;
  });
  const pending = output.print();
  await started.promise;
  publish({
    report: exampleReport({ assessment: 'better' }),
    importedAt: 1_800_000_000_111,
  });
  held.resolve({ incognito: false });
  await pending;
  expect(printHandoff).not.toHaveBeenCalled();
  expect(output.getSnapshot().preview).toBeNull();
  expect(output.getSnapshot().busy).toBe(false);
});

it('refuses a printable representation above 1 MiB without dropping the import', async () => {
  const extensions = Array.from({ length: 1000 }, () => ({
    name: '&'.repeat(400),
    version: '1',
    enabled: true,
  }));
  const { output } = fixture({
    snapshot: {
      report: exampleReport({
        before: { extensions },
        after: { extensions },
        changes: [],
      }),
    },
  });
  await output.prepare();
  expect(output.getSnapshot().preview).toBeNull();
  expect(output.getSnapshot().message).toContain('1 MiB');
  expect(output.getSnapshot().message).toContain(
    'remains available for inspection or saving',
  );
});

it('refuses preparation while the import is busy or empty', async () => {
  const busy = fixture({ snapshot: { busy: true } });
  await busy.output.prepare();
  expect(busy.output.getSnapshot().message).toContain('in progress');

  const empty = fixture({
    snapshot: { report: null, claimedProvenance: null, importedAt: null },
  });
  await empty.output.prepare();
  expect(empty.output.getSnapshot().message).toContain('Choose a report file');
});

it('keeps a bounded handoff failure and lets the same preview retry', async () => {
  const { output, handoff } = fixture();
  await output.prepare();
  const reviewed = output.getSnapshot().preview;
  handoff.mockImplementation(() => {
    throw new Error('SECRET_PRINT');
  });
  await output.download();
  expect(output.getSnapshot().preview).toBe(reviewed);
  expect(output.getSnapshot().message).toContain('could not be requested');
  expect(output.getSnapshot().message).not.toContain('SECRET');
  await output.download();
  expect(handoff).toHaveBeenCalledTimes(2);
});

it('cancels and disposes without publishing or handing off later', async () => {
  const { output, handoff } = fixture();
  await output.prepare();
  output.cancel();
  expect(output.getSnapshot().preview).toBeNull();
  await output.download();
  expect(handoff).not.toHaveBeenCalled();

  await output.prepare();
  const reviewed = output.getSnapshot().preview;
  expect(reviewed).not.toBeNull();
  output.dispose();
  expect(output.getSnapshot().preview).toBeNull();
  await output.prepare();
  await output.download();
  expect(handoff).not.toHaveBeenCalled();
});
