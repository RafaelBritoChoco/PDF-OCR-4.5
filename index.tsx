import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import * as pdfjs from 'pdfjs-dist';

// CRITICAL FIX: The worker version MUST match the library version in index.html (v5.4.296)
// Previous mismatch (v4.4 vs v5.4) caused "Failed to load reference file" errors.
const PDF_WORKER_URL = 'https://aistudiocdn.com/pdfjs-dist@^5.4.296/build/pdf.worker.mjs';
pdfjs.GlobalWorkerOptions.workerSrc = PDF_WORKER_URL;

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);