import { compareInventories, type SnapshotEntry } from './comparison';
import type { Result, TimingMeasurement } from './inspector';
import type { Investigation } from './investigation';
import type { PageErrorSummary } from './page-error-check';

export const REPORT_MAX_BYTES = 1_048_576;
export const REPORT_FILENAME = 'addonray-investigation.md';

type InvestigationState = ReturnType<Investigation['getSnapshot']>;

const numberFormat = new Intl.NumberFormat('en', { maximumFractionDigits: 2 });
const completionLabels: Record<PageErrorSummary['finish'], string> = {
  stop: 'Stopped by you',
  timeout: '30-second window ended',
  limit: '200-event limit reached',
};
const assessmentLabels = {
  better: 'Better',
  unchanged: 'Unchanged',
  worse: 'Worse',
  uncertain: 'Uncertain',
};
const changeLabels = {
  added: 'Added',
  removed: 'Removed',
  enabled: 'Enabled',
  disabled: 'Disabled',
};
const milestones = [
  ['domContentLoaded', 'DOM content loaded'],
  ['loadEvent', 'Load event completed'],
  ['firstContentfulPaint', 'First content displayed'],
] as const;
const tooLarge = Symbol('report size limit');
const literalControls = /[\p{Cc}\p{Cf}\p{Cs}\u2028\u2029]/u;

function measurement(value: TimingMeasurement | undefined) {
  if (!value) return 'Not attached';
  if (value.status === 'unavailable') return 'Unavailable at capture';
  if (value.status === 'unrecorded') return 'Not recorded at capture';
  return milliseconds(value.milliseconds);
}

function milliseconds(value: number) {
  return value > 0 && value < 0.01
    ? '<0.01 ms'
    : `${numberFormat.format(value)} ms`;
}

function difference(
  before: TimingMeasurement | undefined,
  after: TimingMeasurement | undefined,
) {
  if (before?.status !== 'measured' || after?.status !== 'measured')
    return 'Needs two measured values';
  const delta = after.milliseconds - before.milliseconds;
  if (delta === 0) return '0 ms';
  return `${delta > 0 ? '+' : '−'}${milliseconds(Math.abs(delta))}`;
}

function errorObservation(
  summary: PageErrorSummary | null,
  key: keyof PageErrorSummary,
) {
  if (!summary) return 'Not attached';
  if (key === 'finish') return completionLabels[summary.finish];
  if (key === 'observedMs') return milliseconds(summary.observedMs);
  return String(summary[key]);
}

export function createInvestigationReport(
  state: InvestigationState,
): Result<string> {
  if (
    state.busy !== null ||
    state.before?.status !== 'success' ||
    state.after?.status !== 'success'
  )
    return {
      status: 'unavailable',
      reason:
        'Capture both inventories and wait for any capture to finish before preparing a report.',
    };

  const parts: string[] = [];
  const encoder = new TextEncoder();
  let bytes = 0;
  const write = (text: string) => {
    bytes += encoder.encode(text).length;
    if (bytes > REPORT_MAX_BYTES) throw tooLarge;
    parts.push(text);
  };
  const literal = (value: string) => {
    write('`"');
    let chunk = '';
    for (const character of value) {
      const code = character.codePointAt(0)!;
      // Code spans prevent Markdown/HTML interpretation; escape their delimiter,
      // ambiguous literal escapes, and invisible controls without dropping data.
      chunk +=
        character === '`' ||
        character === '\\' ||
        character === '"' ||
        literalControls.test(character)
          ? code <= 0xffff
            ? `\\u${code.toString(16).toUpperCase().padStart(4, '0')}`
            : `\\u{${code.toString(16).toUpperCase()}}`
          : character;
      if (chunk.length >= 4096) {
        write(chunk);
        chunk = '';
      }
    }
    write(chunk);
    write('"`');
  };
  const entry = (value: SnapshotEntry, prefix = '') => {
    write(`- ${prefix}Name: `);
    literal(value.name);
    write('; version: ');
    literal(value.version);
    write(`; state: ${value.enabled ? 'Enabled' : 'Disabled'}.\n`);
  };

  try {
    write('# AddonRay investigation report\n\n');
    write(
      'One manually captured Before/After investigation. Missing observations are explicit. This report is not a diagnosis.\n\n',
    );
    // Serialize inventories first so their byte limit bounds later diff work too.
    for (const [label, inventory] of [
      ['Before', state.before.value],
      ['After', state.after.value],
    ] as const) {
      write(`## ${label} inventory\n\n`);
      write(`Extensions reported: ${inventory.length}.\n\n`);
      if (inventory.length === 0) write('No extensions reported.\n');
      for (const value of inventory) entry(value);
      write('\n');
    }

    write('## Reported inventory changes\n\n');
    const changes = compareInventories(state.before.value, state.after.value);
    if (changes.length === 0)
      write('No reported additions, removals or enabled-state changes.\n');
    for (const change of changes)
      entry(change.entry, `${changeLabels[change.kind]}. `);
    write(
      '\nChanges compare reported additions, removals and enabled states. Name or version changes alone are not classified as inventory changes. Permissions and page activity are not compared.\n\n',
    );

    write('## Your page assessment\n\n');
    write(
      `${state.assessment === null ? 'Not recorded' : assessmentLabels[state.assessment]}.\n\n`,
    );

    write('## Optional loading timings\n\n');
    write(
      "Milestones are milliseconds since each document's navigation began. Difference is After minus Before.\n\n",
    );
    write('| Milestone | Before | After | Difference |\n');
    write('| --- | --- | --- | --- |\n');
    for (const [key, label] of milestones) {
      const before = state.timingBefore?.[key];
      const after = state.timingAfter?.[key];
      write(
        `| ${label} | ${measurement(before)} | ${measurement(after)} | ${difference(before, after)} |\n`,
      );
    }
    write('\n');

    write('## Optional page-error counts\n\n');
    write('| Observation | Before | After |\n');
    write('| --- | --- | --- |\n');
    for (const [key, label] of [
      ['scriptErrors', 'Uncaught JavaScript error events'],
      ['unhandledRejections', 'Unhandled promise-rejection events'],
      ['total', 'Total observed events'],
      ['observedMs', 'Observation duration'],
      ['finish', 'Completion reason'],
    ] as const)
      write(
        `| ${label} | ${errorObservation(state.errorBefore, key)} | ${errorObservation(state.errorAfter, key)} |\n`,
      );

    write('\n## Observation limits\n\n');
    for (const limit of [
      'Inventories contain only extensions reported by the browser. Enabled state does not show whether an extension ran on the tested page.',
      'Inventory, timing and page-error captures are separate observations. Attachment order does not prove when the page was tested or settings changed. Conditions may differ.',
      'Timing and error attachments share one source browser tab, but a tab can navigate. A match does not verify the page, document, reload, cache state or test conditions. No page URL or title fields are collected.',
      'DOM content loaded is when DOMContentLoaded handlers finished. Load event completed is when load handlers finished; later work can continue. First content displayed is the first qualifying text or image paint, when reported.',
      'Positive timing differences mean a later milestone; negative differences mean an earlier one. Missing values have no assumed cause. Clock precision can reduce numeric detail. These timings can describe an original load after a page changes its view or is restored. They do not measure scrolling or typing.',
      'Page-error checks count future top-frame uncaught JavaScript error and unhandled promise-rejection notifications in the current document. They are event counts, not unique defects or a console history.',
      'Each error observation ends at 30 seconds of eligible observation, 200 events, or an explicit Stop. Stop can retain partial counts; the event limit excludes later events. Durations and reproduced interactions can differ, even for two full windows.',
      'Only confirmed Stop, timeout or event-limit summaries attach. Missing or interrupted observations are not zero-error results. Zero observed events does not mean the page is error-free. No error differences or rates are calculated.',
      'Firefox observes page errors in an isolated execution world. On Chrome, the observer runs with the page, which can interfere with its operation or counts. Timing collectors use an isolated execution world.',
      'Attachments are limited to verified normal windows. Private and unclassifiable contexts are excluded. Timings and errors do not identify a responsible extension; the manual page assessment remains separate.',
      'AddonRay does not change other extensions or reload the tested page. These observations do not establish what caused a page result.',
      'Extension names and versions can be sensitive. Review this report before sharing. Quoted code values show literal text; Unicode escape notation represents backticks, backslashes, quotes or invisible controls.',
      'Start over, permission revocation or closing, reloading or unloading the investigation clears its in-memory results. An already saved file is outside that lifetime and is not erased by those actions.',
    ])
      write(`- ${limit}\n`);

    return { status: 'success', value: parts.join('') };
  } catch (error) {
    return {
      status: 'error',
      reason:
        error === tooLarge
          ? 'The report exceeds the 1 MiB limit. It cannot be previewed or saved.'
          : 'The report could not be prepared. Try previewing it again.',
    };
  }
}
