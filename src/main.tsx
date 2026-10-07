import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles/index.css';

const container = document.getElementById('root');
if (!container) throw new Error('Root container missing in index.html');

createRoot(container).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

/**
 * Tear down the pre-paint boot overlay.
 *
 * index.html also hides it with a pure-CSS rule (`#root:not(:empty) + #boot`),
 * which is the real guarantee; this removes the node entirely so it can never
 * trap focus or be read by a screen reader, and cancels the watchdog timer.
 */
const watchdog = (window as unknown as { __bootWatchdog?: number }).__bootWatchdog;
if (watchdog) window.clearTimeout(watchdog);
document.getElementById('boot')?.remove();
