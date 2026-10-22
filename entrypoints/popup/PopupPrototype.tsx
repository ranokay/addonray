// Throwaway: three inventory layouts on popup.html?variant=A|B|C, using fixtures only.
import { useEffect, useState } from 'react';
import './prototype.css';

const fixtures = [
  {
    id: 'clearview@fixture.test',
    name: 'Clearview Blocker',
    enabled: true,
    permissions: ['storage', 'webRequest'],
    hosts: ['<all_urls>'],
  },
  {
    id: 'notes@fixture.test',
    name: 'Page Notes',
    enabled: true,
    permissions: ['activeTab', 'scripting', 'storage'],
    hosts: [],
  },
  {
    id: 'night@fixture.test',
    name: 'Night Palette',
    enabled: true,
    permissions: ['storage'],
    hosts: ['https://example.invalid/*'],
  },
  {
    id: 'shelf@fixture.test',
    name: 'Tab Shelf',
    enabled: true,
    permissions: ['tabs', 'storage'],
    hosts: [],
  },
  {
    id: 'translate@fixture.test',
    name: 'Quiet Translate',
    enabled: false,
    permissions: null,
    hosts: null,
  },
  {
    id: 'ruler@fixture.test',
    name: 'Reading Ruler',
    enabled: true,
    permissions: ['unlistedExamplePermission'],
    hosts: ['https://docs.example.invalid/*'],
  },
];
type Entry = (typeof fixtures)[number];
type Variant = 'A' | 'B' | 'C';
const variants: Variant[] = ['A', 'B', 'C'];
const names = { A: 'Quick list', B: 'Permission lens', C: 'Focused inspector' };
const descriptions = {
  A: 'Scan names and states first. Expand only the details you need.',
  B: 'Start with a permission question, then see which extensions report it.',
  C: 'Choose one extension and read its metadata in a dedicated inspector.',
};
const explanations: Record<string, string> = {
  storage:
    'Use Firefox’s extension storage APIs. This does not show what the extension stores.',
  activeTab:
    'Temporary access to a selected tab after an extension interaction. This does not prove it ran there.',
  scripting:
    'Inject scripts where Firefox grants access. This permission alone is not access to every page.',
  tabs: 'Read additional tab metadata. This does not show which tabs the extension inspected.',
  webRequest:
    'Observe requests where host access allows it. This entry is not a record of observed traffic.',
};
const groups = [
  {
    token: 'storage',
    label: 'Store extension data',
    note: 'Extension storage APIs',
  },
  {
    token: 'activeTab',
    label: 'Access a selected tab',
    note: 'Temporary, user-triggered access',
  },
  {
    token: 'scripting',
    label: 'Run page scripts',
    note: 'Requires access to the target page',
  },
  { token: 'tabs', label: 'Read tab details', note: 'Additional tab metadata' },
  {
    token: 'webRequest',
    label: 'Observe web requests',
    note: 'Within the permitted host scope',
  },
  {
    token: 'unknown',
    label: 'Metadata unavailable',
    note: 'Missing information stays unknown',
  },
];

function PermissionDetails({ entry }: { entry: Entry }) {
  return (
    <div className="p-permissions">
      <p className="p-overline">What Firefox reports</p>
      {entry.permissions === null ? (
        <p className="p-unknown">
          Unknown. Firefox did not supply API permission metadata.
        </p>
      ) : entry.permissions.length === 0 ? (
        <p>None reported.</p>
      ) : (
        entry.permissions.map((token) => (
          <div className="p-permission" key={token}>
            <code>{token}</code>
            <p>
              {explanations[token] ??
                'No explanation is available for this permission. The original identifier is shown above.'}
            </p>
          </div>
        ))
      )}
      <p className="p-overline">Host permission metadata</p>
      {entry.hosts === null ? (
        <p className="p-unknown">
          Unknown. Firefox did not supply host metadata.
        </p>
      ) : entry.hosts.length === 0 ? (
        <p>None reported.</p>
      ) : (
        <>
          <ul>
            {entry.hosts.map((host) => (
              <li key={host}>
                <code>{host}</code>
              </li>
            ))}
          </ul>
          <p>
            Reported access patterns. Browser restrictions still apply; this
            does not establish execution on a page.
          </p>
        </>
      )}
    </div>
  );
}

function Guidance() {
  return (
    <details className="p-guidance">
      <summary>Change an extension’s settings in Firefox</summary>
      <p>
        Open Firefox’s extension menu, choose Manage extensions, then select the
        extension and use Firefox’s controls.
      </p>
      <p>
        Opening settings closes this popup and clears its results. AddonRay
        cannot change another extension’s state or site access.
      </p>
    </details>
  );
}

export function PopupPrototype() {
  const initial = new URLSearchParams(location.search).get('variant');
  const [variant, setVariant] = useState<Variant>(
    initial === 'B' || initial === 'C' ? initial : 'A',
  );
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const [scenario, setScenario] = useState('loaded');
  const [selectedId, setSelectedId] = useState(fixtures[0]?.id ?? '');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [permission, setPermission] = useState<string | null>(null);
  const [page, setPage] = useState(false);
  const cycle = (direction: number) => {
    const next =
      variants[
        (variants.indexOf(variant) + direction + variants.length) %
          variants.length
      ] ?? 'A';
    const url = new URL(location.href);
    url.searchParams.set('variant', next);
    history.replaceState(null, '', url);
    setVariant(next);
  };
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (
        event.target instanceof HTMLElement &&
        event.target.closest('input,textarea,select,[contenteditable="true"]')
      )
        return;
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault();
        cycle(event.key === 'ArrowLeft' ? -1 : 1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  const inventory = scenario === 'loaded' ? fixtures : [];
  const filtered = inventory.filter((entry) => {
    const matchesState =
      status === 'all' || entry.enabled === (status === 'enabled');
    const text = [
      entry.name,
      entry.id,
      ...(entry.permissions ?? []),
      ...(entry.hosts ?? []),
    ]
      .join(' ')
      .toLowerCase();
    return matchesState && text.includes(query.trim().toLowerCase());
  });
  const visible =
    variant === 'B' && permission
      ? filtered.filter((entry) =>
          permission === 'unknown'
            ? entry.permissions === null
            : entry.permissions?.includes(permission),
        )
      : filtered;
  const selected =
    visible.find((entry) => entry.id === selectedId) ?? visible[0];
  const clear = () => {
    setScenario('unrequested');
    setQuery('');
    setStatus('all');
    setPermission(null);
    setExpanded(null);
    setPage(false);
  };
  const search = (
    <div className="p-search-tools">
      <label className="p-search-label">
        Find an extension
        <input
          type="search"
          placeholder="Name, permission, or host pattern"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>
      <label className="p-state-label">
        State
        <select
          value={status}
          onChange={(event) => setStatus(event.target.value)}
        >
          <option value="all">All states</option>
          <option value="enabled">Enabled</option>
          <option value="disabled">Disabled</option>
        </select>
      </label>
    </div>
  );
  const outcome =
    scenario === 'denied' ? (
      <div className="p-empty">
        <h3>Inventory access was declined</h3>
        <p>You can inspect a selected page or choose inventory access again.</p>
        <button onClick={() => setScenario('loaded')}>
          Simulate another inventory request
        </button>
      </div>
    ) : scenario === 'unrequested' ? (
      <div className="p-empty">
        <h3>Your session is clear</h3>
        <p>
          Nothing is collected automatically. This preview uses fixture data
          only.
        </p>
        <button onClick={() => setScenario('loaded')}>
          Load fixture inventory
        </button>
      </div>
    ) : scenario === 'empty' ? (
      <div className="p-empty">
        <h3>No extensions reported</h3>
        <p>Firefox supplied an empty inventory for this simulated session.</p>
      </div>
    ) : visible.length === 0 ? (
      <div className="p-empty">
        <h3>No matching extensions</h3>
        <p>Try a different search or state filter.</p>
        <button
          className="p-text-button"
          onClick={() => {
            setQuery('');
            setStatus('all');
            setPermission(null);
          }}
        >
          Reset filters
        </button>
      </div>
    ) : null;

  return (
    <div className="prototype-shell">
      <aside className="prototype-brief">
        <span>THROWAWAY UI PROTOTYPE</span>
        <h1>How should inventory feel?</h1>
        <p>
          Three layouts on the existing popup route. Fictional extensions,
          in-memory state, no Firefox API access.
        </p>
      </aside>
      <div className={`p-popup p-variant-${variant}`}>
        <header className="p-header">
          <div>
            <div className="p-brand">
              <span className="p-brand-mark" aria-hidden="true">
                A
              </span>
              AddonRay
            </div>
            <p>Firefox extension inspector</p>
          </div>
          <button className="p-clear" onClick={clear}>
            Clear
          </button>
        </header>
        <div className="p-privacy">
          <span aria-hidden="true">◦</span> Local to this popup. Closing it
          clears results.
        </div>
        {variant === 'A' && (
          <div className="p-list-layout">
            <div className="p-title-row">
              <h2>Your extensions</h2>
              <span>{inventory.length} reported</span>
            </div>
            <p className="p-description">
              Find an extension. Understand its access.
            </p>
            {search}
            <p className="p-count" role="status">
              {visible.length} of {inventory.length} extensions
            </p>
            {outcome}
            <div className="p-list">
              {visible.map((entry) => (
                <article className="p-list-entry" key={entry.id}>
                  <button
                    className="p-entry-toggle"
                    aria-expanded={expanded === entry.id}
                    onClick={() =>
                      setExpanded(expanded === entry.id ? null : entry.id)
                    }
                  >
                    <span className="p-initial" aria-hidden="true">
                      {entry.name.slice(0, 1)}
                    </span>
                    <span className="p-entry-label">
                      <strong>{entry.name}</strong>
                      <small>
                        {entry.enabled ? 'Enabled' : 'Disabled'}
                        {entry.permissions === null
                          ? ' · Metadata unavailable'
                          : ''}
                      </small>
                    </span>
                    <span aria-hidden="true">
                      {expanded === entry.id ? '−' : '+'}
                    </span>
                  </button>
                  {expanded === entry.id && (
                    <>
                      <p className="p-identifier">{entry.id}</p>
                      <PermissionDetails entry={entry} />
                    </>
                  )}
                </article>
              ))}
            </div>
            <Guidance />
          </div>
        )}
        {variant === 'B' && (
          <div className="p-lens-layout">
            <h2>Start with access</h2>
            <p className="p-description">
              Browse the permissions Firefox reports. Access is not evidence of
              activity.
            </p>
            {search}
            <div
              className="p-lens-groups"
              aria-label="Browse reported permissions"
            >
              {groups.map((group) => (
                <button
                  className={permission === group.token ? 'is-chosen' : ''}
                  key={group.token}
                  onClick={() =>
                    setPermission(
                      permission === group.token ? null : group.token,
                    )
                  }
                >
                  <span>
                    <strong>{group.label}</strong>
                    <small>{group.note}</small>
                  </span>
                  <b>
                    {
                      filtered.filter((entry) =>
                        group.token === 'unknown'
                          ? entry.permissions === null
                          : entry.permissions?.includes(group.token),
                      ).length
                    }
                  </b>
                </button>
              ))}
            </div>
            <div className="p-title-row">
              <h3>
                {permission
                  ? groups.find((group) => group.token === permission)?.label
                  : 'All extensions'}
              </h3>
              {permission && (
                <button
                  className="p-text-button"
                  onClick={() => setPermission(null)}
                >
                  Show all
                </button>
              )}
            </div>
            <p className="p-count" role="status">
              {visible.length} of {inventory.length} extensions
            </p>
            {outcome}
            {visible.map((entry) => (
              <details className="p-lens-entry" key={entry.id}>
                <summary>
                  <strong>{entry.name}</strong>
                  <span>{entry.enabled ? 'Enabled' : 'Disabled'}</span>
                </summary>
                <p className="p-identifier">{entry.id}</p>
                <PermissionDetails entry={entry} />
              </details>
            ))}
            <Guidance />
          </div>
        )}
        {variant === 'C' && (
          <div className="p-inspector-layout">
            <h2>Take a closer look</h2>
            <p className="p-description">
              One extension at a time. Reported facts stay separate from
              conclusions.
            </p>
            {search}
            <p className="p-count" role="status">
              {visible.length} of {inventory.length} extensions
            </p>
            {outcome}
            {selected && (
              <div className="p-master-detail">
                <nav aria-label="Choose an extension">
                  {visible.map((entry) => (
                    <button
                      aria-pressed={selected.id === entry.id}
                      className={selected.id === entry.id ? 'is-chosen' : ''}
                      key={entry.id}
                      onClick={() => setSelectedId(entry.id)}
                    >
                      <strong>{entry.name}</strong>
                      <small>{entry.enabled ? 'Enabled' : 'Disabled'}</small>
                    </button>
                  ))}
                </nav>
                <article className="p-inspector-detail">
                  <div className="p-initial" aria-hidden="true">
                    {selected.name.slice(0, 1)}
                  </div>
                  <h3>{selected.name}</h3>
                  <p className="p-state-text">
                    {selected.enabled
                      ? 'Enabled in Firefox'
                      : 'Disabled in Firefox'}
                  </p>
                  <p className="p-identifier">{selected.id}</p>
                  <PermissionDetails entry={selected} />
                </article>
              </div>
            )}
            <Guidance />
          </div>
        )}
        <section className="p-page-check">
          <div>
            <h3>Selected-page access</h3>
            <p>One-time readiness check. No page content or URL.</p>
          </div>
          <button onClick={() => setPage(true)}>Simulate page check</button>
          {page && (
            <p role="status">
              Fixture result: document complete. Supported types: navigation,
              paint, resource. These are browser capabilities, not extension
              performance.
            </p>
          )}
        </section>
        <footer className="p-capability-note">
          <strong>Know the limits</strong>
          <p>
            Permission metadata does not show which extensions ran on a page.
            AddonRay cannot switch other extensions or identify a culprit.
          </p>
        </footer>
      </div>
      <aside className="prototype-state">
        <h2>
          {variant} · {names[variant]}
        </h2>
        <p>{descriptions[variant]}</p>
        <label>
          Fixture scenario
          <select
            value={scenario}
            onChange={(event) => setScenario(event.target.value)}
          >
            <option value="loaded">Loaded inventory</option>
            <option value="unrequested">No access requested</option>
            <option value="denied">Access declined</option>
            <option value="empty">Empty inventory</option>
          </select>
        </label>
        <p>
          Use the search, state filter, and details. Switch layouts to compare
          the same query.
        </p>
        <details open>
          <summary>Relevant prototype state</summary>
          <pre>
            {JSON.stringify(
              {
                variant,
                scenario,
                query,
                status,
                permission: variant === 'B' ? permission : null,
                selected: variant === 'C' ? (selected?.id ?? null) : null,
                expanded: variant === 'A' ? expanded : null,
                visibleIds: visible.map((entry) => entry.id),
                pageFixtureVisible: page,
              },
              null,
              2,
            )}
          </pre>
        </details>
      </aside>
      {import.meta.env.DEV && (
        <nav className="prototype-switcher" aria-label="Prototype layouts">
          <button aria-label="Previous layout" onClick={() => cycle(-1)}>
            ←
          </button>
          <span>
            <b>{variant}</b> {names[variant]}
          </span>
          <button aria-label="Next layout" onClick={() => cycle(1)}>
            →
          </button>
        </nav>
      )}
    </div>
  );
}
