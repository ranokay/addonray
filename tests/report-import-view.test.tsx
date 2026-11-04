import { expect, it, vi } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { ImportReportSection } from '../entrypoints/library/ImportReport';
import { pageErrorLimits } from '../lib/page-error-check';
import type { ReportImport, ReportImportSnapshot } from '../lib/report-import';
import type { SavedReport } from '../lib/saved-record';

function report(): SavedReport {
  return {
    before: {
      extensions: [
        {
          name: '<img src=x onerror=alert(1)>',
          version: '<script>alert(2)</script>',
          enabled: true,
        },
      ],
    },
    after: {
      extensions: [
        {
          name: '<img src=x onerror=alert(1)>',
          version: '<script>alert(2)</script>',
          enabled: false,
        },
      ],
    },
    changes: [
      {
        kind: 'disabled',
        name: '<script>alert(3)</script>',
        version: '1.0',
        enabled: false,
      },
    ],
    assessment: 'worse',
    timing: {
      before: null,
      after: {
        domContentLoaded: { status: 'measured', milliseconds: 12.5 },
        loadEvent: { status: 'unrecorded' },
        firstContentfulPaint: { status: 'unavailable' },
      },
    },
    pageErrors: {
      before: null,
      after: {
        scriptErrors: 1,
        unhandledRejections: 0,
        total: 1,
        finish: 'stop',
        observedMs: 1200,
      },
    },
    observationLimits: {
      pageErrorWindowMs: pageErrorLimits.durationMs,
      pageErrorEvents: pageErrorLimits.events,
      pageErrorSummaryBytes: pageErrorLimits.summaryBytes,
    },
  };
}

function importer(overrides: Partial<ReportImportSnapshot> = {}): ReportImport {
  const snapshot: ReportImportSnapshot = {
    report: null,
    claimedProvenance: null,
    importedAt: null,
    busy: false,
    saveable: false,
    retentionDays: 30,
    message: null,
    ...overrides,
  };
  return {
    getSnapshot: () => snapshot,
    subscribe: () => () => {},
    select: vi.fn(async () => {}),
    setRetentionDays: vi.fn(),
    save: vi.fn(async () => {}),
    clear: vi.fn(),
    suspend: vi.fn(),
    resume: vi.fn(),
    dispose: vi.fn(),
  };
}

it('offers explicit file selection and discloses that import alone persists nothing', () => {
  const markup = renderToStaticMarkup(
    <ImportReportSection importer={importer()} />,
  );
  expect(markup).toContain('Import report');
  expect(markup).toContain('Choose a JSON report file');
  expect(markup).toContain('type="file"');
  expect(markup).toContain('accept=".json,application/json"');
  expect(markup).toContain('Import alone stores nothing');
  expect(markup).toContain('filename or path');
  expect(markup).toContain('no collection or permission request');
  expect(markup).not.toContain('Save imported report');
  expect(markup).not.toContain('Imported report</h2>');
});

it('renders an accepted file as a read-only Imported report with escaped text', () => {
  const markup = renderToStaticMarkup(
    <ImportReportSection
      importer={importer({
        report: report(),
        claimedProvenance: 'captured',
        importedAt: 1_800_000_000_000,
        saveable: true,
      })}
    />,
  );
  expect(markup).toContain('Imported report');
  expect(markup).toContain('untrusted');
  expect(markup).toContain('read-only');
  expect(markup).toContain('cannot be attached to a live investigation');
  expect(markup).toContain('file claims provenance');
  expect(markup).toContain('&lt;img src=x onerror=alert(1)&gt;');
  expect(markup).toContain('&lt;script&gt;alert(2)&lt;/script&gt;');
  expect(markup).toContain('&lt;script&gt;alert(3)&lt;/script&gt;');
  expect(markup).not.toContain('<img src=x');
  expect(markup).not.toContain('<script>alert');
  expect(markup).toContain('Save imported report');
  expect(markup).toContain('Keep this archived import for');
  expect(markup).toContain('7 days');
  expect(markup).toContain('30 days');
  expect(markup).toContain('90 days');
});

it('explains view-only imports and does not offer a save action for them', () => {
  const markup = renderToStaticMarkup(
    <ImportReportSection
      importer={importer({
        report: report(),
        claimedProvenance: 'imported',
        importedAt: 1_800_000_000_000,
        saveable: false,
      })}
    />,
  );
  expect(markup).toContain('view-only');
  expect(markup).toContain('1 MiB');
  const saveButton = markup.match(
    /<button[^>]*id="save-imported-report"[^>]*>/,
  )?.[0];
  expect(saveButton).toContain('disabled');
});

it('renders bounded status text and a separate clear action', () => {
  const markup = renderToStaticMarkup(
    <ImportReportSection
      importer={importer({
        report: report(),
        importedAt: 1_800_000_000_000,
        saveable: true,
        message:
          'The selected file is not valid JSON: duplicate property name.',
      })}
    />,
  );
  expect(markup).toContain('duplicate property name');
  expect(markup).toContain('Clear imported report');
});
