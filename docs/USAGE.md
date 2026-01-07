# Uso

## 1) Cargar archivo

- Arrastra y suelta un archivo en el área de subida, o usa “Browse File”.
- Formatos soportados: `mp3`, `mp4`, `m4a`, `m4r`, `ogg`, `flac`, `mov`.

La app intenta validar el archivo por extensión y/o firma (cuando es posible) para reducir fallos comunes.

Notas:
- Si el input es vídeo, se muestra un `<video>` para previsualización del original.
- El export y el preview final siempre son **audio-only** (el vídeo se descarta).

## 2) Recorte (Trimmer)

- Ajusta `Start Time` y `End Time`.
- El timeline permite mover los “handles” para definir el rango.

Reglas:
- `Start Time` nunca puede ser mayor que `End Time`.
- Si introduces tiempos manualmente, se normalizan al rango válido cuando se pueda.

Formato de tiempo:
- `mm:ss`

Consejo:
- Si el audio es muy largo, prueba con un recorte corto primero para acelerar el primer render/preview.

## 3) Ecualizador 10 bandas

Bandas:
- 31Hz
- 62Hz
- 125Hz
- 250Hz
- 500Hz
- 1kHz
- 2kHz
- 4kHz
- 8kHz
- 16kHz

Rango por banda:
- -12 dB a +12 dB

Presets:
- Flat
- Rock
- Jazz
- Classical
- Custom

Guardar preset:
- Ajusta sliders → pulsa “Save Preset” → el preset `Custom` se guarda en `localStorage`.

Notas:
- El EQ se aplica como una cadena de filtros `equalizer` en FFmpeg. Bandas cerca de `0 dB` se omiten para ahorrar coste.

## 4) Fade in / Fade out

- `Fade In`: de 0s a 10s
- `Fade Out`: de 0s a 10s

Los fades se aplican al audio resultante tras recorte + EQ.

Validación:
- Si `Fade In + Fade Out` es mayor que la duración del clip recortado, la app aborta la acción (Preview/Export) con un aviso.

## 5) Crossfade (opcional)

- `Crossfade`: de 0s a 10s

Comportamiento:
- Si `Crossfade` es 0, no se usa Archivo B.
- Si `Crossfade` > 0:
  - Debes seleccionar “Browse File B (for Crossfade)”.
  - La app mezcla A y B con `acrossfade` durante el tiempo indicado.

Validación:
- Si `Crossfade` > 0 y no hay Archivo B, la app **aborta Preview/Export**.
- `Crossfade` debe ser menor o igual que la duración del clip A recortado y menor o igual que la duración de B.

Nota: el export siempre es **audio-only**, aunque el input sea vídeo.

## 6) Export

- Selecciona formato: `MP3`, `MP4`, `M4A`, `M4R`
- Pulsa “Export File”

Detalles del export:
- Siempre audio-only (`-vn`).
- `MP3`: `libmp3lame` (CBR aprox. 192k) y 44.1kHz.
- `MP4/M4A/M4R`: contenedor MP4 + audio AAC (192k, 44.1kHz) con `-movflags +faststart`.

La descarga se dispara al final del proceso.

## 7) Preview (recomendado antes de exportar)

El botón **Preview** genera un archivo temporal aplicando el mismo pipeline que el export (recorte + EQ + fades y crossfade si aplica) y lo carga en el reproductor.

Detalles importantes:
- Preview usa el formato seleccionado en `Output Format` (MP3/MP4/M4A/M4R).
- Si Preview se aborta por validaciones (por ejemplo, `Crossfade` activado sin File B), la app muestra un aviso y **pausa el reproductor** para evitar confusión.
- Si el navegador bloquea autoplay, la app prepara el preview y el usuario puede darle play manualmente.
