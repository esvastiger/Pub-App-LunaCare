# Revisión de seguridad y preparación para producción

Fecha: 2026-10-18 · Alcance: SPA Angular 22 + backend PHP/MySQL (`backend/api`).

## Lo que ya está bien

| Área                    | Estado                                                                  |
| ----------------------- | ----------------------------------------------------------------------- |
| Cifrado de la bóveda    | AES-256-GCM en el dispositivo; el servidor solo guarda texto cifrado    |
| Derivación de clave     | PBKDF2-SHA256, 210.000 iteraciones                                      |
| Contraseñas en servidor | `password_hash` / `password_verify` (bcrypt)                            |
| Consultas SQL           | 100 % sentencias preparadas con parámetros vinculados                   |
| Tokens de sesión        | Guardados como `sha256(token)`; nunca en claro en la BD                 |
| Fuerza bruta            | `rate_limit()` con ventana deslizante + `Retry-After`                   |
| Enumeración de cuentas  | Registro de email duplicado y login fallido devuelven errores genéricos |
| CSRF                    | No aplica: no se usan cookies de sesión, el token va en el cuerpo       |

## Otros riesgos que deben resolverse antes de abrir al público

### 1. Clave AES exportada en `localStorage` — ✅ RESUELTO

Antes, `StorageService.saveCreds()` persistía `keyB64`, la clave maestra
exportada, para "mantener la sesión". Cualquier XSS, extensión maliciosa o
acceso al perfil del navegador obtenía la clave y descifraba **todo** el
historial.

Qué se hizo:

- `CryptoService.deriveKey()` crea la clave con **`extractable: false`**: no puede
  exportarse ni serializarse, así que es imposible escribirla en el navegador.
- Se eliminaron `exportKeyB64` / `importKeyB64` y el campo `keyB64` de
  `StoredCreds`. Solo se persiste `{ session, syncAuth, v: 2 }`.
- Nueva pantalla `/desbloquear` (`features/unlock`): al abrir la app se pide el
  PIN o la contraseña y se **re-deriva** la clave con PBKDF2.
- `AuthService.unlock()` verifica en cascada: descifra la copia local → si no
  hay, la remota → si tampoco, valida el verificador contra el servidor. Sin
  conexión y sin datos no hay nada que validar, y se acepta.
- Distingue **PIN incorrecto** de **dispositivo sin copia**: si había una copia
  local y no descifra, se rechaza. Sin esa rama, un PIN erróneo se trataba como
  "dispositivo nuevo" y podía crear una bóveda vacía.
- `CycleService.initVault()` ya no sobrescribe una bóveda existente
  (`hasLocalCopy()`), para que un fallo de descifrado no destruya datos.
- Migración automática: al arrancar se reescriben las credenciales y se
  **purga** cualquier `keyB64` heredado.

Pendiente opcional: si se quiere evitar teclear el PIN en cada recarga, usar
WebAuthn/PRF o una clave empaquetada con la contraseña del dispositivo — nunca
la clave en claro.

**Coste de UX:** ahora hay que introducir el PIN en cada recarga. Es el precio
de que un XSS no pueda leer el historial.

### 2. Sin Content-Security-Policy — ALTO

`src/index.html` no define CSP. Sin ella, un XSS tiene vía libre para leer el
almacenamiento (ver punto 1) y exfiltrar datos.

Recomendación: cabecera en el servidor (Apache/PHP), no `<meta>`, para no
romper el HMR de desarrollo:

```
Content-Security-Policy: default-src 'self'; script-src 'self' https://accounts.google.com; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self' https://TU-API https://accounts.google.com https://www.googleapis.com; frame-src https://accounts.google.com; frame-ancestors 'none'; base-uri 'none'; form-action 'self'
```

La excepción de `accounts.google.com` / `www.googleapis.com` solo hace falta si activas el inicio
con Google; si no lo usas, deja el CSP sin esos orígenes y el botón avisará de que no está
configurado. El script de GIS se carga bajo demanda (nunca al abrir la app).

Añadir también `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`
y `Strict-Transport-Security` cuando haya HTTPS.

### 3. `Access-Control-Allow-Origin: *` en la API — ✅ MITIGADO (configurable)

El comodín ya no está codificado: `index.php` lee `cors_origin` de
`config.php` → `config.local.php` → `LUNACARE_CORS_ORIGIN`, y responde con
`Vary: Origin`. Sigue siendo `*` por defecto para no romper el desarrollo, así
que **en producción hay que fijar el dominio** (ver `SECURITY.md`).

Pendiente opcional: comparar `Origin` con una lista y rechazar peticiones que
mutan datos desde orígenes desconocidos (hoy el token Bearer ya limita el daño:
no hay cookies de sesión, así que un sitio tercero no puede actuar como la
usuaria sin conocer el token).

### 4. API por HTTP en claro por defecto — MEDIO

`StorageService.apiBase()` cae a `http://localhost/lunacare-api`. En producción
debe ser HTTPS obligatorio y la app rechazar `http://` cuando no sea loopback.

### 5. Google Sign-In — superficie opcional

El flujo usa un ID token firmado por Google y lo verifica el backend con las JWKS públicas
(`backend/api/google.php`): no hay `client_secret`, ni intercambio de códigos, ni cookies de
terceros. El token se valida y se descarta; el servidor emite su propio token de 30 días.

Riesgos asumidos y mitigaciones:

- **Dependencia externa**: si Google no responde, el inicio con Google falla con un mensaje claro;
  correo y modo privado siguen funcionando.
- **Privacidad**: el script de Google solo se descarga al pulsar el botón (ver `docs/cuentas.md`).
- **Identidad ≠ llave**: aunque alguien controle la cuenta de Google, no puede descifrar la bóveda
  sin el PIN; y aunque tenga el PIN, sin Google no obtiene el token. Son dos factores separados.
- **Sincronización**: el token de Google caduca a los 30 días y `SyncService.relogin()` no intenta
  renovarlo en silencio (no hay secreto guardado); la usuaria vuelve a entrar con Google sin perder
  los datos locales.

### 6. Google Fonts como dependencia externa — MEDIO (privacidad, pendiente)

`index.html` carga Quicksand desde `fonts.googleapis.com`: cada visita filtra
IP y User-Agent a un tercero, en una app de salud reproductiva. Autoalojar la
tipografía en `src/assets/fonts` y eliminar `preconnect`. Está declarado como
deuda conocida en `docs/privacidad.md` y en la hoja de ruta del README.

## Mejoras de producto pendientes para "estar operativa"

- **Política de privacidad y términos** enlazados desde Ajustes (obligatorio en
  UE/UK y en las tiendas de apps).
- **Exportación/borrado de datos** ya existe (`exportJson`, `wipeAll`); falta
  documentarlo en la política y ofrecer borrado programado.
- **Aviso médico** ya visible en el panel y en el asistente (modal + banner).
- **Accesibilidad**: sliders y botones segmentados ya exponen `aria-pressed` y
  `aria-label`; falta revisar contraste del texto `plum-300` sobre crema.
- **Copias de seguridad**: la bóveda local no tiene versionado; un fallo de
  escritura puede dejar el último día sin guardar.
