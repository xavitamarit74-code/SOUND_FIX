# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Start dev server (auto-opens browser, picks a free port starting at 5173)
./run_app.sh
# or directly:
node server.mjs

# Run all tests
npm test

# Unit tests only (vitest)
npm run test:unit

# Run a single unit test file
npx vitest run tests/unit/editorCore.test.js

# E2E tests (Playwright — requires dev server on port 5173)
npm run test:e2e
```

The E2E suite auto-starts the server via `webServer` in `playwright.config.js`. Set `NO_OPEN=1` to prevent the server from opening a browser tab. The dev server must serve COOP/COEP headers for FFmpeg's SharedArrayBuffer to work — the plain `node server.mjs` does this; Vite or any other static server will not.

## Architecture

This is a **client-side audio editor** that runs FFmpeg entirely in the browser via WebAssembly. There is no build step; source files are served as-is.

### Server (`server.mjs`)
A minimal Node.js `http` server with two responsibilities:
1. **Static file serving** — serves `public/` and `node_modules/` with the COOP/COEP/CORP security headers required for `crossOriginIsolated` (needed by SharedArrayBuffer / FFmpeg multi-thread).
2. **Export API** — `POST /api/export?filename=&mime=` stores the processed audio in an in-memory map (2-minute TTL), returns a token. `GET /api/export/:token` serves the file for download **without** COOP/COEP headers (required so the browser triggers Save dialog). The download is triggered via a hidden `<iframe>` rather than `<a>.click()` to work around post-`await` gesture context expiry in Safari/Firefox.

### Client (`src/js/`)
- **`editorCore.js`** — pure utility functions with no DOM or FFmpeg dependency: `validateFile`, `formatTime`, `parseTime`, `buildEqFilter`, `buildFadeFilter`, `buildAudioCodecArgs`, `mimeFromExt`, `parseDurationFromFfmpegLogs`, `triggerServerDownload`. All are exported and unit-tested.
- **`app.js`** — single-file UI controller loaded as an ES module from `public/index.html`. Handles DOM wiring, file upload/drag-drop, timeline drag handles, EQ/fade/crossfade controls, localStorage persistence, and orchestrates FFmpeg calls for Preview and Export.

### FFmpeg loading strategy (`app.js → ensureFFmpeg`)
- Lazy-loads FFmpeg on first Preview/Export.
- If `crossOriginIsolated` is true, tries `@ffmpeg/core-mt` (multi-thread) first, falls back to `@ffmpeg/core` (single-thread).
- `?mockFFmpeg=1` query param activates a mock FFmpeg object used by E2E tests to avoid loading WASM.

### Audio processing pipeline
FFmpeg filter chains are built from pure functions in `editorCore.js`:
- **Trim**: `atrim=start=X:end=Y,asetpts=PTS-STARTPTS`
- **EQ**: 10-band parametric via `equalizer=f=…:width_type=q:width=1:g=…` (bands with gain ≈ 0 are omitted)
- **Fade**: `afade=t=in/out:st=…:d=…`
- **Crossfade** (when File B is loaded): uses `acrossfade=d=…` with `-filter_complex`

### Tests
- **Unit** (`tests/unit/`, vitest): `editorCore.test.js` tests all pure functions; `exportApi.test.js` spins up an inline HTTP server to test the API routes; `download.test.js` uses jsdom to test `triggerServerDownload`.
- **E2E** (`tests/e2e/`, Playwright): all tests use `?mockFFmpeg=1` to skip WASM loading. Fixture file: `tests/fixtures/test.mp3`. Notyf assertion strings must be in Spanish (the UI is fully localized).

### LocalStorage keys
- `audioEditorSettings` — EQ band values (10-band array), fadeIn/fadeOut/crossfade, outputFormat.
- `customEqPreset` — saved custom EQ snapshot.
- Migration from the old 5-band format to 10-band is handled by `migrateEqArrayTo10`.
