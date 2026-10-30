import React from 'react';
import ReactDOM from 'react-dom/client';
import { browser } from 'wxt/browser';
import { createSavedLibrary } from '../../lib/saved-library';
import { createSavedChangeHint } from '../../lib/saved-notifier';
import { createIndexedDbSavedStore } from '../../lib/saved-store';
import { App } from './App';
import '../investigation/style.css';
import './style.css';

const root = document.getElementById('root');
if (!root) throw new Error('Missing library root');
const hint = createSavedChangeHint();
const store = createIndexedDbSavedStore();
const library = createSavedLibrary(browser, store, hint);
window.addEventListener(
  'pagehide',
  () => {
    library.close();
    hint.dispose();
  },
  { once: true },
);

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <App library={library} />
  </React.StrictMode>,
);
