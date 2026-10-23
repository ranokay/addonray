import { useState, useSyncExternalStore } from 'react';
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
}: {
  session: InspectorSession;
  onNewInvestigation: () => Promise<void>;
  handoff?: PopupTimingHandoff;
}) {
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot);
  const capture = session.getTimingCapture();
  const { context } = session;
  const [launching, setLaunching] = useState(false);
  const [launchError, setLaunchError] = useState<string | null>(null);

  async function launchInvestigation() {
    if (launching) return;
    setLaunching(true);
    setLaunchError(null);
    try {
      await onNewInvestigation();
    } catch {
      setLaunchError(
        'The investigation tab could not open. Try New investigation again.',
      );
    } finally {
      setLaunching(false);
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
          onClick={() => void launchInvestigation()}
        >
          {launching ? 'Opening investigation…' : 'New investigation'}
        </button>
        {launchError && <p role="status">{launchError}</p>}
        <p className="metadata">
          Each investigation starts empty. Timings transfer only when you
          explicitly attach them. Clear popup results does not clear
          investigation tabs.
        </p>
      </section>

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
