import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { installErrorReporting } from './lib/error-reporting';

if (import.meta.env.PROD) installErrorReporting(import.meta.env.VITE_API_URL);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
