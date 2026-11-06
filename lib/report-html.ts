import type { Result } from './inspector';
import {
  assessmentLabels,
  changeLabels,
  count,
  difference,
  errorObservation,
  errorRows,
  literalControls,
  measurement,
  milestones,
  numberFormat,
  reportLimits,
  type ReportProvenance,
} from './report-content';
import type {
  SavedChange,
  SavedInventoryEntry,
  SavedObservationLimits,
  SavedReport,
} from './saved-record';

export const PRINTABLE_HTML_MAX_BYTES = 1_048_576;

export type { ReportProvenance };

const tooLarge = Symbol('printable HTML size limit');

const style = `<style>
@page { margin: 14mm; }
:root { color-scheme: light; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; background: #fff; color: #111; }
body { font: 11pt/1.45 system-ui, -apple-system, "Segoe UI", sans-serif; }
main { max-width: 190mm; margin: 0 auto; }
h1 { font-size: 20pt; line-height: 1.15; margin: 0 0 6pt; }
h2 { font-size: 13pt; margin: 16pt 0 6pt; padding-bottom: 3pt; border-bottom: 1px solid #bbb; break-after: avoid; page-break-after: avoid; }
h3 { font-size: 11.5pt; margin: 0 0 4pt; break-after: avoid; page-break-after: avoid; }
p { margin: 0 0 6pt; }
ul { margin: 0 0 6pt; padding-left: 16pt; }
li { margin: 0 0 4pt; }
.provenance { margin: 8pt 0 12pt; padding: 6pt 8pt; border-left: 3pt solid #555; background: #f2f2f2; }
.metadata { color: #444; }
.empty { color: #444; font-style: italic; }
.entry-name { font-weight: 600; overflow-wrap: anywhere; word-break: break-word; }
.entry-meta { display: block; color: #444; font-size: 9.5pt; overflow-wrap: anywhere; word-break: break-word; }
.change-kind { font-weight: 700; }
table { width: 100%; border-collapse: collapse; table-layout: fixed; margin: 0 0 8pt; }
th, td { text-align: left; vertical-align: top; border: 1px solid #bbb; padding: 3pt 4pt; overflow-wrap: anywhere; word-break: break-word; }
thead { display: table-header-group; }
tr { break-inside: avoid; page-break-inside: avoid; }
caption { text-align: left; color: #444; font-size: 9.5pt; padding: 0 0 3pt; }
footer { margin-top: 16pt; padding-top: 6pt; border-top: 1px solid #bbb; color: #444; font-size: 9.5pt; }
</style>`;

function escapeHtml(value: string) {
  let output = '';
  for (const character of value) {
    if (literalControls.test(character) || character === '\\') {
      output += `\\u{${character.codePointAt(0)!.toString(16).toUpperCase()}}`;
    } else if (character === '&') output += '&amp;';
    else if (character === '<') output += '&lt;';
    else if (character === '>') output += '&gt;';
    else if (character === '"') output += '&quot;';
    else if (character === "'") output += '&#39;';
    else output += character;
  }
  return output;
}

function literal(value: string) {
  return `&quot;${escapeHtml(value)}&quot;`;
}

export function createPrintableHtml(
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
    if (byteCount > PRINTABLE_HTML_MAX_BYTES) throw tooLarge;
    parts.push(text);
  };
  const entry = (value: SavedInventoryEntry, kind?: SavedChange['kind']) => {
    write('<li>');
    if (kind) write(`<span class="change-kind">${changeLabels[kind]}.</span> `);
    write(
      `<span class="entry-name">${literal(value.name)}</span><span class="entry-meta">Version ${literal(value.version)} · ${value.enabled ? 'Enabled' : 'Disabled'}</span></li>\n`,
    );
  };
  const inventory = (
    label: 'Before' | 'After',
    values: readonly SavedInventoryEntry[],
  ) => {
    write(`<section>\n<h2>${label} inventory</h2>\n`);
    write(
      `<p class="metadata">${count('extension row', values.length)} reported.</p>\n`,
    );
    if (values.length === 0)
      write('<p class="empty">No extensions reported in this capture.</p>\n');
    else {
      write('<ul>\n');
      for (const value of values) entry(value);
      write('</ul>\n');
    }
    write('</section>\n');
  };
  const observationLimits = (values: SavedObservationLimits) => {
    write('<section>\n<h2>Observation limits</h2>\n');
    write(
      `<p>Page-error observation limits that applied to this capture: ${numberFormat.format(values.pageErrorWindowMs)} ms window, ${numberFormat.format(values.pageErrorEvents)} events, ${numberFormat.format(values.pageErrorSummaryBytes)}-byte summary.</p>\n<ul>\n`,
    );
    for (const limit of reportLimits) write(`<li>${escapeHtml(limit)}</li>\n`);
    write('</ul>\n</section>\n');
  };

  try {
    write(
      '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n',
    );
    write(
      '<meta name="viewport" content="width=device-width, initial-scale=1">\n',
    );
    write('<title>AddonRay investigation report</title>\n');
    write(
      `${style}\n</head>\n<body>\n<main>\n<header>\n<h1>AddonRay investigation report</h1>\n`,
    );
    if (options.provenance === 'imported') {
      write(
        '<p class="provenance"><strong>Imported report — untrusted file content.</strong> AddonRay did not observe this content in the browser',
      );
      if (options.claimedProvenance)
        write(
          `; the selected file claims provenance <strong>${options.claimedProvenance}</strong>, which is not authenticated`,
        );
      write('. This content is treated as imported on every re-export.</p>\n');
      write(
        '<p>This report contains content read from an imported file. Missing observations are explicit. This report is not a diagnosis.</p>\n',
      );
    } else {
      write(
        '<p class="provenance"><strong>Captured report.</strong> AddonRay captured this Before/After investigation in this browser profile.</p>\n',
      );
      write(
        '<p>One manually captured Before/After investigation. Missing observations are explicit. This report is not a diagnosis.</p>\n',
      );
    }
    write('</header>\n');

    write('<section>\n<h2>Your page assessment</h2>\n');
    write(
      `<p>${report.assessment === null ? 'Not recorded.' : `${assessmentLabels[report.assessment]}.`}</p>\n</section>\n`,
    );

    inventory('Before', report.before.extensions);
    inventory('After', report.after.extensions);

    write('<section>\n<h2>Reported inventory changes</h2>\n');
    if (report.changes.length === 0)
      write(
        '<p class="empty">No reported additions, removals or enabled-state changes.</p>\n',
      );
    else {
      write(
        `<p class="metadata">${count('stored inventory change', report.changes.length)}.</p>\n<ul>\n`,
      );
      for (const change of report.changes) entry(change, change.kind);
      write('</ul>\n');
    }
    write(
      '<p class="metadata">This list was computed from the extension-ID comparison for this report and is retained as captured. It is never recomputed from names. Extension names and versions can duplicate, so rows may be indistinguishable. Name or version changes alone are not classified as inventory changes. Permissions and page activity are not compared.</p>\n</section>\n',
    );

    write('<section>\n<h2>Optional loading timings</h2>\n');
    write(
      '<table>\n<caption>Milestones are milliseconds since each document\'s navigation began. Difference is After minus Before and is shown only when both values were measured.</caption>\n<thead><tr><th scope="col">Milestone</th><th scope="col">Before</th><th scope="col">After</th><th scope="col">Difference</th></tr></thead>\n<tbody>\n',
    );
    for (const [key, label] of milestones) {
      const before = report.timing.before?.[key];
      const after = report.timing.after?.[key];
      write(
        `<tr><th scope="row">${label}</th><td>${measurement(before)}</td><td>${measurement(after)}</td><td>${difference(before, after)}</td></tr>\n`,
      );
    }
    write('</tbody>\n</table>\n</section>\n');

    write('<section>\n<h2>Optional page-error counts</h2>\n');
    write(
      '<table>\n<caption>Counts, durations and completion reasons preserved from two separate observations. Missing attachments are not zero-error results.</caption>\n<thead><tr><th scope="col">Observation</th><th scope="col">Before</th><th scope="col">After</th></tr></thead>\n<tbody>\n',
    );
    for (const [key, label] of errorRows) {
      write(
        `<tr><th scope="row">${label}</th><td>${errorObservation(report.pageErrors.before, key)}</td><td>${errorObservation(report.pageErrors.after, key)}</td></tr>\n`,
      );
    }
    write('</tbody>\n</table>\n</section>\n');

    observationLimits(report.observationLimits);

    write(
      "<footer>\n<p>Extension names and versions are included and can reveal your extension choices. Once saved or printed, this file or print is outside AddonRay's control and cannot be recalled.</p>\n</footer>\n</main>\n</body>\n</html>\n",
    );

    return { status: 'success', value: parts.join('') };
  } catch (error) {
    return {
      status: 'error',
      reason:
        error === tooLarge
          ? 'The printable HTML report exceeds the 1 MiB limit. It cannot be previewed, downloaded or printed.'
          : 'The printable HTML report could not be prepared. Try again.',
    };
  }
}
