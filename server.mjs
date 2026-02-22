import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { exec } from 'node:child_process';
import { randomBytes } from 'node:crypto';

// ---------------------------------------------------------------------------
// In-memory export store: POST /api/export  →  GET /api/export/:token
// Tokens expire after 2 minutes so they don't accumulate.
// ---------------------------------------------------------------------------
const exportStore = new Map(); // token → { buf, filename, mime, expiresAt }
const EXPORT_TTL_MS = 2 * 60 * 1000;

function storeExport(buf, filename, mime) {
  const token = randomBytes(16).toString('hex');
  exportStore.set(token, { buf, filename, mime, expiresAt: Date.now() + EXPORT_TTL_MS });
  // Lazy cleanup
  setTimeout(() => exportStore.delete(token), EXPORT_TTL_MS + 1000);
  return token;
}

// Exported for unit tests
export function getExportEntry(token) {
  const entry = exportStore.get(token);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) { exportStore.delete(token); return null; }
  return entry;
}

async function handleExportPost(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const filename = url.searchParams.get('filename') || 'output';
  const mime = url.searchParams.get('mime') || 'application/octet-stream';

  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const buf = Buffer.concat(chunks);

  if (buf.length === 0) {
    res.statusCode = 400;
    res.end(JSON.stringify({ error: 'Empty body' }));
    return;
  }

  const token = storeExport(buf, filename, mime);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.statusCode = 200;
  res.end(JSON.stringify({ token, url: `/api/export/${token}` }));
}

function handleExportGet(req, res, token) {
  const entry = getExportEntry(token);
  if (!entry) {
    res.statusCode = 404;
    res.end(JSON.stringify({ error: 'Not found or expired' }));
    return;
  }

  // Sanitise filename for Content-Disposition
  const safe = entry.filename.replace(/[^\w.\-()\[\] ]/g, '_');
  res.setHeader('Content-Type', entry.mime);
  res.setHeader('Content-Disposition', `attachment; filename="${safe}"`);
  res.setHeader('Content-Length', entry.buf.length);
  // Remove COOP/COEP so the response is not treated as a cross-origin-isolated
  // document, but KEEP Cross-Origin-Resource-Policy: same-origin so the parent
  // page's COEP: require-corp allows this same-origin iframe navigation.
  res.removeHeader('Cross-Origin-Opener-Policy');
  res.removeHeader('Cross-Origin-Embedder-Policy');
  res.statusCode = 200;
  res.end(entry.buf);
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT_DIR = __dirname;
const PORT = process.env.PORT ? Number(process.env.PORT) : 5173;

function openBrowser(url) {
  if (process.env.NO_OPEN === '1') return;

  const platform = process.platform;
  const cmd =
    platform === 'darwin'
      ? `open "${url}"`
      : platform === 'win32'
        ? `start "" "${url}"`
        : `xdg-open "${url}"`;

  exec(cmd, (err) => {
    if (err) {
      // No bloquear si no se puede abrir (p.ej. entornos sin GUI)
      console.warn('Could not auto-open browser:', err.message);
    }
  });
}

const MIME = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.wasm', 'application/wasm'],
  ['.map', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.ico', 'image/x-icon']
]);

function setSecurityHeaders(res) {
  // Needed for SharedArrayBuffer (ffmpeg multi-thread)
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
}

function safeResolve(urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0]);
  const withoutHash = decoded.split('#')[0];
  const requestPath = withoutHash === '/' ? '/public/index.html' : withoutHash;
  const absPath = path.resolve(ROOT_DIR, '.' + requestPath);

  if (!absPath.startsWith(ROOT_DIR)) return null;
  return absPath;
}

export const server = http.createServer(async (req, res) => {
  try {
    setSecurityHeaders(res);

    if (!req.url) {
      res.statusCode = 400;
      res.end('Bad Request');
      return;
    }

    const urlPath = req.url.split('?')[0];

    // ── Export API ──────────────────────────────────────────────────────────
    if (urlPath === '/api/export' && req.method === 'POST') {
      await handleExportPost(req, res);
      return;
    }

    const exportTokenMatch = urlPath.match(/^\/api\/export\/([a-f0-9]{32})$/);
    if (exportTokenMatch && req.method === 'GET') {
      handleExportGet(req, res, exportTokenMatch[1]);
      return;
    }
    // ────────────────────────────────────────────────────────────────────────

    const filePath = safeResolve(req.url);
    if (!filePath) {
      res.statusCode = 403;
      res.end('Forbidden');
      return;
    }

    const stat = await fs.stat(filePath).catch(() => null);
    if (!stat || !stat.isFile()) {
      res.statusCode = 404;
      res.end('Not Found');
      return;
    }

    const ext = path.extname(filePath);
    res.setHeader('Content-Type', MIME.get(ext) ?? 'application/octet-stream');

    const data = await fs.readFile(filePath);
    res.statusCode = 200;
    res.end(data);
  } catch (err) {
    res.statusCode = 500;
    res.end('Internal Server Error');
    console.error(err);
  }
});

// Only start listening when run directly (not when imported in tests)
const __isMain = fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (__isMain) {
  server.listen(PORT, () => {
    const url = `http://localhost:${PORT}`;
    console.log(`Dev server running at ${url}`);
    console.log('COOP/COEP enabled (crossOriginIsolated should be true).');
    openBrowser(url);
  });
}
