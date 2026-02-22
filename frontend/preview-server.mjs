#!/usr/bin/env node
/**
 * Preview Server with SPA Fallback
 * Properly handles client-side routing for the production build
 */

import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 4173;

// Serve static files from the dist directory
app.use(express.static(path.join(__dirname, 'dist')));

// SPA fallback - serve index.html for all routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`🚀 Preview server running at http://localhost:${PORT}`);
  console.log(`📦 Serving from: ${path.join(__dirname, 'dist')}`);
});
