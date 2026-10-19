# Arquitectura de LunaCare

Documento de referencia para quien vaya a leer o modificar el código. Explica cómo está organizado,
por dónde pasa el estado y dónde tocar para añadir cosas sin romper el cifrado.

## 1. Vista general

```
┌──────────────────────── SPA Angular 22 (standalone, signals) ────────────────────────┐
│  features/            componentes de pantalla (OnPush, sin lógica de dominio)        │
│      │                                                                               │
│  core/                servicios de dominio: vault, auth, sync, insights, crypto      │
│      │                                                                               │
│  WebCrypto (PBKDF2 + AES-GCM)        localStorage        Service worker (PWA)        │
└──────────────────────────────────────┬───────────────────────────────────────────────┘
                                       │  HTTPS · JSON · Bearer token
                          ┌────────────▼────────────┐
                          │  API PHP 8 (backend/)   │
                          │  usuarios + blob opaco  │
                          └────────────┬────────────┘
                                       │
                                   MySQL 8
```

Dos ideas sostienen el diseño:

1. **El servidor es tonto a propósito.** No entiende nada: guarda hashes de credenciales y un blob
   cifrado con marca temporal. Toda la inteligencia (cifrado, predicciones, conflictos) vive en el
   cliente.
2. **Una sola fuente de verdad.** `CycleService.vault()` es el estado; calendario, estadísticas y
   asistente son `computed()` puros sobre él. No hay copias parciales que sincronizar.

## 2. Arranque de la aplicación

```
main.ts → app.config.ts
  ├─ provideRouter(routes)
  ├─ provideHttpClient(withFetch)
  ├─ provideServiceWorker (solo en producción)
  └─ provideAppInitializer → AuthService.init()
        ├─ lee localStorage (sesión + índice de cuentas)
        ├─ migra credenciales antiguas (v1 → v2, purga `keyB64`)
        ├─ si hay sesión: restaura identidad y marca la bóveda como CERRADA
        └─ si no hay sesión: deja pasar a /inicio
```

`init()` **no descifra nada**: sin el PIN no hay clave. Por eso existe la ruta `/desbloquear`, a la
que redirige `unlockGuard` mientras `AuthService.locked()` sea `true`.

```
/inicio  ──(welcomeGuard)──▶ si ya hay sesión → /onboarding o /app
/desbloquear ──(unlockGuard)──▶ pide PIN/contraseña y re-deriva la clave
/onboarding ─(onboardingGuard)─▶ exige sesión; salta si ya está configurado
/app ───────(appGuard)────────▶ exige sesión + onboarding + desbloqueo
  ├─ ''               Dashboard
  ├─ estadisticas     Statistics
  ├─ asistente        Assistant
  └─ ajustes          Settings
```

## 3. Estado y persistencia

| Concepto                                  | Dónde vive                   | Se cifra                        |
| ----------------------------------------- | ---------------------------- | ------------------------------- |
| Bóveda (`VaultData`: ajustes + registros) | `lunacare.vault.<userId>`    | Sí, AES-256-GCM                 |
| Marca temporal de la bóveda               | `lunacare.vault.<userId>.ts` | No (solo un número)             |
| Sesión e identidad                        | `lunacare.creds`             | No: sin datos de salud ni clave |
| Índice de cuentas del dispositivo         | `lunacare.index`             | Solo hashes SHA-256             |
| Preferencias (sync, recordar sesión)      | `lunacare.prefs`             | No                              |
| Castigos anti fuerza bruta                | `lunacare.lock.*`            | No                              |

`StorageService` es el único que toca `localStorage`. `CycleService` nunca escribe directamente:
llama a `save()`, que re-cifra la bóveda completa, la persiste y programa el push.

```
edición (modal / onboarding / ajustes)
   └─▶ CycleService.update()        actualiza señales + updatedAt
         └─▶ persist()
               ├─ crypto.encryptJson(vault)     AES-GCM, IV nuevo
               ├─ storage.saveVault(payload)    localStorage
               └─ sync.push(payload)            debounce 1,5 s
```

Cifrar la bóveda entera en cada guardado es una decisión deliberada: el sobre cifrado no filtra
cuántos registros hay ni qué día se editó, y evita migraciones de esquema dentro del blob.

## 4. Cifrado

`CryptoService` (WebCrypto, sin dependencias):

| Función                       | Detalle                                                                          |
| ----------------------------- | -------------------------------------------------------------------------------- |
| `deriveKey(secret, salt)`     | PBKDF2-SHA256, 210 000 iteraciones, salida AES-256-GCM, **`extractable: false`** |
| `encryptJson` / `decryptJson` | AES-GCM con IV de 12 bytes; formato `base64(iv).base64(cipher)`                  |
| `sha256Hex`                   | Identificadores y verificadores que viajan al servidor                           |
| `randomRefCode`               | `LUNA-XXXX-XXXX` con alfabeto sin caracteres ambiguos                            |

Consecuencias de `extractable: false`:

- No existe `exportKey`, así que la clave **no puede** escribirse en disco, ni siquiera por la propia
  app. Un XSS en marcha puede leer la pantalla, pero no obtener la clave para descifrar el histórico.
- Al recargar hay que teclear el PIN otra vez. Es el coste consciente de esa garantía.
- `AuthService.unlock()` distingue **"PIN incorrecto"** de **"este dispositivo no tiene copia"**:
  ambos casos hacen fallar `decryptJson`, pero solo el primero debe rechazar el acceso.

## 5. Sincronización y conflictos

`SyncService` es oportunista: no hay websockets ni polling.

- **pull**: al iniciar sesión o desbloquear, si la sincronización está activa.
- **push**: 1,5 s después del último guardado (debounce), con `baseUpdatedAt` del servidor.
- **conflicto**: si el servidor responde `conflict`, devuelve su blob; `CycleService` lo descifra,
  mezcla registro a registro por `updatedAt` y vuelve a subir el resultado.
- **token caducado**: un solo re-login silencioso con las credenciales guardadas y reintento.
- **sin red**: el payload pendiente se conserva y se reintenta en el siguiente guardado.

Estados visibles en la interfaz: `disabled` · `offline` · `syncing` · `synced` · `error`.

## 6. PWA

- `ngsw-config.json` precarga el shell (`index.html`, JS, CSS, manifest, iconos) y deja la API fuera
  de la caché, para no servir nunca una respuesta de login o una bóveda vieja.
- `PwaService` expone el estado online/offline y el aviso de nueva versión con recarga.
- El registro del service worker está desactivado en desarrollo para no interferir con el HMR.

## 7. Puntos de extensión

| Quiero…                                        | Tocar                                                                                                       |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Cambiar el algoritmo o las iteraciones         | `core/crypto.service.ts` + nota en `docs/privacidad.md`                                                     |
| Añadir un campo al registro diario             | `core/models.ts` (tipo + catálogo), `features/daily-log/*`, migración tolerante en `cycle.service.ts`       |
| Cambiar predicciones o fases                   | `core/insights.ts` (funciones puras, fáciles de testear)                                                    |
| Añadir una pantalla                            | `app.routes.ts` + `features/<nombre>/` + entrada en `shell.html`                                            |
| Conectar un LLM real al asistente              | `features/assistant/assistant.ts` → `answer()`; la clave debe vivir en el backend (ver `docs/asistente.md`) |
| Añadir un endpoint                             | `backend/api/index.php` (router por `?action=`) + `core/api.service.ts`                                     |
| Autoalojar la tipografía y quitar Google Fonts | `src/index.html`, `ngsw-config.json`, `src/styles.css`                                                      |

## 8. Convenciones

- Componentes **standalone** con `ChangeDetectionStrategy.OnPush` y `signal()` para el estado local.
- Nada de `any`: los tipos de dominio están en `core/models.ts`.
- Los servicios de `core/` no importan nada de `features/`.
- Las utilidades puras (fechas, insights) no dependen de Angular: se pueden probar con `node`.
- Textos de interfaz en español, en el propio template; no hay capa i18n todavía.
