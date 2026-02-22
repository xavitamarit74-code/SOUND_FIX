import { describe, expect, test } from 'vitest';
import {
  buildAudioCodecArgs,
  buildEqFilter,
  buildFadeFilter,
  buildSeparationFilter,
  formatTime,
  mimeFromExt,
  parseDurationFromFfmpegLogs,
  parseTime,
  validateFile
} from '../../src/js/editorCore.js';

// ── validateFile helpers ──────────────────────────────────────────────────────

function makeFile(name, bytes = []) {
  const data = new Uint8Array(bytes);
  return {
    name,
    slice: (start, end) => ({
      arrayBuffer: async () => data.slice(start, end).buffer
    })
  };
}

describe('editorCore', () => {
  test('formatTime', () => {
    expect(formatTime(0)).toBe('00:00');
    expect(formatTime(61)).toBe('01:01');
  });

  test('parseTime', () => {
    expect(parseTime('00:00')).toBe(0);
    expect(parseTime('01:05')).toBe(65);
    expect(Number.isNaN(parseTime('1:65'))).toBe(true);
    expect(Number.isNaN(parseTime('abc'))).toBe(true);
  });

  test('buildEqFilter omits zero gains', () => {
    expect(buildEqFilter({ g31: 0, g62: 0, g125: 0, g250: 0, g500: 0, g1k: 0, g2k: 0, g4k: 0, g8k: 0, g16k: 0 })).toBe('');
    const f = buildEqFilter({ g31: 0, g62: 3, g125: 0, g250: 0, g500: 0, g1k: -2, g2k: 0, g4k: 0, g8k: 0, g16k: 0 });
    expect(f).toContain('equalizer=f=62');
    expect(f).toContain('g=3');
    expect(f).toContain('equalizer=f=1000');
    expect(f).toContain('g=-2');
  });

  test('buildEqFilter builds 10-band chain in order', () => {
    const f = buildEqFilter({
      g31: 1,
      g62: 2,
      g125: 3,
      g250: 4,
      g500: 5,
      g1k: 6,
      g2k: 7,
      g4k: 8,
      g8k: 9,
      g16k: 10
    });

    const parts = f.split(',');
    expect(parts).toHaveLength(10);
    expect(parts[0]).toContain('equalizer=f=31');
    expect(parts[1]).toContain('equalizer=f=62');
    expect(parts[2]).toContain('equalizer=f=125');
    expect(parts[3]).toContain('equalizer=f=250');
    expect(parts[4]).toContain('equalizer=f=500');
    expect(parts[5]).toContain('equalizer=f=1000');
    expect(parts[6]).toContain('equalizer=f=2000');
    expect(parts[7]).toContain('equalizer=f=4000');
    expect(parts[8]).toContain('equalizer=f=8000');
    expect(parts[9]).toContain('equalizer=f=16000');
    expect(f).toContain(':width_type=q:width=1');
  });

  test('buildEqFilter omits tiny gains under threshold', () => {
    expect(buildEqFilter({ g31: 0.00005, g62: 0, g125: 0, g250: 0, g500: 0, g1k: 0, g2k: 0, g4k: 0, g8k: 0, g16k: 0 })).toBe('');
    expect(buildEqFilter({ g31: 0.001, g62: 0, g125: 0, g250: 0, g500: 0, g1k: 0, g2k: 0, g4k: 0, g8k: 0, g16k: 0 })).toContain('equalizer=f=31');
  });

  test('buildFadeFilter', () => {
    expect(buildFadeFilter(10, 0, 0)).toBe('');
    expect(buildFadeFilter(10, 1, 0)).toContain('afade=t=in');
    expect(buildFadeFilter(10, 0, 2)).toContain('afade=t=out');
    expect(buildFadeFilter(10, 0, 2)).toContain('st=8');
  });

  test('buildFadeFilter handles edge cases', () => {
    // fadeOut should not be emitted without a finite duration
    expect(buildFadeFilter(NaN, 0, 2)).toBe('');

    // fadeOut longer than duration should clamp start time to 0
    const f = buildFadeFilter(1, 0, 5);
    expect(f).toContain('afade=t=out');
    expect(f).toContain('st=0');
    expect(f).toContain('d=5');
  });

  test('buildAudioCodecArgs', () => {
    expect(buildAudioCodecArgs('mp3')).toEqual(['-c:a', 'libmp3lame', '-b:a', '192k', '-ar', '44100']);
    expect(buildAudioCodecArgs('wav')).toEqual(['-c:a', 'pcm_s16le', '-ar', '44100']);
    expect(buildAudioCodecArgs('m4a')).toContain('aac');
    expect(buildAudioCodecArgs('mp4')).toContain('aac');
    expect(buildAudioCodecArgs('m4r')).toContain('aac');
  });

  test('mimeFromExt', () => {
    expect(mimeFromExt('mp3')).toBe('audio/mpeg');
    expect(mimeFromExt('wav')).toBe('audio/wav');
    expect(mimeFromExt('m4a')).toBe('audio/mp4');
    expect(mimeFromExt('mp4')).toBe('audio/mp4');
  });

  test('parseDurationFromFfmpegLogs', () => {
    const logs = 'Duration: 00:03:45.12, start: 0.000000, bitrate: 128 kb/s';
    expect(parseDurationFromFfmpegLogs(logs)).toBeCloseTo(225.12, 2);
  });
});

// ── buildSeparationFilter ─────────────────────────────────────────────────────

describe('buildSeparationFilter', () => {
  test('returns empty string for unrecognised mode', () => {
    expect(buildSeparationFilter('')).toBe('');
    expect(buildSeparationFilter('none')).toBe('');
  });

  test('vocal mode produces mid-channel pan filter', () => {
    const f = buildSeparationFilter('vocal');
    expect(f).toContain('pan=stereo');
    expect(f).toContain('0.5*c0+0.5*c1');
  });

  test('instrumental mode produces side-channel pan filter', () => {
    const f = buildSeparationFilter('instrumental');
    expect(f).toContain('pan=stereo');
    expect(f).toContain('0.5*c0-0.5*c1');
  });
});

// ── validateFile ──────────────────────────────────────────────────────────────

describe('validateFile', () => {
  test('accepts files with allowed extensions', async () => {
    expect(await validateFile(makeFile('song.mp3'))).toBe(true);
    expect(await validateFile(makeFile('audio.wav'))).toBe(true);
    expect(await validateFile(makeFile('video.mp4'))).toBe(true);
    expect(await validateFile(makeFile('audio.m4a'))).toBe(true);
    expect(await validateFile(makeFile('ringtone.m4r'))).toBe(true);
    expect(await validateFile(makeFile('track.ogg'))).toBe(true);
    expect(await validateFile(makeFile('lossless.flac'))).toBe(true);
    expect(await validateFile(makeFile('clip.mov'))).toBe(true);
  });

  test('extension check is case-insensitive', async () => {
    expect(await validateFile(makeFile('SONG.MP3'))).toBe(true);
    expect(await validateFile(makeFile('Video.MP4'))).toBe(true);
  });

  test('rejects unknown extension with no recognisable magic bytes', async () => {
    expect(await validateFile(makeFile('file.xyz', [0x00, 0x01, 0x02, 0x03]))).toBe(false);
    expect(await validateFile(makeFile('data.bin', [0xDE, 0xAD, 0xBE, 0xEF]))).toBe(false);
  });

  test('accepts OGG via magic bytes (OggS)', async () => {
    // OGG capture pattern: 0x4F 0x67 0x67 0x53
    expect(await validateFile(makeFile('unknown', [0x4F, 0x67, 0x67, 0x53]))).toBe(true);
  });

  test('accepts FLAC via magic bytes (fLaC)', async () => {
    // FLAC marker: 0x66 0x4C 0x61 0x43
    expect(await validateFile(makeFile('unknown', [0x66, 0x4C, 0x61, 0x43]))).toBe(true);
  });

  test('accepts MP4/M4A via ftyp box at offset 4', async () => {
    // Bytes 4-7 are 'ftyp' (0x66 0x74 0x79 0x70)
    const bytes = [0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70];
    expect(await validateFile(makeFile('unknown', bytes))).toBe(true);
  });

  test('accepts MP3 via frame sync bytes (0xff 0xe0+)', async () => {
    expect(await validateFile(makeFile('unknown', [0xff, 0xe0, 0x00, 0x00]))).toBe(true);
    expect(await validateFile(makeFile('unknown', [0xff, 0xfb, 0xc0, 0x00]))).toBe(true);
  });

  test('returns false gracefully for null or undefined', async () => {
    expect(await validateFile(null)).toBe(false);
    expect(await validateFile(undefined)).toBe(false);
  });

  test('returns false for file with no extension and no magic bytes', async () => {
    expect(await validateFile(makeFile('noextension', [0x00, 0x00, 0x00, 0x00]))).toBe(false);
  });
});
