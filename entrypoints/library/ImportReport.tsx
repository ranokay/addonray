import { useSyncExternalStore } from 'react';
import type { ImportOutput } from '../../lib/import-output';
import { CLIPBOARD_DISCLOSURE } from '../../lib/report-clipboard';
import type { ReportImport } from '../../lib/report-import';
import type { SavedRetentionDays } from '../../lib/saved-record';
import { ReportDetails } from './ArchiveView';

function ImportedOutputSection({ output }: { output: ImportOutput }) {
  const state = useSyncExternalStore(
    output.subscribe,
    output.getSnapshot,
    output.getSnapshot,
  );
  const markdown = state.format === 'markdown';
  return (
    <section aria-labelledby="imported-output-heading" aria-busy={state.busy}>
      <h3 id="imported-output-heading">Report output</h3>
      <p id="imported-output-disclosure">
        {markdown
          ? 'Review the exact Markdown text that Copy Markdown places on your system clipboard for this imported report. It keeps the imported provenance and untrusted-content label. It omits record IDs, save times, page and browser context. It is not a copy of the JSON or printable HTML source.'
          : 'Review a self-contained printable HTML page for this imported report. It keeps the imported provenance and untrusted-content label. It uses inline styling only and loads no scripts, images, fonts or remote resources. Printing uses your browser’s dialog; AddonRay cannot observe whether you print, cancel or save a PDF.'}
      </p>
      <fieldset className="report-format" disabled={state.busy}>
        <legend>Report format</legend>
        <label>
          <input
            id="imported-format-markdown"
            type="radio"
            name="imported-report-format"
            value="markdown"
            checked={markdown}
            onChange={() => output.setFormat('markdown')}
          />
          Markdown (clipboard)
        </label>
        <label>
          <input
            id="imported-format-html"
            type="radio"
            name="imported-report-format"
            value="html"
            checked={state.format === 'html'}
            onChange={() => output.setFormat('html')}
          />
          Printable HTML
        </label>
      </fieldset>
      <div className="library-actions">
        <button
          id="imported-output-prepare"
          disabled={state.busy}
          onClick={() => void output.prepare()}
        >
          {state.busy
            ? markdown
              ? 'Preparing Markdown…'
              : 'Preparing printable report…'
            : markdown
              ? 'Prepare Markdown for copy'
              : 'Prepare printable report'}
        </button>
        {(state.preview !== null || state.busy) && (
          <button
            id="imported-output-cancel"
            className="quiet"
            onClick={output.cancel}
          >
            Cancel
          </button>
        )}
      </div>
      {state.preview !== null && (
        <div className="report-preview">
          {markdown ? (
            <>
              <label htmlFor="imported-markdown-text">
                Exact Markdown clipboard review
              </label>
              <textarea
                id="imported-markdown-text"
                readOnly
                spellCheck={false}
                rows={14}
                value={state.preview}
                aria-describedby="imported-output-disclosure imported-copy-help"
              />
              <p className="metadata" id="imported-copy-help">
                {CLIPBOARD_DISCLOSURE}
              </p>
              <div className="library-actions">
                <button
                  id="imported-copy"
                  disabled={state.busy}
                  aria-describedby="imported-copy-help"
                  onClick={() => void output.copy()}
                >
                  Copy Markdown
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="metadata">
                Exact printable preview. This is the same document the download
                button saves.
              </p>
              <iframe
                id="imported-html-preview"
                title="Imported printable report preview"
                sandbox="allow-same-origin allow-modals"
                srcDoc={state.preview}
                aria-describedby="imported-output-disclosure"
              />
              <div className="library-actions">
                <button
                  id="imported-html-download"
                  disabled={state.busy}
                  onClick={() => void output.download()}
                >
                  Download HTML report
                </button>
                <button
                  id="imported-html-print"
                  disabled={state.busy}
                  onClick={() => void output.print()}
                >
                  Print / Save as PDF
                </button>
              </div>
            </>
          )}
        </div>
      )}
      <p role="status">{state.message ?? ''}</p>
    </section>
  );
}

function ImportedReportView({
  importer,
  output,
}: {
  importer: ReportImport;
  output: ImportOutput;
}) {
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

      <ImportedOutputSection output={output} />

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

export function ImportReportSection({
  importer,
  output,
}: {
  importer: ReportImport;
  output: ImportOutput;
}) {
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
        <ImportedReportView
          importer={importer}
          output={output}
          key={state.importedAt}
        />
      )}
    </section>
  );
}
