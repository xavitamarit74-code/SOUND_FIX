# Sound Fix (AudioWave Editor)

Editor web (frontend puro) para **recortar audio por tiempo**, aplicar **ecualizador de 10 bandas**, **fade in / fade out** y **crossfade** (con un segundo archivo opcional), y **exportar SOLO audio**.

Funciona en local con `ffmpeg.wasm` (WASM) y un servidor Node que añade los headers necesarios para `SharedArrayBuffer` (multihilo cuando esté disponible).

## Características

- Entrada: `.mp3`, `.mp4`, `.m4a`, `.m4r`, `.ogg`, `.flac`, `.mov`
- Drag & drop + selector de archivo
- Recorte por tiempo (`Start Time` / `End Time`) con timeline
- Ecualizador 10 bandas (31Hz / 62Hz / 125Hz / 250Hz / 500Hz / 1kHz / 2kHz / 4kHz / 8kHz / 16kHz) con presets
- Fade in/out (0–10s)
- Crossfade (0–10s) usando un **Archivo B** (solo si crossfade > 0)
- **Preview**: genera una previsualización procesada (misma cadena de filtros que el export)
- Export: `mp3`, `mp4`, `m4a`, `m4r` (siempre **audio-only**, aunque el input sea vídeo)

## Requisitos

- Node.js 18+ (recomendado)
- Navegador moderno (Chrome/Chromium recomendado)
- En local, el servidor incluido añade `COOP/COEP` para habilitar `SharedArrayBuffer`.

## Quick start

```bash
npm start
```

Esto:
- instala dependencias (si falta)
- levanta el servidor en `http://localhost:5173`
- intenta abrir el navegador automáticamente (en macOS/Linux/Windows)

Para desactivar la autoapertura:

```bash
NO_OPEN=1 npm run dev
```

## Scripts

- `npm run dev`: servidor local (con headers COOP/COEP)
- `npm start`: `npm install` + `npm run dev`
- `npm test`: unit + e2e
- `npm run test:unit`: Vitest (solo helpers)
- `npm run test:e2e`: Playwright (UI)

## Cómo funciona (alto nivel)

1. La UI carga en [public/index.html](public/index.html) y usa Bootstrap + CSS propio (BEM) en [src/css/app.css](src/css/app.css).
2. La lógica está en [src/js/app.js](src/js/app.js).
3. El procesamiento lo hace `ffmpeg.wasm` (`@ffmpeg/ffmpeg`, `@ffmpeg/core(-mt)`).
4. Se construye un grafo de filtros de audio según:
   - recorte (`atrim`)
   - EQ (cadena de `equalizer`)
   - fades (`afade`)
   - crossfade (`acrossfade`) cuando aplica
5. Se exporta siempre audio-only (`-vn`).

## Flujo recomendado (usuario)

1. Carga un archivo (A) por drag & drop o “Browse File”.
2. Ajusta el recorte con `Start Time` / `End Time`.
3. Ajusta EQ, Fade In/Out y (opcional) Crossfade.
4. Si `Crossfade` > 0, selecciona “Browse File B”.
5. Pulsa **Preview** para verificar el resultado (usa el formato seleccionado en `Output Format`).
6. Pulsa **Export File** para descargar el archivo final.

Más detalle en:
- [docs/USAGE.md](docs/USAGE.md)
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md)

## Estructura del proyecto

- [public/index.html](public/index.html): markup + importmap + carga de JS/CSS
- [src/css/app.css](src/css/app.css): estilos propios (BEM)
- [src/js/app.js](src/js/app.js): UI + orquestación + ffmpeg
- [src/js/editorCore.js](src/js/editorCore.js): helpers puros y testeables
- [server.mjs](server.mjs): servidor estático con COOP/COEP + auto-open
- [tests/unit](tests/unit): Vitest
- [tests/e2e](tests/e2e): Playwright

## Notas importantes

- Export “MP4/M4A/M4R”: se usa contenedor MP4 con audio AAC (es lo más compatible). El archivo sigue siendo **solo audio**.
- Crossfade requiere dos archivos. Si `Crossfade` > 0 y no hay Archivo B, la app **aborta Preview/Export** con un aviso.
- Cuando un **Preview se aborta**, la app pausa el reproductor para evitar que “siga sonando” el audio/vídeo previamente cargado.
- Los sliders de Fade/Crossfade muestran una barra de “progreso” (parte izquierda coloreada) para que sea visualmente consistente con el valor actual.

## Licencia

Proyecto interno/demo. Si necesitas una licencia explícita, dímelo y la añadimos.
