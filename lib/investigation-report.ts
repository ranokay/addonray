import { compareInventories, type SnapshotEntry } from './comparison';
import type { Result } from './inspector';
import type { Investigation } from './investigation';
import type { PageErrorSummary } from './page-error-check';
import {
  assessmentLabels,
  changeLabels,
  completionLabels,
  difference,
  measurement,
  milliseconds,
  milestones,
  reportLimits,
  writeMarkdownLiteral,
} from './report-content';

export const REPORT_MAX_BYTES = 1_048_576;
export const REPORT_FILENAME = 'addonray-investigation.md';

type InvestigationState = ReturnType<Investigation['getSnapshot']>;

const tooLarge = Symbol('report size limit');

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
  const literal = (value: string) => writeMarkdownLiteral(write, value);
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
      ...reportLimits.slice(0, 12),
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
