import React from 'react';
import ReactDOM from 'react-dom/client';
import { browser } from 'wxt/browser';
import { createSavedLibrary } from '../../lib/saved-library';
import { createSavedChangeHint } from '../../lib/saved-notifier';
import { createSavedExport } from '../../lib/saved-export';
import { createReportImport } from '../../lib/report-import';
import { requestReportDownload } from '../../lib/report-download';
import { createIndexedDbSavedStore } from '../../lib/saved-store';
import { App } from './App';
import '../investigation/style.css';
import './style.css';

const root = document.getElementById('root');
if (!root) throw new Error('Missing library root');
const hint = createSavedChangeHint();
const store = createIndexedDbSavedStore();
const library = createSavedLibrary(browser, store, hint);
const exporter = createSavedExport(browser, store, library, (json) =>
  requestReportDownload(json, 'json'),
);
const importer = createReportImport(browser, store, hint);
window.addEventListener('pagehide', (event) => {
  if (event.persisted) exporter.cancel();
  else exporter.dispose();
  importer.suspend();
  library.suspend();
  if (!event.persisted) {
    importer.dispose();
    library.close();
    hint.dispose();
  }
});
window.addEventListener('pageshow', (event) => {
  if (event.persisted) {
    importer.resume();
    library.resume();
  }
});

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <App library={library} exporter={exporter} importer={importer} />
  </React.StrictMode>,
);
