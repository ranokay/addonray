import React from 'react';
import ReactDOM from 'react-dom/client';
import { browser } from 'wxt/browser';
import { getBrowserContext } from '../../lib/browser-target';
import { createInvestigation } from '../../lib/investigation';
import { App } from './App';
import './style.css';

const root = document.getElementById('root');
if (!root) throw new Error('Missing investigation root');
const context = getBrowserContext(import.meta.env.BROWSER);
const investigation = createInvestigation(browser, context);

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <App investigation={investigation} />
  </React.StrictMode>,
);
