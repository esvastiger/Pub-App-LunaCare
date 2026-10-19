# Privacidad y modelo de amenazas

Este documento describe qué datos existen, dónde viven, quién puede leerlos y qué **no** protege
LunaCare. Está escrito para ser revisado, no para vender nada.

## 1. Resumen en una frase

Tus registros se cifran en tu dispositivo con una clave derivada de tu PIN; esa clave no se guarda en
ningún sitio y el servidor solo recibe un bloque de bytes cifrado.

## 2. Qué se guarda y dónde

### En tu dispositivo (`localStorage`)

| Clave                        | Contenido                                                        | ¿Legible?                                       |
| ---------------------------- | ---------------------------------------------------------------- | ----------------------------------------------- |
| `lunacare.vault.<userId>`    | Bóveda completa (ajustes + registros + notas)                    | No: AES-256-GCM                                 |
| `lunacare.vault.<userId>.ts` | Marca temporal del último guardado                               | Sí (un número)                                  |
| `lunacare.creds`             | Identidad de la sesión y credenciales de sincronización          | No son datos de salud; **no** contiene la clave |
| `lunacare.index`             | Hashes SHA-256 de los identificadores usados en este dispositivo | Sí, pero son hashes                             |
| `lunacare.prefs`             | `syncEnabled`, `remember`                                        | Sí (preferencias)                               |
| `lunacare.lock.*`            | Intentos fallidos y fin del castigo                              | Sí (contadores)                                 |

> Antes de la versión 0.2 se guardaba `keyB64`, la clave exportada. Ya no existe: se migra al
> arrancar y se purga. Ver [revision-seguridad.md](revision-seguridad.md).

### En tu servidor (solo si activas la sincronización)

| Tabla            | Contenido                                                                                                                        |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `users`          | `sha256(código de referencia)`, `bcrypt(sha256(PIN))`, `bcrypt(sha256(contraseña))`, salt PBKDF2, `google_sub` si está vinculada |
| `vaults`         | Un único `LONGTEXT` con la bóveda cifrada + `updated_at`                                                                         |
| `tokens`         | `sha256(token)` de sesión y caducidad                                                                                            |
| `login_attempts` | `sha256(identificador)` + IP hasheada + instante                                                                                 |

Ni el correo se guarda en claro si usas el modo privado; en modo correo se guarda el email (necesario
para iniciar sesión) pero **no** se asocia a ningún dato de salud legible.

## 3. Qué no sale nunca del dispositivo

- Los registros, síntomas, notas y ajustes: solo salen cifrados.
- La clave AES, el PIN y la contraseña: solo se envían sus hashes, nunca el valor.
- El asistente Luna: responde con cálculos locales, sin ninguna petición de red.

## 4. Qué sí sale (y hay que saberlo)

| Destino                                      | Cuándo                                | Qué ve                                                                               |
| -------------------------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------ |
| Tu API (si la activas)                       | Al guardar y al entrar                | IP, fecha, tamaño del blob cifrado, token                                            |
| `fonts.googleapis.com` / `fonts.gstatic.com` | Al cargar la app                      | IP, User-Agent y la página solicitada                                                |
| `accounts.google.com` (Google Identity)      | Solo al pulsar «Continuar con Google» | IP, User-Agent y el origen de la app; Google devuelve un token firmado con tu correo |

La tipografía remota se mantiene por simplicidad de desarrollo y es una **deuda conocida**: lo
correcto es autoalojar Quicksand y eliminar `preconnect` de `index.html`. Está en la hoja de ruta.

El inicio con Google es **opcional y bajo demanda**: su script no se carga al abrir la app, así que
quien no lo usa no habla con Google en ningún momento. Si lo usas, Google conoce tu identidad y que
has iniciado sesión en LunaCare, pero **no** recibe tu ciclo, tus síntomas ni tu bóveda, y la app
no pide ningún permiso de Google más allá del correo (`openid`, `email`, `profile`). La llave de
cifrado se sigue derivando del PIN o la contraseña en el dispositivo. Detalle en
[cuentas.md](cuentas.md).

No hay analítica, ni píxeles, ni crash reporting, ni CDN de terceros, ni publicidad.

## 4.1 Dónde están tus datos en cada momento

La app lo muestra siempre en **Ajustes → «Dónde están tus datos»** y en el indicador de la cabecera
(`Local + servidor` o `Solo local`).

| Situación                                         | Dónde está la bóveda                                                     |
| ------------------------------------------------- | ------------------------------------------------------------------------ |
| Modo privado o cuenta sin sincronización          | Solo en este dispositivo, cifrada                                        |
| Sesión iniciada y sincronización activa           | En este dispositivo **y** una copia cifrada en tu servidor (`apiBase`)   |
| Sin conexión, servidor caído o sincronización off | Solo en este dispositivo; los cambios se envían al recuperar la conexión |
| Cuenta con Google (o correo vinculado a Google)   | Igual que arriba; Google **solo** recibe la identidad, nunca la bóveda   |

Matices importantes:

- Iniciar sesión con correo o Google **no sube datos por sí solo**: lo que sube es la sincronización,
  que se puede desactivar en Ajustes.
- La copia remota la aloja **tu** servidor PHP/MySQL, no Google ni un servicio de LunaCare. Google
  Identity solo interviene en el momento de demostrar la identidad.
- Si el servidor no responde, la app sigue funcionando y no pierde nada: la copia local es completa.

## 5. Modelo de amenazas

| Escenario                                         | ¿Protege?  | Cómo                                                                                                               |
| ------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------ |
| Alguien abre tu portátil y mira `localStorage`    | ✅         | Solo hay ciphertext; la clave no está                                                                              |
| Extensión maliciosa o XSS en la app               | ⚠️ Parcial | No puede descifrar el histórico, pero **sí** puede leer lo que ya está en pantalla mientras la bóveda está abierta |
| Robo del móvil con la app abierta                 | ❌         | Si la sesión está desbloqueada, los datos están en memoria                                                         |
| Servidor comprometido o copia de la base de datos | ✅         | Solo blobs cifrados; romper el cifrado exige el PIN                                                                |
| Operador del servidor curioso                     | ✅         | No puede leer ni siquiera cuántos síntomas registras                                                               |
| Interceptación de red (Wi-Fi público)             | ⚠️         | El payload va cifrado, pero sin HTTPS el PIN _hash_ y el token podrían reutilizarse: **usa HTTPS en producción**   |
| Fuerza bruta del PIN                              | ⚠️         | PBKDF2 210 000 iteraciones + backoff local + rate limiting del servidor; un PIN de 4 dígitos sigue siendo corto    |
| Alguien conoce tu código de referencia            | ⚠️         | Necesita además el PIN para descifrar; el servidor solo compara hashes                                             |
| Pérdida del PIN sin copia de seguridad            | ❌         | Los datos quedan irrecuperables por diseño                                                                         |

### Sobre el PIN de 4 dígitos

El PIN protege frente a un atacante oportunista con acceso al dispositivo, no frente a un adversario
con recursos que pueda probar 10 000 combinaciones sin límite. Se mitiga con PBKDF2 costoso, bloqueo
progresivo y rate limiting del servidor, pero **una contraseña larga es más fuerte**. La app acepta
contraseñas de 8+ caracteres en las cuentas con correo.

## 6. Tus derechos y cómo ejercerlos

| Derecho                  | Cómo                                                                                       |
| ------------------------ | ------------------------------------------------------------------------------------------ |
| Acceso / portabilidad    | **Ajustes → Exportar copia (JSON)**. El archivo no va cifrado: guárdalo con cuidado        |
| Supresión                | **Ajustes → Borrar todos mis datos**. Elimina el dispositivo y, si hay sesión, el servidor |
| Rectificación            | Editar cualquier día desde el calendario                                                   |
| Oposición al tratamiento | No activar la sincronización: no sale nada del dispositivo                                 |

No hay retención automática: los datos viven hasta que los borras. En el servidor, `vaults` se elimina
con la cuenta (`ON DELETE CASCADE`).

## 7. Cifrado, en detalle

```
clave = PBKDF2-SHA256(secreto, salt, 210 000 iteraciones, 256 bits)
sobre = base64(iv de 12 bytes) + "." + base64(AES-256-GCM(JSON(bóveda)))
```

El `salt` depende del modo de cuenta: en **modo privado** es el código de referencia normalizado
(`LUNA-XXXX-XXXX` sin guiones), que la app puede recalcular sin red; en **modo correo** y en **modo
Google** es un salt aleatorio de 16 bytes que devuelve el servidor al iniciar sesión. En todos los
casos el secreto (PIN o contraseña) nunca sale del dispositivo: Google identifica la cuenta, pero no
aporta ni conoce la llave de la bóveda.

- La clave se crea con `extractable: false`: WebCrypto no permite exportarla.
- Cada guardado usa un IV nuevo; el mismo texto cifrado dos veces da resultados distintos.
- No hay verificación de integridad separada porque GCM ya autentica el ciphertext: un blob
  manipulado falla al descifrar en lugar de devolver datos corruptos.

## 8. Menores y datos sensibles

Los datos menstruales son categoría especial en el RGPD (art. 9). LunaCare está pensada para uso
personal adulto; no hay verificación de edad ni recogida de datos de terceros. Si la despliegas para
otras personas, **tú** eres el responsable del tratamiento y necesitas base legal, política de
privacidad publicada y un encargado si usas hosting de terceros.

## 9. Cambios en esta política

Cualquier cambio en qué se guarda o a dónde se envía debe reflejarse aquí y en `CHANGELOG.md` en el
mismo pull request.
