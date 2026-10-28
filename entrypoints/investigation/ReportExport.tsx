import { useEffect, useRef, useSyncExternalStore, type Ref } from 'react';
import type { ReportExport } from '../../lib/report-export';

type ExportState = ReturnType<ReportExport['getSnapshot']>;

export function ReportExportView({
  state,
  eligible,
  onPrepare,
  onDownload,
  onCancel,
  previewRef,
}: {
  state: ExportState;
  eligible: boolean;
  onPrepare: () => Promise<void>;
  onDownload: () => Promise<void>;
  onCancel: () => void;
  previewRef?: Ref<HTMLTextAreaElement>;
}) {
  return (
    <section aria-labelledby="report-heading" aria-busy={state.busy}>
      <h2 id="report-heading">Investigation report</h2>
      <p id="report-disclosure">
        Review a Markdown file containing both extension inventories, their
        changes, your assessment and any attached diagnostics. Extension names
        and versions are included and can reveal your extension choices. No
        report is sent automatically.
      </p>
      <p className="metadata" id="report-download-help">
        Keep this investigation open until your browser shows the download.
        Closing or reloading may cancel a pending request. Your browser may save
        automatically. Once accepted by the browser, a download or file can
        remain after Start over, permission removal or closing.
      </p>
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
          <label htmlFor="report-text">Exact Markdown preview</label>
          <textarea
            id="report-text"
            ref={previewRef}
            readOnly
            spellCheck={false}
            rows={18}
            value={state.preview}
            aria-describedby="report-disclosure report-download-help"
          />
          <button
            id="report-download"
            disabled={state.busy}
            aria-describedby="report-download-help"
            onClick={() => void onDownload()}
          >
            Download report
          </button>
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
    if (state.preview !== null) previewRef.current?.focus();
  }, [state.preview]);
  return (
    <ReportExportView
      state={state}
      eligible={eligible}
      onPrepare={exporter.prepare}
      onDownload={exporter.download}
      onCancel={exporter.cancel}
      previewRef={previewRef}
    />
  );
}
