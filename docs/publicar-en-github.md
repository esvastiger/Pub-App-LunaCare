# Publicar LunaCare en GitHub

El proyecto vive en **[esvastiger/Pub-App-LunaCare](https://github.com/esvastiger/Pub-App-LunaCare)**
(repositorio público, licencia **GPL v2 o posterior**). Esta guía sirve para publicar cambios y para
revisar los ajustes que no viven en el código.

## 0. Antes de nada

```bash
cd LunaCare
git status                       # el repo ya está inicializado
ls backend/api/config.local.php  # solo existe en tu equipo; está ignorado por git
```

`config.local.php` contiene tu Client ID de Google y los datos de conexión locales. Nunca debe
entrar en el índice (`git check-ignore -v backend/api/config.local.php`).

## 1. Verificación previa

```bash
npm ci
npm run typecheck
npm run format:check
npm run build

# API (si tocaste el backend)
for f in backend/api/*.php; do php -l "$f" || exit 1; done
```

Sin PHP en el PATH, usa el de USBWebServer:
`E:\usbwebserver\php\php.exe -l backend/api/index.php`.

## 2. Revisar lo que va a subirse

```bash
git status --short
# ⛔ No deben aparecer:
git status --short | grep -E "config\.local|node_modules|dist/|\.env" && echo "PARA: artefactos o secretos"
```

Tampoco deben aparecer `docs/_qa/` ni `*.log` (están en `.gitignore`).

## 3. Commit y push

```bash
git add .
git commit -m "feat: describe el cambio en una línea"
git push
```

El remoto ya está configurado como `origin`. Si clonas desde cero:

```bash
git clone https://github.com/esvastiger/Pub-App-LunaCare.git
cd Pub-App-LunaCare
npm ci
npm run dev        # http://127.0.0.1:4200
```

## 4. Ajustes que no viven en el código

| Ajuste                               | Dónde                               | Valor                                                          |
| ------------------------------------ | ----------------------------------- | -------------------------------------------------------------- |
| Imagen social                        | Settings → General → Social preview | subir `docs/social-preview.png` (1280×640)                     |
| Descripción                          | Settings → General                  | la de `package.json`                                           |
| Topics                               | About → ⚙️                          | `menstrual-health`, `period-tracker`, `privacy`, `e2ee`, `pwa` |
| Discussions                          | Settings → Features                 | activar para dudas de uso                                      |
| Private vulnerability reporting      | Settings → Code security            | **activar** (lo enlaza `SECURITY.md`)                          |
| Dependabot alerts + security updates | Settings → Code security            | activar                                                        |
| Branch protection en `main`          | Settings → Branches                 | exigir PR + CI verde antes de mergear                          |
| Pages                                | Settings → Pages                    | Source: _GitHub Actions_, solo si usas `deploy-pages.yml`      |

`deploy-pages.yml` es **manual**: aunque esté en el repo, no publica nada hasta que lo lanzas desde
la pestaña Actions.

## 5. Releases

```bash
git tag -a v0.2.0 -m "LunaCare 0.2.0"
git push origin v0.2.0
```

En GitHub → **Releases** → _Draft a new release_: elige el tag, pega la sección correspondiente de
[CHANGELOG.md](../CHANGELOG.md) y publica.

## 6. Checklist final

- [ ] `npm ci && npm run typecheck && npm run format:check && npm run build` en verde
- [ ] El workflow **CI** pasa en el push
- [ ] `backend/api/config.local.php` no está en el repo
- [ ] Sin marcadores de usuario pendientes (ya se sustituyó por `esvastiger`)
- [ ] Imagen social, descripción y topics puestos
- [ ] Reporte privado de vulnerabilidades activado
- [ ] Las capturas del README se ven (rutas relativas)
- [ ] Etiquetas `bug` y `enhancement` creadas (las usan las plantillas de issue)
