import type { Result } from './inspector';
import {
  assessmentLabels,
  changeLabels,
  count,
  difference,
  errorObservation,
  errorRows,
  measurement,
  milestones,
  numberFormat,
  reportLimits,
  writeMarkdownLiteral,
  type ReportProvenance,
} from './report-content';
import { REPORT_TEXT_MAX_BYTES } from './report-shape';
import type {
  SavedChange,
  SavedInventoryEntry,
  SavedObservationLimits,
  SavedReport,
} from './saved-record';

const tooLarge = Symbol('clipboard Markdown size limit');

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
  const literal = (value: string) => writeMarkdownLiteral(write, value);
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
    for (const limit of reportLimits) write(`- ${limit}\n`);
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
