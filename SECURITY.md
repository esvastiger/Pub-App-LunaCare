# Política de seguridad

## Versiones soportadas

| Versión | Soportada |
| ------- | --------- |
| 0.1.x   | ✅        |

Es un proyecto joven: solo la última versión publicada recibe correcciones.

## Cómo reportar una vulnerabilidad

**No abras un issue público.** Usa el canal privado de GitHub:

1. Entra en la pestaña **Security** del repositorio.
2. **Report a vulnerability** (GitHub Security Advisories).

Incluye, si puedes: versión o commit, pasos para reproducir, impacto que crees que tiene y una
prueba de concepto mínima. Evita adjuntar datos reales de salud: usa una bóveda de prueba.

### Qué esperar

- Acuse de recibo en **72 horas**.
- Evaluación y plan de corrección en **7 días**.
- Crédito en el aviso público cuando se publique el arreglo, si lo quieres.

No hay recompensa económica. Este es un proyecto personal de código abierto.

## Alcance

En alcance:

- La SPA (`src/`) y el service worker.
- La API PHP (`backend/api/`) y su esquema.
- El proceso de cifrado, derivación de claves y sincronización.

Fuera de alcance:

- Despliegues de terceros mal configurados (HTTP sin TLS, `cors_origin: '*'`, base de datos expuesta).
- Ataques que requieran control del dispositivo desbloqueado o de la cuenta de correo.
- Ingeniería social, spam o denegación de servicio a gran escala.
- Limitaciones ya documentadas en [docs/privacidad.md](docs/privacidad.md#5-modelo-de-amenazas).

## Advertencias conocidas

`npm audit` señala dos avisos en dependencias. Ninguno afecta a esta aplicación tal y como se ejecuta,
pero se documentan para que nadie se lleve una sorpresa:

| Paquete                    | Aviso                                               | Por qué no aplica                                                   | Plan                                                                 |
| -------------------------- | --------------------------------------------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `@angular/router` < 22.2.0 | DoS por parámetros de matriz en URLs (afecta a SSR) | LunaCare es una SPA CSR: no hay servidor Angular que resuelva rutas | Actualizar todo Angular a 22.2.x en cuanto se pueda validar el build |
| `source-map-js`            | DoS al procesar mapas de código maliciosos          | Es una dependencia de compilación, no se envía al navegador         | Se resuelve al actualizar la cadena de build                         |

Revisar el estado actual:

```bash
npm audit --omit=dev
```

## Endurecimiento si despliegas tu propia instancia

- Sirve la app y la API **solo por HTTPS**.
- `config.local.php` (o `LUNACARE_CORS_ORIGIN`) con **tu dominio**, nunca `*`.
- Usuario de MySQL dedicado, sin privilegios de `CREATE DATABASE` en producción: importa
  `backend/schema.sql` a mano y ajusta el usuario.
- Añade cabeceras en el servidor web:

  ```
  Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self' https://TU-API; frame-ancestors 'none'; base-uri 'none'; form-action 'self'
  X-Content-Type-Options: nosniff
  Referrer-Policy: no-referrer
  Strict-Transport-Security: max-age=31536000; includeSubDomains
  ```

- Haz copias de seguridad de la base de datos: aunque no puedas leerlas, son la única copia remota de
  la bóveda de quien confía en tu servidor.
- No registres cuerpos de petición en los logs: contienen la bóveda cifrada y tokens.
