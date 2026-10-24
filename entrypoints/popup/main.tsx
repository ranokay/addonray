import React from 'react';
import ReactDOM from 'react-dom/client';
import { browser } from 'wxt/browser';
import { getBrowserContext } from '../../lib/browser-target';
import { createSession } from '../../lib/session';
import { createPopupTimingHandoff } from '../../lib/timing-handoff';
import { createPageErrorLauncher } from '../../lib/page-error-launch';
import { App } from './App';
import './style.css';

const root = document.getElementById('root');
if (!root) throw new Error('Missing popup root');
const context = getBrowserContext(import.meta.env.BROWSER);
const session = createSession(browser, context);
const handoff = createPopupTimingHandoff(browser, session, window);
const errorLauncher = createPageErrorLauncher(browser, window);
window.addEventListener(
  'pagehide',
  () => {
    session.clear();
    errorLauncher.dispose();
  },
  { once: true },
);

async function newInvestigation() {
  await browser.tabs.create({
    url: browser.runtime.getURL('/investigation.html'),
  });
}

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <App
      session={session}
      onNewInvestigation={newInvestigation}
      handoff={handoff}
      onNewPageErrorCheck={errorLauncher.open}
    />
  </React.StrictMode>,
);
