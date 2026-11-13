import { expect, it } from 'bun:test';
import { createPrintableHtml } from '../lib/report-html';
import { exampleReport, hostileReport } from './saved-report-fixture';

const bytes = (text: string) => new TextEncoder().encode(text).length;

function success(result: ReturnType<typeof createPrintableHtml>) {
  if (result.status !== 'success')
    throw new Error(`Expected printable HTML: ${result.reason}`);
  return result.value;
}

it('builds one complete self-contained document with inline CSS only', () => {
  const html = success(
    createPrintableHtml(exampleReport(), { provenance: 'captured' }),
  );
  expect(html.startsWith('<!doctype html>\n<html lang="en">')).toBe(true);
  expect(html.endsWith('</html>\n')).toBe(true);
  expect(html).toContain('<meta charset="utf-8">');
  expect(html).toContain('<title>AddonRay investigation report</title>');
  expect(html).toContain('<style>');
  expect(html).toContain('@page');
  expect(html).toContain('display: table-header-group');
  expect(html).toContain('overflow-wrap: anywhere');
  for (const forbidden of [
    '<script',
    '<link',
    '<img',
    '<iframe',
    '<object',
    '<embed',
    ' src=',
    ' href=',
    'url(',
    '@import',
    'http://',
    'https://',
    'data:',
  ])
    expect(html.toLowerCase()).not.toContain(forbidden);
  expect(bytes(html)).toBeLessThanOrEqual(1_048_576);
});

it('renders hostile names, versions and change text as escaped text', () => {
  const html = success(
    createPrintableHtml(hostileReport(), { provenance: 'captured' }),
  );
  expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  expect(html).toContain('&lt;script&gt;alert(2)&lt;/script&gt;');
  expect(html).toContain('&lt;script&gt;alert(3)&lt;/script&gt;');
  expect(html).not.toContain('<img src=x');
  expect(html).not.toContain('<script>alert');
  expect(html).not.toMatch(/<\w+[^>]*\sonerror=/);
});

it('shows controls, bidi formatting and lone surrogates as visible escapes', () => {
  const report = exampleReport({
    before: {
      extensions: [
        {
          name: 'A\u0000B\u202EC\u200FD\uD800E',
          version: '1\u0009.0',
          enabled: true,
        },
      ],
    },
  });
  const html = success(createPrintableHtml(report, { provenance: 'captured' }));
  expect(html).toContain('A\\u{0}B\\u{202E}C\\u{200F}D\\u{D800}E');
  expect(html).toContain('1\\u{9}.0');
  expect(html).not.toContain('\u202E');
  expect(html).not.toContain('\u200F');
});

it('distinguishes a literal Unicode escape from a real control character', () => {
  const literal = success(
    createPrintableHtml(
      exampleReport({
        before: {
          extensions: [
            { name: 'literal \\u{202E} text', version: '1', enabled: true },
          ],
        },
      }),
      { provenance: 'captured' },
    ),
  );
  const actual = success(
    createPrintableHtml(
      exampleReport({
        before: {
          extensions: [
            { name: 'actual \u202E text', version: '1', enabled: true },
          ],
        },
      }),
      { provenance: 'captured' },
    ),
  );
  expect(literal).toContain('literal \\u{5C}u{202E} text');
  expect(actual).toContain('actual \\u{202E} text');
  expect(literal).not.toContain('\\u{202E} ');
  expect(literal).not.toBe(actual);
  expect(literal).toContain('Unicode escape notation represents backticks');
});

it('labels empty inventories, absent assessment and unattached diagnostics explicitly', () => {
  const html = success(
    createPrintableHtml(
      exampleReport({
        before: { extensions: [] },
        after: { extensions: [] },
        changes: [],
        assessment: null,
        timing: { before: null, after: null },
        pageErrors: { before: null, after: null },
      }),
      { provenance: 'captured' },
    ),
  );
  expect(html.match(/No extensions reported in this capture\./g)?.length).toBe(
    2,
  );
  expect(html).toContain('Not recorded.');
  expect(html).toContain(
    'No reported additions, removals or enabled-state changes.',
  );
  expect(html).toContain('Not attached');
  expect(html).toContain('Needs two measured values');
});

it('preserves measured, unrecorded and unavailable states without coercion', () => {
  const report = exampleReport();
  const html = success(createPrintableHtml(report, { provenance: 'captured' }));
  expect(html).toContain('120.5 ms');
  expect(html).toContain('Not recorded at capture');
  expect(html).toContain('Unavailable at capture');
  expect(html).toContain('Stopped by you');
  expect(html).toContain('12,000 ms');
  expect(html).toContain('30,000 ms window');
  expect(html).toContain('200 events');
  expect(html).toContain('1,024-byte summary');
});

it('uses the stored change list and states the duplicate-name limitation', () => {
  const report = exampleReport({
    before: {
      extensions: [
        { name: 'Duplicate', version: '1.0', enabled: true },
        { name: 'Duplicate', version: '1.0', enabled: true },
      ],
    },
    after: {
      extensions: [
        { name: 'Duplicate', version: '1.0', enabled: true },
        { name: 'Duplicate', version: '1.0', enabled: true },
      ],
    },
    changes: [],
  });
  const html = success(createPrintableHtml(report, { provenance: 'captured' }));
  expect(html).toContain(
    'No reported additions, removals or enabled-state changes.',
  );
  expect(html).toContain('Duplicate');
  expect(html).toContain('Extension names and versions can duplicate');
  expect(html).toContain('never recomputed from names');
  const recomputed = success(
    createPrintableHtml(
      exampleReport({
        changes: [
          {
            kind: 'added',
            name: 'Stored only',
            version: '9',
            enabled: true,
          },
        ],
      }),
      { provenance: 'captured' },
    ),
  );
  expect(recomputed).toContain('Stored only');
});

it('distinguishes captured provenance from imported and claimed provenance', () => {
  const captured = success(
    createPrintableHtml(exampleReport(), { provenance: 'captured' }),
  );
  expect(captured).toContain('Captured report.');
  expect(captured).not.toContain('Imported report');
  expect(captured).not.toContain('claims provenance');

  const imported = success(
    createPrintableHtml(exampleReport(), {
      provenance: 'imported',
      claimedProvenance: 'captured',
    }),
  );
  expect(imported).toContain('Imported report');
  expect(imported).toContain('untrusted file content');
  expect(imported).toContain('did not observe this content');
  expect(imported).toContain('claims provenance');
  expect(imported).toContain('not authenticated');
  expect(imported).not.toContain('Captured report.');

  const savedImport = success(
    createPrintableHtml(exampleReport(), { provenance: 'imported' }),
  );
  expect(savedImport).toContain('Imported report');
  expect(savedImport).not.toContain('claims provenance');
});

it('renders a full 4,096-code-point name without truncation', () => {
  const name = 'x'.repeat(4096);
  const html = success(
    createPrintableHtml(
      exampleReport({
        before: {
          extensions: [{ name, version: '1.0', enabled: true }],
        },
      }),
      { provenance: 'captured' },
    ),
  );
  expect(html).toContain(name);
  expect(html).not.toContain('…');
});

it('renders all 1,000 rows per side and 2,000 stored changes', () => {
  const report = exampleReport({
    before: {
      extensions: Array.from({ length: 1000 }, (_, index) => ({
        name: `Before ${index}`,
        version: '1',
        enabled: true,
      })),
    },
    after: {
      extensions: Array.from({ length: 1000 }, (_, index) => ({
        name: `After ${index}`,
        version: '1',
        enabled: false,
      })),
    },
    changes: Array.from({ length: 2000 }, (_, index) => ({
      kind: index % 2 === 0 ? ('added' as const) : ('removed' as const),
      name: `Change ${index}`,
      version: '1',
      enabled: true,
    })),
  });
  const html = success(createPrintableHtml(report, { provenance: 'captured' }));
  expect(html).toContain('Before 999');
  expect(html).toContain('After 999');
  expect(html).toContain('Change 1999');
  expect(html.match(/Before \d+/g)?.length).toBe(1000);
  expect(bytes(html)).toBeLessThanOrEqual(1_048_576);
});

it('refuses a printable document above 1 MiB without truncating or affecting JSON', () => {
  const name = '&'.repeat(4096);
  const report = exampleReport({
    before: {
      extensions: Array.from({ length: 1000 }, () => ({
        name,
        version: '1',
        enabled: true,
      })),
    },
  });
  const result = createPrintableHtml(report, { provenance: 'captured' });
  expect(result.status).toBe('error');
  if (result.status !== 'error') throw new Error('Expected a refusal');
  expect(result.reason).toContain('1 MiB');
  expect(result.reason).not.toContain('truncat');
});

it('omits local record envelope, identifiers, timestamps and context metadata', () => {
  const html = success(
    createPrintableHtml(exampleReport(), { provenance: 'captured' }),
  );
  for (const forbidden of [
    'recordId',
    'savedAt',
    'expiresAt',
    'importedAt',
    'sourceTabId',
    'documentId',
    'attemptId',
    'transferId',
    'incognito',
    'schemaVersion',
    'extensionId',
  ])
    expect(html).not.toContain(forbidden);
});
