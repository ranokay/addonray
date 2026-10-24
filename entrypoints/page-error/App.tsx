import { useSyncExternalStore } from 'react';
import {
  pageErrorFailureMessages,
  pageErrorLimits,
  type PageErrorCheck,
  type PageErrorSummary,
} from '../../lib/page-error-check';

type State = ReturnType<PageErrorCheck['getSnapshot']>;

const phaseMessages: Record<State['phase'], string> = {
  unbound:
    "This check has no source page. Open a new page-error check from the page's AddonRay toolbar popup.",
  ready: 'Ready. Start when you are ready to reproduce the problem.',
  starting:
    'Starting the check. Waiting for page access and the observation connection.',
  observing:
    'Observing. Return to the original source tab through your browser tabs and reproduce the problem. Counts appear when this attempt stops.',
  stopping: 'Stopping. Waiting for confirmed partial counts.',
  finished:
    'This attempt has finished. Choose Start over before another attempt.',
};

const completionMessages: Record<PageErrorSummary['finish'], string> = {
  stop: 'Stopped by you. Counts cover the confirmed part of this attempt.',
  timeout: 'The 30-second observation window ended.',
  limit: 'The 200-event limit was reached. Observation stopped.',
};

const numberFormat = new Intl.NumberFormat('en', { maximumFractionDigits: 2 });

function describeDuration(milliseconds: number) {
  return milliseconds > 0 && milliseconds < 0.01
    ? '<0.01 ms'
    : `${numberFormat.format(milliseconds)} ms`;
}

function statusMessage(state: State) {
  if (state.phase !== 'finished' || !state.outcome)
    return phaseMessages[state.phase];
  return state.outcome.status === 'success'
    ? completionMessages[state.outcome.value.finish]
    : pageErrorFailureMessages[state.outcome.status];
}

export function App({ check }: { check: PageErrorCheck }) {
  const state = useSyncExternalStore(
    check.subscribe,
    check.getSnapshot,
    check.getSnapshot,
  );
  const summary =
    state.phase === 'finished' && state.outcome?.status === 'success'
      ? state.outcome.value
      : null;

  return (
    <main className="page-error-check">
      <header>
        <div>
          <p className="eyebrow">AddonRay · {check.context.name}</p>
          <h1>Page-error check</h1>
          <p id="page-error-check-label" className="check-label">
            {check.label}
          </p>
          <p className="introduction">
            Count JavaScript error events while you reproduce a problem in one
            document.
          </p>
        </div>
        <button id="page-error-clear" className="quiet" onClick={check.clear}>
          Clear results
        </button>
      </header>

      <aside className="privacy" aria-label="Check data lifetime">
        <p>
          Local only. Closing, reloading or unloading this check tab discards
          its results. Nothing is saved or restored after a browser restart.
        </p>
        <p>
          Clear results discards this attempt. Stop keeps confirmed partial
          counts. Other checks, investigations and the popup are independent.
        </p>
      </aside>

      <div className="check-grid">
        <section aria-labelledby="run-heading">
          <p className="step">1 · Start deliberately</p>
          <h2 id="run-heading">Run one attempt</h2>
          <p>
            Start asks for page-inspection access, then observes the document
            loaded in the original source tab. {check.context.name} may remember
            the permission you grant. Opening this check starts nothing.
          </p>
          <div className="check-actions">
            <button
              id="page-error-start"
              disabled={state.phase !== 'ready'}
              onClick={() => void check.start()}
            >
              Start check
            </button>
            <button
              id="page-error-stop"
              className="quiet"
              disabled={state.phase !== 'observing'}
              onClick={check.stop}
            >
              Stop and keep counts
            </button>
          </div>
          <p
            id="page-error-status"
            className="check-status"
            data-phase={state.phase}
            role="status"
            aria-live="polite"
          >
            {statusMessage(state)}
          </p>
        </section>

        <section aria-labelledby="reproduce-heading">
          <p className="step">2 · Reproduce the problem</p>
          <h2 id="reproduce-heading">Return to the source tab</h2>
          <ol>
            <li>
              After Start, use your browser tabs to return to the original page.
            </li>
            <li>
              Repeat the interaction that fails, without reloading the page.
            </li>
            <li>Return here to Stop early or read the final summary.</li>
          </ol>
          <p className="limit-note">
            Up to {pageErrorLimits.durationMs / 1000} seconds or{' '}
            {pageErrorLimits.events} events total. No automatic restart or live
            counter updates.
          </p>
        </section>
      </div>

      {summary ? (
        <section id="page-error-summary" aria-labelledby="counts-heading">
          <p className="step">3 · Review the observation</p>
          <h2 id="counts-heading">Observed event counts</h2>
          <dl className="error-counts">
            <div>
              <dt>Uncaught JavaScript error events</dt>
              <dd id="page-error-script-errors">{summary.scriptErrors}</dd>
            </div>
            <div>
              <dt>Unhandled promise-rejection events</dt>
              <dd id="page-error-rejections">{summary.unhandledRejections}</dd>
            </div>
            <div>
              <dt>Total observed events</dt>
              <dd id="page-error-total">{summary.total}</dd>
            </div>
          </dl>
          <p className="duration">
            Observation window: {describeDuration(summary.observedMs)}
          </p>
          <p>
            Zero observed events does not mean the page is error-free. These are
            event notifications, not unique defects or a diagnosis of which
            extension caused a problem.
          </p>
        </section>
      ) : null}

      {state.phase === 'finished' ? (
        <div className="reset-attempt">
          <button
            id="page-error-reset"
            className="quiet"
            onClick={check.startOver}
          >
            Start over
          </button>
          <p className="metadata">
            Erase this attempt, then choose Start for another check on the
            original source tab. No history is kept.
          </p>
        </div>
      ) : null}

      <section aria-labelledby="scope-heading" className="check-scope">
        <h2 id="scope-heading">What this check observes</h2>
        <p>
          Only future uncaught JavaScript error events and promise rejections
          that are unhandled when observed, in the document's top frame.
          Reloading, leaving the document or closing the source tab interrupts
          the attempt. Missing observations are never shown as zero errors.
        </p>
        <p>
          Only verified normal browser windows can participate. We collect no
          raw error messages, stack traces, filenames, URLs, page titles or
          rejected values.
        </p>
        <p className="browser-boundary">
          {check.context.target === 'chrome'
            ? "Chrome's observer runs with the page. The page can interfere with the observer or its counts. Treat the result as a limited observation."
            : "Firefox's observer runs in an isolated extension environment. Browser restrictions can still hide events."}
        </p>
        <details>
          <summary>Understand the limits</summary>
          <p>
            This does not retrieve earlier console errors, handled exceptions,
            console.error calls, resource or network failures, or other
            extensions' private errors. A promise rejection can gain a handler
            later. These counts cannot identify a responsible extension.
          </p>
          <p>
            The source is the browser tab chosen when you opened this check. Its
            URL and title are not collected, and the check never switches to
            another source automatically. It observes the document present when
            collection begins, which can differ from the one present when you
            clicked Start.
          </p>
          <p>
            The observation window is bounded even if browser scheduling delays
            cleanup or delivery. Revoking inventory or page-inspection access
            clears this entire check. Before/After comparisons remain separate.
          </p>
        </details>
      </section>
    </main>
  );
}
