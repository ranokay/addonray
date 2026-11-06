import { beforeEach, expect, it, vi } from 'bun:test';
import { createImportOutput } from '../lib/import-output';
import {
  CLIPBOARD_COMPLETED_STALE_MESSAGE,
  type ClipboardOutcome,
} from '../lib/report-clipboard';
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
  // Simulates an authoritative source change that has not delivered its
  // notification yet.
  const mutate = (partial: Partial<ReportImportSnapshot>) => {
    state = { ...state, ...partial };
  };
  const context = { normal };
  const getCurrent = vi.fn<SavedBrowser['tabs']['getCurrent']>(async () =>
    context.normal ? { incognito: false } : { incognito: true },
  );
  const api: SavedBrowser = { tabs: { getCurrent } };
  const handoff = vi.fn<(text: string, format: 'html') => void>();
  const printHandoff = vi.fn<(text: string, format: 'html') => void>();
  const copyHandoff = vi.fn(
    async (_text: string): Promise<ClipboardOutcome> => ({
      status: 'success',
      message: 'Copied the exact Markdown report.',
    }),
  );
  const output = createImportOutput(api, source, {
    download: handoff,
    print: printHandoff,
    copy: copyHandoff,
  });
  return {
    api,
    getCurrent,
    context,
    source,
    publish,
    mutate,
    handoff,
    printHandoff,
    copyHandoff,
    output,
  };
}

beforeEach(() => vi.restoreAllMocks());

it('prepares exact imported Markdown for clipboard review with provenance', async () => {
  const { output, handoff, copyHandoff } = fixture();
  output.setFormat('markdown');
  await output.prepare();
  const reviewed = output.getSnapshot().preview;
  if (reviewed === null) throw new Error('Missing imported Markdown preview');
  expect(reviewed.startsWith('# AddonRay investigation report')).toBe(true);
  expect(reviewed).toContain('Imported report — untrusted file content');
  expect(reviewed).toContain('claims provenance captured');
  expect(reviewed).toContain('not authenticated');
  expect(reviewed).not.toContain('recordId');
  expect(reviewed).not.toContain('importedAt');
  await output.download();
  expect(handoff).not.toHaveBeenCalled();
  expect(copyHandoff).not.toHaveBeenCalled();
});

it('copies imported Markdown only after the write resolves', async () => {
  const { output, copyHandoff } = fixture();
  const write = Promise.withResolvers<ClipboardOutcome>();
  copyHandoff.mockImplementation(() => write.promise);
  output.setFormat('markdown');
  await output.prepare();
  const reviewed = output.getSnapshot().preview;
  if (reviewed === null) throw new Error('Missing imported Markdown preview');
  const pending = output.copy();
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(copyHandoff.mock.calls).toEqual([[reviewed]]);
  expect(output.getSnapshot().busy).toBe(true);
  write.resolve({
    status: 'success',
    message: 'Copied the exact Markdown report.',
  });
  await pending;
  expect(output.getSnapshot()).toEqual({
    format: 'markdown',
    preview: reviewed,
    busy: false,
    message: 'Copied the exact Markdown report.',
  });
});

it('reports imported clipboard denial and suppresses success after replacement', async () => {
  const denied = fixture();
  denied.output.setFormat('markdown');
  await denied.output.prepare();
  const reviewed = denied.output.getSnapshot().preview;
  denied.copyHandoff.mockResolvedValueOnce({
    status: 'denied',
    message: 'Clipboard access was denied by the browser.',
  });
  await denied.output.copy();
  expect(denied.output.getSnapshot()).toMatchObject({
    preview: reviewed,
    message: 'Clipboard access was denied by the browser.',
  });

  const stale = fixture();
  const write = Promise.withResolvers<ClipboardOutcome>();
  stale.copyHandoff.mockImplementation(() => write.promise);
  stale.output.setFormat('markdown');
  await stale.output.prepare();
  const pending = stale.output.copy();
  await new Promise((resolve) => setTimeout(resolve, 0));
  stale.publish({ report: null, importedAt: null, saveable: false });
  write.resolve({ status: 'success', message: 'Copied the exact Markdown.' });
  await pending;
  expect(stale.output.getSnapshot().preview).toBeNull();
  expect(stale.output.getSnapshot().message).not.toContain('Copied');
});

it('revalidates normal context after a resolved imported write before success', async () => {
  const { context, output, copyHandoff } = fixture();
  const write = Promise.withResolvers<ClipboardOutcome>();
  copyHandoff.mockImplementation(() => write.promise);
  output.setFormat('markdown');
  await output.prepare();
  const pending = output.copy();
  await new Promise((resolve) => setTimeout(resolve, 0));
  context.normal = false;
  write.resolve({ status: 'success', message: 'Copied the exact Markdown.' });
  await pending;
  expect(output.getSnapshot().preview).toBeNull();
  expect(output.getSnapshot().message).toBe(CLIPBOARD_COMPLETED_STALE_MESSAGE);
  expect(output.getSnapshot().message).not.toContain('was not copied');
});

it('suppresses success when the imported report changes during a write without notification', async () => {
  const { mutate, output, copyHandoff } = fixture();
  const write = Promise.withResolvers<ClipboardOutcome>();
  copyHandoff.mockImplementation(() => write.promise);
  output.setFormat('markdown');
  await output.prepare();
  const pending = output.copy();
  await new Promise((resolve) => setTimeout(resolve, 0));
  mutate({ report: null, importedAt: null, saveable: false });
  write.resolve({ status: 'success', message: 'Copied the exact Markdown.' });
  await pending;
  expect(output.getSnapshot().preview).toBeNull();
  expect(output.getSnapshot().message).toBe(CLIPBOARD_COMPLETED_STALE_MESSAGE);
});

it('does not copy the imported printable HTML preview', async () => {
  const { output, copyHandoff } = fixture();
  await output.prepare();
  await output.copy();
  expect(copyHandoff).not.toHaveBeenCalled();
});

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
