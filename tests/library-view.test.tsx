import { expect, it, vi } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { App } from '../entrypoints/library/App';
import type { SavedLibrary, SavedLibrarySnapshot } from '../lib/saved-library';
import type { SavedRecord } from '../lib/saved-record';
import { pageErrorLimits } from '../lib/page-error-check';
import { SAVED_RETENTION_MS } from '../lib/saved-record';

const recordId = '11111111-1111-1111-1111-111111111111';
const savedAt = Date.now() - 60_000;

function record(overrides: Partial<SavedRecord> = {}): SavedRecord {
  return {
    schemaVersion: 1,
    recordId,
    origin: 'captured',
    savedAt,
    expiresAt: savedAt + SAVED_RETENTION_MS,
    report: {
      before: {
        extensions: [
          {
            name: '<img src=x onerror=alert(1)>',
            version: '<b>1.0</b>',
            enabled: true,
          },
        ],
      },
      after: {
        extensions: [
          {
            name: '<img src=x onerror=alert(1)>',
            version: '<b>1.0</b>',
            enabled: false,
          },
        ],
      },
      changes: [
        {
          kind: 'disabled',
          name: '<script>alert(1)</script>',
          version: '1.0',
          enabled: false,
        },
      ],
      assessment: 'worse',
      timing: {
        before: {
          domContentLoaded: { status: 'measured', milliseconds: 12.5 },
          loadEvent: { status: 'unrecorded' },
          firstContentfulPaint: { status: 'unavailable' },
        },
        after: null,
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
    },
    ...overrides,
  };
}

function snapshot(
  overrides: Partial<SavedLibrarySnapshot> = {},
): SavedLibrarySnapshot {
  return {
    phase: 'ready',
    entries: [{ key: recordId, status: 'valid', record: record() }],
    selected: null,
    selectedKey: null,
    pendingDeleteKey: null,
    busy: false,
    message: null,
    ...overrides,
  };
}

function library(state: SavedLibrarySnapshot): SavedLibrary {
  return {
    getSnapshot: () => state,
    subscribe: () => () => {},
    start: vi.fn(),
    refresh: vi.fn(async () => {}),
    open: vi.fn(async () => {}),
    requestDelete: vi.fn(),
    cancelDelete: vi.fn(),
    closeDetail: vi.fn(),
    delete: vi.fn(async () => {}),
    suspend: vi.fn(),
    resume: vi.fn(),
    revalidate: vi.fn(),
    close: vi.fn(),
  };
}

it('lists a saved record and unsupported or unreadable rows for deletion only', () => {
  const markup = renderToStaticMarkup(
    <App
      library={library(
        snapshot({
          entries: [
            { key: recordId, status: 'valid', record: record() },
            { key: 'future', status: 'unsupported' },
            { key: 'bad', status: 'invalid' },
          ],
        }),
      )}
    />,
  );
  expect(markup).toContain('Saved investigations');
  expect(markup).toContain('Unsupported saved record');
  expect(markup).toContain('Unreadable saved record');
  expect(markup).toContain('never migrated or silently removed');
  expect(markup.match(/>Delete<\/button>/g)?.length).toBe(3);
  expect(markup).toContain('Open');
  expect(markup).toContain('Read-only archives');
  for (const phrase of [
    'browser profile on this device',
    'no sync, cloud, telemetry or companion transfer',
    'no encryption layer',
    'Browser or OS backups',
    'Uninstall clearing is browser-controlled',
    'does not export, print or copy saved reports',
  ])
    expect(markup).toContain(phrase);
});

it('renders a selected archive as escaped untrusted text with no extension identifiers', () => {
  const selected = record();
  const markup = renderToStaticMarkup(
    <App
      library={library(
        snapshot({
          selected,
          selectedKey: recordId,
        }),
      )}
    />,
  );
  expect(markup).toContain('Read-only saved investigation');
  expect(markup).toContain('&lt;img src=x onerror=alert(1)&gt;');
  expect(markup).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  expect(markup).not.toContain('<img');
  expect(markup).not.toContain('<script>');
  expect(markup).not.toContain('fixture@test');
  expect(markup).not.toContain('sourceTabId');
  expect(markup).not.toContain('https://');
  expect(markup).toContain('12.5 ms');
  expect(markup).toContain('Not recorded at capture');
  expect(markup).toContain('Unavailable at capture');
  expect(markup).toContain('Stopped by you');
  expect(markup).toContain('30,000 ms window');
  expect(markup).toContain('computed before saving');
  expect(markup).toContain('never recomputed from archived names');
});

it('renders an inline delete confirmation without mutating', () => {
  const current = library(
    snapshot({
      pendingDeleteKey: recordId,
      message: null,
    }),
  );
  const markup = renderToStaticMarkup(<App library={current} />);
  expect(markup).toContain('Delete this saved record?');
  expect(markup).toContain('Delete saved record');
  expect(markup).toContain('Cancel');
  expect(current.delete).not.toHaveBeenCalled();
});

it('exposes no saved rows when context is denied even if a caller supplies data', () => {
  const markup = renderToStaticMarkup(
    <App
      library={library(
        snapshot({
          phase: 'denied',
          entries: [{ key: recordId, status: 'valid', record: record() }],
          message: 'Normal windows only.',
        }),
      )}
    />,
  );
  expect(markup).toContain('Normal windows only');
  expect(markup).not.toContain('library-entry');
  expect(markup).not.toContain('onerror');
  expect(markup).not.toContain(recordId.slice(0, 8));
});

it('reports unavailable storage with a retry action', () => {
  const markup = renderToStaticMarkup(
    <App
      library={library(
        snapshot({
          phase: 'unavailable',
          message: 'Saved storage is unavailable.',
        }),
      )}
    />,
  );
  expect(markup).toContain('Saved storage unavailable');
  expect(markup).toContain('Saved storage is unavailable.');
  expect(markup).toContain('Try again');
});
