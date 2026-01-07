import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { exec } from 'node:child_process';

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

const server = http.createServer(async (req, res) => {
  try {
    setSecurityHeaders(res);

    if (!req.url) {
      res.statusCode = 400;
      res.end('Bad Request');
      return;
    }

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

server.listen(PORT, () => {
  const url = `http://localhost:${PORT}`;
  console.log(`Dev server running at ${url}`);
  console.log('COOP/COEP enabled (crossOriginIsolated should be true).');
  openBrowser(url);
});
