import { useSyncExternalStore } from 'react';
import { capabilityLimits, type Result } from '../../lib/inspector';
import type { InspectorSession } from '../../lib/session';

function Outcome({ result }: { result: Result<unknown> | null }) {
  if (!result || result.status === 'success') return null;
  return <p role="status">{result.reason}</p>;
}

function permissionSummary(permissions: string[] | null) {
  if (permissions === null)
    return 'Unknown. Firefox did not supply this metadata.';
  return permissions.length ? permissions.join(', ') : 'None reported.';
}

export function App({ session }: { session: InspectorSession }) {
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot);

  return (
    <main>
      <header>
        <div>
          <p className="eyebrow">Firefox inspector · Phase 0</p>
          <h1>AddonRay</h1>
        </div>
        <button className="quiet" onClick={session.clear}>
          Clear session
        </button>
      </header>
      <p>Understand your extensions and what Firefox lets you inspect.</p>
      <p className="privacy">
        Local only. Results disappear when you close this popup. Firefox may
        remember permissions you grant.
      </p>

      <section aria-labelledby="inventory-heading">
        <h2 id="inventory-heading">Extension inventory</h2>
        <p>
          Allow access to extension names, enabled states, and available
          permission metadata. This does not tell us which extensions ran on a
          page.
        </p>
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
          <div aria-live="polite">
            <p>{state.inventory.value.length} extensions exposed by Firefox.</p>
            <ul className="inventory">
              {state.inventory.value.map((entry) => (
                <li key={entry.id}>
                  <h3>
                    {entry.name}{' '}
                    <span>{entry.enabled ? 'Enabled' : 'Disabled'}</span>
                  </h3>
                  <p className="metadata">
                    Version {entry.version} · {entry.id}
                  </p>
                  <details>
                    <summary>Permission metadata</summary>
                    <p>
                      API permissions: {permissionSummary(entry.permissions)}
                    </p>
                    <p>
                      Host permissions:{' '}
                      {permissionSummary(entry.hostPermissions)}
                    </p>
                  </details>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section aria-labelledby="page-heading">
        <h2 id="page-heading">Selected-page access</h2>
        <p>
          Allow a one-time check of document readiness and available performance
          entry types. We collect no page content or URL. Firefox protects some
          pages.
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
          {capabilityLimits.map((capability) => (
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
