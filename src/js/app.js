import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import {
  validateFile,
  formatTime,
  parseTime,
  buildEqFilter,
  buildFadeFilter,
  buildAudioCodecArgs,
  mimeFromExt,
  parseDurationFromFfmpegLogs
} from './editorCore.js';

document.addEventListener('DOMContentLoaded', () => {
  const { Notyf } = window;

  const notyf = new Notyf({
    duration: 3500,
    position: { x: 'right', y: 'top' },
    types: [
      { type: 'success', background: '#4ecdc4', icon: false },
      { type: 'error', background: '#f790b2', icon: false }
    ]
  });

  // DOM Elements
  const dropZone = document.getElementById('drop-zone');
  const fileInput = document.getElementById('file-input');
  const fileDetails = document.getElementById('file-details');
  const fileName = document.getElementById('file-name');
  const fileInfo = document.getElementById('file-info');
  const fileDetailsB = document.getElementById('file-details-b');
  const fileNameB = document.getElementById('file-name-b');
  const fileInfoB = document.getElementById('file-info-b');
  const browseFileB = document.getElementById('browse-file-b');
  const fileInputB = document.getElementById('file-input-b');
  const audioPlayer = document.getElementById('audio-player');
  const videoPlayer = document.getElementById('video-player');
  const editorPanels = document.getElementById('editor-panels');
  const startOverBtn = document.getElementById('start-over-btn');
  const previewBtn = document.getElementById('preview-btn');
  const exportBtn = document.getElementById('export-btn');
  const loadingOverlay = document.getElementById('loading-overlay');
  const progressBar = document.getElementById('progress-bar');
  const progressText = document.getElementById('progress-text');

  // EQ controls
  const eqPreset = document.getElementById('eq-preset');
  const savePresetBtn = document.getElementById('save-preset-btn');
  const eqSliders = [
    document.getElementById('eq-31'),
    document.getElementById('eq-62'),
    document.getElementById('eq-125'),
    document.getElementById('eq-250'),
    document.getElementById('eq-500'),
    document.getElementById('eq-1k'),
    document.getElementById('eq-2k'),
    document.getElementById('eq-4k'),
    document.getElementById('eq-8k'),
    document.getElementById('eq-16k')
  ];

  // Fade controls
  const fadeInSlider = document.getElementById('fade-in');
  const fadeOutSlider = document.getElementById('fade-out');
  const crossfadeSlider = document.getElementById('crossfade');
  const fadeInValue = document.getElementById('fade-in-value');
  const fadeOutValue = document.getElementById('fade-out-value');
  const crossfadeValue = document.getElementById('crossfade-value');

  // Timeline controls
  const timelineEl = document.getElementById('timeline');
  const startHandle = document.getElementById('start-handle');
  const endHandle = document.getElementById('end-handle');
  const selectionEl = document.getElementById('timeline-selection');
  const startTimeInput = document.getElementById('start-time');
  const endTimeInput = document.getElementById('end-time');

  // Output format
  const outputFormat = document.getElementById('output-format');

  // Variables
  let currentFile = null;
  let currentFileB = null;
  let isVideoFile = false;
  let isVideoFileB = false;
  let totalDuration = 0;
  let totalDurationB = 0;
  let startTime = 0;
  let endTime = 0;
  let previewObjectUrl = null;
  let previewRunId = 0;

  // FFmpeg (lazy loaded)
  let ffmpeg = null;
  let ffmpegLoaded = false;
  let ffmpegLoading = false;

  const mockFFmpegMode = new URLSearchParams(window.location.search).has('mockFFmpeg');

  // Initialize from localStorage if exists
  loadSavedSettings();

  // Event Listeners
  dropZone.addEventListener('click', () => fileInput.click());
  browseFileB.addEventListener('click', () => fileInputB.click());

  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('uploader__dropzone--active');
  });

  dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('uploader__dropzone--active');
  });

  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('uploader__dropzone--active');

    const files = e.dataTransfer.files;
    if (files.length) {
      handleFile(files[0]);
    }
  });

  fileInput.addEventListener('change', () => {
    if (fileInput.files.length) {
      handleFile(fileInput.files[0]);
    }
  });

  fileInputB.addEventListener('change', () => {
    if (fileInputB.files.length) {
      handleFileB(fileInputB.files[0]);
    }
  });

  // Handle file upload
  async function handleFile(file) {
    const ok = await validateFile(file);
    if (!ok) {
      notyf.error('Unsupported file format. Please upload an MP3, MP4, M4A, M4R, OGG, FLAC, or MOV file.');
      return;
    }

    currentFile = file;
    fileName.textContent = file.name;

    isVideoFile = (file.type || '').startsWith('video/') || file.name.toLowerCase().endsWith('.mov') || file.name.toLowerCase().endsWith('.mp4');

    if (isVideoFile) {
      videoPlayer.style.display = 'block';
      audioPlayer.style.display = 'none';

      const videoURL = URL.createObjectURL(file);
      videoPlayer.src = videoURL;

      videoPlayer.onloadedmetadata = () => {
        if (Number.isFinite(videoPlayer.duration) && videoPlayer.duration > 0) {
          totalDuration = videoPlayer.duration;
          updateDurationDisplay();
        }
      };
    } else {
      audioPlayer.style.display = 'block';
      videoPlayer.style.display = 'none';

      const audioURL = URL.createObjectURL(file);
      audioPlayer.src = audioURL;

      audioPlayer.onloadedmetadata = () => {
        if (Number.isFinite(audioPlayer.duration) && audioPlayer.duration > 0) {
          totalDuration = audioPlayer.duration;
          updateDurationDisplay();
        }
      };
    }

    fileDetails.style.display = 'block';
    editorPanels.style.display = 'block';

    generateFakeWaveform();

    queueMicrotask(async () => {
      if (!Number.isFinite(totalDuration) || totalDuration <= 0) {
        try {
          const probed = await probeDurationSeconds(file, 'inputA');
          if (Number.isFinite(probed) && probed > 0) {
            totalDuration = probed;
            updateDurationDisplay();
          }
        } catch (e) {
          console.warn(e);
        }
      }
    });
  }

  async function handleFileB(file) {
    const ok = await validateFile(file);
    if (!ok) {
      notyf.error('Unsupported file format for File B.');
      return;
    }

    currentFileB = file;
    fileNameB.textContent = file.name;
    isVideoFileB = (file.type || '').startsWith('video/') || file.name.toLowerCase().endsWith('.mov') || file.name.toLowerCase().endsWith('.mp4');

    try {
      const probed = await probeDurationSeconds(file, 'inputB');
      totalDurationB = Number.isFinite(probed) ? probed : 0;
    } catch {
      totalDurationB = 0;
    }

    const fileSizeMB = (file.size / (1024 * 1024)).toFixed(2);
    const durationStr = totalDurationB > 0 ? formatTime(totalDurationB) : '-';
    fileInfoB.textContent = `Size: ${fileSizeMB} MB | Duration: ${durationStr}`;
    fileDetailsB.style.display = 'block';
  }

  function updateDurationDisplay() {
    const fileSizeMB = (currentFile.size / (1024 * 1024)).toFixed(2);
    const durationStr = formatTime(totalDuration);
    fileInfo.textContent = `Size: ${fileSizeMB} MB | Duration: ${durationStr}`;

    endTime = totalDuration;
    startTime = 0;

    startTimeInput.value = formatTime(startTime);
    endTimeInput.value = formatTime(endTime);

    updateTimelineSelection();
  }

  // Generate a fake waveform for visualization
  function generateFakeWaveform() {
    const waveform = document.getElementById('waveform');
    const gradient = `linear-gradient(180deg, var(--primary) 0%, var(--secondary) 50%, var(--primary) 100%)`;
    waveform.style.background = gradient;
  }

  // Timeline Handling
  function updateTimelineSelection() {
    if (!timelineEl) return;
    const timelineWidth = timelineEl.offsetWidth;
    if (!Number.isFinite(totalDuration) || totalDuration <= 0) return;

    const handleWidth = 10;
    const startPos = Math.max(0, Math.min(timelineWidth - handleWidth, (startTime / totalDuration) * timelineWidth));
    const endPos = Math.max(handleWidth, Math.min(timelineWidth, (endTime / totalDuration) * timelineWidth));

    startHandle.style.left = `${startPos}px`;
    endHandle.style.left = `${Math.max(startPos + handleWidth, endPos - handleWidth)}px`;

    selectionEl.style.left = `${startPos + handleWidth}px`;
    selectionEl.style.width = `${Math.max(0, (endPos - startPos - handleWidth))}px`;
    selectionEl.style.right = 'auto';
  }

  function clampTimes() {
    if (!Number.isFinite(totalDuration) || totalDuration <= 0) return;
    startTime = Math.max(0, Math.min(startTime, totalDuration));
    endTime = Math.max(0, Math.min(endTime, totalDuration));
    if (endTime < startTime) {
      const t = endTime;
      endTime = startTime;
      startTime = t;
    }
  }

  function secondsFromX(clientX) {
    const rect = timelineEl.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, clientX - rect.left));
    return (x / rect.width) * totalDuration;
  }

  function setupHandleDrag() {
    let dragging = null;

    const onPointerMove = (e) => {
      if (!dragging || !Number.isFinite(totalDuration) || totalDuration <= 0) return;
      const sec = secondsFromX(e.clientX);
      const minGap = 0.05;
      if (dragging === 'start') {
        startTime = Math.min(sec, endTime - minGap);
        startTime = Math.max(0, startTime);
        startTimeInput.value = formatTime(startTime);
      } else {
        endTime = Math.max(sec, startTime + minGap);
        endTime = Math.min(totalDuration, endTime);
        endTimeInput.value = formatTime(endTime);
      }
      updateTimelineSelection();
    };

    const onPointerUp = () => {
      dragging = null;
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };

    startHandle.addEventListener('pointerdown', (e) => {
      dragging = 'start';
      startHandle.setPointerCapture?.(e.pointerId);
      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
    });

    endHandle.addEventListener('pointerdown', (e) => {
      dragging = 'end';
      endHandle.setPointerCapture?.(e.pointerId);
      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
    });

    startTimeInput.addEventListener('change', () => {
      const v = parseTime(startTimeInput.value);
      if (!Number.isFinite(v)) {
        startTimeInput.value = formatTime(startTime);
        return;
      }
      startTime = v;
      clampTimes();
      startTimeInput.value = formatTime(startTime);
      endTimeInput.value = formatTime(endTime);
      updateTimelineSelection();
    });

    endTimeInput.addEventListener('change', () => {
      const v = parseTime(endTimeInput.value);
      if (!Number.isFinite(v)) {
        endTimeInput.value = formatTime(endTime);
        return;
      }
      endTime = v;
      clampTimes();
      startTimeInput.value = formatTime(startTime);
      endTimeInput.value = formatTime(endTime);
      updateTimelineSelection();
    });
  }

  // EQ Preset Handling
  eqPreset.addEventListener('change', () => {
    const presetName = eqPreset.value;
    if (presetName === 'custom') {
      applyCustomEqPreset();
      saveSettings();
      return;
    }

    let values = [];
    switch (presetName) {
      // 10-band order: 31, 62, 125, 250, 500, 1k, 2k, 4k, 8k, 16k
      // Mapped from the previous 5-band intent: 60≈62, 230≈250, 910≈1k, 4k, 14k≈16k
      case 'rock': values = [0, 4, 0, 2, 0, -2, 0, 2, 0, 3]; break;
      case 'jazz': values = [0, 2, 0, -1, 0, 0, 0, 1, 0, 3]; break;
      case 'classical': values = [0, 3, 0, 1, 0, 0, 0, 2, 0, -1]; break;
      case 'flat':
      default: values = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]; break;
    }

    eqSliders.forEach((slider, index) => {
      slider.value = values[index];
      updateEqValue(slider, slider.nextElementSibling.nextElementSibling);
    });

    saveSettings();
  });

  savePresetBtn.addEventListener('click', () => {
    const values = eqSliders.map(slider => slider.value);
    localStorage.setItem('customEqPreset', JSON.stringify(values));
    eqPreset.value = 'custom';
    notyf.success('Custom preset saved');
  });

  function migrateEqArrayTo10(values) {
    if (!Array.isArray(values)) return null;
    if (values.length === 10) return values;
    if (values.length !== 5) return null;

    // old order: [60, 230, 910, 4k, 14k]
    // new order: [31, 62, 125, 250, 500, 1k, 2k, 4k, 8k, 16k]
    const out = ['0', values[0], '0', values[1], '0', values[2], '0', values[3], '0', values[4]];
    return out;
  }

  function applyEqValues(values) {
    eqSliders.forEach((slider, index) => {
      const v = values?.[index] ?? 0;
      slider.value = v;
      updateEqValue(slider, slider.nextElementSibling.nextElementSibling);
    });
  }

  function applyCustomEqPreset() {
    const raw = localStorage.getItem('customEqPreset');
    if (!raw) return;

    try {
      let values = JSON.parse(raw);
      values = migrateEqArrayTo10(values) ?? values;
      if (Array.isArray(values) && values.length === 10) {
        applyEqValues(values);
        localStorage.setItem('customEqPreset', JSON.stringify(values));
      }
    } catch {
      // ignore
    }
  }

  eqSliders.forEach(slider => {
    const valueDisplay = slider.nextElementSibling.nextElementSibling;

    slider.addEventListener('input', () => {
      updateEqValue(slider, valueDisplay);
      eqPreset.value = 'custom';
      saveSettings();
    });

    updateEqValue(slider, valueDisplay);
  });

  function updateEqValue(slider, display) {
    const value = parseInt(slider.value);
    display.textContent = `${value > 0 ? '+' : ''}${value} dB`;
  }

  function pausePlayers() {
    try {
      audioPlayer.pause();
    } catch {
      // ignore
    }

    try {
      videoPlayer.pause();
    } catch {
      // ignore
    }
  }

  function updateRangeProgress(slider) {
    if (!slider) return;
    const min = Number(slider.min ?? 0);
    const max = Number(slider.max ?? 100);
    const value = Number(slider.value ?? 0);
    const denom = max - min;
    const pct = denom > 0 ? ((value - min) / denom) * 100 : 0;
    const clamped = Math.max(0, Math.min(100, pct));
    slider.style.setProperty('--range-progress', `${clamped}%`);
  }

  // Fade Controls
  fadeInSlider.addEventListener('input', () => {
    fadeInValue.textContent = `${fadeInSlider.value}s`;
    updateRangeProgress(fadeInSlider);
    saveSettings();
  });

  fadeOutSlider.addEventListener('input', () => {
    fadeOutValue.textContent = `${fadeOutSlider.value}s`;
    updateRangeProgress(fadeOutSlider);
    saveSettings();
  });

  crossfadeSlider.addEventListener('input', () => {
    crossfadeValue.textContent = `${crossfadeSlider.value}s`;
    updateRangeProgress(crossfadeSlider);
    updateCrossfadeUI();
    saveSettings();
  });

  fadeInValue.textContent = `${fadeInSlider.value}s`;
  fadeOutValue.textContent = `${fadeOutSlider.value}s`;
  crossfadeValue.textContent = `${crossfadeSlider.value}s`;
  updateRangeProgress(fadeInSlider);
  updateRangeProgress(fadeOutSlider);
  updateRangeProgress(crossfadeSlider);

  startOverBtn.addEventListener('click', () => {
    resetApplication();
  });

  function resetApplication() {
    currentFile = null;
    currentFileB = null;
    fileInput.value = '';
    fileInputB.value = '';
    fileDetails.style.display = 'none';
    fileDetailsB.style.display = 'none';
    editorPanels.style.display = 'none';
    audioPlayer.src = '';
    videoPlayer.src = '';
    audioPlayer.style.display = 'none';
    videoPlayer.style.display = 'none';

    if (previewObjectUrl) {
      URL.revokeObjectURL(previewObjectUrl);
      previewObjectUrl = null;
    }

    startTime = 0;
    endTime = 0;
    startTimeInput.value = '00:00';
    endTimeInput.value = '00:00';

    notyf.success('Application reset successfully');
  }

  function updateCrossfadeUI() {
    const cf = Number(crossfadeSlider.value);
    if (cf > 0) {
      fileDetailsB.style.display = 'block';
    } else {
      fileDetailsB.style.display = 'none';
      currentFileB = null;
      fileInputB.value = '';
      fileNameB.textContent = 'second-file.mp3';
      fileInfoB.textContent = 'Size: - | Duration: -';
      totalDurationB = 0;
    }
  }

  function saveSettings() {
    const settings = {
      eq: eqSliders.map(slider => slider.value),
      fadeIn: fadeInSlider.value,
      fadeOut: fadeOutSlider.value,
      crossfade: crossfadeSlider.value,
      outputFormat: outputFormat.value
    };

    localStorage.setItem('audioEditorSettings', JSON.stringify(settings));
  }

  function loadSavedSettings() {
    const savedSettings = localStorage.getItem('audioEditorSettings');

    if (savedSettings) {
      const settings = JSON.parse(savedSettings);

      if (settings.eq) {
        const migrated = migrateEqArrayTo10(settings.eq);
        const eqValues = migrated ?? settings.eq;
        applyEqValues(eqValues);

        if (migrated) {
          settings.eq = migrated;
          localStorage.setItem('audioEditorSettings', JSON.stringify(settings));
        }
      }

      if (settings.fadeIn) {
        fadeInSlider.value = settings.fadeIn;
        fadeInValue.textContent = `${settings.fadeIn}s`;
      }

      if (settings.fadeOut) {
        fadeOutSlider.value = settings.fadeOut;
        fadeOutValue.textContent = `${settings.fadeOut}s`;
      }

      if (settings.crossfade) {
        crossfadeSlider.value = settings.crossfade;
        crossfadeValue.textContent = `${settings.crossfade}s`;
      }

      if (settings.outputFormat) {
        outputFormat.value = settings.outputFormat;
      }
    }

    updateCrossfadeUI();

    const customPreset = localStorage.getItem('customEqPreset');
    if (customPreset) {
      try {
        const values = JSON.parse(customPreset);
        const migrated = migrateEqArrayTo10(values);
        if (migrated) {
          localStorage.setItem('customEqPreset', JSON.stringify(migrated));
        }
      } catch {
        // ignore
      }
    }
  }

  // Preview (renders a temporary MP3 and loads it into the player)
  previewBtn?.addEventListener('click', async () => {
    const runId = ++previewRunId;
    pausePlayers();

    try {
      if (!currentFile) {
        notyf.error('No file to preview. Please upload a file first.');
        return;
      }

      const cf = Number(crossfadeSlider.value);
      if (cf > 0 && !currentFileB) {
        notyf.error('Preview aborted: Crossfade is enabled. Please choose File B.');
        return;
      }

      if (!Number.isFinite(totalDuration) || totalDuration <= 0) {
        totalDuration = await probeDurationSeconds(currentFile, 'inputA');
        updateDurationDisplay();
      }

      clampTimes();
      const segDur = Math.max(0, endTime - startTime);
      if (segDur <= 0.01) {
        notyf.error('Invalid trim range.');
        return;
      }

      const fadeIn = Number(fadeInSlider.value);
      const fadeOut = Number(fadeOutSlider.value);
      if (fadeIn + fadeOut > segDur + 1e-6) {
        notyf.error('Fade in/out is longer than the selected clip.');
        return;
      }

      if (cf > 0) {
        if (totalDurationB <= 0) {
          totalDurationB = await probeDurationSeconds(currentFileB, 'inputB');
        }
        if (!Number.isFinite(totalDurationB) || totalDurationB <= 0) {
          notyf.error('Could not read duration for File B.');
          return;
        }
        if (cf > segDur || cf > totalDurationB) {
          notyf.error('Crossfade must be shorter than both clips.');
          return;
        }
      }

      loadingOverlay.style.display = 'flex';
      setProgress(0);

      await ensureFFmpeg();

      ffmpeg.off?.('progress');
      ffmpeg.on('progress', ({ progress }) => {
        if (typeof progress === 'number') {
          setProgress(Math.round(Math.max(0, Math.min(1, progress)) * 100));
        }
      });

      const outExt = outputFormat.value;
      const baseName = (currentFile.name || 'output').replace(/\.[^/.]+$/, '');
      const outName = `${baseName}_preview.${outExt}`;

      await safeUnlink('inputA');
      await safeUnlink('inputB');
      await safeUnlink(outName);

      await ffmpeg.writeFile('inputA', await fetchFile(currentFile));
      if (cf > 0) {
        await ffmpeg.writeFile('inputB', await fetchFile(currentFileB));
      }

      const eqFilter = buildEqFilter({
        g31: eqSliders[0].value,
        g62: eqSliders[1].value,
        g125: eqSliders[2].value,
        g250: eqSliders[3].value,
        g500: eqSliders[4].value,
        g1k: eqSliders[5].value,
        g2k: eqSliders[6].value,
        g4k: eqSliders[7].value,
        g8k: eqSliders[8].value,
        g16k: eqSliders[9].value
      });
      const fadesFilter = buildFadeFilter(segDur, fadeIn, fadeOut);

      if (cf > 0) {
        const aTrim = `atrim=start=${startTime}:end=${endTime},asetpts=PTS-STARTPTS`;
        const bTrim = `atrim=start=0:end=${totalDurationB},asetpts=PTS-STARTPTS`;

        const aChain = [aTrim, eqFilter].filter(Boolean).join(',');
        const bChain = [bTrim, eqFilter].filter(Boolean).join(',');

        const post = [fadesFilter].filter(Boolean).join(',');
        const filterComplex = `
          [0:a]${aChain}[a0];
          [1:a]${bChain}[a1];
          [a0][a1]acrossfade=d=${cf}:c1=tri:c2=tri[ac];
          [ac]${post}[outa]
        `.replace(/\s+/g, ' ').trim();

        await ffmpeg.exec([
          '-hide_banner',
          '-y',
          '-i', 'inputA',
          '-i', 'inputB',
          '-vn',
          '-filter_complex', filterComplex,
          '-map', '[outa]',
          ...buildAudioCodecArgs(outExt),
          outName
        ]);
      } else {
        const trim = `atrim=start=${startTime}:end=${endTime},asetpts=PTS-STARTPTS`;
        const af = [trim, eqFilter, fadesFilter].filter(Boolean).join(',');

        await ffmpeg.exec([
          '-hide_banner',
          '-y',
          '-i', 'inputA',
          '-vn',
          '-af', af,
          ...buildAudioCodecArgs(outExt),
          outName
        ]);
      }

      const data = await ffmpeg.readFile(outName);
      const blob = new Blob([data.buffer], { type: mimeFromExt(outExt) });

      if (runId !== previewRunId) return;

      if (previewObjectUrl) {
        URL.revokeObjectURL(previewObjectUrl);
        previewObjectUrl = null;
      }

      previewObjectUrl = URL.createObjectURL(blob);
      audioPlayer.src = previewObjectUrl;
      audioPlayer.load();
      audioPlayer.style.display = 'block';
      videoPlayer.style.display = 'none';

      try {
        await audioPlayer.play();
      } catch {
        // Autoplay may be blocked; user can press play.
      }

      notyf.success('Preview ready');
    } catch (err) {
      console.error(err);
      notyf.error('Preview failed. Try a smaller clip or check the dev server (COOP/COEP).');
    } finally {
      loadingOverlay.style.display = 'none';
      setProgress(0);
    }
  });

  // Export
  exportBtn.addEventListener('click', async () => {
    try {
      if (!currentFile) {
        notyf.error('No file to export. Please upload a file first.');
        return;
      }

      const cf = Number(crossfadeSlider.value);
      if (cf > 0 && !currentFileB) {
        notyf.error('Export aborted: Crossfade is enabled. Please choose File B.');
        return;
      }

      if (!Number.isFinite(totalDuration) || totalDuration <= 0) {
        totalDuration = await probeDurationSeconds(currentFile, 'inputA');
        updateDurationDisplay();
      }

      clampTimes();
      const segDur = Math.max(0, endTime - startTime);
      if (segDur <= 0.01) {
        notyf.error('Invalid trim range.');
        return;
      }

      const fadeIn = Number(fadeInSlider.value);
      const fadeOut = Number(fadeOutSlider.value);
      if (fadeIn + fadeOut > segDur + 1e-6) {
        notyf.error('Fade in/out is longer than the selected clip.');
        return;
      }

      if (cf > 0) {
        if (totalDurationB <= 0) {
          totalDurationB = await probeDurationSeconds(currentFileB, 'inputB');
        }
        if (!Number.isFinite(totalDurationB) || totalDurationB <= 0) {
          notyf.error('Could not read duration for File B.');
          return;
        }
        if (cf > segDur || cf > totalDurationB) {
          notyf.error('Crossfade must be shorter than both clips.');
          return;
        }
      }

      loadingOverlay.style.display = 'flex';
      setProgress(0);

      await ensureFFmpeg();

      ffmpeg.off?.('progress');
      ffmpeg.on('progress', ({ progress }) => {
        if (typeof progress === 'number') {
          setProgress(Math.round(Math.max(0, Math.min(1, progress)) * 100));
        }
      });

      const outExt = outputFormat.value;
      const baseName = (currentFile.name || 'output').replace(/\.[^/.]+$/, '');
      const outName = `${baseName}_edited.${outExt}`;

      await safeUnlink('inputA');
      await safeUnlink('inputB');
      await safeUnlink(outName);

      await ffmpeg.writeFile('inputA', await fetchFile(currentFile));
      if (cf > 0) {
        await ffmpeg.writeFile('inputB', await fetchFile(currentFileB));
      }

      const eqFilter = buildEqFilter({
        g31: eqSliders[0].value,
        g62: eqSliders[1].value,
        g125: eqSliders[2].value,
        g250: eqSliders[3].value,
        g500: eqSliders[4].value,
        g1k: eqSliders[5].value,
        g2k: eqSliders[6].value,
        g4k: eqSliders[7].value,
        g8k: eqSliders[8].value,
        g16k: eqSliders[9].value
      });
      const fadesFilter = buildFadeFilter(segDur, fadeIn, fadeOut);

      if (cf > 0) {
        const aTrim = `atrim=start=${startTime}:end=${endTime},asetpts=PTS-STARTPTS`;
        const bTrim = `atrim=start=0:end=${totalDurationB},asetpts=PTS-STARTPTS`;

        const aChain = [aTrim, eqFilter].filter(Boolean).join(',');
        const bChain = [bTrim, eqFilter].filter(Boolean).join(',');

        const post = [fadesFilter].filter(Boolean).join(',');
        const filterComplex = `
          [0:a]${aChain}[a0];
          [1:a]${bChain}[a1];
          [a0][a1]acrossfade=d=${cf}:c1=tri:c2=tri[ac];
          [ac]${post}[outa]
        `.replace(/\s+/g, ' ').trim();

        await ffmpeg.exec([
          '-hide_banner',
          '-y',
          '-i', 'inputA',
          '-i', 'inputB',
          '-vn',
          '-filter_complex', filterComplex,
          '-map', '[outa]',
          ...buildAudioCodecArgs(outExt),
          outName
        ]);
      } else {
        const trim = `atrim=start=${startTime}:end=${endTime},asetpts=PTS-STARTPTS`;
        const af = [trim, eqFilter, fadesFilter].filter(Boolean).join(',');

        await ffmpeg.exec([
          '-hide_banner',
          '-y',
          '-i', 'inputA',
          '-vn',
          '-af', af,
          ...buildAudioCodecArgs(outExt),
          outName
        ]);
      }

      const data = await ffmpeg.readFile(outName);
      const blob = new Blob([data.buffer], { type: mimeFromExt(outExt) });
      downloadBlob(blob, outName);

      notyf.success('File exported successfully!');
    } catch (err) {
      console.error(err);
      notyf.error('Export failed. Try a smaller file or check the dev server (COOP/COEP).');
    } finally {
      loadingOverlay.style.display = 'none';
      setProgress(0);
    }
  });

  function setProgress(percent) {
    const p = Math.max(0, Math.min(100, Number(percent) || 0));
    progressBar.style.width = `${p}%`;
    progressText.textContent = `${p}%`;
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  async function ensureFFmpeg() {
    if (mockFFmpegMode) {
      if (!ffmpegLoaded) {
        ffmpeg = createMockFFmpeg();
        ffmpegLoaded = true;
      }
      return;
    }

    if (ffmpegLoaded) return;
    if (ffmpegLoading) {
      while (!ffmpegLoaded) {
        await new Promise(r => setTimeout(r, 50));
      }
      return;
    }

    ffmpegLoading = true;
    try {
      ffmpeg = new FFmpeg();

      const tryLoad = async (baseURL) => {
        await ffmpeg.load({
          coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
          wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
          workerURL: await toBlobURL(`${baseURL}/ffmpeg-core.worker.js`, 'text/javascript')
        });
      };

      if (window.crossOriginIsolated) {
        try {
          await tryLoad('/node_modules/@ffmpeg/core-mt/dist/esm');
        } catch (e) {
          console.warn('FFmpeg MT load failed, falling back to single-thread.', e);
          notyf.error('FFmpeg multi-thread unavailable. Falling back to compatibility mode.');
          await tryLoad('/node_modules/@ffmpeg/core/dist/esm');
        }
      } else {
        await tryLoad('/node_modules/@ffmpeg/core/dist/esm');
      }

      ffmpegLoaded = true;
    } finally {
      ffmpegLoading = false;
    }
  }

  async function safeUnlink(name) {
    try {
      await ffmpeg?.deleteFile?.(name);
    } catch {
      // ignore
    }
  }

  async function probeDurationSeconds(file, fsName) {
    if (mockFFmpegMode) {
      return 10;
    }

    await ensureFFmpeg();
    const filename = fsName;
    await safeUnlink(filename);
    await ffmpeg.writeFile(filename, await fetchFile(file));

    let logs = '';
    const onLog = ({ message }) => {
      logs += message + '\n';
    };

    ffmpeg.on('log', onLog);
    try {
      await ffmpeg.exec(['-hide_banner', '-i', filename]);
    } catch {
      // expected
    } finally {
      ffmpeg.off('log', onLog);
    }

    const dur = parseDurationFromFfmpegLogs(logs);
    if (!Number.isFinite(dur) || dur <= 0) {
      throw new Error('Could not probe duration');
    }
    return dur;
  }

  function createMockFFmpeg() {
    const files = new Map();
    const handlers = new Map();
    const on = (evt, fn) => {
      if (!handlers.has(evt)) handlers.set(evt, new Set());
      handlers.get(evt).add(fn);
    };
    const off = (evt, fn) => {
      handlers.get(evt)?.delete(fn);
    };
    const emit = (evt, payload) => {
      handlers.get(evt)?.forEach(fn => {
        try { fn(payload); } catch { /* ignore */ }
      });
    };

    return {
      on,
      off,
      writeFile: async (name, data) => {
        files.set(name, data);
      },
      readFile: async (name) => {
        const d = files.get(name);
        if (!d) throw new Error(`Missing file: ${name}`);
        return d;
      },
      deleteFile: async (name) => {
        files.delete(name);
      },
      exec: async (args) => {
        if (Array.isArray(args) && args.includes('-i') && args.length === 3) {
          emit('log', { message: 'Duration: 00:00:10.00, start: 0.000000, bitrate: 128 kb/s' });
          throw new Error('Mock probe: no output');
        }

        emit('progress', { progress: 0.1 });
        emit('progress', { progress: 0.6 });
        emit('progress', { progress: 1 });

        const outName = args[args.length - 1];
        files.set(outName, new Uint8Array([0x46, 0x41, 0x4b, 0x45]));
      }
    };
  }

  setupHandleDrag();
  updateCrossfadeUI();
});
