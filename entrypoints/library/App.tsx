import { useEffect, useSyncExternalStore } from 'react';
import {
  sameSavedKey,
  type SavedLibrary,
  type SavedLibraryEntry,
} from '../../lib/saved-library';
import { recordLabel } from '../../lib/saved-record';
import { ArchiveView, unsupportedLabel } from './ArchiveView';

const expiryFormat = new Intl.DateTimeFormat('en', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

function entryLabel(entry: SavedLibraryEntry) {
  if (entry.status === 'valid') return recordLabel(entry.record);
  return unsupportedLabel(entry) ?? 'Saved record';
}

function DeleteControl({
  library,
  entry,
  label,
  pending,
  busy,
}: {
  library: SavedLibrary;
  entry: SavedLibraryEntry;
  label: string;
  pending: boolean;
  busy: boolean;
}) {
  if (pending)
    return (
      <div
        className="delete-confirm"
        role="group"
        aria-label={`Confirm delete ${label}`}
      >
        <p>Delete this saved record? AddonRay cannot restore it.</p>
        <div className="library-actions">
          <button
            className="danger"
            disabled={busy}
            onClick={() => void library.delete()}
          >
            Delete saved record
          </button>
          <button
            className="quiet"
            disabled={busy}
            onClick={library.cancelDelete}
          >
            Cancel
          </button>
        </div>
      </div>
    );
  return (
    <button
      className="quiet"
      disabled={busy}
      onClick={() => library.requestDelete(entry.key)}
    >
      Delete
    </button>
  );
}

function LibraryEntryRow({
  library,
  entry,
  state,
}: {
  library: SavedLibrary;
  entry: SavedLibraryEntry;
  state: ReturnType<SavedLibrary['getSnapshot']>;
}) {
  const label = entryLabel(entry);
  const pending =
    state.pendingDeleteKey !== null &&
    sameSavedKey(state.pendingDeleteKey, entry.key);
  const checked = state.checkedKeys.some((checkedKey) =>
    sameSavedKey(checkedKey, entry.key),
  );
  const locked = state.busy || state.pendingBulk !== null;
  return (
    <li className="library-entry" data-testid="library-entry">
      <div className="library-entry-heading">
        <div>
          <label className="library-select">
            <input
              type="checkbox"
              checked={checked}
              disabled={locked}
              onChange={() => library.toggleChecked(entry.key)}
            />
            <span>Select {label}</span>
          </label>
          <strong>{label}</strong>
          {entry.status !== 'valid' && (
            <p className="metadata">
              This row cannot be opened. It is kept for explicit deletion and is
              never migrated or silently removed.
            </p>
          )}
          {entry.status === 'valid' && (
            <p className="metadata">
              {entry.record.report.before.extensions.length} Before ·{' '}
              {entry.record.report.after.extensions.length} After ·{' '}
              {entry.record.report.changes.length}{' '}
              {entry.record.report.changes.length === 1 ? 'change' : 'changes'}
            </p>
          )}
          {entry.status === 'valid' && (
            <p className="metadata">
              Expires {expiryFormat.format(new Date(entry.record.expiresAt))}
            </p>
          )}
        </div>
        <div className="library-actions">
          {entry.status === 'valid' && (
            <button
              id="open-saved-record"
              disabled={locked}
              onClick={() => void library.open(entry.key)}
            >
              Open
            </button>
          )}
          <DeleteControl
            library={library}
            entry={entry}
            label={label}
            pending={pending}
            busy={locked}
          />
        </div>
      </div>
      {pending && (
        <p className="metadata">
          Browser or OS backups and profile copies may retain bytes outside
          AddonRay's control.
        </p>
      )}
    </li>
  );
}

function BulkActions({
  library,
  state,
}: {
  library: SavedLibrary;
  state: ReturnType<SavedLibrary['getSnapshot']>;
}) {
  const locked = state.busy || state.pendingBulk !== null;
  return (
    <div
      className="library-bulk-actions"
      role="group"
      aria-label="Bulk actions"
    >
      <button
        className="quiet"
        disabled={locked || state.checkedKeys.length === 0}
        onClick={library.clearChecked}
      >
        Clear selection
      </button>
      <button
        disabled={locked || state.checkedKeys.length === 0}
        onClick={library.requestBulkDelete}
      >
        Delete selected ({state.checkedKeys.length})
      </button>
      <button
        className="danger"
        disabled={locked}
        onClick={library.requestDeleteAll}
      >
        Delete all saved records
      </button>
    </div>
  );
}

function BulkDeleteConfirmation({
  library,
  state,
}: {
  library: SavedLibrary;
  state: ReturnType<SavedLibrary['getSnapshot']>;
}) {
  const pending = state.pendingBulk;
  if (!pending) return null;
  if (pending.kind === 'selected') {
    const count = pending.keys.length;
    return (
      <div
        className="delete-confirm"
        role="group"
        aria-label="Confirm bulk delete"
      >
        <p>
          Delete {count} selected saved {count === 1 ? 'record' : 'records'}?
          This cannot be undone by AddonRay. Browser or OS backups and profile
          copies may retain bytes. Clearing a live investigation does not affect
          saved records.
        </p>
        <div className="library-actions">
          <button
            className="danger"
            disabled={state.busy}
            onClick={() => void library.deleteChecked()}
          >
            Delete selected records
          </button>
          <button
            className="quiet"
            disabled={state.busy}
            onClick={library.cancelBulkDelete}
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }
  return (
    <div
      className="delete-confirm"
      role="group"
      aria-label="Confirm delete all"
    >
      <p>
        Delete all saved records? This removes every record in local storage,
        including any not shown here, and cannot be undone by AddonRay. Browser
        or OS backups and profile copies may retain bytes. Clearing a live
        investigation does not affect saved records.
      </p>
      <div className="library-actions">
        <button
          className="danger"
          disabled={state.busy}
          onClick={() => void library.deleteAll()}
        >
          Delete all saved records
        </button>
        <button
          className="quiet"
          disabled={state.busy}
          onClick={library.cancelBulkDelete}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function Disclosures() {
  return (
    <aside
      className="privacy"
      aria-label="Saved-investigation storage boundary"
    >
      <p>
        Saved records persist only in this browser profile on this device. Any
        AddonRay extension page in this profile can read them.
      </p>
      <p>
        There is no sync, cloud, telemetry or companion transfer. AddonRay adds
        no encryption layer.
      </p>
      <p>
        Deletion and expiry are product-level actions. Browser or OS backups,
        profile copies and lower storage layers may retain bytes. Uninstall
        clearing is browser-controlled and can have documented exceptions.
      </p>
      <p>
        This build does not export, print or copy saved reports. Exported files
        from the live report remain outside AddonRay's control.
      </p>
    </aside>
  );
}

export function App({ library }: { library: SavedLibrary }) {
  const state = useSyncExternalStore(
    library.subscribe,
    library.getSnapshot,
    library.getSnapshot,
  );
  useEffect(() => {
    library.start();
  }, [library]);

  return (
    <main>
      <header>
        <div>
          <p className="eyebrow">AddonRay · local archive</p>
          <h1>Saved investigations</h1>
          <p>
            Read-only archives saved explicitly from a completed investigation.
            Opening one performs no collection and requests no permission.
          </p>
        </div>
        <button
          className="quiet"
          disabled={state.busy || state.phase === 'denied'}
          onClick={() => void library.refresh()}
        >
          Refresh
        </button>
      </header>

      <Disclosures />

      {state.phase === 'checking' && (
        <p role="status">
          {state.busy
            ? 'Checking context and saved storage…'
            : 'Checking saved storage…'}
        </p>
      )}

      {state.phase === 'denied' && (
        <section aria-labelledby="library-denied-heading">
          <h2 id="library-denied-heading">Normal windows only</h2>
          <p role="status">{state.message}</p>
          <p className="metadata">
            Private, incognito and unclassifiable contexts expose no saved data.
          </p>
        </section>
      )}

      {state.phase === 'unavailable' && (
        <section aria-labelledby="library-unavailable-heading">
          <h2 id="library-unavailable-heading">Saved storage unavailable</h2>
          <p role="status">{state.message}</p>
          <button disabled={state.busy} onClick={() => void library.refresh()}>
            Try again
          </button>
        </section>
      )}

      {state.phase === 'ready' && (
        <div className="library-grid">
          <section
            className="library-list-section"
            aria-labelledby="library-list-heading"
            aria-busy={state.busy}
          >
            <h2 id="library-list-heading">Local saved records</h2>
            <p className="metadata">
              A maximum of 50 records, 5 MiB in total and 1 MiB per complete
              record applies. Each record keeps the 7, 30 or 90-day retention
              chosen when it was saved, never beyond 90 days from its save time.
              Unsupported or unreadable rows are listed only for deletion.
            </p>
            <BulkActions library={library} state={state} />
            <BulkDeleteConfirmation library={library} state={state} />
            {state.entries.length === 0 ? (
              <p role="status">
                No saved investigations. Save one from a completed investigation
                in a normal window.
              </p>
            ) : (
              <ul className="library-list">
                {state.entries.map((entry) => (
                  <LibraryEntryRow
                    key={
                      typeof entry.key === 'string'
                        ? entry.key
                        : String(entry.key)
                    }
                    library={library}
                    entry={entry}
                    state={state}
                  />
                ))}
              </ul>
            )}
            <p role="status">{state.message}</p>
          </section>

          <section
            className="library-detail-section"
            aria-labelledby="library-detail-heading"
          >
            <div className="library-detail-heading">
              <h2 id="library-detail-heading">Open saved record</h2>
              {state.selected && (
                <button
                  className="quiet"
                  disabled={state.busy}
                  onClick={() => library.closeDetail?.()}
                >
                  Close record
                </button>
              )}
            </div>
            {state.selected ? (
              <ArchiveView record={state.selected} />
            ) : (
              <p role="status">
                Choose Open on an available record to review it here. Opening
                rechecks normal context and re-reads the stored record.
              </p>
            )}
          </section>
        </div>
      )}
    </main>
  );
}
