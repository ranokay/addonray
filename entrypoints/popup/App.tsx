import { useRef, useState, useSyncExternalStore } from 'react';
import { capabilityLimits, type Result } from '../../lib/inspector';
import type { InspectorSession } from '../../lib/session';
import type { PopupTimingHandoff } from '../../lib/timing-handoff';
import { Inventory } from './Inventory';
import { PageTimings } from './PageTimings';
import { TimingAttachment } from './TimingAttachment';

function Outcome({ result }: { result: Result<unknown> | null }) {
  if (!result || result.status === 'success') return null;
  return <p role="status">{result.reason}</p>;
}

export function App({
  session,
  onNewInvestigation,
  handoff,
  onNewPageErrorCheck,
  onOpenSavedLibrary,
}: {
  session: InspectorSession;
  onNewInvestigation: () => Promise<void>;
  handoff?: PopupTimingHandoff;
  onNewPageErrorCheck?: () => Promise<Result<null>>;
  onOpenSavedLibrary?: () => Promise<Result<null>>;
}) {
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot);
  const capture = session.getTimingCapture();
  const { context } = session;
  const [launching, setLaunching] = useState(false);
  const launchBusy = useRef(false);
  const [launchError, setLaunchError] = useState<{
    kind: 'investigation' | 'page-error' | 'library';
    message: string;
  } | null>(null);

  async function launch(kind: 'investigation' | 'page-error' | 'library') {
    if (launchBusy.current) return;
    launchBusy.current = true;
    setLaunching(true);
    setLaunchError(null);
    try {
      if (kind === 'investigation') await onNewInvestigation();
      else if (kind === 'library') {
        const result = await onOpenSavedLibrary?.();
        if (result && result.status !== 'success')
          setLaunchError({ kind, message: result.reason });
      } else {
        const result = await onNewPageErrorCheck?.();
        if (result && result.status !== 'success')
          setLaunchError({ kind, message: result.reason });
      }
    } catch {
      setLaunchError({
        kind,
        message:
          kind === 'library'
            ? 'The saved-investigation library could not open. Try again from a normal window.'
            : 'The new tab could not open. Try opening a fresh check or investigation.',
      });
    } finally {
      setLaunching(false);
      launchBusy.current = false;
    }
  }

  return (
    <main>
      <header>
        <div>
          <p className="eyebrow">{context.name} extension inspector</p>
          <h1>AddonRay</h1>
        </div>
        <button className="quiet" onClick={session.clear}>
          Clear popup results
        </button>
      </header>
      <p className="privacy">
        Local only. Popup results disappear when you close this popup.{' '}
        {context.name} may remember permissions you grant.
      </p>

      <section aria-labelledby="investigation-heading">
        <h2 id="investigation-heading">Compare a manual change</h2>
        <p>
          Keep a Before/After inventory pair in a separate tab while you change
          settings and test a page manually.
        </p>
        <button
          id="new-investigation"
          disabled={launching}
          onClick={() => void launch('investigation')}
        >
          {launching ? 'Opening investigation…' : 'New investigation'}
        </button>
        {launchError?.kind === 'investigation' && (
          <p role="status">{launchError.message}</p>
        )}
        <p className="metadata">
          Each investigation starts empty. Timings transfer only when you
          explicitly attach them. Clear popup results does not clear
          investigation tabs.
        </p>
      </section>

      {onOpenSavedLibrary && (
        <section aria-labelledby="saved-library-heading">
          <h2 id="saved-library-heading">Saved investigations</h2>
          <p>
            Review read-only archives saved explicitly from completed
            investigations. The library performs no collection and requests no
            permission.
          </p>
          <button
            id="open-saved-investigations"
            disabled={launching}
            onClick={() => void launch('library')}
          >
            {launching ? 'Opening…' : 'Open saved investigations'}
          </button>
          <p className="metadata">
            Normal windows only. Private, incognito and unknown contexts expose
            no saved data. Each archive is stored locally in this browser
            profile.
          </p>
          {launchError?.kind === 'library' && (
            <p role="status">{launchError.message}</p>
          )}
        </section>
      )}

      {onNewPageErrorCheck && (
        <section aria-labelledby="page-errors-heading">
          <h2 id="page-errors-heading">Troubleshoot a broken interaction</h2>
          <p>
            Open a separate check bound to this page's tab. Then choose Start
            there to count future JavaScript error events while you reproduce
            the problem. Opening a check collects nothing.
          </p>
          <button
            id="new-page-error-check"
            disabled={launching}
            onClick={() => void launch('page-error')}
          >
            New page-error check
          </button>
          <p className="metadata">
            Normal windows only. One attempt lasts up to 30 seconds or 200
            events. No raw error details, URLs or titles are collected.
          </p>
          {launchError?.kind === 'page-error' && (
            <p role="status">{launchError.message}</p>
          )}
        </section>
      )}

      <section aria-labelledby="inventory-heading">
        <h2 id="inventory-heading">Your extensions</h2>
        <p>
          Allow access to extension names, enabled states, and available
          permission metadata. This does not tell us which extensions ran on a
          page.
        </p>
        {context.target === 'chrome' && (
          <p className="metadata">
            Chrome groups inventory and extension controls under one permission.
            AddonRay uses it only to read the inventory.
          </p>
        )}
        <button
          disabled={state.inventoryBusy}
          onClick={() => void session.loadInventory()}
        >
          {state.inventoryBusy
            ? 'Reading inventory…'
            : 'Allow inventory access and inspect'}
        </button>
        <Outcome result={state.inventory} />
        {state.inventory?.status === 'success' && (
          <Inventory entries={state.inventory.value} context={context} />
        )}
        <details className="guidance">
          <summary>Change an extension's settings in {context.name}</summary>
          <p>
            Open {context.name}'s extension menu, choose Manage extensions, then
            select the extension and use {context.name}'s controls.
          </p>
          <p>
            Opening {context.name} settings closes this popup and clears its
            results. AddonRay does not change another extension's state or site
            access.
          </p>
        </details>
      </section>

      <section aria-labelledby="page-heading">
        <h2 id="page-heading">Selected-page access</h2>
        <p>
          Allow a one-time check of document readiness, available performance
          entry types, and three recorded loading milestones. We collect no page
          content or URL. {context.name} protects some pages.
        </p>
        <button
          disabled={state.pageBusy}
          onClick={() => void session.inspectPage()}
        >
          {state.pageBusy ? 'Checking page…' : 'Allow page access and inspect'}
        </button>
        <Outcome result={state.page} />
        {state.page?.status === 'success' && (
          <div aria-live="polite">
            <p>Document: {state.page.value.readyState}</p>
            <p>
              Performance entry types:{' '}
              {state.page.value.performanceEntryTypes?.join(', ') ||
                'No supported types reported.'}
            </p>
            <p className="metadata">
              The entry-type list describes browser support.
            </p>
            <PageTimings timings={state.page.value.timings} />
            {handoff && capture && (
              <TimingAttachment
                key={capture.id}
                captureId={capture.id}
                session={session}
                handoff={handoff}
              />
            )}
          </div>
        )}
        <p className="metadata">
          If a permission prompt closes this popup, reopen it and choose the
          action again.
        </p>
      </section>

      <section aria-labelledby="limits-heading">
        <h2 id="limits-heading">Capability limits</h2>
        <ul className="limits">
          {capabilityLimits(context).map((capability) => (
            <li key={capability.name}>
              <strong>{capability.name}</strong>
              <span className="badge">{capability.status}</span>
              <p>{capability.reason}</p>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
