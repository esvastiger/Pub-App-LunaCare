/**
 * Tarjeta social del repositorio (docs/social-preview.png)
 *
 * Compone una imagen de 1280×640 con la identidad de LunaCare y una captura real
 * del panel. Es la que se sube en GitHub → Settings → Social preview.
 *
 * Uso: npm run social-card   (requiere docs/screenshots/03-dashboard.png)
 *
 * Mismo criterio que en screenshots.mjs: puppeteer es opcional, se importa aquí
 * para dar un mensaje útil si no está instalado.
 */

import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

let puppeteer;
try {
  puppeteer = (await import('puppeteer')).default;
} catch {
  console.error(
    'Falta puppeteer. Instálalo solo para generar imágenes:\n' +
      '  npm install --no-save puppeteer && npm approve-scripts puppeteer\n',
  );
  process.exit(1);
}

const ROOT = process.cwd();
const SHOT = join(ROOT, 'docs', 'screenshots', '03-dashboard.png');
const OUT = join(ROOT, 'docs', 'social-preview.png');
mkdirSync(dirname(OUT), { recursive: true });

const shot = readFileSync(SHOT).toString('base64');

const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<style>
  * { box-sizing: border-box; }
  body {
    margin: 0;
    width: 1280px;
    height: 640px;
    overflow: hidden;
    font-family: system-ui, 'Segoe UI', Roboto, sans-serif;
    background:
      radial-gradient(1100px 620px at 8% -10%, #fbd6e9 0%, transparent 60%),
      radial-gradient(900px 540px at 100% 110%, #d9cdf7 0%, transparent 65%),
      #fdf5f9;
    color: #3f2740;
  }
  .wrap {
    display: grid;
    grid-template-columns: 560px 1fr;
    align-items: center;
    gap: 32px;
    height: 100%;
    padding: 56px 56px 56px 64px;
  }
  .brand { display: flex; align-items: center; gap: 16px; }
  .logo {
    display: grid; place-items: center;
    width: 64px; height: 64px; border-radius: 22px;
    background: linear-gradient(135deg, #f7a8c4, #b79ce8);
    box-shadow: 0 16px 32px -12px rgba(160, 78, 122, .55);
    font-size: 34px;
  }
  h1 { margin: 0; font-size: 46px; letter-spacing: -.6px; }
  .tag { margin: 26px 0 0; font-size: 27px; line-height: 1.35; font-weight: 600; color: #5c3a5c; }
  .tag b { color: #b8397a; }
  .pills { margin-top: 34px; display: flex; flex-wrap: wrap; gap: 10px; }
  .pill {
    padding: 9px 15px; border-radius: 999px;
    background: rgba(255, 255, 255, .78);
    border: 1px solid rgba(160, 78, 122, .16);
    font-size: 15px; font-weight: 600; color: #6b4568;
    box-shadow: 0 6px 16px -12px rgba(90, 40, 70, .8);
  }
  .foot { margin-top: 40px; font-size: 15px; font-weight: 600; color: #a5769b; }
  .shot {
    position: relative;
    border-radius: 26px;
    padding: 8px;
    background: rgba(255, 255, 255, .7);
    box-shadow: 0 40px 70px -34px rgba(88, 38, 68, .55), 0 2px 0 rgba(255, 255, 255, .9) inset;
    transform: rotate(-1.2deg);
  }
  .shot img { display: block; width: 100%; border-radius: 19px; }
</style>
</head>
<body>
  <div class="wrap">
    <div>
      <div class="brand"><div class="logo">🌙</div><h1>LunaCare</h1></div>
      <p class="tag">Tu ciclo, con <b>calma</b> y <b>privacidad</b>.</p>
      <div class="pills">
        <span class="pill">🔐 AES-256-GCM en tu dispositivo</span>
        <span class="pill">🙈 Sin cuentas obligatorias</span>
        <span class="pill">📴 100 % offline</span>
      </div>
      <p class="foot">Código abierto · MIT</p>
    </div>
    <div class="shot"><img src="data:image/png;base64,${shot}" alt=""></div>
  </div>
</body>
</html>`;

const browser = await puppeteer.launch({ headless: true, args: ['--lang=es'] });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 640, deviceScaleFactor: 2 });
  await page.setContent(html, { waitUntil: 'load' });

  // La tarjeta tiene tamaño fijo: si algo desborda, GitHub lo recortaría.
  const check = await page.evaluate(() => ({
    overflowX: document.documentElement.scrollWidth > 1280,
    overflowY: document.documentElement.scrollHeight > 640,
    shotLoaded: (document.querySelector('.shot img')?.naturalWidth ?? 0) > 0,
    shotWidth: Math.round(document.querySelector('.shot')?.getBoundingClientRect().width ?? 0),
    tagVisible: (document.querySelector('.tag')?.getBoundingClientRect().height ?? 0) > 20,
  }));
  if (
    check.overflowX ||
    check.overflowY ||
    !check.shotLoaded ||
    !check.tagVisible ||
    check.shotWidth < 500
  ) {
    throw new Error(`Tarjeta mal compuesta: ${JSON.stringify(check)}`);
  }

  await page.screenshot({ path: OUT });
  console.log('✓ docs/social-preview.png (1280×640)');
} finally {
  await browser.close();
}
