import { expect, it } from 'bun:test';
import { createReportMarkdown } from '../lib/report-markdown';
import { REPORT_TEXT_MAX_BYTES } from '../lib/report-shape';
import type { SavedReport } from '../lib/saved-record';
import { exampleReport, hostileReport } from './saved-report-fixture';

function markdown(
  report: SavedReport = exampleReport(),
  options: Parameters<typeof createReportMarkdown>[1] = {
    provenance: 'captured',
  },
) {
  const result = createReportMarkdown(report, options);
  expect(result.status).toBe('success');
  if (result.status !== 'success') throw new Error(result.reason);
  return result.value;
}

it('renders a captured Markdown clipboard representation with minimized fields', () => {
  const text = markdown();
  expect(text.startsWith('# AddonRay investigation report\n\n')).toBe(true);
  expect(text).toContain(
    'Captured report. AddonRay captured this Before/After investigation in this browser profile.',
  );
  expect(text).toContain('## Before inventory\n\nExtensions reported: 1.');
  expect(text).toContain('## After inventory\n\nExtensions reported: 1.');
  expect(text).toContain(
    '- Name: `"Example"`; version: `"1.0"`; state: Enabled.',
  );
  expect(text).toContain(
    '- Disabled. Name: `"Example"`; version: `"1.0"`; state: Disabled.',
  );
  expect(text).toContain('## Your page assessment\n\nWorse.');
  expect(text).toContain('| DOM content loaded | Not attached | 120.5 ms |');
  expect(text).toContain('| Load event completed | Not attached |');
  expect(text).toContain('Not recorded at capture');
  expect(text).toContain('Unavailable at capture');
  expect(text).toContain('| Total observed events | Not attached | 1 |');
  expect(text).toContain(
    'Page-error observation limits that applied to this capture: 30,000 ms window, 200 events, 1,024-byte summary.',
  );
  expect(text).not.toContain('recordId');
  expect(text).not.toContain('savedAt');
  expect(text).not.toContain('expiresAt');
  expect(text).not.toContain('importedAt');
  expect(text).not.toContain('\r');
  expect(text.endsWith('\n')).toBe(true);
  expect(text.endsWith('\n\n')).toBe(false);
});

it('labels imported content as untrusted and keeps an unauthenticated claim', () => {
  const claimed = markdown(exampleReport(), {
    provenance: 'imported',
    claimedProvenance: 'captured',
  });
  expect(claimed).toContain(
    'Imported report — untrusted file content. AddonRay did not observe this content in the browser; the selected file claims provenance captured, which is not authenticated. This content is treated as imported on every re-export.',
  );
  expect(claimed).not.toContain(
    'Captured report. AddonRay captured this Before/After investigation',
  );

  const savedImport = markdown(exampleReport(), { provenance: 'imported' });
  expect(savedImport).toContain('Imported report — untrusted file content');
  expect(savedImport).not.toContain('the selected file claims provenance');
});

it('uses the stored change list verbatim and never recomputes it from names', () => {
  const text = markdown(
    exampleReport({
      before: {
        extensions: [{ name: 'Only Before', version: '1', enabled: true }],
      },
      after: { extensions: [] },
      changes: [
        {
          kind: 'enabled',
          name: 'Stored change',
          version: '9',
          enabled: true,
        },
      ],
    }),
  );
  expect(text).toContain(
    '- Enabled. Name: `"Stored change"`; version: `"9"`; state: Enabled.',
  );
  expect(text).not.toContain('Removed. Name: `"Only Before"`');
  expect(text).toContain('1 stored inventory change.');
  expect(text).toContain('never recomputed from names');
  expect(text).toContain('Extension names and versions can duplicate');
});

it('preserves empty inventories, absent assessment and unattached diagnostics', () => {
  const text = markdown(
    exampleReport({
      before: { extensions: [] },
      after: { extensions: [] },
      changes: [],
      assessment: null,
      timing: { before: null, after: null },
      pageErrors: { before: null, after: null },
    }),
  );
  expect(text.match(/No extensions reported\./g)).toHaveLength(2);
  expect(text).toContain('## Your page assessment\n\nNot recorded.');
  expect(text).toContain(
    'No reported additions, removals or enabled-state changes.',
  );
  expect(text).toContain(
    '| DOM content loaded | Not attached | Not attached | Needs two measured values |',
  );
  expect(text).toContain(
    '| Total observed events | Not attached | Not attached |',
  );
});

it('keeps duplicate names as indistinguishable rows', () => {
  const duplicate = { name: 'Same', version: '1', enabled: true };
  const text = markdown(
    exampleReport({
      before: { extensions: [duplicate, duplicate] },
      after: { extensions: [duplicate, duplicate] },
      changes: [],
    }),
  );
  expect(
    text.match(/- Name: `"Same"`; version: `"1"`; state: Enabled\./g),
  ).toHaveLength(4);
});

it('keeps hostile names literal through code spans and escape notation', () => {
  const text = markdown(
    hostileReport({
      before: {
        extensions: [
          {
            name: 'Back`tick \\slash "quote"\nNew line\u0007🧪',
            version: '<script>alert(2)</script>',
            enabled: true,
          },
        ],
      },
    }),
  );
  expect(text).toContain(
    '- Name: `"Back\\u0060tick \\u005Cslash \\u0022quote\\u0022\\u000ANew line\\u0007🧪"`;',
  );
  expect(text).toContain('version: `"<script>alert(2)</script>"`');
  expect(text).not.toContain('Back`tick');
  expect(text).not.toContain('\nNew line');
});

it('refuses an over-limit representation without truncation', () => {
  const report = exampleReport({
    before: {
      extensions: Array.from({ length: 400 }, (_, index) => ({
        name: `${index}-${'x'.repeat(4090)}`,
        version: '1',
        enabled: true,
      })),
    },
    after: { extensions: [] },
    changes: [],
  });
  const result = createReportMarkdown(report, { provenance: 'captured' });
  expect(result.status).toBe('error');
  if (result.status === 'error') expect(result.reason).toContain('1 MiB');
  expect(REPORT_TEXT_MAX_BYTES).toBe(1_048_576);
});
