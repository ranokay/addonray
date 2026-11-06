import { useEffect, useRef, useSyncExternalStore, type Ref } from 'react';
import type { SavedExport, SavedExportFormat } from '../../lib/saved-export';

export function SavedExportView({
  state,
  onPrepare,
  onDownload,
  onPrint,
  onCancel,
  onFormat,
  previewRef,
}: {
  state: ReturnType<SavedExport['getSnapshot']>;
  onPrepare: () => Promise<void>;
  onDownload: () => Promise<void>;
  onPrint: () => Promise<void>;
  onCancel: () => void;
  onFormat: (format: SavedExportFormat) => void;
  previewRef?: Ref<HTMLTextAreaElement>;
}) {
  const html = state.format === 'html';
  return (
    <section aria-labelledby="saved-json-heading" aria-busy={state.busy}>
      <h3 id="saved-json-heading">Report</h3>
      <p id="saved-json-disclosure">
        {html
          ? 'Review a self-contained printable HTML page for this archive. It contains both inventories, the stored changes, assessment, optional timing and page-error summaries and observation limits. It uses inline styling only and loads no scripts, images, fonts or remote resources. It omits extension IDs, record IDs, save times, page and browser context.'
          : 'Review the exact schema version 1 JSON document for this archive. It contains both inventories, the stored changes, assessment, optional timing and page-error summaries and observation limits. It omits extension IDs, record IDs, save times, page and browser context. No report is sent automatically.'}
      </p>
      <fieldset className="report-format" disabled={state.busy}>
        <legend>Report format</legend>
        <label>
          <input
            id="saved-format-json"
            type="radio"
            name="saved-report-format"
            value="json"
            checked={!html}
            onChange={() => onFormat('json')}
          />
          JSON
        </label>
        <label>
          <input
            id="saved-format-html"
            type="radio"
            name="saved-report-format"
            value="html"
            checked={html}
            onChange={() => onFormat('html')}
          />
          Printable HTML
        </label>
      </fieldset>
      <p className="metadata" id="saved-json-help">
        Export uses no collection permission and does not prompt for management
        or scripting access, so it remains available after either permission is
        removed. Keep this view open until your browser shows the download. A
        download request is not acceptance or a completed file, and an accepted
        file can outlive deletion, expiry or closing this view.
      </p>
      {html && (
        <p className="metadata" id="saved-print-help">
          Print or Save as PDF opens your browser&rsquo;s print dialog. AddonRay
          cannot observe whether you print, cancel or save a PDF. A print
          request is not a completed print or file.
        </p>
      )}
      <div className="library-actions">
        <button
          id="saved-json-prepare"
          disabled={state.busy}
          onClick={() => void onPrepare()}
        >
          {state.busy
            ? html
              ? 'Preparing printable report…'
              : 'Preparing JSON…'
            : html
              ? 'Prepare printable report'
              : 'Prepare JSON report'}
        </button>
        {(state.preview !== null || state.busy) && (
          <button id="saved-json-cancel" className="quiet" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
      {state.preview !== null && (
        <div className="report-preview">
          {html ? (
            <>
              <p className="metadata">
                Exact printable preview. This is the same document the download
                button saves.
              </p>
              <iframe
                id="saved-html-preview"
                title="Saved printable report preview"
                sandbox="allow-same-origin allow-modals"
                srcDoc={state.preview}
                aria-describedby="saved-json-disclosure saved-print-help"
              />
            </>
          ) : (
            <>
              <label htmlFor="saved-json-text">Exact JSON preview</label>
              <textarea
                id="saved-json-text"
                ref={previewRef}
                readOnly
                spellCheck={false}
                rows={14}
                value={state.preview}
                aria-describedby="saved-json-disclosure saved-json-help"
              />
            </>
          )}
          <div className="library-actions">
            <button
              id="saved-json-download"
              disabled={state.busy}
              aria-describedby="saved-json-help"
              onClick={() => void onDownload()}
            >
              {html ? 'Download HTML report' : 'Download JSON report'}
            </button>
            {html && (
              <button
                id="saved-print"
                disabled={state.busy}
                aria-describedby="saved-print-help"
                onClick={() => void onPrint()}
              >
                Print / Save as PDF
              </button>
            )}
          </div>
        </div>
      )}
      <p role="status">{state.message ?? ''}</p>
    </section>
  );
}

export function SavedExportSection({ exporter }: { exporter: SavedExport }) {
  const state = useSyncExternalStore(
    exporter.subscribe,
    exporter.getSnapshot,
    exporter.getSnapshot,
  );
  const previewRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (state.preview !== null && state.format !== 'html')
      previewRef.current?.focus();
  }, [state.preview, state.format]);
  return (
    <SavedExportView
      state={state}
      onPrepare={exporter.prepare}
      onDownload={exporter.download}
      onPrint={exporter.print}
      onCancel={exporter.cancel}
      onFormat={exporter.setFormat}
      previewRef={previewRef}
    />
  );
}
