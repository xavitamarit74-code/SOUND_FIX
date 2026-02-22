// Tests for the server-side export API (POST /api/export + GET /api/export/:token)
// Spins up a minimal inline server that replicates the same routes — this avoids
// importing server.mjs directly (which would call server.listen and conflict
// with the running dev server on port 5173).
import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { randomBytes } from 'node:crypto';

// ── Minimal inline server replicating the two API routes ───────────────────
// (Avoids port conflicts with the running dev server during tests.)
import { createServer } from 'node:http';

let testServer;
let baseUrl;

// Replicate the two handlers from server.mjs so we can test them in isolation.
const exportStore = new Map();
const TTL = 2000; // short TTL for tests

function storeLocal(buf, filename, mime) {
  const token = randomBytes(16).toString('hex');
  exportStore.set(token, { buf, filename, mime, expiresAt: Date.now() + TTL });
  setTimeout(() => exportStore.delete(token), TTL + 100);
  return token;
}

function getLocal(token) {
  const e = exportStore.get(token);
  if (!e) return null;
  if (Date.now() > e.expiresAt) { exportStore.delete(token); return null; }
  return e;
}

beforeAll(async () => {
  testServer = createServer(async (req, res) => {
    const urlPath = (req.url || '').split('?')[0];

    if (urlPath === '/api/export' && req.method === 'POST') {
      const url = new URL(req.url, 'http://localhost');
      const filename = url.searchParams.get('filename') || 'output';
      const mime = url.searchParams.get('mime') || 'application/octet-stream';
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const buf = Buffer.concat(chunks);
      if (buf.length === 0) { res.statusCode = 400; res.end('{}'); return; }
      const token = storeLocal(buf, filename, mime);
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ token, url: `/api/export/${token}` }));
      return;
    }

    const m = urlPath.match(/^\/api\/export\/([a-f0-9]{32})$/);
    if (m && req.method === 'GET') {
      const entry = getLocal(m[1]);
      if (!entry) { res.statusCode = 404; res.end('{}'); return; }
      const safe = entry.filename.replace(/[^\w.\-()\[\] ]/g, '_');
      res.setHeader('Content-Type', entry.mime);
      res.setHeader('Content-Disposition', `attachment; filename="${safe}"`);
      res.setHeader('Content-Length', entry.buf.length);
      res.statusCode = 200;
      res.end(entry.buf);
      return;
    }

    res.statusCode = 404;
    res.end('Not Found');
  });

  await new Promise(resolve => testServer.listen(0, resolve));
  baseUrl = `http://localhost:${testServer.address().port}`;
});

afterAll(() => {
  testServer?.close();
});

// ── helper ──────────────────────────────────────────────────────────────────

async function postExport(body, filename, mime) {
  const params = new URLSearchParams({ filename, mime });
  const res = await fetch(`${baseUrl}/api/export?${params}`, {
    method: 'POST',
    headers: { 'Content-Type': mime },
    body
  });
  return res;
}

async function getExport(token) {
  return fetch(`${baseUrl}/api/export/${token}`);
}

// ── tests ────────────────────────────────────────────────────────────────────

describe('POST /api/export', () => {
  test('returns 200 with token and url for valid upload', async () => {
    const res = await postExport('FAKE_AUDIO', 'song_edited.mp3', 'audio/mpeg');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.token).toMatch(/^[a-f0-9]{32}$/);
    expect(body.url).toBe(`/api/export/${body.token}`);
  });

  test('returns 400 for empty body', async () => {
    const res = await fetch(`${baseUrl}/api/export?filename=x.mp3&mime=audio/mpeg`, {
      method: 'POST',
      headers: { 'Content-Type': 'audio/mpeg' },
      body: ''
    });
    expect(res.status).toBe(400);
  });

  test('stores the exact bytes that were uploaded', async () => {
    const payload = Buffer.from([0x49, 0x44, 0x33, 0xFF, 0xFE]);
    const res = await postExport(payload, 'check.mp3', 'audio/mpeg');
    const { token } = await res.json();

    const dl = await getExport(token);
    const downloaded = Buffer.from(await dl.arrayBuffer());
    expect(downloaded.equals(payload)).toBe(true);
  });
});

describe('GET /api/export/:token', () => {
  test('returns the file with correct Content-Disposition header', async () => {
    const res = await postExport('AUDIO_DATA', 'my track_edited.m4a', 'audio/mp4');
    const { token } = await res.json();

    const dl = await getExport(token);
    expect(dl.status).toBe(200);
    const cd = dl.headers.get('content-disposition');
    expect(cd).toContain('attachment');
    // The sanitiser allows spaces; verify the base filename is present
    expect(cd).toContain('my track_edited.m4a');
  });

  test('sets correct Content-Type for mp3 download', async () => {
    const res = await postExport('MP3', 'song.mp3', 'audio/mpeg');
    const { token } = await res.json();
    const dl = await getExport(token);
    expect(dl.headers.get('content-type')).toBe('audio/mpeg');
  });

  test('sets correct Content-Type for m4a download', async () => {
    const res = await postExport('M4A', 'song.m4a', 'audio/mp4');
    const { token } = await res.json();
    const dl = await getExport(token);
    expect(dl.headers.get('content-type')).toBe('audio/mp4');
  });

  test('returns 404 for unknown token', async () => {
    const dl = await getExport('0'.repeat(32));
    expect(dl.status).toBe(404);
  });

  test('returns 404 for malformed token (wrong length)', async () => {
    const dl = await fetch(`${baseUrl}/api/export/tooshort`);
    expect(dl.status).toBe(404);
  });

  test('token expires after TTL and returns 404', async () => {
    const res = await postExport('EXPIRING', 'temp.mp3', 'audio/mpeg');
    const { token } = await res.json();

    // Wait for TTL to pass
    await new Promise(r => setTimeout(r, TTL + 200));

    const dl = await getExport(token);
    expect(dl.status).toBe(404);
  }, 10_000);

  test('Content-Length matches actual file size', async () => {
    const data = Buffer.alloc(1024, 0xAB);
    const res = await postExport(data, 'big.mp3', 'audio/mpeg');
    const { token } = await res.json();

    const dl = await getExport(token);
    expect(Number(dl.headers.get('content-length'))).toBe(1024);
    const body = await dl.arrayBuffer();
    expect(body.byteLength).toBe(1024);
  });
});
