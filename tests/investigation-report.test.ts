import { expect, it, vi } from 'bun:test';
import type { InventorySnapshot, SnapshotEntry } from '../lib/comparison';
import type { Investigation } from '../lib/investigation';
import {
  createInvestigationReport,
  REPORT_FILENAME,
  REPORT_MAX_BYTES,
} from '../lib/investigation-report';
import type { PageErrorSummary } from '../lib/page-error-check';

type State = ReturnType<Investigation['getSnapshot']>;

function extension(update: Partial<SnapshotEntry> = {}): SnapshotEntry {
  return {
    id: 'internal-extension-id',
    name: 'Reader extension',
    version: '1.2',
    enabled: true,
    ...update,
  };
}

function state(update: Partial<State> = {}): State {
  return {
    before: { status: 'success', value: [extension()] },
    after: { status: 'success', value: [extension({ enabled: false })] },
    busy: null,
    assessment: null,
    timingBefore: null,
    timingAfter: null,
    errorBefore: null,
    errorAfter: null,
    afterStarted: true,
    ...update,
  };
}

function report(update: Partial<State> = {}) {
  const result = createInvestigationReport(state(update));
  expect(result.status).toBe('success');
  if (result.status !== 'success') throw new Error(result.reason);
  return result.value;
}

function summary(update: Partial<PageErrorSummary> = {}): PageErrorSummary {
  return {
    scriptErrors: 2,
    unhandledRejections: 1,
    total: 3,
    finish: 'stop',
    observedMs: 1200,
    ...update,
  };
}

it('provides one metadata-free Markdown file with both full inventories and assessment', () => {
  const text = report({ assessment: 'better' });
  expect(REPORT_FILENAME).toBe('addonray-investigation.md');
  expect(REPORT_MAX_BYTES).toBe(1_048_576);
  expect(text.startsWith('# AddonRay investigation report\n\n')).toBe(true);
  expect(text).toContain('## Before inventory\n\nExtensions reported: 1.');
  expect(text).toContain('## After inventory\n\nExtensions reported: 1.');
  expect(text).toContain(
    '- Name: `"Reader extension"`; version: `"1.2"`; state: Enabled.',
  );
  expect(text).toContain(
    '- Disabled. Name: `"Reader extension"`; version: `"1.2"`; state: Disabled.',
  );
  expect(text).toContain('## Your page assessment\n\nBetter.');
  expect(text).not.toContain('internal-extension-id');
  expect(text).not.toContain('\r');
  expect(text.endsWith('\n')).toBe(true);
  expect(text.endsWith('\n\n')).toBe(false);
});

it.each(['better', 'unchanged', 'worse', 'uncertain'] as const)(
  'keeps the manually chosen %s assessment',
  (assessment) => {
    const label = assessment.charAt(0).toUpperCase() + assessment.slice(1);
    expect(report({ assessment })).toContain(
      `## Your page assessment\n\n${label}.`,
    );
  },
);

it.each(['before', 'after'] as const)(
  'rejects a pending %s capture even when both stored results succeeded',
  (busy) => {
    expect(createInvestigationReport(state({ busy }))).toEqual({
      status: 'unavailable',
      reason:
        'Capture both inventories and wait for any capture to finish before preparing a report.',
    });
  },
);

for (const side of ['before', 'after'] as const) {
  it.each(['denied', 'unavailable', 'error', 'cancelled'] as const)(
    `rejects a ${side} %s result without exporting its reason`,
    (status) => {
      const result = createInvestigationReport(
        state({ [side]: { status, reason: 'private-error-sentinel' } }),
      );
      expect(result.status).toBe('unavailable');
      expect(JSON.stringify(result)).not.toContain('private-error-sentinel');
    },
  );
  it(`rejects an absent ${side} inventory`, () => {
    expect(createInvestigationReport(state({ [side]: null })).status).toBe(
      'unavailable',
    );
  });
}

it('permits empty successful inventories with no assessment or attachments', () => {
  const text = report({
    before: { status: 'success', value: [] },
    after: { status: 'success', value: [] },
  });
  expect(text.match(/Extensions reported: 0\./g)).toHaveLength(2);
  expect(text.match(/No extensions reported\./g)).toHaveLength(2);
  expect(text).toContain(
    'No reported additions, removals or enabled-state changes.',
  );
  expect(text).toContain('## Your page assessment\n\nNot recorded.');
  expect(text).toContain(
    '| DOM content loaded | Not attached | Not attached | Needs two measured values |',
  );
  expect(text).toContain(
    '| Total observed events | Not attached | Not attached |',
  );
});

it('reports all four existing change kinds without classifying name or version changes', () => {
  const before: InventorySnapshot = [
    extension({ id: 'a', name: 'Removed' }),
    extension({ id: 'b', name: 'Enabled', enabled: false }),
    extension({ id: 'c', name: 'Disabled' }),
    extension({ id: 'd', name: 'Old label', version: '1' }),
  ];
  const after: InventorySnapshot = [
    extension({ id: 'b', name: 'Enabled' }),
    extension({ id: 'c', name: 'Disabled', enabled: false }),
    extension({ id: 'd', name: 'New label', version: '2' }),
    extension({ id: 'e', name: 'Added' }),
  ];
  const text = report({
    before: { status: 'success', value: before },
    after: { status: 'success', value: after },
  });
  const changes = text
    .split('## Reported inventory changes\n\n')[1]
    ?.split('\n## Your page assessment')[0];
  if (changes === undefined) throw new Error('Missing change section');
  for (const label of ['Added', 'Removed', 'Enabled', 'Disabled'])
    expect(changes).toContain(`- ${label}. Name: `);
  expect(changes.match(/^- /gm)).toHaveLength(4);
  expect(changes).not.toContain('Old label');
  expect(changes).not.toContain('New label');
  expect(text).toContain('Name: `"Old label"`; version: `"1"`');
  expect(text).toContain('Name: `"New label"`; version: `"2"`');
});

it('retains timing statuses and calculates signed deltas only for measured pairs', () => {
  const text = report({
    timingBefore: {
      domContentLoaded: { status: 'measured', milliseconds: 10 },
      loadEvent: { status: 'unrecorded' },
      firstContentfulPaint: { status: 'unavailable' },
    },
    timingAfter: {
      domContentLoaded: { status: 'measured', milliseconds: 12.345 },
      loadEvent: { status: 'measured', milliseconds: 20 },
      firstContentfulPaint: { status: 'unrecorded' },
    },
  });
  expect(text).toContain(
    '| DOM content loaded | 10 ms | 12.35 ms | +2.35 ms |',
  );
  expect(text).toContain(
    '| Load event completed | Not recorded at capture | 20 ms | Needs two measured values |',
  );
  expect(text).toContain(
    '| First content displayed | Unavailable at capture | Not recorded at capture | Needs two measured values |',
  );
});

it('preserves zero, negative and sub-hundredth timing differences without a speed verdict', () => {
  const text = report({
    timingBefore: {
      domContentLoaded: { status: 'measured', milliseconds: 20 },
      loadEvent: { status: 'measured', milliseconds: 10 },
      firstContentfulPaint: { status: 'measured', milliseconds: 0.003 },
    },
    timingAfter: {
      domContentLoaded: { status: 'measured', milliseconds: 10 },
      loadEvent: { status: 'measured', milliseconds: 10 },
      firstContentfulPaint: { status: 'measured', milliseconds: 0 },
    },
  });
  expect(text).toContain('| DOM content loaded | 20 ms | 10 ms | −10 ms |');
  expect(text).toContain('| Load event completed | 10 ms | 10 ms | 0 ms |');
  expect(text).toContain(
    '| First content displayed | <0.01 ms | 0 ms | −<0.01 ms |',
  );
  expect(text).toContain('## Your page assessment\n\nNot recorded.');
});

it.each([
  ['stop', 'Stopped by you'],
  ['timeout', '30-second window ended'],
  ['limit', '200-event limit reached'],
] as const)(
  'retains the %s completion reason and bounded error data',
  (finish, label) => {
    const value = summary(
      finish === 'timeout'
        ? { finish, observedMs: 30_000 }
        : finish === 'limit'
          ? { finish, scriptErrors: 199, total: 200 }
          : { finish },
    );
    const text = report({
      errorBefore: value,
      errorAfter: summary({ observedMs: 0.001 }),
    });
    expect(text).toContain(
      `| Uncaught JavaScript error events | ${value.scriptErrors} | 2 |`,
    );
    expect(text).toContain(`| Unhandled promise-rejection events | 1 | 1 |`);
    expect(text).toContain(`| Total observed events | ${value.total} | 3 |`);
    expect(text).toContain(`| Completion reason | ${label} | Stopped by you |`);
    expect(text).toContain(
      `| Observation duration | ${finish === 'timeout' ? '30,000' : '1,200'} ms | <0.01 ms |`,
    );
    const errors = text
      .split('## Optional page-error counts\n\n')[1]
      ?.split('\n## Observation limits')[0];
    if (errors === undefined) throw new Error('Missing error section');
    expect(errors).not.toContain('Difference');
    expect(errors).not.toContain('rate');
  },
);

it('does not convert a missing error side to zero and retains a confirmed zero side', () => {
  const text = report({
    errorBefore: summary({ scriptErrors: 0, unhandledRejections: 0, total: 0 }),
  });
  expect(text).toContain('| Total observed events | 0 | Not attached |');
  expect(text).toContain(
    'Missing or interrupted observations are not zero-error results.',
  );
  expect(text).toContain(
    'Zero observed events does not mean the page is error-free.',
  );
});

it('allowlists report fields without reading unrelated metadata or getters', () => {
  const touched = vi.fn(() => {
    throw new Error('unknown getter');
  });
  const extra = extension({ id: 'private-id-sentinel' });
  Object.defineProperties(extra, {
    permissions: { get: touched },
    hostPermissions: { value: ['private-host-sentinel'] },
    url: { value: 'private-page-sentinel' },
  });
  const value = state({
    before: { status: 'success', value: [extra] },
    after: { status: 'success', value: [] },
    timingBefore: {
      domContentLoaded: { status: 'unavailable' },
      loadEvent: { status: 'unrecorded' },
      firstContentfulPaint: { status: 'measured', milliseconds: 0 },
    },
    errorBefore: summary(),
  });
  Object.defineProperties(value, {
    sourceTabId: { get: touched },
    identity: { value: 'private-investigation-sentinel' },
    transferId: { value: 'private-transfer-sentinel' },
    notes: { value: 'private-notes-sentinel' },
  });
  Object.defineProperties(value.errorBefore!, {
    message: { get: touched },
    stack: { value: 'private-stack-sentinel' },
  });
  Object.defineProperties(value.timingBefore!.firstContentfulPaint, {
    url: { get: touched },
    name: { value: 'private-timing-sentinel' },
  });
  const result = createInvestigationReport(value);
  expect(result.status).toBe('success');
  expect(JSON.stringify(result)).not.toContain('private-');
  expect(touched).not.toHaveBeenCalled();
});

it('keeps allowed name/version content even when it resembles a URL or identifier', () => {
  const text = report({
    before: {
      status: 'success',
      value: [
        extension({
          name: 'https://example.invalid/extension',
          version: 'identifier@text',
        }),
      ],
    },
  });
  expect(text).toContain('Name: `"https://example.invalid/extension"`');
  expect(text).toContain('version: `"identifier@text"`');
});

it('keeps Markdown, HTML, controls, bidi and delimiters inside single-line literal values', () => {
  const name =
    '[help](https://attacker.invalid) ![image](https://attacker.invalid/i) <script>x</script> `evil`\n## Forged\r\n| forged |\u202E\u2066\u0000\\u0060"';
  const version = 'é 😀\t\u2028\u0085\uD800';
  const text = report({
    before: { status: 'success', value: [extension({ name, version })] },
  });
  expect(text).toContain(
    '`"[help](https://attacker.invalid) ![image](https://attacker.invalid/i) <script>x</script> \\u0060evil\\u0060\\u000A## Forged\\u000D\\u000A| forged |\\u202E\\u2066\\u0000\\u005Cu0060\\u0022"`',
  );
  expect(text).toContain('version: `"é 😀\\u0009\\u2028\\u0085\\uD800"`');
  expect(text).not.toContain('\n## Forged');
  expect(text).not.toContain('\n| forged |');
  expect(
    [...text].filter((character) => {
      const point = character.codePointAt(0) ?? 0;
      return (
        point <= 9 ||
        (point >= 11 && point <= 31) ||
        (point >= 127 && point <= 159) ||
        [0x2028, 0x202e, 0x2066].includes(point)
      );
    }),
  ).toEqual([]);
  const inventoryLine = text
    .split('\n')
    .find((line) => line.startsWith('- Name: `"[help]'));
  expect(inventoryLine?.match(/`/g)).toHaveLength(4);
});

it('keeps extension text inert when a Markdown renderer interprets the shared report', () => {
  const hostile =
    '<img src="https://private.invalid/x" onerror="bad()">\n# Forged section\n[link](https://private.invalid/) ![image](https://private.invalid/) ` https://private.invalid/ \u202e';
  const text = report({
    before: {
      status: 'success',
      value: [extension({ name: hostile, version: hostile })],
    },
    after: { status: 'success', value: [] },
  });
  const html = Bun.markdown.html(text);
  expect(html).not.toMatch(/<(?:a|img|script|iframe|style)(?:\s|>)/i);
  expect(html).toContain('&lt;img');
  expect(html).not.toContain('<h1>Forged');
  expect(html).not.toContain('\u202e');
  expect(html).toContain('\\u202E');
});

it('includes the observation and saved-file lifetime limits', () => {
  const text = report();
  for (const limitation of [
    'Conditions may differ.',
    'does not verify the page, document, reload, cache state or test conditions',
    'Clock precision can reduce numeric detail.',
    'not unique defects or a console history',
    '30 seconds of eligible observation, 200 events, or an explicit Stop',
    'the page, which can interfere with its operation or counts',
    'Private and unclassifiable contexts are excluded.',
    'do not identify a responsible extension',
    'An already saved file is outside that lifetime',
  ])
    expect(text).toContain(limitation);
});

it('is deterministic and does not modify immutable investigation input', () => {
  const value = state({
    before: Object.freeze({
      status: 'success',
      value: Object.freeze([Object.freeze(extension())]),
    }),
    after: Object.freeze({
      status: 'success',
      value: Object.freeze([Object.freeze(extension({ enabled: false }))]),
    }),
  });
  Object.freeze(value);
  const first = createInvestigationReport(value);
  expect(createInvestigationReport(value)).toEqual(first);
  expect(value.before?.status).toBe('success');
  if (value.before?.status === 'success')
    expect(value.before.value[0]?.enabled).toBe(true);
  expect(value.assessment).toBeNull();
});

it('accepts exactly 1 MiB of UTF-8 and rejects the next byte without truncation', () => {
  const make = (name: string) =>
    state({
      before: { status: 'success', value: [extension({ name })] },
      after: { status: 'success', value: [extension({ name: 'After' })] },
    });
  const baseline = createInvestigationReport(make(''));
  if (baseline.status !== 'success') throw new Error(baseline.reason);
  const available =
    REPORT_MAX_BYTES - new TextEncoder().encode(baseline.value).length;
  const name =
    'é'.repeat(Math.floor(available / 2)) + 'a'.repeat(available % 2);
  const exact = createInvestigationReport(make(name));
  expect(exact.status).toBe('success');
  if (exact.status === 'success') {
    expect(new TextEncoder().encode(exact.value)).toHaveLength(
      REPORT_MAX_BYTES,
    );
    expect(exact.value).toContain(`Name: \`"${name}"\``);
  }
  expect(createInvestigationReport(make(name + 'a'))).toEqual({
    status: 'error',
    reason:
      'The report exceeds the 1 MiB limit. It cannot be previewed or saved.',
  });
});

it('bounds escaped text expansion and stops before processing later inventory entries', () => {
  const touched = vi.fn(() => {
    throw new Error('later field read');
  });
  const later = extension();
  Object.defineProperty(later, 'name', { get: touched });
  const result = createInvestigationReport(
    state({
      before: {
        status: 'success',
        value: [extension({ name: '\u202E'.repeat(REPORT_MAX_BYTES) }), later],
      },
    }),
  );
  expect(result.status).toBe('error');
  expect(touched).not.toHaveBeenCalled();
});
