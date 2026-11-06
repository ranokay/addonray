import { expect, it, vi } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { SavedExportView } from '../entrypoints/library/SavedExport';

function view({
  preview = null,
  busy = false,
  message = null,
  format = 'json' as const,
}: {
  preview?: string | null;
  busy?: boolean;
  message?: string | null;
  format?: 'json' | 'html';
} = {}) {
  const onPrepare = vi.fn(async () => {});
  const onDownload = vi.fn(async () => {});
  const onPrint = vi.fn(async () => {});
  const onCancel = vi.fn();
  const onFormat = vi.fn();
  const markup = renderToStaticMarkup(
    <SavedExportView
      state={{ format, preview, busy, message }}
      onPrepare={onPrepare}
      onDownload={onDownload}
      onPrint={onPrint}
      onCancel={onCancel}
      onFormat={onFormat}
    />,
  );
  return { markup, onPrepare, onDownload, onPrint, onCancel, onFormat };
}

it('discloses the archive JSON boundary and request lifetime before preparation', () => {
  const { markup, onPrepare, onDownload, onPrint } = view();
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
  expect(markup).not.toContain('id="saved-print"');
  expect(onPrepare).not.toHaveBeenCalled();
  expect(onDownload).not.toHaveBeenCalled();
  expect(onPrint).not.toHaveBeenCalled();
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

it('offers printable HTML, its exact inert preview and print/PDF controls', () => {
  const reviewed =
    '<!doctype html>\n<html lang="en"><body><p>&lt;img src=x&gt;</p></body></html>\n';
  const { markup, onPrint } = view({ format: 'html', preview: reviewed });
  expect(markup).toMatch(/id="saved-format-html"[^>]*checked/);
  expect(markup).toContain('self-contained printable HTML page');
  expect(markup).toContain(
    'loads no scripts, images, fonts or remote resources',
  );
  expect(markup).toContain('id="saved-html-preview"');
  expect(markup).toContain('Exact printable preview');
  expect(markup).toContain('sandbox="allow-same-origin allow-modals"');
  expect(markup).not.toContain('allow-scripts');
  expect(markup).toContain('&lt;!doctype html&gt;');
  expect(markup).not.toContain('<img src=x');
  expect(markup).toContain('Download HTML report');
  expect(markup).toContain('id="saved-print"');
  expect(markup).toContain('Print / Save as PDF');
  expect(markup).toContain('cannot observe whether you print, cancel or save');
  expect(onPrint).not.toHaveBeenCalled();
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

it('announces only a print request, never a completed print or PDF', () => {
  const { markup } = view({
    format: 'html',
    message:
      'Print dialog requested. AddonRay cannot observe whether it was printed, cancelled or saved as a PDF.',
  });
  expect(markup).toContain('Print dialog requested');
  expect(markup).not.toContain('printed successfully');
  expect(markup).not.toContain('PDF saved');
});
