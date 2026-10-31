import type { SavedLibraryEntry } from '../../lib/saved-library';
import type {
  SavedChange,
  SavedInventoryEntry,
  SavedObservationLimits,
  SavedRecord,
  SavedReport,
} from '../../lib/saved-record';
import type { TimingMeasurement, TimingSnapshot } from '../../lib/inspector';
import type { PageErrorSummary } from '../../lib/page-error-check';

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

const measurementLabels = {
  unavailable: 'Unavailable at capture',
  unrecorded: 'Not recorded at capture',
} as const;

const finishLabels = {
  stop: 'Stopped by you',
  timeout: '30-second window ended',
  limit: '200-event limit reached',
} as const;

const numberFormat = new Intl.NumberFormat('en', { maximumFractionDigits: 2 });
const dateFormat = new Intl.DateTimeFormat('en', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

function describeMeasurement(measurement: TimingMeasurement | undefined) {
  if (!measurement) return 'Not attached';
  if (measurement.status !== 'measured')
    return measurementLabels[measurement.status];
  if (measurement.milliseconds > 0 && measurement.milliseconds < 0.01)
    return '<0.01 ms';
  return `${numberFormat.format(measurement.milliseconds)} ms`;
}

function TimingTable({
  before,
  after,
}: {
  before: TimingSnapshot | null;
  after: TimingSnapshot | null;
}) {
  const milestones = [
    ['domContentLoaded', 'DOM content loaded'],
    ['loadEvent', 'Load event completed'],
    ['firstContentfulPaint', 'First content displayed'],
  ] as const;
  return (
    <div
      className="timing-table-scroll"
      tabIndex={0}
      role="region"
      aria-label="Saved loading milestone comparison"
    >
      <table className="timing-comparison">
        <caption>
          Recorded milestones in milliseconds since each document's navigation
          began. Missing states are preserved from the capture.
        </caption>
        <thead>
          <tr>
            <th scope="col">Milestone</th>
            <th scope="col">Before</th>
            <th scope="col">After</th>
          </tr>
        </thead>
        <tbody>
          {milestones.map(([key, label]) => (
            <tr key={key}>
              <th scope="row">{label}</th>
              <td>{describeMeasurement(before?.[key])}</td>
              <td>{describeMeasurement(after?.[key])}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ErrorTable({
  before,
  after,
}: {
  before: PageErrorSummary | null;
  after: PageErrorSummary | null;
}) {
  const observations = [
    ['scriptErrors', 'Uncaught JavaScript error events'],
    ['unhandledRejections', 'Unhandled promise-rejection events'],
    ['total', 'Total observed events'],
    ['observedMs', 'Observation duration'],
    ['finish', 'Completion reason'],
  ] as const;
  const describe = (
    summary: PageErrorSummary | null,
    key: (typeof observations)[number][0],
  ) => {
    if (!summary) return 'Not attached';
    if (key === 'finish') return finishLabels[summary.finish];
    if (key === 'observedMs')
      return summary.observedMs > 0 && summary.observedMs < 0.01
        ? '<0.01 ms'
        : `${numberFormat.format(summary.observedMs)} ms`;
    return String(summary[key]);
  };
  return (
    <div
      className="error-table-scroll"
      tabIndex={0}
      role="region"
      aria-label="Saved page-error count comparison"
    >
      <table className="error-comparison">
        <caption>
          Counts, durations and completion reasons preserved from two separate
          observations. Missing attachments are not zero-error results.
        </caption>
        <thead>
          <tr>
            <th scope="col">Observation</th>
            <th scope="col">Before</th>
            <th scope="col">After</th>
          </tr>
        </thead>
        <tbody>
          {observations.map(([key, label]) => (
            <tr key={key}>
              <th scope="row">{label}</th>
              <td>{describe(before, key)}</td>
              <td>{describe(after, key)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Inventory({
  label,
  entries,
}: {
  label: 'Before' | 'After';
  entries: readonly SavedInventoryEntry[];
}) {
  return (
    <section
      className="archive-inventory"
      aria-labelledby={`archive-${label.toLowerCase()}-heading`}
    >
      <h3 id={`archive-${label.toLowerCase()}-heading`}>{label} inventory</h3>
      <p className="metadata" role="status">
        {entries.length === 1
          ? '1 extension row reported.'
          : `${entries.length} extension rows reported.`}
      </p>
      {entries.length === 0 ? (
        <p className="metadata">No extensions reported in this archive.</p>
      ) : (
        <ul className="snapshot-list">
          {entries.map((entry, index) => (
            <li key={`${label}:${index}`}>
              <div className="entry-heading">
                <strong>{entry.name}</strong>
                <span className="state-label">
                  {entry.enabled ? 'Enabled' : 'Disabled'}
                </span>
              </div>
              <p className="metadata">Version {entry.version}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Changes({ changes }: { changes: readonly SavedChange[] }) {
  return (
    <section
      className="archive-changes"
      aria-labelledby="archive-changes-heading"
    >
      <h3 id="archive-changes-heading">Reported inventory changes</h3>
      {changes.length === 0 ? (
        <p role="status">
          No reported additions, removals or enabled-state changes were stored.
        </p>
      ) : (
        <>
          <p role="status">
            {changes.length} stored inventory{' '}
            {changes.length === 1 ? 'change' : 'changes'}.
          </p>
          <ul className="changes-list">
            {changes.map((change, index) => (
              <li key={`${change.kind}:${index}`}>
                <span className="change-kind">{changeLabels[change.kind]}</span>
                <div>
                  <strong>{change.name}</strong>
                  <p className="metadata">
                    Version {change.version} ·{' '}
                    {change.enabled ? 'Enabled' : 'Disabled'}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
      <p className="metadata">
        This list was computed before saving from the live extension-ID
        comparison and is retained as captured. It is never recomputed from
        archived names. Duplicate names and versions can make rows
        indistinguishable.
      </p>
    </section>
  );
}

function limitsText(limits: SavedObservationLimits) {
  return `${numberFormat.format(limits.pageErrorWindowMs)} ms window, ${numberFormat.format(
    limits.pageErrorEvents,
  )} events, ${numberFormat.format(limits.pageErrorSummaryBytes)}-byte summary`;
}

export function ArchiveView({ record }: { record: SavedRecord }) {
  const report: SavedReport = record.report;
  const saved = dateFormat.format(new Date(record.savedAt));
  const expires = dateFormat.format(new Date(record.expiresAt));
  return (
    <article className="archive" aria-labelledby="archive-heading">
      <header className="archive-header">
        <div>
          <p className="eyebrow">Read-only saved investigation</p>
          <h2 id="archive-heading">
            {report.assessment === null
              ? 'No assessment'
              : assessmentLabels[report.assessment]}
          </h2>
          <p className="metadata">
            Saved {saved}. Expires {expires}.
          </p>
          <p className="metadata">
            {record.origin === 'captured'
              ? 'Captured from a live investigation in this browser profile.'
              : 'Imported report content.'}
          </p>
        </div>
      </header>
      <p className="archive-note">
        This archive is read-only. It cannot resume collection, inspect a page,
        prompt for permission or reattach a source tab. It stores no extension
        IDs, source tab IDs, page URLs or titles. Extension names and versions
        can reveal extension choices.
      </p>

      <section aria-labelledby="archive-assessment-heading">
        <h3 id="archive-assessment-heading">Page assessment</h3>
        <p>
          {report.assessment === null
            ? 'Not recorded.'
            : assessmentLabels[report.assessment]}
        </p>
      </section>

      <div className="archive-inventory-grid">
        <Inventory label="Before" entries={report.before.extensions} />
        <Inventory label="After" entries={report.after.extensions} />
      </div>

      <Changes changes={report.changes} />

      <section aria-labelledby="archive-timing-heading">
        <h3 id="archive-timing-heading">Loading timings</h3>
        <TimingTable
          before={report.timing.before}
          after={report.timing.after}
        />
      </section>

      <section aria-labelledby="archive-errors-heading">
        <h3 id="archive-errors-heading">Page-error counts</h3>
        <ErrorTable
          before={report.pageErrors.before}
          after={report.pageErrors.after}
        />
      </section>

      <section aria-labelledby="archive-limits-heading">
        <h3 id="archive-limits-heading">Observation limits</h3>
        <p>Page-error observation: {limitsText(report.observationLimits)}.</p>
        <p className="metadata">
          These limits applied to the capture and are retained with the archive.
          Zero observed events does not mean the page was error-free, and none
          of these observations establishes what caused the page result.
        </p>
      </section>
    </article>
  );
}

export function unsupportedLabel(entry: SavedLibraryEntry) {
  if (entry.status === 'unsupported') return 'Unsupported saved record';
  if (entry.status === 'invalid') return 'Unreadable saved record';
  return null;
}
