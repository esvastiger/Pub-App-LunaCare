# Capturas y tarjeta social

Las imágenes de `docs/screenshots/` y `docs/social-preview.png` se generan desde la app real, no se
retocan a mano. Si cambias la interfaz, regenéralas antes de abrir el PR.

## Requisitos

1. **Dev server en marcha** en `http://127.0.0.1:4200`:

   ```bash
   npm run dev
   ```

2. **Puppeteer** (no es dependencia del proyecto: pesa ~300 MB y solo hace falta para esto):

   ```bash
   npm install --no-save puppeteer
   npm approve-scripts puppeteer   # descarga su Chromium
   ```

## Uso

```bash
npm run screenshots    # docs/screenshots/*.png
npm run social-card    # docs/social-preview.png (1280×640)
```

## Qué hace `tools/screenshots.mjs`

1. Abre un Chromium con perfil temporal, locale `es-ES` y viewport 1280×800 (×2 de densidad).
2. Siembra una cuenta demo **sin tocar el backend**: deriva la misma clave que la app
   (PBKDF2 210 000 iteraciones), cifra ~90 días de registros con un patrón cíclico realista y escribe
   la bóveda, el índice y las credenciales en `localStorage`.
3. Recorre el flujo real: bienvenida → desbloqueo con PIN → panel → móvil → registro del día →
   digestión con texto libre → estadísticas → asistente → ajustes → aviso médico.
4. Antes de cada disparo **comprueba el estado** de la pantalla. Si algo no está donde debería
   (modal cerrado, chat sin respuestas, desbordamiento horizontal en móvil), el script falla con un
   mensaje en vez de generar una imagen vacía.

Salida:

| Archivo                   | Pantalla                                             |
| ------------------------- | ---------------------------------------------------- |
| `01-welcome.png`          | Bienvenida: modo privado, código o correo            |
| `02-unlock.png`           | Desbloqueo con PIN (la clave no se persiste)         |
| `03-dashboard.png`        | Panel con calendario, resumen de hoy y próxima regla |
| `04-dashboard-mobile.png` | El mismo panel a 390 × 844                           |
| `05-daily-log.png`        | Registro del día (bottom-sheet)                      |
| `06-digestion-otros.png`  | Digestión con la opción «Otros» y texto libre        |
| `07-statistics.png`       | Medias, ciclos y evolución del bienestar             |
| `08-assistant.png`        | Asistente Luna respondiendo sin red                  |
| `09-settings.png`         | Cuenta, privacidad, exportar y borrar                |
| `10-aviso-medico.png`     | Aviso médico y límites de uso                        |

## Añadir una captura

1. Añade el paso en `tools/screenshots.mjs` con su `await sleep(...)` y un `assert(...)` que valide lo
   que debe verse.
2. Usa el siguiente número en el nombre para mantener el orden.
3. Añádela al `README.md` y a la tabla de arriba.

## Notas

- Los datos son de demostración: `LUNA`/`DEMO-2026-XXXX`, PIN `4821`.
- El script no firma en ningún servidor ni envía datos a la red: la sincronización queda desactivada.
- El fondo de las capturas incluye el toast de sincronización desactivado a propósito: es el estado
  real sin backend.
