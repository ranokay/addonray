import type { BrowserContext } from '../../lib/browser-target';
import type { PageErrorSummary } from '../../lib/page-error-check';

const observations = [
  { key: 'scriptErrors', label: 'Uncaught JavaScript error events' },
  { key: 'unhandledRejections', label: 'Unhandled promise-rejection events' },
  { key: 'total', label: 'Total observed events' },
  { key: 'observedMs', label: 'Observation duration' },
  { key: 'finish', label: 'Completion reason' },
] as const;
const completionLabels: Record<PageErrorSummary['finish'], string> = {
  stop: 'Stopped by you',
  timeout: '30-second window ended',
  limit: '200-event limit reached',
};
const numberFormat = new Intl.NumberFormat('en', { maximumFractionDigits: 2 });

function describeObservation(
  summary: PageErrorSummary | null,
  key: (typeof observations)[number]['key'],
) {
  if (!summary) return 'Not attached';
  if (key === 'finish') return completionLabels[summary.finish];
  if (key === 'observedMs')
    return summary.observedMs > 0 && summary.observedMs < 0.01
      ? '<0.01 ms'
      : `${numberFormat.format(summary.observedMs)} ms`;
  return String(summary[key]);
}

export function PageErrorComparison({
  before,
  after,
  hasBeforeInventory,
  hasAfterInventory,
  afterStarted,
  context,
}: {
  before: PageErrorSummary | null;
  after: PageErrorSummary | null;
  hasBeforeInventory: boolean;
  hasAfterInventory: boolean;
  afterStarted: boolean;
  context: BrowserContext;
}) {
  let guidance =
    'Capture the Before inventory first. Error counts are optional; inventory-only and timing-only comparisons still work.';
  if (hasBeforeInventory) {
    if (before === null) {
      guidance = afterStarted
        ? 'Before error counts were not attached before the After inventory started. Choose Start over to begin an error-count comparison.'
        : 'Run a separate page-error check from the source page, then attach its confirmed counts to Before before starting the After inventory.';
    } else if (!hasAfterInventory) {
      guidance =
        'Before error counts attached. Make your manual change, retest the page, then capture the After inventory here.';
    } else if (after === null) {
      guidance =
        'Before error counts attached. Run a new explicit check on the same source tab, then attach its confirmed counts to After.';
    } else {
      guidance =
        'Before and After error counts attached. These slots stay fixed until Start over.';
    }
  }

  return (
    <section aria-labelledby="error-comparison-heading">
      <h2 id="error-comparison-heading">Optional page-error counts</h2>
      <p role="status" data-testid="error-comparison-status">
        {guidance}
      </p>
      <p className="metadata">
        Attach a completed check deliberately, matching this investigation's
        label and side. These observations were collected separately from the
        inventories and timings. Attachment order does not prove when you
        reproduced the problem or changed settings.
      </p>
      <div
        className="error-table-scroll"
        tabIndex={0}
        role="region"
        aria-label="Page-error count comparison"
      >
        <table className="error-comparison">
          <caption>
            Counts, durations and completion reasons from two separate
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
            {observations.map(({ key, label }) => (
              <tr key={key} data-testid={`comparison-error-${key}`}>
                <th scope="row">{label}</th>
                <td data-side="before">{describeObservation(before, key)}</td>
                <td data-side="after">{describeObservation(after, key)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="metadata">
        Stop can shorten an observation. The 200-event limit stops counting
        later events. Durations and reproduced interactions can differ, even for
        two full windows. Zero observed events does not mean the page is
        error-free. These counts cannot identify a responsible extension; your
        page assessment remains separate.
      </p>
      <p className="metadata">
        All timing and error attachments must come from the same browser tab. A
        tab can navigate to a different page. Matching it does not verify the
        page, document or test conditions. No URL or title is collected.
      </p>
      {context.target === 'chrome' && (
        <p className="metadata browser-boundary">
          Chrome's observer runs with the page. The page can interfere with the
          observer or its counts. Treat both sides as limited observations.
        </p>
      )}
      <details className="error-guidance">
        <summary>How error attachments are kept</summary>
        <p>
          Before must be attached before starting After inventory. After needs
          that inventory and the Before error attachment. Each completed check
          can attach successfully once. Start over is required to replace a
          fixed attachment.
        </p>
        <p>
          This investigation owns accepted copies. Resetting or closing the
          source check does not retract them. Start over, revoking inventory or
          page-inspection permission, or closing, reloading or unloading this
          investigation discards all its observations. Failed transfers keep
          existing results.
        </p>
        <p>
          Only confirmed Stop, timeout and event-limit summaries can attach.
          Interrupted, declined and invalid observations remain unavailable.
          Normal windows only; private or unclassifiable contexts are excluded.
          These are counts of event notifications, not unique defects, a console
          history or a causal diagnosis.
        </p>
      </details>
    </section>
  );
}
