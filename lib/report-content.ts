import type { TimingMeasurement } from './inspector';
import type { PageErrorSummary } from './page-error-check';

export type ReportProvenance = 'captured' | 'imported';

export const numberFormat = new Intl.NumberFormat('en', {
  maximumFractionDigits: 2,
});
export const assessmentLabels = {
  better: 'Better',
  unchanged: 'Unchanged',
  worse: 'Worse',
  uncertain: 'Uncertain',
} as const;
export const changeLabels = {
  added: 'Added',
  removed: 'Removed',
  enabled: 'Enabled',
  disabled: 'Disabled',
} as const;
export const completionLabels: Record<PageErrorSummary['finish'], string> = {
  stop: 'Stopped by you',
  timeout: '30-second window ended',
  limit: '200-event limit reached',
};
export const milestones = [
  ['domContentLoaded', 'DOM content loaded'],
  ['loadEvent', 'Load event completed'],
  ['firstContentfulPaint', 'First content displayed'],
] as const;
export const errorRows = [
  ['scriptErrors', 'Uncaught JavaScript error events'],
  ['unhandledRejections', 'Unhandled promise-rejection events'],
  ['total', 'Total observed events'],
  ['observedMs', 'Observation duration'],
  ['finish', 'Completion reason'],
] as const;
export const literalControls = /[\p{Cc}\p{Cf}\p{Cs}\u2028\u2029]/u;

export function milliseconds(value: number) {
  return value > 0 && value < 0.01
    ? '<0.01 ms'
    : `${numberFormat.format(value)} ms`;
}

export function measurement(value: TimingMeasurement | undefined) {
  if (!value) return 'Not attached';
  if (value.status === 'unavailable') return 'Unavailable at capture';
  if (value.status === 'unrecorded') return 'Not recorded at capture';
  return milliseconds(value.milliseconds);
}

export function difference(
  before: TimingMeasurement | undefined,
  after: TimingMeasurement | undefined,
) {
  if (before?.status !== 'measured' || after?.status !== 'measured')
    return 'Needs two measured values';
  const delta = after.milliseconds - before.milliseconds;
  if (delta === 0) return '0 ms';
  return `${delta > 0 ? '+' : '−'}${milliseconds(Math.abs(delta))}`;
}

export function errorObservation(
  summary: PageErrorSummary | null,
  key: (typeof errorRows)[number][0],
) {
  if (!summary) return 'Not attached';
  if (key === 'finish') return completionLabels[summary.finish];
  if (key === 'observedMs') return milliseconds(summary.observedMs);
  return numberFormat.format(summary[key]);
}

export function count(text: string, value: number) {
  return `${numberFormat.format(value)} ${text}${value === 1 ? '' : 's'}`;
}

// Markdown code spans keep hostile names literal. Escaping their delimiter,
// backslashes, quotes and invisible controls preserves one exact text value.
export function writeMarkdownLiteral(
  write: (text: string) => void,
  value: string,
) {
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
}

export const commonReportLimits = [
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
] as const;

export const reportLimits = [
  ...commonReportLimits,
  'Start over, permission revocation or closing, reloading or unloading the investigation clears its in-memory results. A copied report, downloaded file or print is outside that lifetime and is not erased by those actions.',
] as const;
