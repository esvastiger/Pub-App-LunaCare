# LunaCare · Backend (PHP + MySQL)

API mínima y sin dependencias para sincronizar la **bóveda cifrada** de cada cuenta.

## Despliegue en USBWebServer

1. Copia la carpeta `api/` a tu docroot:

   ```
   E:\usbwebserver\root\lunacare-api\
   ```

2. Configura las credenciales. `config.php` se versiona y no lleva secretos: lee variables de
   entorno y, si existe, `config.local.php` (ignorado por git).

   ```bash
   cp api/config.example.php api/config.local.php
   # edita host, usuario y contraseña de tu MySQL
   ```

   O bien, sin crear archivos:

   ```bash
   set LUNACARE_DB_USER=lunacare
   set LUNACARE_DB_PASS=…
   set LUNACARE_CORS_ORIGIN=https://tu-dominio.example
   set LUNACARE_GOOGLE_CLIENT_ID=1234567890-abcdef.apps.googleusercontent.com
   ```

3. Comprueba: `http://localhost/lunacare-api/index.php?action=ping`

   La primera petición crea la base `lunacare` y las tablas `users`, `vaults`, `tokens`
   (con USBWebServer: usuario `root`, contraseña `usbw`, puerto 3306).

   También puedes importar `schema.sql` manualmente desde phpMyAdmin.

4. Alternativa sin Apache: ejecuta `start-api.bat` (servidor PHP en el puerto 8090)
   y ajusta la URL del servidor en los Ajustes de la app.

## Endpoints (POST JSON, salvo ping)

| Acción           | Cuerpo                                 | Respuesta                                                      |
| ---------------- | -------------------------------------- | -------------------------------------------------------------- |
| `ping`           | —                                      | `{ok, app, time}`                                              |
| `register.anon`  | `{refCodeHash, pinVerifier}`           | `{ok, userId, token}`                                          |
| `login.anon`     | `{refCodeHash, pinVerifier}`           | `{ok, userId, token}`                                          |
| `register.email` | `{email, passwordVerifier, salt}`      | `{ok, userId, salt, token}`                                    |
| `login.email`    | `{email, passwordVerifier}`            | `{ok, userId, salt, googleLinked, token}`                      |
| `link.email` 🔒  | `{email, passwordVerifier, salt}`      | `{ok, linked}`                                                 |
| `auth.google`    | `{credential}` (ID token de Google)    | `{ok, userId, email, mode, salt, newAccount, hasVault, token}` |
| `link.google` 🔒 | `{credential}` (ID token de Google)    | `{ok, linked}`                                                 |
| `vault.get` 🔒   | —                                      | `{ok, data_enc, updatedAt}`                                    |
| `vault.put` 🔒   | `{data_enc, updatedAt, baseUpdatedAt}` | `{ok, conflict, data_enc?, updatedAt?}`                        |

🔒 Requiere cabecera `Authorization: Bearer <token>`.

## Inicio de sesión con Google (opcional)

El backend **verifica el ID token** que firma Google (`google.php`): firma RS256 con las JWKS
públicas de Google (caché de 1 h), `iss`, `aud`, `exp`, `email_verified` y `sub`. No hay
`client_secret` ni intercambio de códigos: solo se valida un token que Google ya emitió.

1. Crea el Client ID en Google Cloud Console (tipo **Web application**) y autoriza los orígenes
   JavaScript `http://localhost:4200` y tu dominio. No necesitas URI de redirección.
2. Pega el Client ID en `LUNACARE_GOOGLE_CLIENT_ID` (o en `google.client_id` de
   `config.local.php`) y en el `<meta name="google-client-id">` de `src/index.html`.
3. Despliega el frontend y prueba «Continuar con Google» en `/inicio`.

Con `google.client_id` vacío la acción responde `GOOGLE_NOT_CONFIGURED` (503) y el resto de la API
funciona igual. La app pide además un **PIN** para cifrar la bóveda: Google identifica, no descifra.
Detalle completo en [../docs/cuentas.md](../docs/cuentas.md).

## Qué guarda (y qué no) el servidor

- **Sí**: `sha256(código de referencia)`, `bcrypt(sha256(PIN))`, `bcrypt(sha256(contraseña))`,
  salt PBKDF2, el `sub` de Google (`users.google_sub`), hash de tokens, y la **bóveda ya cifrada**
  (texto ilegible).
- **No**: el código de referencia en claro, el PIN, la contraseña, el ID token de Google (solo se
  valida y se descarta), ni ningún dato del ciclo/síntomas/notas en claro.

## Seguridad implementada

- PDO con _prepared statements_ en todas las consultas (sin inyección SQL).
- `password_hash`/`password_verify` (bcrypt) para los verificadores.
- Tokens de sesión aleatorios de 32 bytes, guardados solo como hash, caducidad 30 días.
- **Anti fuerza-bruta** (`login.anon` / `login.email`): máximo 5 intentos/minuto y 20/hora
  por cuenta, y 30/minuto por IP. Si se supera, la API responde **HTTP 429 + `retryAfter`
  (segundos restantes)** hasta que expire la ventana. En la tabla `login_attempts` solo se
  guarda el `sha256` del identificador y la IP también hasheada — nada identificable en claro.
  El frontend complementa esto con un bloqueo progresivo local (15 s → 30 s → 1 min → 2 min
  → 5 min → 15 min, persistido en `localStorage`), que además obedece al `retryAfter` del 429.
- CORS configurable (`cors_origin` en `config.php` / `config.local.php` / `LUNACARE_CORS_ORIGIN`),
  con `Vary: Origin`. El valor por defecto `*` es solo para desarrollo: **en producción pon tu
  dominio** y sirve siempre por HTTPS.
- Cabeceras `X-Content-Type-Options: nosniff` y `Referrer-Policy: no-referrer`.

## Qué NO hace este backend

- No sirve el frontend: publica `dist/LunaCare/browser` en tu servidor web (o en GitHub Pages) y
  apunta la app a la URL de la API desde Ajustes.
- No descifra, indexa ni analiza la bóveda: si pierdes el PIN, no hay recuperación posible.
