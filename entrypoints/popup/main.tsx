import React from 'react';
import ReactDOM from 'react-dom/client';
import { browser } from 'wxt/browser';
import { createSession } from '../../lib/session';
import { App } from './App';
import './style.css';

const root = document.getElementById('root');
if (!root) throw new Error('Missing popup root');

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <App session={createSession(browser)} />
  </React.StrictMode>,
);
