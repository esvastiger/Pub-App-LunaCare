# Changelog

Todos los cambios relevantes de este proyecto se documentan aquí.

El formato sigue [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y el proyecto usa
[Versionado Semántico](https://semver.org/lang/es/).

## [Sin publicar]

### Añadido

- **Inicio de sesión con Google (opcional)**: el backend verifica el ID token firmado por Google
  (`auth.google`) y la app pide un PIN para cifrar la bóveda. Google identifica la cuenta, nunca
  descifra los datos.
- **Vinculación de Google a una cuenta de correo** desde Ajustes (`link.google`), sin re-cifrar la
  bóveda: la contraseña sigue siendo la llave.
- **Guía de cuentas** en [docs/cuentas.md](docs/cuentas.md): alta anónima, alta con correo, entrada,
  cascada de desbloqueo y configuración de Google paso a paso.
- Migración idempotente del esquema: `users.google_sub` y `mode = 'google'` en bases existentes.
- **Transparencia de ubicación**: Ajustes → «Dónde están tus datos» y el indicador de cabecera
  (`Local + servidor` / `Solo local`) explican si la bóveda está solo en el dispositivo, si hay una
  copia cifrada en el servidor (con su host y hora del último envío) y que Google solo aporta la
  identidad, nunca los datos.

### Cambiado

- `StorageService`/`SyncAuth` distinguen el origen del token (`anon`, `email`, `google`). El
  desbloqueo y el índice local entienden el modo Google.
- **Licencia**: de MIT a **GNU GPL v2 o posterior** (`GPL-2.0-or-later`), que permite usar el
  proyecto bajo la versión 2 o la 3 de la GPL.

## [0.1.0] — 2026-10-18

Primera versión publicada. Aplicación completa y usable sin backend.

### Añadido

- **Modo privado** con código de referencia `LUNA-XXXX-XXXX` + PIN, sin correo ni registro.
- **Cuentas con correo** (registro, login y vinculación desde una cuenta anónima).
- **Cifrado de la bóveda** con AES-256-GCM y derivación de clave PBKDF2-SHA256 (210 000
  iteraciones, salt por cuenta).
- **Registro diario de 19 campos**: flujo, dolor, síntomas, ánimo, ánimo 0–10, libido, sueño, estrés,
  temperatura basal, moco cervical, cérvix (altura, apertura, firmeza), sensibilidad mamaria,
  digestión, piel, alcohol, medicación, texto libre y nota personal.
- **Calendario** con navegación por meses, sangrado registrado, ventana fértil, ovulación y
  predicción de la próxima regla.
- **Estadísticas**: medias y variabilidad del ciclo, sangrado medio, historial, síntomas frecuentes y
  evolución mensual de ánimo · libido · sueño en SVG.
- **Asistente Luna**: respuestas calculadas en el dispositivo, sin peticiones de red, con derivación
  a un profesional ante señales de alarma.
- **PWA instalable**: manifest, iconos 192/512 y maskable, precache del shell, aviso de nueva versión
  y banner de conexión perdida.
- **Sincronización cifrada** entre dispositivos con resolución de conflictos por `updatedAt` y
  re-login silencioso al caducar el token.
- **API PHP 8 + MySQL** sin dependencias: `register.*`, `login.*`, `link.email`, `vault.get`,
  `vault.put`, `ping`; esquema autocreado.
- **Anti fuerza bruta en dos capas**: backoff progresivo local (15 s → 15 min) y rate limiting en
  servidor (5/min y 20/h por cuenta, 30/min por IP, HTTP 429 + `retryAfter`).
- **Ajustes**: exportar copia JSON, borrar todos los datos, vincular correo, activar sincronización,
  mostrar/copiar/descargar el código de referencia.
- **Aviso médico** visible en el panel y en el asistente.
- **Documentación**: arquitectura, privacidad y modelo de amenazas, revisión de seguridad, guía de
  capturas, contribución y política de seguridad.

### Seguridad

- La clave AES **ya no se persiste**: `deriveKey()` la crea con `extractable: false` y se elimina
  `keyB64` del almacenamiento (migración automática al arrancar, purgando el valor heredado).
- Nueva pantalla `/desbloquear`: al reabrir la app se pide el PIN y se re-deriva la clave.
- `unlock()` distingue «PIN incorrecto» de «dispositivo sin copia», para que un fallo de descifrado no
  se interprete como cuenta nueva.
- `initVault()` ya no sobrescribe una bóveda existente.
- La API deja de enviar `Access-Control-Allow-Origin: *` de forma fija: el origen es configurable y
  añade `Vary: Origin`, `X-Content-Type-Options` y `Referrer-Policy`.
- Las credenciales del backend salen del código versionado: `config.local.php` (ignorado por git) y
  variables de entorno con `config.example.php` como plantilla.

### Corregido

- La gráfica de bienestar se centraba con márgenes muertos en pantallas anchas (`h-44` + `w-full`
  sobre un SVG con `viewBox`); ahora conserva su proporción y ocupa el ancho disponible.

### Conocido

- Sin suite de tests todavía: el CI valida build, tipos y formato; la prueba de humo es el recorrido
  E2E de `npm run screenshots`.
- Sin Content-Security-Policy servida por cabeceras y con la tipografía de Google Fonts como
  dependencia externa (ver hoja de ruta).

[0.1.0]: https://github.com/esvastiger/Pub-App-LunaCare/releases/tag/v0.1.0
