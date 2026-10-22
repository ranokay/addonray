import { useState } from 'react';
import type { ExtensionEntry } from '../../lib/inspector';
import {
  filterInventory,
  permissionExplanation,
  type InventoryFilter,
} from '../../lib/inventory';

function PermissionDetails({ entry }: { entry: ExtensionEntry }) {
  return (
    <div className="permission-details">
      <p className="metadata">
        Version {entry.version} · {entry.id}
      </p>
      <h3>API permission metadata</h3>
      {entry.permissions === null ? (
        <p>Unknown. Firefox did not supply API permission metadata.</p>
      ) : entry.permissions.length === 0 ? (
        <p>None reported.</p>
      ) : (
        <dl>
          {entry.permissions.map((identifier, index) => (
            <div key={`${index}:${identifier}`}>
              <dt>
                <code>{identifier}</code>
              </dt>
              <dd>{permissionExplanation(identifier)}</dd>
            </div>
          ))}
        </dl>
      )}
      <h3>Host permission metadata</h3>
      {entry.hostPermissions === null ? (
        <p>Unknown. Firefox did not supply host permission metadata.</p>
      ) : entry.hostPermissions.length === 0 ? (
        <p>None reported.</p>
      ) : (
        <>
          <ul className="hosts">
            {entry.hostPermissions.map((host, index) => (
              <li key={`${index}:${host}`}>
                <code>{host}</code>
              </li>
            ))}
          </ul>
          <p>
            Reported access patterns. Browser restrictions still apply. These do
            not show that the extension ran on a page.
          </p>
        </>
      )}
    </div>
  );
}

// Mounted only while a successful inventory exists. Removing it discards display state.
export function Inventory({ entries }: { entries: ExtensionEntry[] }) {
  const [query, setQuery] = useState('');
  const [state, setState] = useState<InventoryFilter>('all');
  const visible = filterInventory(entries, query, state);

  return (
    <div className="inventory-results">
      <div className="search-tools">
        <label htmlFor="inventory-search">
          Find an extension
          <input
            id="inventory-search"
            type="search"
            placeholder="Name, ID, permission, or host"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <label htmlFor="inventory-state">
          State
          <select
            id="inventory-state"
            value={state}
            onChange={(event) => {
              const value = event.target.value;
              setState(
                value === 'enabled' || value === 'disabled' ? value : 'all',
              );
            }}
          >
            <option value="all">All</option>
            <option value="enabled">Enabled</option>
            <option value="disabled">Disabled</option>
          </select>
        </label>
      </div>
      <p className="result-count" role="status">
        {visible.length} of {entries.length} extensions
      </p>
      {entries.length === 0 ? (
        <p className="empty">
          No extensions reported. Firefox supplied an empty inventory.
        </p>
      ) : visible.length === 0 ? (
        <div className="empty">
          <h3>No matching extensions</h3>
          <p>Try a different search or state filter.</p>
          <button
            className="quiet"
            onClick={() => {
              setQuery('');
              setState('all');
            }}
          >
            Reset filters
          </button>
        </div>
      ) : (
        <ul className="inventory">
          {visible.map((entry) => (
            <li key={entry.id}>
              <details>
                <summary>
                  <span className="entry-initial" aria-hidden="true">
                    {entry.name.slice(0, 1)}
                  </span>
                  <span className="entry-label">
                    <strong>{entry.name}</strong>
                    <span>
                      {entry.enabled ? 'Enabled' : 'Disabled'}
                      {entry.permissions === null
                        ? ' · Metadata unavailable'
                        : ''}
                    </span>
                  </span>
                </summary>
                <PermissionDetails entry={entry} />
              </details>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
