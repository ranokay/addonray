import type { Result, TimingMeasurement } from './inspector';
import type { PageErrorSummary } from './page-error-check';
import type { ReportProvenance } from './report-html';
import { REPORT_TEXT_MAX_BYTES } from './report-shape';
import type {
  SavedChange,
  SavedInventoryEntry,
  SavedObservationLimits,
  SavedReport,
} from './saved-record';

const numberFormat = new Intl.NumberFormat('en', { maximumFractionDigits: 2 });
const assessmentLabels = {
  better: 'Better',
  unchanged: 'Unchanged',
  worse: 'Worse',
  uncertain: 'Uncertain',
} as const;
const changeLabels = {
  added: 'Added',
  removed: 'Removed',
  enabled: 'Enabled',
  disabled: 'Disabled',
} as const;
const completionLabels: Record<PageErrorSummary['finish'], string> = {
  stop: 'Stopped by you',
  timeout: '30-second window ended',
  limit: '200-event limit reached',
};
const milestones = [
  ['domContentLoaded', 'DOM content loaded'],
  ['loadEvent', 'Load event completed'],
  ['firstContentfulPaint', 'First content displayed'],
] as const;
const errorRows = [
  ['scriptErrors', 'Uncaught JavaScript error events'],
  ['unhandledRejections', 'Unhandled promise-rejection events'],
  ['total', 'Total observed events'],
  ['observedMs', 'Observation duration'],
  ['finish', 'Completion reason'],
] as const;
const limits = [
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
  'Start over, permission revocation or closing, reloading or unloading the investigation clears its in-memory results. A copied report, downloaded file or print is outside that lifetime and is not erased by those actions.',
];
const tooLarge = Symbol('clipboard Markdown size limit');
const literalControls = /[\p{Cc}\p{Cf}\p{Cs}\u2028\u2029]/u;

function milliseconds(value: number) {
  return value > 0 && value < 0.01
    ? '<0.01 ms'
    : `${numberFormat.format(value)} ms`;
}

function measurement(value: TimingMeasurement | undefined) {
  if (!value) return 'Not attached';
  if (value.status === 'unavailable') return 'Unavailable at capture';
  if (value.status === 'unrecorded') return 'Not recorded at capture';
  return milliseconds(value.milliseconds);
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
  key: (typeof errorRows)[number][0],
) {
  if (!summary) return 'Not attached';
  if (key === 'finish') return completionLabels[summary.finish];
  if (key === 'observedMs') return milliseconds(summary.observedMs);
  return numberFormat.format(summary[key]);
}

function count(text: string, value: number) {
  return `${numberFormat.format(value)} ${text}${value === 1 ? '' : 's'}`;
}

// The clipboard representation is exact Markdown from the stored report. Code
// spans keep hostile names literal, and controls or delimiters are shown as
// Unicode escapes so copied text cannot masquerade as different content.
export function createReportMarkdown(
  report: SavedReport,
  options: {
    provenance: ReportProvenance;
    claimedProvenance?: ReportProvenance;
  },
): Result<string> {
  const parts: string[] = [];
  const encoder = new TextEncoder();
  let byteCount = 0;
  const write = (text: string) => {
    byteCount += encoder.encode(text).length;
    if (byteCount > REPORT_TEXT_MAX_BYTES) throw tooLarge;
    parts.push(text);
  };
  const literal = (value: string) => {
    write('`"');
    let chunk = '';
    for (const character of value) {
      const code = character.codePointAt(0)!;
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
  const entry = (value: SavedInventoryEntry, kind?: SavedChange['kind']) => {
    write('- ');
    if (kind) write(`${changeLabels[kind]}. `);
    write('Name: ');
    literal(value.name);
    write('; version: ');
    literal(value.version);
    write(`; state: ${value.enabled ? 'Enabled' : 'Disabled'}.\n`);
  };
  const inventory = (
    label: 'Before' | 'After',
    values: readonly SavedInventoryEntry[],
  ) => {
    write(`## ${label} inventory\n\n`);
    write(`Extensions reported: ${numberFormat.format(values.length)}.\n\n`);
    if (values.length === 0) write('No extensions reported.\n');
    for (const value of values) entry(value);
    write('\n');
  };
  const observationLimits = (values: SavedObservationLimits) => {
    write('## Observation limits\n\n');
    write(
      `Page-error observation limits that applied to this capture: ${numberFormat.format(values.pageErrorWindowMs)} ms window, ${numberFormat.format(values.pageErrorEvents)} events, ${numberFormat.format(values.pageErrorSummaryBytes)}-byte summary.\n\n`,
    );
    for (const limit of limits) write(`- ${limit}\n`);
  };

  try {
    write('# AddonRay investigation report\n\n');
    if (options.provenance === 'imported') {
      write(
        'Imported report — untrusted file content. AddonRay did not observe this content in the browser',
      );
      if (options.claimedProvenance)
        write(
          `; the selected file claims provenance ${options.claimedProvenance}, which is not authenticated`,
        );
      write('. This content is treated as imported on every re-export.\n\n');
      write(
        'This report contains content read from an imported file. Missing observations are explicit. This report is not a diagnosis.\n\n',
      );
    } else {
      write(
        'Captured report. AddonRay captured this Before/After investigation in this browser profile.\n\n',
      );
      write(
        'One manually captured Before/After investigation. Missing observations are explicit. This report is not a diagnosis.\n\n',
      );
    }

    write('## Your page assessment\n\n');
    write(
      `${report.assessment === null ? 'Not recorded' : assessmentLabels[report.assessment]}.\n\n`,
    );

    inventory('Before', report.before.extensions);
    inventory('After', report.after.extensions);

    write('## Reported inventory changes\n\n');
    if (report.changes.length === 0)
      write('No reported additions, removals or enabled-state changes.\n');
    else {
      write(`${count('stored inventory change', report.changes.length)}.\n\n`);
      for (const change of report.changes) entry(change, change.kind);
    }
    write(
      '\nThis list was computed from the extension-ID comparison for this report and is retained as captured. It is never recomputed from names. Extension names and versions can duplicate, so rows may be indistinguishable. Name or version changes alone are not classified as inventory changes. Permissions and page activity are not compared.\n\n',
    );

    write('## Optional loading timings\n\n');
    write(
      "Milestones are milliseconds since each document's navigation began. Difference is After minus Before and is shown only when both values were measured.\n\n",
    );
    write('| Milestone | Before | After | Difference |\n');
    write('| --- | --- | --- | --- |\n');
    for (const [key, label] of milestones) {
      const before = report.timing.before?.[key];
      const after = report.timing.after?.[key];
      write(
        `| ${label} | ${measurement(before)} | ${measurement(after)} | ${difference(before, after)} |\n`,
      );
    }
    write('\n');

    write('## Optional page-error counts\n\n');
    write(
      'Counts, durations and completion reasons are preserved from two separate observations. Missing attachments are not zero-error results.\n\n',
    );
    write('| Observation | Before | After |\n');
    write('| --- | --- | --- |\n');
    for (const [key, label] of errorRows) {
      write(
        `| ${label} | ${errorObservation(report.pageErrors.before, key)} | ${errorObservation(report.pageErrors.after, key)} |\n`,
      );
    }
    write('\n');

    observationLimits(report.observationLimits);

    write(
      "\nExtension names and versions are included and can reveal your extension choices. Copied, downloaded or printed content is outside AddonRay's control and cannot be recalled.\n",
    );

    return { status: 'success', value: parts.join('') };
  } catch (error) {
    return {
      status: 'error',
      reason:
        error === tooLarge
          ? 'The Markdown report exceeds the 1 MiB clipboard limit. It was not copied.'
          : 'The Markdown report could not be prepared. Try again.',
    };
  }
}
