/**
 * Application Entry Point
 * 
 * This is the main entry point for the Glinax Chatbot React application.
 * It initializes the React app and renders it to the DOM.
 * 
 * Features:
 * - StrictMode for development warnings and checks
 * - Modern React 18 createRoot API
 * - Global CSS imports
 * 
 * Integration Notes:
 * - Ready for production deployment
 * - Optimized for performance
 */

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';

// Get the root element and create React root
const rootElement = document.getElementById('root');
if (!rootElement) {
  // Production-safe error handling
  console.error('CRITICAL: Root element not found. Please ensure there is a div with id="root" in your HTML.');
  document.body.innerHTML = '<div style="padding: 20px; text-align: center; font-family: sans-serif;"><h1>⚠️ App Initialization Error</h1><p>Unable to find root element. Please refresh the page or contact support.</p></div>';
  throw new Error('Root element not found');
}

const root = createRoot(rootElement);

// Render the app with StrictMode for development checks
// Add global error handler for production
window.addEventListener('error', (event) => {
  console.error('Global error:', event.error);
  // In production, you might want to send this to an error tracking service
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled promise rejection:', event.reason);
});

root.render(
  <StrictMode>
    <App />
  </StrictMode>
);
