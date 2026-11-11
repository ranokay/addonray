import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
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
import { PageErrorComparison } from './PageErrorComparison';
import { ReportExportSection } from './ReportExport';
import { SavedInvestigationSection } from './SavedInvestigation';
import type { ReportExport } from '../../lib/report-export';
import type { SavedSave } from '../../lib/saved-save';

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
  startOverPending = false,
  startOverMessage = 'Checking the saved trial…',
  onCancelStartOver,
  onAssessment,
  report,
  saved,
}: {
  state: InvestigationState;
  context: BrowserContext;
  label: string;
  onCaptureBefore: () => Promise<void>;
  onCaptureAfter: () => Promise<void>;
  onStartOver: () => void;
  startOverPending?: boolean;
  startOverMessage?: string;
  onCancelStartOver?: () => void;
  onAssessment: (value: PageAssessment) => void;
  report?: ReactNode;
  saved?: ReactNode;
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
        <div>
          <button
            id="start-over"
            className="quiet"
            disabled={startOverPending}
            onClick={onStartOver}
          >
            Start over
          </button>
          {startOverPending && (
            <p role="status">
              {startOverMessage}{' '}
              <button className="quiet" onClick={onCancelStartOver}>
                Cancel start over
              </button>
            </p>
          )}
        </div>
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
      <section aria-labelledby="guide-heading">
        <h2 id="guide-heading">Guide to a manual comparison</h2>
        <ol>
          <li>
            Capture the Before baseline.{' '}
            {before !== null ? 'Captured.' : 'Not captured.'}
          </li>
          <li>
            Manually change one browser extension setting. AddonRay cannot
            verify this step.
          </li>
          <li>
            Manually reproduce the problem on the same page. AddonRay cannot
            verify this step.
          </li>
          <li>
            Capture After. {after !== null ? 'Captured.' : 'Not captured.'}
          </li>
          <li>
            Record your page assessment.{' '}
            {state.assessment === null
              ? 'No assessment selected.'
              : `Selected: ${assessmentLabels[state.assessment]}.`}
          </li>
        </ol>
        <p>
          Assessment is optional for saving. A matching tab does not prove the
          same page or controlled conditions.
        </p>
      </section>
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
            verify which page you tested. This investigation starts no
            collection between captures.
          </p>
        </section>

        <section
          aria-labelledby="after-heading"
          aria-busy={state.busy === 'after'}
        >
          <p className="step">4 · Capture</p>
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

      <PageErrorComparison
        before={state.errorBefore}
        after={state.errorAfter}
        hasBeforeInventory={before !== null}
        hasAfterInventory={after !== null}
        afterStarted={state.afterStarted}
        context={context}
      />

      {changes !== null && (
        <section aria-labelledby="changes-heading">
          <p className="step">5 · Assess</p>
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
            This pair stays fixed until you choose Start over. Nothing is saved
            unless you choose Save investigation.
          </p>
        </section>
      )}
      {saved}
      {report}
    </main>
  );
}

export function App({
  investigation,
  exporter,
  saver,
  libraryUrl,
}: {
  investigation: Investigation;
  exporter: ReportExport;
  saver: SavedSave;
  libraryUrl: string;
}) {
  const state = useSyncExternalStore(
    investigation.subscribe,
    investigation.getSnapshot,
  );
  const saveState = useSyncExternalStore(saver.subscribe, saver.getSnapshot);
  const [warning, setWarning] = useState<InvestigationState | null>(null);
  const [warningAttempted, setWarningAttempted] = useState(false);
  const [warningChecking, setWarningChecking] = useState(false);
  const [warningError, setWarningError] = useState<string | null>(null);
  const [startRequest, setStartRequest] = useState<{
    snapshot: WeakRef<InvestigationState>;
    generation: number;
    waitedForSave: boolean;
    successfulSaves: number;
    ticket: number;
  } | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const cancelButton = useRef<HTMLButtonElement>(null);
  const warningTicket = useRef(0);
  const warningSave = useRef<number | null>(null);
  const warningConfirmation = useRef<AbortController | null>(null);
  const startTicket = useRef(0);
  useEffect(() => {
    if (!warning) return;
    const element = dialog.current;
    element?.showModal();
    cancelButton.current?.focus();
    return () => {
      warningTicket.current += 1;
      warningConfirmation.current?.abort();
      warningConfirmation.current = null;
      if (warningSave.current !== null) {
        warningSave.current = null;
        saver.cancelPending();
      }
      element?.close();
      document.getElementById('start-over')?.focus();
    };
  }, [saver, warning]);
  useEffect(() => {
    if (warning && warning !== state) setWarning(null);
  }, [state, warning]);
  useEffect(() => {
    if (!startRequest) return;
    const current = () =>
      startRequest.ticket === startTicket.current &&
      startRequest.snapshot.deref() === investigation.getSnapshot() &&
      startRequest.generation === investigation.getGeneration();
    if (!current()) {
      setStartRequest(null);
      return;
    }
    if (saveState.busy || saver.getSnapshot().busy) return;
    let active = true;
    const controller = new AbortController();
    void (async () => {
      const wasSaved = saver.isPreserved();
      const saveSucceeded =
        !startRequest.waitedForSave ||
        saver.getSuccessfulSaves() > startRequest.successfulSaves;
      const preserved =
        saveSucceeded &&
        wasSaved &&
        (await saver.confirmPreserved(controller.signal));
      if (!active || !current() || saver.getSnapshot().busy) return;
      setStartRequest(null);
      if (preserved) investigation.startOver();
      else {
        const snapshot = startRequest.snapshot.deref();
        if (!snapshot) return;
        setWarningAttempted(startRequest.waitedForSave || wasSaved);
        setWarningChecking(false);
        setWarningError(
          saveSucceeded && wasSaved
            ? 'The saved archive could not be confirmed. The live trial was kept.'
            : null,
        );
        setWarning(snapshot);
      }
    })();
    return () => {
      active = false;
      controller.abort();
    };
  }, [investigation, saver, saveState, startRequest, state]);
  const eligible =
    state.busy === null &&
    state.before?.status === 'success' &&
    state.after?.status === 'success';
  const startOver = () => {
    const snapshot = investigation.getSnapshot();
    if (
      snapshot.busy === null &&
      snapshot.before?.status === 'success' &&
      snapshot.after?.status === 'success'
    ) {
      setStartRequest({
        snapshot: new WeakRef(snapshot),
        generation: investigation.getGeneration(),
        waitedForSave: saver.getSnapshot().busy,
        successfulSaves: saver.getSuccessfulSaves(),
        ticket: ++startTicket.current,
      });
    } else investigation.startOver();
  };
  const saveAndStartOver = async () => {
    const expected = warning ? new WeakRef(warning) : null;
    const generation = investigation.getGeneration();
    const ticket = warningTicket.current;
    setWarningAttempted(true);
    setWarningError(null);
    if (saver.getSnapshot().busy) return;
    const saving = saver.save();
    if (saver.getSnapshot().busy) warningSave.current = ticket;
    const saved = await saving;
    if (warningSave.current === ticket) warningSave.current = null;
    if (
      !saved ||
      !expected ||
      ticket !== warningTicket.current ||
      expected.deref() !== investigation.getSnapshot() ||
      generation !== investigation.getGeneration()
    )
      return;
    setWarningChecking(true);
    const controller = new AbortController();
    warningConfirmation.current = controller;
    const confirmed = await saver.confirmPreserved(controller.signal);
    if (warningConfirmation.current === controller)
      warningConfirmation.current = null;
    if (
      ticket !== warningTicket.current ||
      expected.deref() !== investigation.getSnapshot() ||
      generation !== investigation.getGeneration()
    )
      return;
    setWarningChecking(false);
    if (!confirmed) {
      setWarningError(
        'The saved archive could not be confirmed. The live trial was kept.',
      );
      return;
    }
    setWarning(null);
    investigation.startOver();
  };
  const cancelWarning = () => {
    warningTicket.current += 1;
    warningConfirmation.current?.abort();
    warningConfirmation.current = null;
    if (warningSave.current !== null) saver.cancelPending();
    warningSave.current = null;
    setWarningChecking(false);
    setWarning(null);
  };
  return (
    <>
      <InvestigationView
        state={state}
        context={investigation.context}
        label={investigation.label}
        onCaptureBefore={investigation.captureBefore}
        onCaptureAfter={investigation.captureAfter}
        onStartOver={startOver}
        startOverPending={startRequest !== null}
        startOverMessage={
          saveState.busy
            ? 'Waiting for Save to finish…'
            : 'Checking the saved trial…'
        }
        onCancelStartOver={() => {
          startTicket.current += 1;
          setStartRequest(null);
        }}
        onAssessment={investigation.setAssessment}
        saved={
          <SavedInvestigationSection
            saver={saver}
            eligible={eligible && startRequest === null}
            libraryUrl={libraryUrl}
          />
        }
        report={<ReportExportSection exporter={exporter} eligible={eligible} />}
      />
      {warning && (
        <dialog
          ref={dialog}
          className="start-over-dialog"
          aria-labelledby="start-over-title"
          aria-busy={saveState.busy || warningChecking}
          onCancel={(event) => {
            event.preventDefault();
            cancelWarning();
          }}
        >
          <h2 id="start-over-title">Save this trial before starting over?</h2>
          <p>
            Starting over clears the live trial. Save creates a new local
            archive kept for {saveState.retentionDays} days.
          </p>
          <div className="report-actions">
            <button
              disabled={saveState.busy || warningChecking}
              onClick={() => void saveAndStartOver()}
            >
              Save
            </button>
            <button
              disabled={saveState.busy || warningChecking}
              onClick={() => {
                setWarning(null);
                investigation.startOver();
              }}
            >
              Discard and start over
            </button>
            <button ref={cancelButton} onClick={cancelWarning}>
              Cancel
            </button>
          </div>
          <p role="status">
            {saveState.busy || warningChecking
              ? 'Saving…'
              : warningAttempted
                ? (warningError ?? saveState.message)
                : null}
          </p>
        </dialog>
      )}
    </>
  );
}
