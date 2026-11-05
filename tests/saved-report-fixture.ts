import { pageErrorLimits } from '../lib/page-error-check';
import type { SavedReport } from '../lib/saved-record';

export function exampleReport(
  overrides: Partial<SavedReport> = {},
): SavedReport {
  return {
    before: {
      extensions: [{ name: 'Example', version: '1.0', enabled: true }],
    },
    after: {
      extensions: [{ name: 'Example', version: '1.0', enabled: false }],
    },
    changes: [
      { kind: 'disabled', name: 'Example', version: '1.0', enabled: false },
    ],
    assessment: 'worse',
    timing: {
      before: null,
      after: {
        domContentLoaded: { status: 'measured', milliseconds: 120.5 },
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
        observedMs: 12_000,
      },
    },
    observationLimits: {
      pageErrorWindowMs: pageErrorLimits.durationMs,
      pageErrorEvents: pageErrorLimits.events,
      pageErrorSummaryBytes: pageErrorLimits.summaryBytes,
    },
    ...overrides,
  };
}

export function hostileReport(
  overrides: Partial<SavedReport> = {},
): SavedReport {
  return exampleReport({
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
    ...overrides,
  });
}
