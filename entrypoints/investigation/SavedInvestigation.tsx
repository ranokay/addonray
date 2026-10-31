import { useSyncExternalStore } from 'react';
import {
  SAVED_DEFAULT_RETENTION_DAYS,
  SAVED_RETENTION_CHOICES,
  type SavedRetentionDays,
} from '../../lib/saved-record';
import type { SavedSave } from '../../lib/saved-save';

export function SavedInvestigationSection({
  saver,
  eligible,
  libraryUrl,
}: {
  saver: SavedSave;
  eligible: boolean;
  libraryUrl: string;
}) {
  const state = useSyncExternalStore(
    saver.subscribe,
    saver.getSnapshot,
    saver.getSnapshot,
  );
  const disabled = !eligible || state.busy || !state.ready;
  return (
    <section aria-labelledby="save-heading" aria-busy={state.busy}>
      <p className="step">5 · Save</p>
      <h2 id="save-heading">Save this investigation</h2>
      <p id="save-disclosure">
        Save creates one new read-only archive from this completed comparison.
        It never updates an existing archive or saves automatically.
      </p>
      <aside
        className="privacy"
        aria-label="Saved-investigation storage and privacy disclosures"
        aria-describedby="save-heading"
      >
        <p>
          Saved records persist on this device and browser profile. Any AddonRay
          extension page in this profile can read them.
        </p>
        <p>
          There is no sync, cloud, telemetry or companion transfer. AddonRay
          adds no encryption layer.
        </p>
        <p>
          Deletion and expiry are product-level actions, not guarantees about
          browser or OS backups, profile copies or lower storage layers.
        </p>
        <p>
          Uninstall clearing is browser-controlled and can have documented
          exceptions.
        </p>
        <p>
          Exported files, prints and clipboard content leave AddonRay's control.
          This build offers only the existing live Markdown download; it does
          not export, print or copy saved archives.
        </p>
        <p>
          The archive keeps extension names, versions and enabled states, your
          assessment and any attached timing or page-error summaries. It omits
          extension IDs, source tab IDs and page URLs or titles.
        </p>
      </aside>
      <p className="metadata">
        Save requires both successful inventories, no capture, attachment or
        report action in progress, current inventory access and a verified
        normal window. Resetting or removing access invalidates a pending save.
        Storage, quota and size failures keep this live investigation.
      </p>
      <p>
        <label htmlFor="save-retention">
          Keep this archive for{' '}
          <select
            id="save-retention"
            aria-describedby="save-retention-note"
            disabled={state.busy}
            value={state.retentionDays}
            onChange={(event) =>
              saver.setRetentionDays(
                Number(event.target.value) as SavedRetentionDays,
              )
            }
          >
            {SAVED_RETENTION_CHOICES.map((days) => (
              <option key={days} value={days}>
                {days} days
              </option>
            ))}
          </select>
        </label>
      </p>
      <p className="metadata" id="save-retention-note">
        The default is {SAVED_DEFAULT_RETENTION_DAYS} days from this save. An
        archive is never kept beyond 90 days from its save time. This choice
        applies only to the new archive; existing records keep their saved
        expiry. Expiry is checked when AddonRay next uses saved storage, with no
        background timer.
      </p>
      <div className="report-actions">
        <button
          id="save-investigation"
          disabled={disabled}
          aria-describedby="save-disclosure"
          onClick={() => void saver.save()}
        >
          {state.busy
            ? 'Saving…'
            : state.ready
              ? 'Save investigation'
              : state.message
                ? 'Save unavailable'
                : 'Checking saved storage…'}
        </button>
        {!state.ready && state.message && (
          <button
            id="retry-saved-storage"
            disabled={state.busy}
            onClick={() => void saver.retryStorage()}
          >
            Retry saved storage
          </button>
        )}
        <a id="open-library" href={libraryUrl} target="_blank" rel="noreferrer">
          Open saved investigations
        </a>
      </div>
      <p role="status">
        {state.message ??
          (state.busy
            ? 'Checking context, access and bounds before saving…'
            : state.ready
              ? ''
              : 'Saved storage is not ready. Saving is unavailable until it opens.')}
      </p>
      <p className="metadata">
        Each explicit Save creates a separate archive. Repeated saves of this
        investigation are not deduplicated or merged.
      </p>
    </section>
  );
}
