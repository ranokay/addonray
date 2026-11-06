import { useEffect, useRef, useSyncExternalStore, type Ref } from 'react';
import type { ReportExport } from '../../lib/report-export';
import type { ReportFormat } from '../../lib/report-download';

type ExportState = ReturnType<ReportExport['getSnapshot']>;

export function ReportExportView({
  state,
  eligible,
  onPrepare,
  onDownload,
  onPrint,
  onCancel,
  onFormat,
  previewRef,
}: {
  state: ExportState;
  eligible: boolean;
  onPrepare: () => Promise<void>;
  onDownload: () => Promise<void>;
  onPrint: () => Promise<void>;
  onCancel: () => void;
  onFormat: (format: ReportFormat) => void;
  previewRef?: Ref<HTMLTextAreaElement>;
}) {
  const json = state.format === 'json';
  const html = state.format === 'html';
  const disclosure = html
    ? 'Review a self-contained printable HTML page containing both extension inventories, their changes, your assessment and any attached diagnostics. It uses inline styling only and loads no scripts, images, fonts or remote resources. It includes extension names and versions, which can reveal your extension choices. No report is sent automatically.'
    : json
      ? 'Review a schema version 1 JSON file containing both extension inventories, their changes, your assessment and any attached diagnostics. It omits extension IDs, local record IDs, save times and browser context. Extension names and versions are included and can reveal your extension choices. No report is sent automatically.'
      : 'Review a Markdown file containing both extension inventories, their changes, your assessment and any attached diagnostics. Extension names and versions are included and can reveal your extension choices. No report is sent automatically.';
  return (
    <section aria-labelledby="report-heading" aria-busy={state.busy}>
      <h2 id="report-heading">Investigation report</h2>
      <p id="report-disclosure">{disclosure}</p>
      <fieldset className="report-format" disabled={state.busy}>
        <legend>Report format</legend>
        <label>
          <input
            id="report-format-markdown"
            type="radio"
            name="report-format"
            value="markdown"
            checked={state.format === 'markdown'}
            onChange={() => onFormat('markdown')}
          />
          Markdown
        </label>
        <label>
          <input
            id="report-format-json"
            type="radio"
            name="report-format"
            value="json"
            checked={json}
            onChange={() => onFormat('json')}
          />
          JSON
        </label>
        <label>
          <input
            id="report-format-html"
            type="radio"
            name="report-format"
            value="html"
            checked={html}
            onChange={() => onFormat('html')}
          />
          Printable HTML
        </label>
      </fieldset>
      <p className="metadata" id="report-download-help">
        Keep this investigation open until your browser shows the download.
        Closing or reloading may cancel a pending request. Your browser may save
        automatically. Once accepted by the browser, a download or file can
        remain after Start over, permission removal or closing.
      </p>
      {html && (
        <p className="metadata" id="report-print-help">
          Print or Save as PDF opens your browser&rsquo;s print dialog. AddonRay
          cannot observe whether you print, cancel or save a PDF. A print
          request is not a completed print or file.
        </p>
      )}
      <p className="metadata">
        Both inventory captures must succeed. Assessment and attached
        diagnostics are optional. Export is available only in verified normal
        windows.
      </p>
      <div className="report-actions">
        <button
          id="report-prepare"
          disabled={!eligible || state.busy}
          onClick={() => void onPrepare()}
        >
          {state.busy ? 'Checking report…' : 'Prepare report'}
        </button>
        {(state.preview !== null || state.busy) && (
          <button id="report-cancel" className="quiet" onClick={onCancel}>
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
                id="report-html-preview"
                title="Printable report preview"
                srcDoc={state.preview}
                aria-describedby="report-disclosure report-print-help"
              />
            </>
          ) : (
            <>
              <label htmlFor="report-text">
                {json ? 'Exact JSON preview' : 'Exact Markdown preview'}
              </label>
              <textarea
                id="report-text"
                ref={previewRef}
                readOnly
                spellCheck={false}
                rows={18}
                value={state.preview}
                aria-describedby="report-disclosure report-download-help"
              />
            </>
          )}
          <div className="report-actions">
            <button
              id="report-download"
              disabled={state.busy}
              aria-describedby="report-download-help"
              onClick={() => void onDownload()}
            >
              {html
                ? 'Download HTML report'
                : json
                  ? 'Download JSON report'
                  : 'Download report'}
            </button>
            {html && (
              <button
                id="report-print"
                disabled={state.busy}
                aria-describedby="report-print-help"
                onClick={() => void onPrint()}
              >
                Print / Save as PDF
              </button>
            )}
          </div>
        </div>
      )}
      <p role="status">
        {state.message ?? (state.busy ? 'Checking context and access…' : '')}
      </p>
    </section>
  );
}

export function ReportExportSection({
  exporter,
  eligible,
}: {
  exporter: ReportExport;
  eligible: boolean;
}) {
  const state = useSyncExternalStore(exporter.subscribe, exporter.getSnapshot);
  const previewRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (state.preview !== null && state.format !== 'html')
      previewRef.current?.focus();
  }, [state.preview, state.format]);
  return (
    <ReportExportView
      state={state}
      eligible={eligible}
      onPrepare={exporter.prepare}
      onDownload={exporter.download}
      onPrint={exporter.print}
      onCancel={exporter.cancel}
      onFormat={exporter.setFormat}
      previewRef={previewRef}
    />
  );
}
