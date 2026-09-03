import { createRoot } from 'react-dom/client';
import { setBaseUrl } from '@workspace/api-client-react';

import App from './App';
import { ErrorBoundary } from '@/components/error-boundary';
import { initObservability } from '@/lib/observability';

import './index.css';

// Kick off Sentry first so errors during setBaseUrl / App mount are captured.
initObservability();

// When the frontend is deployed on a different origin than the API
// (e.g. Vercel serving the SPA, Fly/Railway/Render hosting the Express
// server), set VITE_API_BASE_URL at build time so all generated hooks
// hit the correct origin. Leave unset for same-origin deploys.
const apiBaseUrl = import.meta.env.VITE_API_BASE_URL;
if (apiBaseUrl) {
  setBaseUrl(apiBaseUrl);
}

createRoot(document.getElementById('root')!, {
  // Keeps caught errors off reportError(), which would raise the dev overlay.
  onCaughtError: (error, errorInfo) => {
    console.error(error, errorInfo.componentStack);
  },
}).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
);
