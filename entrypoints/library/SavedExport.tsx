import { useEffect, useRef, useSyncExternalStore, type Ref } from 'react';
import { CLIPBOARD_DISCLOSURE } from '../../lib/report-clipboard';
import type { SavedExport, SavedExportFormat } from '../../lib/saved-export';

export function SavedExportView({
  state,
  onPrepare,
  onDownload,
  onPrint,
  onCopy,
  onCancel,
  onFormat,
  previewRef,
}: {
  state: ReturnType<SavedExport['getSnapshot']>;
  onPrepare: () => Promise<void>;
  onDownload: () => Promise<void>;
  onPrint: () => Promise<void>;
  onCopy: () => Promise<void>;
  onCancel: () => void;
  onFormat: (format: SavedExportFormat) => void;
  previewRef?: Ref<HTMLTextAreaElement>;
}) {
  const html = state.format === 'html';
  const markdown = state.format === 'markdown';
  return (
    <section aria-labelledby="saved-json-heading" aria-busy={state.busy}>
      <h3 id="saved-json-heading">Report</h3>
      <p id="saved-json-disclosure">
        {html
          ? 'Review a self-contained printable HTML page for this archive. It contains both inventories, the stored changes, assessment, optional timing and page-error summaries and observation limits. It uses inline styling only and loads no scripts, images, fonts or remote resources. It omits extension IDs, record IDs, save times, page and browser context.'
          : markdown
            ? 'Review the exact Markdown text that Copy Markdown places on your system clipboard for this archive. It contains both inventories, the stored changes, assessment, optional timing and page-error summaries and observation limits. It omits extension IDs, record IDs, save times, page and browser context. It is not a copy of the JSON or printable HTML source.'
            : 'Review the exact schema version 1 JSON document for this archive. It contains both inventories, the stored changes, assessment, optional timing and page-error summaries and observation limits. It omits extension IDs, record IDs, save times, page and browser context. No report is sent automatically.'}
      </p>
      <fieldset className="report-format" disabled={state.busy}>
        <legend>Report format</legend>
        <label>
          <input
            id="saved-format-markdown"
            type="radio"
            name="saved-report-format"
            value="markdown"
            checked={markdown}
            onChange={() => onFormat('markdown')}
          />
          Markdown (clipboard)
        </label>
        <label>
          <input
            id="saved-format-json"
            type="radio"
            name="saved-report-format"
            value="json"
            checked={state.format === 'json'}
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
        {markdown
          ? 'Copy uses no collection permission and does not prompt for management or scripting access, so this review remains available after either permission is removed.'
          : 'Export uses no collection permission and does not prompt for management or scripting access, so it remains available after either permission is removed. Keep this view open until your browser shows the download. A download request is not acceptance or a completed file, and an accepted file can outlive deletion, expiry or closing this view.'}
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
              : markdown
                ? 'Preparing Markdown…'
                : 'Preparing JSON…'
            : html
              ? 'Prepare printable report'
              : markdown
                ? 'Prepare Markdown for copy'
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
              <label htmlFor="saved-json-text">
                {markdown
                  ? 'Exact Markdown clipboard review'
                  : 'Exact JSON preview'}
              </label>
              <textarea
                id="saved-json-text"
                ref={previewRef}
                readOnly
                spellCheck={false}
                rows={14}
                value={state.preview}
                aria-describedby={
                  markdown
                    ? 'saved-json-disclosure saved-json-help saved-copy-help'
                    : 'saved-json-disclosure saved-json-help'
                }
              />
              {markdown && (
                <p className="metadata" id="saved-copy-help">
                  {CLIPBOARD_DISCLOSURE}
                </p>
              )}
            </>
          )}
          <div className="library-actions">
            {markdown ? (
              <button
                id="saved-copy"
                disabled={state.busy}
                aria-describedby="saved-copy-help"
                onClick={() => void onCopy()}
              >
                Copy Markdown
              </button>
            ) : (
              <button
                id="saved-json-download"
                disabled={state.busy}
                aria-describedby="saved-json-help"
                onClick={() => void onDownload()}
              >
                {html ? 'Download HTML report' : 'Download JSON report'}
              </button>
            )}
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
      onCopy={exporter.copy}
      onCancel={exporter.cancel}
      onFormat={exporter.setFormat}
      previewRef={previewRef}
    />
  );
}
