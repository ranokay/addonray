import { expect, it } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { ImportReportSection } from '../entrypoints/library/ImportReport';
import { importOutputStub } from './import-output-stub';
import { reportImportStub as importer } from './report-import-stub';
import { hostileReport as report } from './saved-report-fixture';

it('offers explicit file selection and discloses that import alone persists nothing', () => {
  const markup = renderToStaticMarkup(
    <ImportReportSection importer={importer()} output={importOutputStub()} />,
  );
  expect(markup).toContain('Import report');
  expect(markup).toContain('Choose a JSON report file');
  expect(markup).toContain('type="file"');
  expect(markup).toContain('accept=".json,application/json"');
  expect(markup).toContain('Import alone stores nothing');
  expect(markup).toContain('filename or path');
  expect(markup).toContain('no collection or permission request');
  expect(markup).not.toContain('Save imported report');
  expect(markup).not.toContain('Imported report</h2>');
});

it('renders an accepted file as a read-only Imported report with escaped text', () => {
  const markup = renderToStaticMarkup(
    <ImportReportSection
      importer={importer({
        report: report(),
        claimedProvenance: 'captured',
        importedAt: 1_800_000_000_000,
        saveable: true,
      })}
      output={importOutputStub()}
    />,
  );
  expect(markup).toContain('Imported report');
  expect(markup).toContain('untrusted');
  expect(markup).toContain('read-only');
  expect(markup).toContain('cannot be attached to a live investigation');
  expect(markup).toContain('file claims provenance');
  expect(markup).toContain('&lt;img src=x onerror=alert(1)&gt;');
  expect(markup).toContain('&lt;script&gt;alert(2)&lt;/script&gt;');
  expect(markup).toContain('&lt;script&gt;alert(3)&lt;/script&gt;');
  expect(markup).not.toContain('<img src=x');
  expect(markup).not.toContain('<script>alert');
  expect(markup).toContain('Save imported report');
  expect(markup).toContain('Keep this archived import for');
  expect(markup).toContain('7 days');
  expect(markup).toContain('30 days');
  expect(markup).toContain('90 days');
  expect(markup).toContain('Printable report');
  expect(markup).toContain('id="imported-html-prepare"');
  expect(markup).not.toContain('id="imported-html-download"');
});

it('renders the exact imported printable document in an inert preview with download and print', () => {
  const reviewed =
    '<!doctype html>\n<html lang="en"><body><p>&lt;script&gt;alert(9)&lt;/script&gt;</p></body></html>\n';
  const markup = renderToStaticMarkup(
    <ImportReportSection
      importer={importer({
        report: report(),
        claimedProvenance: 'captured',
        importedAt: 1_800_000_000_000,
        saveable: true,
      })}
      output={importOutputStub({ preview: reviewed })}
    />,
  );
  expect(markup).toContain('id="imported-html-preview"');
  expect(markup).toContain('Exact printable preview');
  expect(markup).toContain('&lt;!doctype html&gt;');
  expect(markup).toContain('&amp;lt;script&amp;gt;alert(9)');
  expect(markup).not.toContain('<script>alert(9)');
  expect(markup).toContain('id="imported-html-download"');
  expect(markup).toContain('id="imported-html-print"');
  expect(markup).toContain('cannot observe whether you print, cancel or save');
  expect(markup).toContain('keeps the imported provenance');
});

it('explains view-only imports and does not offer a save action for them', () => {
  const markup = renderToStaticMarkup(
    <ImportReportSection
      importer={importer({
        report: report(),
        claimedProvenance: 'imported',
        importedAt: 1_800_000_000_000,
        saveable: false,
      })}
      output={importOutputStub()}
    />,
  );
  expect(markup).toContain('view-only');
  expect(markup).toContain('1 MiB');
  const saveButton = markup.match(
    /<button[^>]*id="save-imported-report"[^>]*>/,
  )?.[0];
  expect(saveButton).toContain('disabled');
});

it('renders bounded status text and a separate clear action', () => {
  const markup = renderToStaticMarkup(
    <ImportReportSection
      importer={importer({
        report: report(),
        importedAt: 1_800_000_000_000,
        saveable: true,
        message:
          'The selected file is not valid JSON: duplicate property name.',
      })}
      output={importOutputStub()}
    />,
  );
  expect(markup).toContain('duplicate property name');
  expect(markup).toContain('Clear imported report');
});
