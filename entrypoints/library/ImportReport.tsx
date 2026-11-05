import { useSyncExternalStore } from 'react';
import type { ReportImport } from '../../lib/report-import';
import type { SavedRetentionDays } from '../../lib/saved-record';
import { ReportDetails } from './ArchiveView';

function ImportedReportView({ importer }: { importer: ReportImport }) {
  const state = useSyncExternalStore(
    importer.subscribe,
    importer.getSnapshot,
    importer.getSnapshot,
  );
  const report = state.report;
  return (
    <article
      className="archive imported-report"
      aria-labelledby="imported-report-heading"
    >
      <header className="archive-header">
        <div>
          <p className="eyebrow">Imported report</p>
          <h2 id="imported-report-heading">Imported report</h2>
          <p className="metadata">
            The file claims provenance {state.claimedProvenance}. That claim is
            not authenticated; this content is treated as imported and never as
            a locally captured observation.
          </p>
        </div>
      </header>
      <p className="archive-note">
        This imported report is read-only and untrusted file content. It cannot
        be attached to a live investigation, resume collection, inspect a page,
        prompt for permission or reattach a source tab. AddonRay did not observe
        this content in the browser.
      </p>

      {report && <ReportDetails report={report} idPrefix="imported" />}

      <section aria-labelledby="save-imported-heading">
        <h3 id="save-imported-heading">Save imported report</h3>
        <p>
          Saving stores this validated content only in this browser profile on
          this device. It keeps the local imported origin and import time,
          stores no filename or path, and every re-export keeps the imported
          provenance marker. This is a separate action; importing alone stores
          nothing.
        </p>
        {!state.saveable && (
          <p id="import-view-only" role="status">
            This report is view-only because its complete stored record would
            exceed the 1 MiB limit including the local envelope. You can inspect
            it, but it cannot be saved.
          </p>
        )}
        <div className="library-actions">
          <label htmlFor="import-retention">
            Keep this archived import for
          </label>
          <select
            id="import-retention"
            value={state.retentionDays}
            disabled={state.busy}
            onChange={(event) =>
              importer.setRetentionDays(
                Number(event.currentTarget.value) as SavedRetentionDays,
              )
            }
          >
            <option value={7}>7 days</option>
            <option value={30}>30 days</option>
            <option value={90}>90 days</option>
          </select>
          <button
            id="save-imported-report"
            disabled={state.busy || !state.saveable}
            onClick={() => void importer.save()}
          >
            Save imported report
          </button>
          <button
            className="quiet"
            id="clear-imported-report"
            disabled={state.busy}
            onClick={importer.clear}
          >
            Clear imported report
          </button>
        </div>
      </section>
    </article>
  );
}

export function ImportReportSection({ importer }: { importer: ReportImport }) {
  const state = useSyncExternalStore(
    importer.subscribe,
    importer.getSnapshot,
    importer.getSnapshot,
  );
  return (
    <section
      className="import-report-section"
      aria-labelledby="import-heading"
      aria-busy={state.busy}
    >
      <h2 id="import-heading">Import report</h2>
      <p>
        Choose a JSON report exported by AddonRay. The file is read only after
        your explicit selection. Import alone stores nothing, makes no
        collection or permission request and cannot attach to a live
        investigation. AddonRay stores no filename or path.
      </p>
      <div className="library-actions">
        <label htmlFor="import-report-file">Choose a JSON report file</label>
        <input
          id="import-report-file"
          type="file"
          accept=".json,application/json"
          disabled={state.busy}
          onChange={(event) => {
            const input = event.currentTarget;
            const file = input.files?.[0];
            input.value = '';
            if (file) void importer.select(file);
          }}
        />
      </div>
      <p id="import-status" role="status">
        {state.busy
          ? 'Reading or saving the selected report…'
          : (state.message ?? '')}
      </p>
      {state.report && (
        <ImportedReportView importer={importer} key={state.importedAt} />
      )}
    </section>
  );
}
