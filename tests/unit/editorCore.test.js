import { describe, expect, test } from 'vitest';
import {
  buildAudioCodecArgs,
  buildEqFilter,
  buildFadeFilter,
  formatTime,
  mimeFromExt,
  parseDurationFromFfmpegLogs,
  parseTime
} from '../../src/js/editorCore.js';

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
    expect(buildAudioCodecArgs('m4a')).toContain('aac');
    expect(buildAudioCodecArgs('mp4')).toContain('aac');
    expect(buildAudioCodecArgs('m4r')).toContain('aac');
  });

  test('mimeFromExt', () => {
    expect(mimeFromExt('mp3')).toBe('audio/mpeg');
    expect(mimeFromExt('m4a')).toBe('audio/mp4');
    expect(mimeFromExt('mp4')).toBe('audio/mp4');
  });

  test('parseDurationFromFfmpegLogs', () => {
    const logs = 'Duration: 00:03:45.12, start: 0.000000, bitrate: 128 kb/s';
    expect(parseDurationFromFfmpegLogs(logs)).toBeCloseTo(225.12, 2);
  });
});
