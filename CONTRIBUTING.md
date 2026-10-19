# Contribuir a LunaCare

Gracias por pasarte. Este proyecto nació para que una persona pueda llevar su ciclo sin entregar sus
datos a nadie, así que las contribuciones se juzgan con dos criterios: **utilidad real** y **respeto
por la privacidad de quien la usa**.

## Antes de escribir código

- Abre un issue para cambios grandes (nueva pantalla, cambio de modelo de datos, dependencia nueva).
  Ahorra trabajo a todo el mundo.
- Para arreglos pequeños (typos, estilos, un bug claro) abre el PR directamente.
- Busca en los issues existentes y revisa la [hoja de ruta](README.md#-hoja-de-ruta).

## Puesta en marcha

```bash
git clone https://github.com/esvastiger/Pub-App-LunaCare.git
cd LunaCare
npm install
npm run dev              # http://127.0.0.1:4200
```

El backend es opcional; solo lo necesitas si vas a tocar la sincronización:

```bash
cp backend/api/config.example.php backend/api/config.local.php
php -S 127.0.0.1:8090 -t backend/api
curl 'http://127.0.0.1:8090/index.php?action=ping'
```

## Antes de enviar el PR

```bash
npm run format        # Prettier (obligatorio: el CI comprueba el formato)
npm run typecheck     # tsc sin emitir
npm run build         # build de producción
```

Si has tocado la interfaz, regenera las capturas (`npm run screenshots`) y actualiza el README si
cambia alguna pantalla. Ver [docs/capturas.md](docs/capturas.md).

> **Tests**: el proyecto todavía no tiene suite (no hay target `ng test` configurado). Si añades
> lógica de dominio, prueba al menos el camino manual y cuéntalo en el PR. Montar Vitest es una de
> las tareas abiertas de la hoja de ruta; un PR que lo haga con dos o tres tests de `insights.ts`
> sería muy bienvenido.

## Estilo de código

- **Angular standalone** + `ChangeDetectionStrategy.OnPush` + `signal()` para estado local.
- La lógica de dominio vive en `src/app/core/`; los componentes solo pintan y delegan.
- Tipado estricto: nada de `any` ni de `as unknown as`. Los tipos de datos están en `core/models.ts`.
- Textos de interfaz en español y con tono cercano; nunca prometas diagnósticos ni resultados médicos.
- Comentarios solo cuando explican **por qué**, no qué hace la línea.
- Prettier manda: ancho 100, comillas simples, plantillas con parser `angular`.

## Commits y ramas

Usamos [Conventional Commits](https://www.conventionalcommits.org/es/):

```
feat(dashboard): añadir resumen de la fase actual
fix(crypto): rechazar PIN incorrecto cuando no hay copia local
docs(privacidad): documentar el modelo de amenazas
```

Ramas: `feat/…`, `fix/…`, `docs/…`. Un PR = un tema.

## Qué se revisa en un PR

1. **Privacidad**: ¿el cambio envía algo nuevo fuera del dispositivo? ¿Se puede evitar?
2. **Datos existentes**: ¿rompe bóvedas ya guardadas? Si el modelo cambia, la migración debe ser
   tolerante (los registros antiguos tienen campos opcionales).
3. **Accesibilidad**: etiquetas, `aria-label`, foco, contraste y objetivos táctiles de 44 px.
4. **Cifrado**: nada de persistir claves, IV reutilizados ni secretos en el bundle.
5. **Formato y build**: verdes.

## Seguridad

No abras issues públicos para vulnerabilidades: sigue [SECURITY.md](SECURITY.md).

## Licencia de las contribuciones

Al enviar un PR aceptas que tu aportación se publique bajo la licencia [GNU GPL v2 o
posterior](LICENSE) del proyecto. Al ser una licencia con _copyleft_, las versiones derivadas deben
seguir siendo software libre bajo los mismos términos.
