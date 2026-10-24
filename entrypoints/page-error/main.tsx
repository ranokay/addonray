import React from 'react';
import ReactDOM from 'react-dom/client';
import { browser } from 'wxt/browser';
import { getBrowserContext } from '../../lib/browser-target';
import { createPageErrorCheck } from '../../lib/page-error-check';
import { createPageErrorDriver } from '../../lib/page-error-browser';
import { installPageErrorBinding } from '../../lib/page-error-launch';
import { App } from './App';
import './style.css';

const root = document.getElementById('root');
if (!root) throw new Error('Missing page-error check root');
const context = getBrowserContext(import.meta.env.BROWSER);
const check = createPageErrorCheck(
  browser,
  createPageErrorDriver(browser, context),
  context,
);
const removeBinding = installPageErrorBinding(browser, check, window);
window.addEventListener(
  'pagehide',
  () => {
    removeBinding();
    check.dispose();
  },
  { once: true },
);
ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <App check={check} />
  </React.StrictMode>,
);
