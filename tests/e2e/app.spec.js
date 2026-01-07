import path from 'node:path';
import { test, expect } from '@playwright/test';

const fixtureA = path.resolve(process.cwd(), 'tests/fixtures/test.mp3');

test('carga archivo, habilita editor y exporta (mock ffmpeg)', async ({ page }) => {
  await page.goto('/?mockFFmpeg=1');

  const fileInput = page.locator('#file-input');
  await fileInput.setInputFiles(fixtureA);

  await expect(page.locator('#editor-panels')).toBeVisible();
  await expect(page.locator('#file-details')).toBeVisible();

  // Ajustar trim a 00:08 (duración mock = 10s)
  await page.locator('#end-time').fill('00:08');
  await page.locator('#end-time').dispatchEvent('change');

  // Fade in/out
  await page.locator('#fade-in').fill('1');
  await page.locator('#fade-out').fill('1');

  // Export MP3
  await page.locator('#output-format').selectOption('mp3');

  const downloadPromise = page.waitForEvent('download');
  await page.locator('#export-btn').click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toMatch(/_edited\.mp3$/);
});

test('crossfade requiere archivo B y exporta (mock ffmpeg)', async ({ page }) => {
  await page.goto('/?mockFFmpeg=1');

  await page.locator('#file-input').setInputFiles(fixtureA);

  // Habilita crossfade para mostrar File B
  await page.locator('#crossfade').fill('1');
  await expect(page.locator('#file-details-b')).toBeVisible();

  await page.locator('#file-input-b').setInputFiles(fixtureA);

  await page.locator('#output-format').selectOption('m4a');

  const downloadPromise = page.waitForEvent('download');
  await page.locator('#export-btn').click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toMatch(/_edited\.m4a$/);
});

test('preview genera audio (mock ffmpeg) y refleja EQ/Fade', async ({ page }) => {
  await page.goto('/?mockFFmpeg=1');

  await page.locator('#file-input').setInputFiles(fixtureA);
  await expect(page.locator('#editor-panels')).toBeVisible();

  // EQ: subir 1kHz a +4 dB y verificar etiqueta
  await page.locator('#eq-1k').evaluate((el) => {
    el.value = '4';
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await expect(page.locator('#eq-1k').locator('..').locator('.eq__value')).toHaveText('+4 dB');

  // Fade: poner 2.5s y verificar texto y progreso (25%)
  await page.locator('#fade-in').evaluate((el) => {
    el.value = '2.5';
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await expect(page.locator('#fade-in-value')).toHaveText('2.5s');

  const fadeProgress = await page.locator('#fade-in').evaluate((el) => {
    const v = getComputedStyle(el).getPropertyValue('--range-progress');
    return (v || '').trim();
  });
  expect(fadeProgress).toBe('25%');

  // Preview en M4A
  await page.locator('#output-format').selectOption('m4a');
  await page.locator('#preview-btn').click();

  await expect(page.getByText('Preview ready')).toBeVisible();
  await expect(page.locator('#audio-player')).toBeVisible();
  await expect(page.locator('#video-player')).toBeHidden();

  const src = await page.locator('#audio-player').evaluate(el => el.src);
  expect(src).toMatch(/^blob:/);
});

test('preview abortado con crossfade sin File B pausa reproductor', async ({ page }) => {
  await page.addInitScript(() => {
    window.__pauseCount = 0;
    const orig = HTMLMediaElement.prototype.pause;
    HTMLMediaElement.prototype.pause = function () {
      window.__pauseCount++;
      return orig.call(this);
    };
  });

  await page.goto('/?mockFFmpeg=1');
  await page.locator('#file-input').setInputFiles(fixtureA);
  await expect(page.locator('#editor-panels')).toBeVisible();

  // Forzar una src conocida para asegurar que no se cambia al abortar
  await page.locator('#audio-player').evaluate((el) => {
    el.src = 'data:audio/mpeg;base64,SUQz';
  });

  // Activar crossfade sin seleccionar File B
  await page.locator('#crossfade').evaluate((el) => {
    el.value = '1';
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });

  await page.locator('#preview-btn').click();

  await expect(page.getByText('Preview aborted: Crossfade is enabled. Please choose File B.')).toBeVisible();

  const pauseCount = await page.evaluate(() => window.__pauseCount);
  expect(pauseCount).toBeGreaterThan(0);

  const srcAfter = await page.locator('#audio-player').evaluate(el => el.src);
  expect(srcAfter).toMatch(/^data:/);
});
