import { useSyncExternalStore } from 'react';
import type { BrowserContext } from '../../lib/browser-target';
import {
  compareInventories,
  pageAssessments,
  type InventorySnapshot,
  type PageAssessment,
} from '../../lib/comparison';
import type { Result } from '../../lib/inspector';
import type { Investigation } from '../../lib/investigation';
import { TimingComparison } from './TimingComparison';

type InvestigationState = ReturnType<Investigation['getSnapshot']>;

const assessmentLabels: Record<PageAssessment, string> = {
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
} as const;

function SnapshotResult({
  result,
  label,
}: {
  result: Result<InventorySnapshot> | null;
  label: 'before' | 'after';
}) {
  if (!result) return <p className="metadata">No {label} snapshot captured.</p>;
  if (result.status !== 'success') {
    const headings = {
      denied: 'Inventory access declined',
      unavailable: 'Inventory unavailable',
      error: 'Capture failed',
      cancelled: 'Capture cancelled',
    };
    return (
      <div className="capture-message" role="status">
        <strong>{headings[result.status]}</strong>
        <p>{result.reason}</p>
      </div>
    );
  }

  return (
    <div data-testid={`${label}-snapshot`}>
      <p className="snapshot-count" role="status">
        {label === 'before' ? 'Before' : 'After'} snapshot captured.{' '}
        {result.value.length} extensions reported.
      </p>
      {result.value.length === 0 ? (
        <p className="metadata">No extensions reported in this snapshot.</p>
      ) : (
        <details className="snapshot-details">
          <summary>View captured extensions</summary>
          <ul className="snapshot-list">
            {result.value.map((entry) => (
              <li key={entry.id}>
                <div className="entry-heading">
                  <strong>{entry.name}</strong>
                  <span className="state-label">
                    {entry.enabled ? 'Enabled' : 'Disabled'}
                  </span>
                </div>
                <p className="metadata">
                  ID <code>{entry.id}</code>
                </p>
                <p className="metadata">Version {entry.version}</p>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

export function InvestigationView({
  state,
  context,
  label,
  onCaptureBefore,
  onCaptureAfter,
  onStartOver,
  onAssessment,
}: {
  state: InvestigationState;
  context: BrowserContext;
  label: string;
  onCaptureBefore: () => Promise<void>;
  onCaptureAfter: () => Promise<void>;
  onStartOver: () => void;
  onAssessment: (value: PageAssessment) => void;
}) {
  const before = state.before?.status === 'success' ? state.before.value : null;
  const after = state.after?.status === 'success' ? state.after.value : null;
  const changes =
    before !== null && after !== null
      ? compareInventories(before, after)
      : null;

  return (
    <main>
      <header>
        <div>
          <p className="eyebrow">AddonRay · {context.name}</p>
          <h1>Manual comparison</h1>
          <p id="investigation-label" className="investigation-label">
            {label}
          </p>
          <p>
            Compare two extension inventories while you test the same page
            manually.
          </p>
        </div>
        <button id="start-over" className="quiet" onClick={onStartOver}>
          Start over
        </button>
      </header>

      <aside className="privacy" aria-label="Investigation lifetime">
        <p>
          This tab keeps one comparison in memory. Closing, reloading or
          unloading it loses the results. A browser restart or extension reload
          also loses them.
        </p>
        <p>
          Other investigations and the popup are independent. Start over clears
          only this investigation.
        </p>
      </aside>

      <p className="consent">
        Each capture requests inventory access from your click. It retains only
        extension names, IDs, versions and enabled states. {context.name} may
        remember the permission you grant.
      </p>
      {context.target === 'chrome' && (
        <p className="metadata">
          Chrome groups inventory and extension controls under one permission.
          AddonRay uses it only to read the inventory.
        </p>
      )}

      <div className="capture-grid">
        <section
          aria-labelledby="before-heading"
          aria-busy={state.busy === 'before'}
        >
          <p className="step">1 · Capture</p>
          <h2 id="before-heading">Before</h2>
          <p>
            Capture the extensions {context.name} exposes before making your
            manual change.
          </p>
          <button
            id="capture-before"
            disabled={state.busy !== null || before !== null}
            onClick={() => void onCaptureBefore()}
          >
            {state.busy === 'before' ? 'Capturing before…' : 'Capture before'}
          </button>
          <SnapshotResult result={state.before} label="before" />
        </section>

        <section className="manual-guidance" aria-labelledby="manual-heading">
          <p className="step">2 · Test manually</p>
          <h2 id="manual-heading">Make one deliberate change</h2>
          <ol>
            <li>Test the page before changing settings.</li>
            <li>
              Open {context.name}'s extension menu, choose Manage extensions,
              and use the browser or extension's controls to make your change.
            </li>
            <li>
              Retest the same page, then return to this tab and choose Capture
              after.
            </li>
          </ol>
          <p className="metadata">
            AddonRay does not change extensions or reload the page. Timings
            require a separate deliberate popup capture. This tab does not
            verify which page you tested. No collection runs between captures.
          </p>
        </section>

        <section
          aria-labelledby="after-heading"
          aria-busy={state.busy === 'after'}
        >
          <p className="step">3 · Capture</p>
          <h2 id="after-heading">After</h2>
          <p>
            Return here after changing settings and retesting the same page.
          </p>
          <button
            id="capture-after"
            disabled={state.busy !== null || before === null || after !== null}
            onClick={() => void onCaptureAfter()}
          >
            {state.busy === 'after' ? 'Capturing after…' : 'Capture after'}
          </button>
          <SnapshotResult result={state.after} label="after" />
        </section>
      </div>

      <TimingComparison
        before={state.timingBefore}
        after={state.timingAfter}
        hasBeforeInventory={before !== null}
        hasAfterInventory={after !== null}
        afterStarted={state.afterStarted}
      />

      {changes !== null && (
        <section aria-labelledby="changes-heading">
          <p className="step">4 · Review</p>
          <h2 id="changes-heading">Reported inventory changes</h2>
          <div data-testid="comparison-changes">
            {changes.length === 0 ? (
              <p role="status">
                No reported additions, removals or enabled-state changes.
              </p>
            ) : (
              <>
                <p role="status">
                  {changes.length} reported inventory{' '}
                  {changes.length === 1 ? 'change' : 'changes'}.
                </p>
                <ul className="changes-list">
                  {changes.map((change) => (
                    <li key={`${change.kind}:${change.entry.id}`}>
                      <span className="change-kind">
                        {changeLabels[change.kind]}
                      </span>
                      <div>
                        <strong>{change.entry.name}</strong>
                        <p className="metadata">
                          ID <code>{change.entry.id}</code>
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
          <p className="metadata">
            This compares reported additions, removals and enabled states by
            extension ID. It does not compare permissions or page activity.
            Changes do not establish what caused the page result.
          </p>
          <fieldset aria-describedby="assessment-help">
            <legend>Your page assessment</legend>
            <p id="assessment-help">
              Choose your assessment after retesting the page. You can change it
              while this tab remains loaded.
            </p>
            <div className="assessment-options">
              {pageAssessments.map((value) => (
                <label key={value}>
                  <input
                    type="radio"
                    name="page-assessment"
                    value={value}
                    checked={state.assessment === value}
                    onChange={() => onAssessment(value)}
                  />
                  <span>{assessmentLabels[value]}</span>
                </label>
              ))}
            </div>
            <p className="metadata" role="status">
              {state.assessment === null
                ? 'No assessment selected.'
                : `Your assessment: ${assessmentLabels[state.assessment]}.`}
            </p>
          </fieldset>
          <p className="metadata">
            This pair stays fixed until you choose Start over. No history is
            saved.
          </p>
        </section>
      )}
    </main>
  );
}

export function App({ investigation }: { investigation: Investigation }) {
  const state = useSyncExternalStore(
    investigation.subscribe,
    investigation.getSnapshot,
  );
  return (
    <InvestigationView
      state={state}
      context={investigation.context}
      label={investigation.label}
      onCaptureBefore={investigation.captureBefore}
      onCaptureAfter={investigation.captureAfter}
      onStartOver={investigation.startOver}
      onAssessment={investigation.setAssessment}
    />
  );
}
