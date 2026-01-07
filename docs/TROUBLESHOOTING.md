# Troubleshooting

## La app no carga o FFmpeg falla al iniciar

- Usa `npm run dev` (no abras `index.html` con doble click).
- Verifica que estás en `http://localhost:5173`.

Motivo:
- `ffmpeg.wasm` (sobre todo multihilo) puede requerir `SharedArrayBuffer`, y eso requiere `COOP/COEP`.

## No se abre el navegador automáticamente

- En macOS/Linux/Windows modernos debería abrirse.
- Puedes abrir manualmente `http://localhost:5173`.

Desactivar auto-open:

```bash
NO_OPEN=1 npm run dev
```

## Crossfade no funciona

- Asegúrate de que `Crossfade` > 0.
- Selecciona “Browse File B”.

Si falta archivo B, la app debe bloquear el export con un aviso.

## Al pulsar Preview sale un aviso y “sigue sonando algo”

Caso típico:
- Tienes `Crossfade` > 0 pero no has elegido “File B”.

Comportamiento esperado:
- La app **aborta** Preview y muestra un mensaje.
- Además **pausa** el reproductor para evitar que se siga reproduciendo el audio/vídeo anterior.

Qué hacer:
- Selecciona “Browse File B (for Crossfade)” o vuelve `Crossfade` a `0`.

## El archivo exportado “MP4/M4A/M4R” no tiene vídeo

Es correcto: el export es **siempre audio-only**. Para MP4/M4A/M4R se usa contenedor MP4 con AAC.

## La barra de los sliders (Fade/Crossfade) no se pinta como “mitad color / mitad claro”

La UI pinta un “progreso” en el track (parte izquierda coloreada). Si tu navegador no lo refleja:
- Prueba con Chrome/Chromium actualizado.
- En Safari, algunos estilos de `input[type=range]` pueden comportarse diferente; si lo ves raro, abre un issue con versión de macOS/Safari.

## Los tests E2E no descargan un archivo real

Los tests usan `?mockFFmpeg=1` para simular export y hacerlos estables y rápidos.

Para probar el flujo real:
- arranca la app
- carga un archivo real
- exporta sin `?mockFFmpeg=1`

## Error de memoria / tab se cuelga

- Archivos muy grandes pueden exigir mucha RAM.
- Prueba con un recorte más corto.
- Reinicia el navegador y vuelve a intentar.
