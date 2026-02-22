export const ALLOWED_EXT = new Set(['mp3', 'mp4', 'm4a', 'm4r', 'ogg', 'flac', 'mov', 'wav']);

export async function validateFile(file) {
  const name = (file?.name || '').toLowerCase();
  const ext = name.includes('.') ? name.split('.').pop() : '';
  if (ALLOWED_EXT.has(ext)) return true;

  try {
    const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
    const str4 = String.fromCharCode(...head.slice(0, 4));
    if (str4 === 'OggS') return true;
    if (str4 === 'fLaC') return true;
    if (str4 === 'ID3') return true;

    const str8 = String.fromCharCode(...head.slice(4, 8));
    if (str8 === 'ftyp') return true;

    if (head[0] === 0xff && (head[1] & 0xe0) === 0xe0) return true;
  } catch {
    // ignore
  }

  return false;
}

export function formatTime(seconds) {
  const s = Number(seconds);
  if (!Number.isFinite(s) || s < 0) return '00:00';
  const mins = Math.floor(s / 60);
  const secs = Math.floor(s % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

export function parseTime(timeStr) {
  const parts = (timeStr || '').trim().split(':').map(p => p.trim());
  if (parts.length !== 2) return NaN;
  const mins = Number(parts[0]);
  const secs = Number(parts[1]);
  if (!Number.isFinite(mins) || !Number.isFinite(secs)) return NaN;
  if (mins < 0 || secs < 0 || secs >= 60) return NaN;
  return mins * 60 + secs;
}

export function buildEqFilter({ g31, g62, g125, g250, g500, g1k, g2k, g4k, g8k, g16k }) {
  const bands = [
    { f: 31, g: Number(g31) },
    { f: 62, g: Number(g62) },
    { f: 125, g: Number(g125) },
    { f: 250, g: Number(g250) },
    { f: 500, g: Number(g500) },
    { f: 1000, g: Number(g1k) },
    { f: 2000, g: Number(g2k) },
    { f: 4000, g: Number(g4k) },
    { f: 8000, g: Number(g8k) },
    { f: 16000, g: Number(g16k) }
  ];

  return bands
    .filter(b => Number.isFinite(b.g) && Math.abs(b.g) > 0.0001)
    .map(b => `equalizer=f=${b.f}:width_type=q:width=1:g=${b.g}`)
    .join(',');
}

export function buildFadeFilter(durationSec, fadeInSec, fadeOutSec) {
  const duration = Number(durationSec);
  const fadeIn = Number(fadeInSec);
  const fadeOut = Number(fadeOutSec);

  const parts = [];
  if (Number.isFinite(fadeIn) && fadeIn > 0) {
    parts.push(`afade=t=in:st=0:d=${fadeIn}`);
  }
  if (Number.isFinite(fadeOut) && fadeOut > 0 && Number.isFinite(duration) && duration > 0) {
    const st = Math.max(0, duration - fadeOut);
    parts.push(`afade=t=out:st=${st}:d=${fadeOut}`);
  }
  return parts.join(',');
}

export function buildAudioCodecArgs(outExt) {
  const ext = (outExt || '').toLowerCase();
  if (ext === 'mp3') {
    return ['-c:a', 'libmp3lame', '-b:a', '192k', '-ar', '44100'];
  }
  if (ext === 'wav') {
    return ['-c:a', 'pcm_s16le', '-ar', '44100'];
  }
  return ['-c:a', 'aac', '-b:a', '192k', '-ar', '44100', '-movflags', '+faststart'];
}

export function mimeFromExt(ext) {
  switch ((ext || '').toLowerCase()) {
    case 'mp3': return 'audio/mpeg';
    case 'm4a':
    case 'm4r':
    case 'mp4': return 'audio/mp4';
    case 'wav': return 'audio/wav';
    default: return 'application/octet-stream';
  }
}

export function buildSeparationFilter(mode) {
  if (mode === 'vocal') {
    return 'pan=stereo|c0=0.5*c0+0.5*c1|c1=0.5*c0+0.5*c1';
  }
  if (mode === 'instrumental') {
    return 'pan=stereo|c0=0.5*c0-0.5*c1|c1=0.5*c1-0.5*c0';
  }
  return '';
}

export function parseDurationFromFfmpegLogs(logs) {
  const m = (logs || '').match(/Duration:\s+(\d+):(\d+):(\d+(?:\.\d+)?)/);
  if (!m) return NaN;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  const ss = Number(m[3]);
  if (![hh, mm, ss].every(Number.isFinite)) return NaN;
  return hh * 3600 + mm * 60 + ss;
}

/**
 * Download a blob directly using a temporary <a download> link.
 * Works in all modern browsers (Chrome, Firefox, Safari 13+).
 * @param {Blob} blob
 * @param {string} filename
 */
export function triggerBlobDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * Returns a save handler for the processed blob. Must be called as the FIRST
 * await inside a user-gesture handler so the gesture context is still active
 * when showSaveFilePicker is invoked.
 *
 * - Chrome/Edge 86+: shows a native Save dialog so the user picks the folder.
 * - Other browsers (or if the picker fails): falls back to triggerBlobDownload.
 * - If the user cancels the dialog: returns null (caller should abort).
 *
 * @param {string} filename  Suggested filename shown in the dialog.
 * @param {string} mimeType  MIME type of the file to save.
 * @returns {Promise<((blob: Blob) => Promise<void>) | null>}
 */
export async function getSaveHandler(filename, mimeType) {
  if (typeof window !== 'undefined' && 'showSaveFilePicker' in window) {
    try {
      const ext = filename.includes('.') ? `.${filename.split('.').pop()}` : '';
      const handle = await window.showSaveFilePicker({
        suggestedName: filename,
        types: ext ? [{ description: 'Audio', accept: { [mimeType]: [ext] } }] : undefined
      });
      return async (blob) => {
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
      };
    } catch (err) {
      if (err.name === 'AbortError') return null; // User explicitly cancelled
      // SecurityError, TypeError, NotAllowedError, etc. → fall through to blob
    }
  }
  return (blob) => triggerBlobDownload(blob, filename);
}
