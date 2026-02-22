// Tests for security headers and getExportEntry on the real server.mjs
import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { server, getExportEntry } from '../../server.mjs';

let baseUrl;

beforeAll(async () => {
  await new Promise(resolve => server.listen(0, resolve));
  baseUrl = `http://localhost:${server.address().port}`;
});

afterAll(() => {
  server.close();
});

// ── helpers ──────────────────────────────────────────────────────────────────

async function postExport(body, filename = 'test.mp3', mime = 'audio/mpeg') {
  const params = new URLSearchParams({ filename, mime });
  return fetch(`${baseUrl}/api/export?${params}`, {
    method: 'POST',
    headers: { 'Content-Type': mime },
    body
  });
}

// ── getExportEntry ────────────────────────────────────────────────────────────

describe('getExportEntry', () => {
  test('returns null for a non-existent token', () => {
    expect(getExportEntry('a'.repeat(32))).toBeNull();
  });

  test('returns the stored entry after a successful POST', async () => {
    const res = await postExport(Buffer.from('AUDIO'), 'cancion.mp3', 'audio/mpeg');
    expect(res.status).toBe(200);
    const { token } = await res.json();

    const entry = getExportEntry(token);
    expect(entry).not.toBeNull();
    expect(entry.filename).toBe('cancion.mp3');
    expect(entry.mime).toBe('audio/mpeg');
    expect(entry.buf).toBeInstanceOf(Buffer);
    expect(entry.buf.toString()).toBe('AUDIO');
  });

  test('returns null for malformed token (wrong length)', () => {
    expect(getExportEntry('tooshort')).toBeNull();
  });
});

// ── Security headers: export GET ─────────────────────────────────────────────

describe('GET /api/export/:token — security headers', () => {
  test('has CORP: same-origin but NOT COOP or COEP', async () => {
    const post = await postExport(Buffer.from('DATA'), 'audio.mp3', 'audio/mpeg');
    const { token } = await post.json();

    const res = await fetch(`${baseUrl}/api/export/${token}`);
    expect(res.status).toBe(200);

    // CORP must be present so the parent page's COEP: require-corp allows it
    expect(res.headers.get('cross-origin-resource-policy')).toBe('same-origin');
    // COOP and COEP must be absent to avoid "Refused to display in a frame" errors
    expect(res.headers.get('cross-origin-opener-policy')).toBeNull();
    expect(res.headers.get('cross-origin-embedder-policy')).toBeNull();
  });
});

// ── Security headers: static files ────────────────────────────────────────────

describe('Static files — security headers', () => {
  test('index.html response has COOP, COEP, and CORP', async () => {
    const res = await fetch(`${baseUrl}/`);
    expect(res.status).toBe(200);
    expect(res.headers.get('cross-origin-opener-policy')).toBe('same-origin');
    expect(res.headers.get('cross-origin-embedder-policy')).toBe('require-corp');
    expect(res.headers.get('cross-origin-resource-policy')).toBe('same-origin');
  });
});

// ── Server routing edge cases ─────────────────────────────────────────────────

describe('Server routing', () => {
  test('returns 404 for unknown token', async () => {
    const res = await fetch(`${baseUrl}/api/export/${'0'.repeat(32)}`);
    expect(res.status).toBe(404);
  });

  test('returns 400 for POST with empty body', async () => {
    const res = await fetch(`${baseUrl}/api/export?filename=x.mp3&mime=audio/mpeg`, {
      method: 'POST',
      body: ''
    });
    expect(res.status).toBe(400);
  });

  test('returns 404 for non-existent file', async () => {
    const res = await fetch(`${baseUrl}/nonexistent/file.js`);
    expect(res.status).toBe(404);
  });
});
