import type { TimingMeasurement, TimingSnapshot } from '../../lib/inspector';

const milestones = [
  {
    key: 'domContentLoaded',
    label: 'DOM content loaded',
    description: "When this document's DOMContentLoaded handlers finished.",
  },
  {
    key: 'loadEvent',
    label: 'Load event completed',
    description:
      "When this document's load handlers finished. Later work can continue.",
  },
  {
    key: 'firstContentfulPaint',
    label: 'First content displayed',
    description: 'The first qualifying text or image paint, when reported.',
  },
] as const;

const numberFormat = new Intl.NumberFormat('en', { maximumFractionDigits: 2 });

function describeMeasurement(measurement: TimingMeasurement | undefined) {
  if (!measurement) return 'Not attached';
  if (measurement.status === 'unavailable') return 'Unavailable at capture';
  if (measurement.status === 'unrecorded') return 'Not recorded at capture';
  if (measurement.milliseconds > 0 && measurement.milliseconds < 0.01)
    return '<0.01 ms';
  return `${numberFormat.format(measurement.milliseconds)} ms`;
}

function describeDifference(
  before: TimingMeasurement | undefined,
  after: TimingMeasurement | undefined,
) {
  if (before?.status !== 'measured' || after?.status !== 'measured')
    return 'Needs two measured values';
  const difference = after.milliseconds - before.milliseconds;
  if (difference === 0) return '0 ms';
  const sign = difference > 0 ? '+' : '−';
  const magnitude = Math.abs(difference);
  return `${sign}${magnitude < 0.01 ? '<0.01' : numberFormat.format(magnitude)} ms`;
}

export function TimingComparison({
  before,
  after,
  hasBeforeInventory,
  hasAfterInventory,
  afterStarted,
}: {
  before: TimingSnapshot | null;
  after: TimingSnapshot | null;
  hasBeforeInventory: boolean;
  hasAfterInventory: boolean;
  afterStarted: boolean;
}) {
  let guidance =
    'Capture the Before inventory first. Timings are optional; inventory-only comparisons still work.';
  if (hasBeforeInventory) {
    if (before === null) {
      guidance = afterStarted
        ? 'Before timing was not attached before the After inventory started. This attempt has no timing pair. Choose Start over to begin a timing comparison.'
        : 'For a timing comparison, inspect the page through the popup and attach Before timing before starting the After inventory.';
    } else if (!hasAfterInventory) {
      guidance =
        'Before timing attached. Make your manual change, retest or reload the page yourself, then capture the After inventory here.';
    } else if (after === null) {
      guidance =
        'Before timing attached. Return to the same source tab, reopen the toolbar popup, inspect the page again, and attach After timing.';
    } else {
      guidance =
        'Before and After timings attached. These slots stay fixed until Start over.';
    }
  }

  return (
    <section aria-labelledby="timing-comparison-heading">
      <h2 id="timing-comparison-heading">Optional loading timings</h2>
      <p role="status" data-testid="timing-comparison-status">
        {guidance}
      </p>
      <p className="metadata">
        Inventory and timing captures are separate observations and may describe
        different browser conditions. Capture and attach each timing
        deliberately through the popup, matching this investigation's label and
        side.
      </p>
      <div
        className="timing-table-scroll"
        tabIndex={0}
        role="region"
        aria-label="Loading milestone comparison"
      >
        <table className="timing-comparison">
          <caption>
            Recorded milestones in milliseconds since each document's navigation
            began. Difference is After minus Before.
          </caption>
          <thead>
            <tr>
              <th scope="col">Milestone</th>
              <th scope="col">Before</th>
              <th scope="col">After</th>
              <th scope="col">Difference in ms</th>
            </tr>
          </thead>
          <tbody>
            {milestones.map(({ key, label, description }) => (
              <tr key={key} data-testid={`comparison-timing-${key}`}>
                <th scope="row">
                  {label}
                  <span className="metadata">{description}</span>
                </th>
                <td data-side="before">{describeMeasurement(before?.[key])}</td>
                <td data-side="after">{describeMeasurement(after?.[key])}</td>
                <td data-side="difference">
                  {describeDifference(before?.[key], after?.[key])}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <details className="timing-guidance">
        <summary>How to compare these timings</summary>
        <p>
          Positive differences mean a later recorded milestone. Negative
          differences mean an earlier milestone. Missing values have no assumed
          cause. These observations do not prove an extension caused a change;
          your page assessment remains separate.
        </p>
        <p>
          Both timings must come from the same browser tab. A tab can navigate
          to another page, so matching it does not verify the page, document,
          reload or cache state. Reopen the toolbar popup after navigation to
          renew temporary page access.
        </p>
        <p>
          These timings can describe an original document load after an app
          changes its view or a page is restored. Browser clock precision can
          reduce numeric detail. They do not measure scrolling or typing.
        </p>
        <p>
          Timing attachments are available only between normal browser windows.
          Private or unclassifiable windows are excluded. Each popup capture can
          be attached once. Start over removes this pair; repeat the Before
          inventory and Before timing sequence for another timing comparison.
        </p>
        <p>
          Revoking inventory or page-inspection permission clears this entire
          investigation. Ordinary timing failures preserve its valid results.
          Clearing or closing the popup keeps an accepted attachment here.
        </p>
      </details>
    </section>
  );
}
