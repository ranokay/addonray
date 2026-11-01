import { useEffect, useRef, useSyncExternalStore, type Ref } from 'react';
import type { SavedExport } from '../../lib/saved-export';

export function SavedExportView({
  state,
  onPrepare,
  onDownload,
  onCancel,
  previewRef,
}: {
  state: ReturnType<SavedExport['getSnapshot']>;
  onPrepare: () => Promise<void>;
  onDownload: () => Promise<void>;
  onCancel: () => void;
  previewRef?: Ref<HTMLTextAreaElement>;
}) {
  return (
    <section aria-labelledby="saved-json-heading" aria-busy={state.busy}>
      <h3 id="saved-json-heading">JSON report</h3>
      <p id="saved-json-disclosure">
        Review the exact schema version 1 JSON document for this archive. It
        contains both inventories, the stored changes, assessment, optional
        timing and page-error summaries and observation limits. It omits
        extension IDs, record IDs, save times, page and browser context. No
        report is sent automatically.
      </p>
      <p className="metadata" id="saved-json-help">
        Export uses no collection permission and does not prompt for management
        or scripting access, so it remains available after either permission is
        removed. Keep this view open until your browser shows the download. A
        download request is not acceptance or a completed file, and an accepted
        file can outlive deletion, expiry or closing this view.
      </p>
      <div className="library-actions">
        <button
          id="saved-json-prepare"
          disabled={state.busy}
          onClick={() => void onPrepare()}
        >
          {state.busy ? 'Preparing JSON…' : 'Prepare JSON report'}
        </button>
        {(state.preview !== null || state.busy) && (
          <button id="saved-json-cancel" className="quiet" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
      {state.preview !== null && (
        <div className="report-preview">
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
          <button
            id="saved-json-download"
            disabled={state.busy}
            aria-describedby="saved-json-help"
            onClick={() => void onDownload()}
          >
            Download JSON report
          </button>
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
    if (state.preview !== null) previewRef.current?.focus();
  }, [state.preview]);
  return (
    <SavedExportView
      state={state}
      onPrepare={exporter.prepare}
      onDownload={exporter.download}
      onCancel={exporter.cancel}
      previewRef={previewRef}
    />
  );
}
