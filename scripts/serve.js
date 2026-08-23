#!/usr/bin/env node
'use strict';

/**
 * DCITC PREVIEW SERVER  —  scripts/serve.js
 * =========================================
 * WHAT THIS FILE CONTROLS:
 *   A zero-dependency static file server for the BUILD OUTPUT
 *   (public/) — `npm run serve`. It exists because the site uses
 *   directory-style URLs (/about/, /projects/<slug>/) that plain
 *   file:// or naive servers don't resolve nicely.
 *
 * RESOLUTION RULES (in order, first existing file wins):
 *   1. <public>/<path>            (exact file)
 *   2. <public>/<path>.html       (extensionless convenience)
 *   3. <public>/<path>/index.html (directory-style page URL)
 *
 * SAFETY: every candidate must sit inside public/ (prefix check), so
 * ../ traversal can't escape the build output.
 *
 * HEADERS: Content-Type from a small MIME map; Cache-Control: no-cache
 * so edits show up on refresh without server restarts.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'public'); // served directory
const PORT = process.env.PORT || 8080;

// extension → Content-Type for anything the site ships
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml',
};

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent(new URL(req.url, `http://${req.headers.host}`).pathname);
  let filePath = path.join(OUT, urlPath);

  // directory URLs -> index.html
  if (urlPath.endsWith('/')) filePath = path.join(filePath, 'index.html');

  // try the three candidate paths described in the header
  const candidates = [filePath, filePath + '.html', path.join(filePath, 'index.html')];
  let chosen = null;
  for (const c of candidates) {
    if (!c.startsWith(OUT)) continue; // traversal guard: stay inside public/
    try {
      if (fs.statSync(c).isFile()) {
        chosen = c;
        break;
      }
    } catch (e) {
      /* keep trying */
    }
  }
  if (chosen) {
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(chosen).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    fs.createReadStream(chosen).pipe(res);
    return;
  }
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('404 — not found');
});

server.listen(PORT, () => {
  console.log(`DCITC preview → http://localhost:${PORT}`);
});
