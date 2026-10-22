import React from 'react';
import ReactDOM from 'react-dom/client';
import { createSession } from '../../lib/session';
import { App } from './App';
import './style.css';

const root = document.getElementById('root');
if (!root) throw new Error('Missing popup root');

if (
  import.meta.env.DEV &&
  new URLSearchParams(location.search).has('variant')
) {
  const { PopupPrototype } = await import('./PopupPrototype');
  ReactDOM.createRoot(root).render(<PopupPrototype />);
} else {
  const { browser } = await import('wxt/browser');
  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <App session={createSession(browser)} />
    </React.StrictMode>,
  );
}
