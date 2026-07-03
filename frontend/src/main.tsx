import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';

const rootElement = document.getElementById('root');
if (!rootElement) {
  console.error('CRITICAL: Root element not found. Please ensure there is a div with id="root" in your HTML.');
  document.body.innerHTML = '<div style="padding: 20px; text-align: center; font-family: sans-serif;"><h1>️ App Initialization Error</h1><p>Unable to find root element. Please refresh the page or contact support.</p></div>';
  throw new Error('Root element not found');
}

const root = createRoot(rootElement);

window.addEventListener('error', (event) => {
  console.error('Global error:', event.error);
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled promise rejection:', event.reason);
});

root.render(
  <StrictMode>
    <App />
  </StrictMode>
);
