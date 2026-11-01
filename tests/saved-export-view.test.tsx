import { expect, it, vi } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { SavedExportView } from '../entrypoints/library/SavedExport';

function view({
  preview = null,
  busy = false,
  message = null,
}: {
  preview?: string | null;
  busy?: boolean;
  message?: string | null;
} = {}) {
  const onPrepare = vi.fn(async () => {});
  const onDownload = vi.fn(async () => {});
  const onCancel = vi.fn();
  const markup = renderToStaticMarkup(
    <SavedExportView
      state={{ preview, busy, message }}
      onPrepare={onPrepare}
      onDownload={onDownload}
      onCancel={onCancel}
    />,
  );
  return { markup, onPrepare, onDownload, onCancel };
}

it('discloses the archive JSON boundary and request lifetime before preparation', () => {
  const { markup, onPrepare, onDownload } = view();
  for (const phrase of [
    'schema version 1 JSON document',
    'omits extension IDs, record IDs, save times',
    'uses no collection permission',
    'remains available after either permission is removed',
    'Keep this view open until your browser shows the download',
    'A download request is not acceptance or a completed file',
    'can outlive deletion, expiry or closing this view',
  ])
    expect(markup).toContain(phrase);
  expect(markup).toContain('id="saved-json-prepare"');
  expect(markup).not.toContain('id="saved-json-download"');
  expect(onPrepare).not.toHaveBeenCalled();
  expect(onDownload).not.toHaveBeenCalled();
});

it('renders the exact JSON as a labelled read-only value without interpreting it', () => {
  const { markup } = view({
    preview:
      '{"schemaVersion":1,"provenance":"captured","report":{"name":"<script>bad()</script>","text":"\\u0000"}}',
  });
  expect(markup).toContain('for="saved-json-text"');
  expect(markup).toMatch(/<textarea[^>]*readOnly/);
  expect(markup).toContain('&quot;schemaVersion&quot;');
  expect(markup).toContain('&lt;script&gt;bad()&lt;/script&gt;');
  expect(markup).not.toContain('<script>bad()');
  expect(markup).toContain('id="saved-json-download"');
  expect(markup).toContain('id="saved-json-cancel"');
});

it('keeps Cancel available and duplicate actions disabled while busy', () => {
  const { markup } = view({ preview: '{"schemaVersion":1}', busy: true });
  expect(markup).toMatch(/id="saved-json-prepare"[^>]*disabled/);
  expect(markup).toMatch(/id="saved-json-download"[^>]*disabled/);
  expect(markup).not.toMatch(/id="saved-json-cancel"[^>]*disabled/);
  expect(markup).toContain('aria-busy="true"');
});

it('announces only a download request, never completed saving', () => {
  const { markup } = view({
    message:
      'Download requested. Check your browser downloads for its outcome.',
  });
  expect(markup).toContain(
    'Download requested. Check your browser downloads for its outcome.',
  );
  expect(markup).not.toContain('downloaded successfully');
});
