# Cuentas, inicio de sesión y Google

Este documento explica **cómo se crea una cuenta**, **cómo se entra** y **qué añade (y qué no)
el inicio de sesión con Google**. La idea que ordena todo: _la identidad la confirma el servidor,
pero la llave que descifra tus datos solo existe en tu dispositivo_.

---

## 1. Tres modos, un mismo cifrado

| Modo    | Identidad                                  | Llave de la bóveda                     | Salt PBKDF2                     |
| ------- | ------------------------------------------ | -------------------------------------- | ------------------------------- |
| Anónimo | Código `LUNA-XXXX-XXXX`                    | PBKDF2 del **PIN**                     | El propio código (normalizado)  |
| Correo  | Email + contraseña                         | PBKDF2 de la **contraseña**            | Aleatorio, guardado en servidor |
| Google  | Cuenta de Google verificada por el backend | PBKDF2 de un **PIN** elegido en la app | Aleatorio, guardado en servidor |

En los tres casos:

- La clave AES-256-GCM se deriva con **PBKDF2-SHA256 (210 000 iteraciones)** y se crea con
  `extractable: false`: no se puede exportar ni guardar (`crypto.service.ts`).
- El servidor **nunca** recibe el PIN ni la contraseña: recibe como mucho un
  `sha256("lunacare:pin|pwd:<secreto>")` que se guarda con `password_hash()` (bcrypt).
- La bóveda (`settings` + `logs` del ciclo) se cifra entera antes de salir del dispositivo. El
  servidor solo almacena `data_enc` (texto ilegible), `updated_at` y metadatos de cuenta.

> Google no cambia la criptografía: solo sustituye la forma de demostrar identidad ante el servidor.

---

## 2. Alta en modo privado (anónimo)

Código: `AuthService.createAnonymous()` → `establishSession()`.

1. Se genera un código con `crypto.randomRefCode()`: alfabeto sin caracteres ambiguos
   (`23456789ABCDEFGHJKMNPQRSTUVWXYZ`), formato `LUNA-XXXX-XXXX`.
2. Se calculan dos hashes SHA-256 (el secreto no se envía):
   - `identifier = sha256("lunacare:ref:" + código normalizado)` → se envía como `refCodeHash`.
   - `verifier = sha256("lunacare:pin:" + PIN)` → se envía como `pinVerifier`.
3. La clave de la bóveda se deriva con el **PIN** y el **código normalizado** como salt.
4. `POST register.anon`: el servidor guarda `ref_code_hash`, `bcrypt(verifier)` en `pin_hash`,
   `mode = 'anon'` y emite un token de sesión (32 bytes aleatorios; en la base solo se guarda su
   SHA-256, con caducidad de 30 días). Si el hash ya existe → `REF_TAKEN`.
5. Se crea una bóveda vacía, se cifra con AES-GCM y se guarda en `localStorage`; después se sube
   (`vault.put`) si la sincronización está activa.
6. En el índice local (`lunacare.index`) queda una entrada `{lookup: refHash, userId, mode:'anonymous',
salt:''}` — datos sin valor si alguien los lee.
7. La pantalla muestra el código una sola vez y exige marcar «Ya lo guardé» antes de continuar.
   **Código + PIN son el único método de recuperación** si no se vincula un correo.

## 3. Alta con correo y contraseña

Código: `AuthService.registerEmail()`.

1. Se genera un **salt aleatorio de 16 bytes** (`crypto.randomSalt()`), distinto por cuenta.
2. `verifier = sha256("lunacare:pwd:" + contraseña)`; la clave de la bóveda se deriva de la
   contraseña con ese salt.
3. `POST register.email` → el servidor comprueba el formato del correo y del salt, rechaza correos
   repetidos (`EMAIL_TAKEN`, 409) y guarda `email`, `bcrypt(verifier)`, `salt` y `mode = 'email'`.
4. Si el registro falla por correo repetido, hay **rollback local** (`clearCreds`, `detach`): no queda
   ninguna cuenta fantasma en el dispositivo.
5. Índice local: `{lookup: sha256("lunacare:lookup:" + email), userId, mode:'email', salt}`.
   El `lookup` es un hash, así que el índice no revela el correo.

## 4. Entrar con correo y contraseña

Código: `AuthService.loginEmail()`.

1. `verifier = sha256("lunacare:pwd:" + contraseña)` y `POST login.email`.
2. Si el servidor responde `ok`: devuelve `userId`, `salt` (necesario para derivar la clave) y token.
   - Se deriva la clave con la contraseña y el salt.
   - Se descifra la copia local; se concilia con la remota (`cycle.reconcileWithServer()`): si la
     remota es más nueva se adopta, si no se sube la local.
   - Se guardan sesión y `syncAuth` en `lunacare.creds` (`sessionStorage` por defecto; `localStorage`
     si «Recordar mi cuenta» está activo). **La clave AES nunca se guarda.**
3. Si el servidor responde `INVALID_CREDENTIALS` o está caído, se intenta **recuperación local**
   (`localEmailLogin()`): buscar el `lookup` en el índice, derivar la clave con el salt local y
   descifrar la bóveda. Si funciona, la cuenta se vuelve a registrar en el servidor cuando esté
   disponible. Un descifrado correcto es la prueba criptográfica de que la contraseña es correcta.
4. Al recargar la app (`AuthService.init()`), se restaura solo la identidad y `locked = true`. La
   pantalla `/desbloquear` pide de nuevo la contraseña y deriva la clave. Un XSS que lea el
   almacenamiento no encuentra nada descifrable.
5. **Fuerza bruta**: el servidor limita `login.*` a 5 intentos/minuto y 20/hora por cuenta y
   30/minuto por IP (HTTP 429 con `retryAfter`); el cliente añade un bloqueo progresivo persistente
   (`LoginGate`: 15 s → 30 s → 1 min → 2 min → 5 min → 15 min).

### Cascada de desbloqueo

`unlock(secret)` prueba, en orden: descifrar la copia local → descifrar la remota → validar el
verificador contra el servidor → aceptar si no hay ningún dato que proteger. La rama «había copia
local y no se pudo descifrar» **no** se trata como dispositivo nuevo: así un PIN/contraseña erróneo
nunca sobrescribe la bóveda con una vacía.

---

## 5. Inicio de sesión con Google

### Qué hace y qué no

- **Hace**: Google firma un _ID token_ que demuestra que controlas esa cuenta de correo. El backend
  lo verifica y emite su propio token de sincronización de LunaCare.
- **No hace**: no conoce el PIN, no puede descifrar la bóveda y **no sustituye al secreto local**.
  En una cuenta de Google se pide un PIN; en una cuenta de correo vinculada, su contraseña.
- Es **opcional**: si no hay Client ID configurado, el botón avisa y todo lo demás funciona igual.
- Es **bajo demanda**: el script `https://accounts.google.com/gsi/client` no se carga al abrir la
  app, solo al pulsar «Continuar con Google». Entonces GIS pinta su **botón oficial**, que abre el
  selector de cuentas o, si el navegador no tiene sesión, el inicio de sesión de Google
  (`google-auth.service.ts`). One Tap no se usa: sin sesión previa no muestra nada.

### Flujo A · Cuenta nueva con Google

1. La usuaria pulsa **Continuar con Google** y luego el **botón oficial** que aparece → Google
   devuelve un ID token (`credential`).
2. `POST auth.google` (`index.php`) verifica el token y:
   - si ya existe `google_sub`, devuelve esa cuenta (`newAccount: false`);
   - si el correo ya tiene cuenta con contraseña, responde `EMAIL_EXISTS` (no se vincula sola);
   - si no existe, crea `users` con `mode = 'google'`, `email`, `google_sub` y un **salt aleatorio**,
     y devuelve `{userId, token, salt, newAccount: true, hasVault: false}`.
3. La app guarda el salt en el índice local y pide **elegir un PIN** (4–8 dígitos).
4. Con ese PIN y el salt del servidor se deriva la clave, se crea la bóveda vacía y se sube cifrada.
5. La sesión queda guardada (sin la clave); al recargar se pide el PIN como en cualquier cuenta.

### Flujo B · Volver a entrar con Google

1. GIS devuelve el ID token; `auth.google` reconoce `google_sub` y devuelve `salt` y `hasVault`.
2. La app pregunta el **PIN** y deriva la clave.
3. Si hay copia local, descifra; si es un dispositivo nuevo, descarga la bóveda remota y la descifra
   (`AuthService.unlock()` reutiliza exactamente la cascada del modo correo).
4. Un PIN incorrecto falla en el descifrado (AES-GCM autentica): no hay forma de saltárselo.

### Flujo C · Vincular Google a una cuenta de correo

1. Entrar con email + contraseña (la clave sigue derivándose de la contraseña).
2. **Ajustes → Vincular con Google** → `link.google` con el token de sesión.
3. El servidor exige `mode = 'email'`, que el correo de Google coincida con el de la cuenta y que esa
   identidad de Google no esté vinculada a otra cuenta. Guarda `google_sub`; no toca la bóveda.
4. A partir de ahí, **Continuar con Google** identifica la cuenta, pero se pedirá la contraseña para
   descifrar. Google ahorra teclear el correo, no la llave.

### Flujo D · Cuenta anónima

No se ofrece vincular Google: en modo anónimo el salt de PBKDF2 es el código de referencia, que es
secreto y no está en el servidor. Primero hay que **vincular un correo** (Ajustes → «Vincular correo
definitivo»); después aparece la opción de Google.

### Verificación en el servidor

`backend/api/google.php` valida, sin dependencias ni `client_secret`:

| Comprobación | Detalle                                                             |
| ------------ | ------------------------------------------------------------------- |
| Firma        | RS256 con la clave pública (`kid`) de las JWKS de Google            |
| JWKS         | `https://www.googleapis.com/oauth2/v3/certs`, caché en disco 1 hora |
| Emisor       | `accounts.google.com` o `https://accounts.google.com`               |
| Audiencia    | `aud` debe ser tu Client ID (`azp` si hay varias)                   |
| Caducidad    | `exp` > ahora − 60 s; `iat` no puede venir del futuro               |
| Correo       | presente y `email_verified = true`                                  |
| Identidad    | `sub` no vacío (se guarda en `users.google_sub`, único)             |
| Abuso        | máximo 30 intentos/minuto por IP (`rate_limit_ip`)                  |

La conversión de la JWK (`n`, `e`) a PEM se hace construyendo el DER/SPKI a mano, para no requerir
extensiones ni Composer.

### Configuración paso a paso

1. **Google Cloud Console** → crea o elige un proyecto.
2. **APIs y servicios → Pantalla de consentimiento OAuth**: tipo _External_, añade los scopes
   `openid`, `email` y `profile` (no se piden permisos sensibles), y tu correo como usuario de
   prueba mientras la app esté en modo _Testing_.
3. **Credenciales → Crear credenciales → ID de cliente de OAuth → Aplicación web**.
   - **Orígenes JavaScript autorizados**: `http://localhost:4200` y tu dominio real
     (`https://tu-dominio.example`).
   - **URIs de redirección**: no hacen falta (el flujo usa ID token, no redirección).
4. Copia el **Client ID** (termina en `.apps.googleusercontent.com`) en **dos** sitios:
   - Frontend: `<meta name="google-client-id" content="…">` en `src/index.html` (y `npm run build`).
   - Backend: `LUNACARE_GOOGLE_CLIENT_ID` o `google.client_id` en
     `backend/api/config.local.php` (ver `config.example.php`). **No hay client secret.**
5. Si sirves la app con CSP, permite Google en las directivas indicadas en
   [revision-seguridad.md](revision-seguridad.md).
6. Prueba: `Continuar con Google` en `/inicio` → botón oficial de Google → elige tu cuenta. Si GIS
   no pinta el botón o Google rechaza el diálogo, revisa que el origen exacto (esquema, host y
   **puerto**) esté autorizado en el paso 3.

### Comprobaciones rápidas

```bash
# El backend está configurado (debe responder GOOGLE_NOT_CONFIGURED si falta el Client ID)
curl -s -X POST 'http://127.0.0.1:8090/index.php?action=auth.google' \
  -H 'Content-Type: application/json' -d '{"credential":"x"}'

# Token falso → 401 GOOGLE_TOKEN_INVALID (la firma no valida)
```

En el navegador: crear cuenta con Google → elegir PIN → recargar (pide PIN) → cerrar sesión → volver
a entrar con Google → vincular Google a una cuenta de correo y comprobar que sigue pidiendo la
contraseña.

### Límites conocidos

- Requiere el backend desplegado y conexión a internet; sin backend la app sigue funcionando en local.
- El primer clic solo carga GIS y muestra el botón oficial; el diálogo de Google se abre al pulsar
  ese botón (así funciona también sin sesión de Google iniciada). Si un bloqueador impide el
  diálogo, la alternativa con correo/PIN sigue disponible.
- La sesión de Google caduca (token de 30 días) y **no hay renovación silenciosa**: al caducar, la
  sincronización muestra error y hay que volver a entrar con Google y el PIN. Los datos locales no se
  pierden.
- Si se pierde el PIN de una cuenta de Google, no hay recuperación: Google demuestra la identidad,
  no conserva la llave.
- Cambiar de correo en Google no actualiza la cuenta de LunaCare: `google_sub` es estable, pero el
  correo mostrado es el del momento del alta.

---

## 6. Qué se guarda y dónde

**En el dispositivo** (`localStorage` / `sessionStorage`):

| Clave                    | Contenido                                                     |
| ------------------------ | ------------------------------------------------------------- |
| `lunacare.creds`         | `{session, syncAuth, v:2}` — identidad y token, **sin clave** |
| `lunacare.index`         | `{lookup, userId, mode, salt}` por cuenta (todo hashes/salt)  |
| `lunacare.vault.<id>`    | Bóveda cifrada (AES-256-GCM) + `.ts` con la marca de tiempo   |
| `lunacare.prefs`         | Recordar sesión y sincronización                              |
| `lunacare.lock.<acción>` | Estado del bloqueo anti fuerza bruta                          |

**En el servidor** (`backend/schema.sql`):

| Tabla            | Contenido                                                           |
| ---------------- | ------------------------------------------------------------------- |
| `users`          | `mode`, `email`, `salt`, `bcrypt(verificador)`, `google_sub`        |
| `vaults`         | `data_enc` (cifrado), `updated_at`                                  |
| `tokens`         | `sha256(token)`, caducidad                                          |
| `login_attempts` | hashes del identificador y de la IP, timestamps (anti fuerza bruta) |

---

## 7. Dónde está cada pieza

| Pieza                                | Archivo                                    |
| ------------------------------------ | ------------------------------------------ |
| Derivación de claves y AES-GCM       | `src/app/core/crypto.service.ts`           |
| Alta, acceso, Google, desbloqueo     | `src/app/core/auth.service.ts`             |
| Google Identity Services             | `src/app/core/google-auth.service.ts`      |
| Sesión, índice y preferencias        | `src/app/core/storage.service.ts`          |
| Cliente de la API                    | `src/app/core/api.service.ts`              |
| Verificación de ID tokens            | `backend/api/google.php`                   |
| Acciones `auth.google`/`link.google` | `backend/api/index.php`                    |
| Tablas y migración                   | `backend/schema.sql`, `backend/api/db.php` |
