import { useSyncExternalStore } from 'react';
import { capabilityLimits, type Result } from '../../lib/inspector';
import type { InspectorSession } from '../../lib/session';
import { Inventory } from './Inventory';

function Outcome({ result }: { result: Result<unknown> | null }) {
  if (!result || result.status === 'success') return null;
  return <p role="status">{result.reason}</p>;
}

export function App({ session }: { session: InspectorSession }) {
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot);
  const { context } = session;

  return (
    <main>
      <header>
        <div>
          <p className="eyebrow">{context.name} extension inspector</p>
          <h1>AddonRay</h1>
        </div>
        <button className="quiet" onClick={session.clear}>
          Clear session
        </button>
      </header>
      <p className="privacy">
        Local only. Results disappear when you close this popup. {context.name}{' '}
        may remember permissions you grant.
      </p>

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
          Allow a one-time check of document readiness and available performance
          entry types. We collect no page content or URL. {context.name}{' '}
          protects some pages.
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
              These describe browser support, not measured extension
              performance.
            </p>
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
