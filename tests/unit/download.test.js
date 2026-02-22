// @vitest-environment jsdom
// Tests for triggerBlobDownload and getSaveHandler (editorCore.js)
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { triggerBlobDownload, getSaveHandler } from '../../src/js/editorCore.js';

// ── helpers ─────────────────────────────────────────────────────────────────

function makeBlob(content = 'FAKE', mime = 'audio/mpeg') {
  return new Blob([content], { type: mime });
}

// ── setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-url');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  // Ensure showSaveFilePicker is not defined by default
  delete global.showSaveFilePicker;
});

afterEach(() => {
  vi.restoreAllMocks();
  document.querySelectorAll('a').forEach(el => el.remove());
  delete global.showSaveFilePicker;
});

// ── triggerBlobDownload ───────────────────────────────────────────────────────

describe('triggerBlobDownload', () => {
  test('creates and clicks an <a download> element', () => {
    const blob = makeBlob();
    const clickSpy = vi.spyOn(HTMLElement.prototype, 'click').mockImplementation(() => {});

    triggerBlobDownload(blob, 'output.mp3');

    expect(URL.createObjectURL).toHaveBeenCalledWith(blob);
    expect(clickSpy).toHaveBeenCalledOnce();
  });

  test('sets the correct download attribute and href', () => {
    const blob = makeBlob();
    let capturedA = null;

    vi.spyOn(document.body, 'appendChild').mockImplementation((el) => {
      capturedA = el;
    });
    vi.spyOn(document.body, 'removeChild').mockImplementation(() => {});
    vi.spyOn(HTMLElement.prototype, 'click').mockImplementation(() => {});

    triggerBlobDownload(blob, 'track_editado.mp3');

    expect(capturedA).not.toBeNull();
    expect(capturedA.download).toBe('track_editado.mp3');
    expect(capturedA.href).toContain('blob:mock-url');
    expect(capturedA.style.display).toBe('none');
  });

  test('removes the <a> element from DOM after click', () => {
    const blob = makeBlob();
    vi.spyOn(HTMLElement.prototype, 'click').mockImplementation(() => {});
    const removeSpy = vi.spyOn(document.body, 'removeChild').mockImplementation(() => {});

    triggerBlobDownload(blob, 'output.mp3');

    expect(removeSpy).toHaveBeenCalledOnce();
  });

  test('revokes blob URL after 10 seconds', () => {
    vi.useFakeTimers();
    const blob = makeBlob();
    vi.spyOn(HTMLElement.prototype, 'click').mockImplementation(() => {});

    triggerBlobDownload(blob, 'output.mp3');

    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    vi.advanceTimersByTime(10_000);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');

    vi.useRealTimers();
  });
});

// ── getSaveHandler ────────────────────────────────────────────────────────────

describe('getSaveHandler', () => {
  test('returns blob download function when showSaveFilePicker is unavailable', async () => {
    const handler = await getSaveHandler('output.mp3', 'audio/mpeg');

    expect(typeof handler).toBe('function');

    const blob = makeBlob();
    vi.spyOn(HTMLElement.prototype, 'click').mockImplementation(() => {});
    handler(blob);

    expect(URL.createObjectURL).toHaveBeenCalledWith(blob);
  });

  test('uses showSaveFilePicker when available and returns write handler', async () => {
    const mockClose = vi.fn();
    const mockWrite = vi.fn();
    const mockWritable = { write: mockWrite, close: mockClose };
    const mockHandle = { createWritable: vi.fn().mockResolvedValue(mockWritable) };
    global.showSaveFilePicker = vi.fn().mockResolvedValue(mockHandle);

    const handler = await getSaveHandler('output.mp3', 'audio/mpeg');

    expect(global.showSaveFilePicker).toHaveBeenCalledWith({
      suggestedName: 'output.mp3',
      types: [{ description: 'Audio', accept: { 'audio/mpeg': ['.mp3'] } }]
    });

    // URL.createObjectURL should NOT be called (we're writing to file handle)
    expect(URL.createObjectURL).not.toHaveBeenCalled();

    const blob = makeBlob();
    await handler(blob);

    expect(mockHandle.createWritable).toHaveBeenCalledOnce();
    expect(mockWrite).toHaveBeenCalledWith(blob);
    expect(mockClose).toHaveBeenCalledOnce();
  });

  test('returns null when user cancels showSaveFilePicker (AbortError)', async () => {
    const abortErr = new DOMException('User cancelled', 'AbortError');
    global.showSaveFilePicker = vi.fn().mockRejectedValue(abortErr);

    const handler = await getSaveHandler('output.mp3', 'audio/mpeg');

    expect(handler).toBeNull();
  });

  test('falls back to blob download on SecurityError from showSaveFilePicker', async () => {
    const secErr = new DOMException('Not allowed', 'SecurityError');
    global.showSaveFilePicker = vi.fn().mockRejectedValue(secErr);

    const handler = await getSaveHandler('output.mp3', 'audio/mpeg');

    // Should return a fallback function, not null
    expect(typeof handler).toBe('function');

    const blob = makeBlob();
    vi.spyOn(HTMLElement.prototype, 'click').mockImplementation(() => {});
    handler(blob);

    expect(URL.createObjectURL).toHaveBeenCalledWith(blob);
  });

  test('passes correct types for m4a format', async () => {
    global.showSaveFilePicker = vi.fn().mockResolvedValue({
      createWritable: vi.fn().mockResolvedValue({ write: vi.fn(), close: vi.fn() })
    });

    await getSaveHandler('audio.m4a', 'audio/mp4');

    expect(global.showSaveFilePicker).toHaveBeenCalledWith(
      expect.objectContaining({
        suggestedName: 'audio.m4a',
        types: [{ description: 'Audio', accept: { 'audio/mp4': ['.m4a'] } }]
      })
    );
  });

  test('works without extension in filename (no types passed)', async () => {
    global.showSaveFilePicker = vi.fn().mockResolvedValue({
      createWritable: vi.fn().mockResolvedValue({ write: vi.fn(), close: vi.fn() })
    });

    await getSaveHandler('noextension', 'audio/mpeg');

    const call = global.showSaveFilePicker.mock.calls[0][0];
    expect(call.types).toBeUndefined();
  });
});
