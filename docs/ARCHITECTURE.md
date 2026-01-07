# Arquitectura

## Visión general

La app es un frontend estático servido por Node para poder:
- servir `node_modules` (importmap)
- añadir headers `COOP/COEP` que habilitan `SharedArrayBuffer` (necesario para `@ffmpeg/core-mt` en navegadores modernos)

El procesamiento se hace 100% en el cliente (WASM). No hay backend de conversión.

La app ofrece dos acciones principales:
- **Preview**: genera un output temporal para escuchar el resultado antes de exportar.
- **Export**: genera el output final y dispara la descarga.

Ambas comparten el mismo pipeline de filtros y codecs; la diferencia es solo el nombre/uso del archivo resultante.

## Componentes principales

### UI

- [public/index.html](../public/index.html)
  - Layout (Bootstrap)
  - Importmap para `@ffmpeg/ffmpeg` y `@ffmpeg/util`
  - Carga del módulo [src/js/app.js](../src/js/app.js)

### Estilos

- [src/css/app.css](../src/css/app.css)
  - Estilos propios con convención BEM
  - Se apoya en variables CSS para colores base
  - Bootstrap se usa solo como base de componentes/utilidades

### Lógica principal

- [src/js/app.js](../src/js/app.js)
  - Maneja input (drag/drop y file picker)
  - Renderiza estado UI (paneles, overlay, progreso)
  - Orquesta `ffmpeg.wasm`:
    - carga core (mt si se puede)
    - escribe archivos en FS virtual
    - ejecuta `ffmpeg.exec([...args])`
    - lee el output y dispara descarga
  - Persiste settings en `localStorage`

Estado y UX relevantes:
- La app guarda EQ/Fades/Crossfade/Formato en `localStorage` para restaurarlos en la siguiente sesión.
- Cuando `Crossfade` > 0, se muestra el panel de “File B” y se valida que exista antes de ejecutar Preview/Export.
- Los sliders de Fade/Crossfade pintan una barra de “progreso” usando una variable CSS `--range-progress`, actualizada desde JS.

### Helpers testeables

- [src/js/editorCore.js](../src/js/editorCore.js)
  - Validación de archivos
  - Parse/format de tiempos
  - Construcción de filtros `ffmpeg` (EQ + fades)
  - Elección de args de codec según formato de salida
  - Parser de duración desde logs

Estos helpers tienen tests unitarios (Vitest) para evitar regresiones.

## Pipeline de audio (conceptual)

La app construye un filtro `-filter:a` (o `-filter_complex` cuando hay crossfade) según el estado de UI.

Casos típicos:

1) Sin crossfade:
- input A → recorte (atrim) → EQ (equalizer x10) → fades (afade) → encode

2) Con crossfade:
- input A → (recorte/EQ/fades) = A'
- input B → (recorte/EQ/fades) = B'
- A' + B' → `acrossfade=d=...` → encode

Export:
- siempre `-vn` para descartar vídeo.

Preview:
- también usa `-vn` (audio-only)
- escribe un output temporal y lo carga en el reproductor de audio
- si se aborta por validación (p.ej. falta File B), la app pausa el reproductor para evitar confusión

## Servidor local

- [server.mjs](../server.mjs)
  - Sirve estáticos del proyecto
  - Expone `node_modules` para el importmap
  - Añade headers:
    - `Cross-Origin-Opener-Policy: same-origin`
    - `Cross-Origin-Embedder-Policy: require-corp`
    - `Cross-Origin-Resource-Policy: same-origin`
  - Autoabre el navegador (desactivable con `NO_OPEN=1`)

## Testing

- Unit: [tests/unit](../tests/unit)
  - Vitest, enfocado en [src/js/editorCore.js](../src/js/editorCore.js)

- E2E: [tests/e2e](../tests/e2e)
  - Playwright
  - Usa `?mockFFmpeg=1` para evitar dependencia real de WASM en CI/local lento

## Validaciones (resumen)

Antes de ejecutar FFmpeg (Preview/Export), la app valida:
- Existe File A.
- El rango de recorte produce un clip con duración > ~0.
- `Fade In + Fade Out` no supera la duración del clip.
- Si `Crossfade` > 0:
  - existe File B
  - se puede obtener duración de B
  - `Crossfade` no excede la duración del clip A ni la duración de B

## Decisiones / limitaciones

- `ffmpeg.wasm` es pesado: el primer load puede tardar.
- `core-mt` requiere `SharedArrayBuffer` → por eso COOP/COEP.
- La UI no busca “edición sample-perfect”; es una herramienta práctica de recorte/efectos.
