import { expect, it, vi } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { ReportExportView } from '../entrypoints/investigation/ReportExport';

function view({
  eligible = true,
  preview = null,
  busy = false,
  message = null,
  format = 'markdown' as const,
}: {
  eligible?: boolean;
  preview?: string | null;
  busy?: boolean;
  message?: string | null;
  format?: 'markdown' | 'json' | 'html';
} = {}) {
  const onPrepare = vi.fn(async () => {});
  const onDownload = vi.fn(async () => {});
  const onPrint = vi.fn(async () => {});
  const onCopy = vi.fn(async () => {});
  const onFormat = vi.fn();
  const markup = renderToStaticMarkup(
    <ReportExportView
      state={{ format, preview, busy, message }}
      eligible={eligible}
      onPrepare={onPrepare}
      onDownload={onDownload}
      onPrint={onPrint}
      onCopy={onCopy}
      onCancel={vi.fn()}
      onFormat={onFormat}
    />,
  );
  return { markup, onPrepare, onDownload, onPrint, onCopy, onFormat };
}

it('explains disclosure, missing-data eligibility and the accepted download lifetime before preparation', () => {
  const { markup, onPrepare, onDownload, onPrint } = view({ eligible: false });
  expect(markup).toContain('Extension names');
  expect(markup).toContain('versions are included');
  expect(markup).toContain('Keep this investigation open');
  expect(markup).toContain('Closing or reloading may cancel');
  expect(markup).toContain('may save');
  expect(markup).toContain('verified normal windows');
  expect(markup).toMatch(/id="report-prepare"[^>]*disabled/);
  expect(markup).not.toContain('id="report-download"');
  expect(markup).not.toContain('id="report-print"');
  expect(onPrepare).not.toHaveBeenCalled();
  expect(onDownload).not.toHaveBeenCalled();
  expect(onPrint).not.toHaveBeenCalled();
});

it('renders the exact text as a labelled read-only value instead of interpreting Markdown or HTML', () => {
  const { markup } = view({
    preview:
      '# Report\n<script>bad()</script>\n![image](https://private.invalid/)\n',
  });
  expect(markup).toContain('for="report-text"');
  expect(markup).toMatch(/<textarea[^>]*readOnly/);
  expect(markup).toContain('&lt;script&gt;bad()&lt;/script&gt;');
  expect(markup).toContain('![image](https://private.invalid/)');
  expect(markup).not.toContain('<script>');
  expect(markup).not.toContain('<img');
  expect(markup).toContain('Download report');
  expect(markup).toContain('id="report-cancel"');
});

it('offers an explicit JSON format and describes its minimized schema', () => {
  const { markup } = view({
    format: 'json',
    preview:
      '{"schemaVersion":1,"provenance":"captured","report":{"before":{"extensions":[{"name":"<script>bad()</script>"}]}}}',
  });
  expect(markup).toContain('id="report-format-markdown"');
  expect(markup).toContain('id="report-format-json"');
  expect(markup).toContain('id="report-format-html"');
  expect(markup).toMatch(/id="report-format-json"[^>]*checked/);
  expect(markup).toContain('Exact JSON preview');
  expect(markup).toContain('schema version 1');
  expect(markup).toContain('omits extension IDs');
  expect(markup).toContain('&quot;schemaVersion&quot;');
  expect(markup).not.toContain('<script>bad()');
  expect(markup).toMatch(/id="report-download"[^>]*/);
  expect(markup).not.toContain('id="report-print"');
});

it('renders the exact printable document in an inert iframe preview with download and print', () => {
  const reviewed =
    '<!doctype html>\n<html lang="en"><body><p>&lt;script&gt;bad()&lt;/script&gt;</p></body></html>\n';
  const { markup, onPrint } = view({
    format: 'html',
    preview: reviewed,
  });
  expect(markup).toMatch(/id="report-format-html"[^>]*checked/);
  expect(markup).toContain('id="report-html-preview"');
  expect(markup).toMatch(/<iframe[^>]*srcDoc|srcdoc/);
  expect(markup).toContain('Exact printable preview');
  expect(markup).toContain('sandbox="allow-same-origin allow-modals"');
  expect(markup).not.toContain('allow-scripts');
  expect(markup).toContain('&lt;!doctype html&gt;');
  expect(markup).toContain('&amp;lt;script&amp;gt;');
  expect(markup).not.toContain('<script>bad()');
  expect(markup).toContain('id="report-download"');
  expect(markup).toContain('Download HTML report');
  expect(markup).toContain('id="report-print"');
  expect(markup).toContain('Print / Save as PDF');
  expect(markup).toContain('cannot observe whether you print, cancel or save');
  expect(onPrint).not.toHaveBeenCalled();
});

it('marks the Markdown format as the preserved default with a clipboard review', () => {
  const { markup } = view({ preview: '# Report\n' });
  expect(markup).toMatch(/id="report-format-markdown"[^>]*checked/);
  expect(markup).toContain('Exact Markdown clipboard review');
  expect(markup).not.toContain('Exact JSON preview');
  expect(markup).toContain('id="report-copy"');
  expect(markup).toContain('Copy Markdown');
  expect(markup).toContain('system clipboard');
  expect(markup).toContain('cannot recall or erase copied content');
  expect(markup).not.toContain('id="report-print"');
});

it('offers clipboard copy only for Markdown, never for JSON or printable HTML', () => {
  for (const format of ['json', 'html'] as const) {
    const { markup } = view({ format, preview: 'reviewed' });
    expect(markup).not.toContain('id="report-copy"');
    expect(markup).not.toContain('Copy Markdown');
    expect(markup).not.toContain('system clipboard');
  }
});

it('disables duplicate actions during checks while keeping Cancel available', () => {
  const { markup } = view({ preview: '# Reviewed\n', busy: true });
  expect(markup).toMatch(/id="report-prepare"[^>]*disabled/);
  expect(markup).toMatch(/id="report-download"[^>]*disabled/);
  expect(markup).not.toMatch(/id="report-cancel"[^>]*disabled/);
  expect(markup).toContain('aria-busy="true"');
});

it('disables print during checks while keeping Cancel available', () => {
  const { markup } = view({
    format: 'html',
    preview: '<!doctype html>',
    busy: true,
  });
  expect(markup).toMatch(/id="report-print"[^>]*disabled/);
  expect(markup).not.toMatch(/id="report-cancel"[^>]*disabled/);
});

it('announces bounded outcomes without a completed-save claim', () => {
  const { markup } = view({
    message:
      'Download requested. Check your browser downloads for its outcome.',
  });
  expect(markup).toContain('role="status"');
  expect(markup).toContain('Download requested');
  expect(markup).not.toContain('saved successfully');
});

it('announces a print request without a completed-print claim', () => {
  const { markup } = view({
    format: 'html',
    message:
      'Print dialog requested. AddonRay cannot observe whether it was printed, cancelled or saved as a PDF.',
  });
  expect(markup).toContain('Print dialog requested');
  expect(markup).not.toContain('printed successfully');
  expect(markup).not.toContain('PDF saved');
});
