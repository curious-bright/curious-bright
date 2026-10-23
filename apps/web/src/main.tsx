import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';
import { initAnalytics } from './lib/analytics';
import './assets/fonts.css';
import './index.css';

initAnalytics();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

// The service worker is production-only so Vite's dev server keeps hot reload.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js');
  });
}
