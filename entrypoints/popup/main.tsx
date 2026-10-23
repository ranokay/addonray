import React from 'react';
import ReactDOM from 'react-dom/client';
import { browser } from 'wxt/browser';
import { getBrowserContext } from '../../lib/browser-target';
import { createSession } from '../../lib/session';
import { App } from './App';
import './style.css';

const root = document.getElementById('root');
if (!root) throw new Error('Missing popup root');
const context = getBrowserContext(import.meta.env.BROWSER);
const session = createSession(browser, context);

async function newInvestigation() {
  await browser.tabs.create({
    url: browser.runtime.getURL('/investigation.html'),
  });
}

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <App session={session} onNewInvestigation={newInvestigation} />
  </React.StrictMode>,
);
