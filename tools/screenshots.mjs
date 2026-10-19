/**
 * Capturas promocionales de LunaCare (tools/screenshots.mjs)
 *
 * Lanza un Chromium propio (perfil temporal, sin tocar el navegador del usuario)
 * contra el dev server de http://127.0.0.1:4200, crea una cuenta demo anónima
 * mediante WebCrypto (PBKDF2 + AES-GCM), siembra ~90 días de registros
 * realistas y captura pantallas: bienvenida, desbloqueo con PIN, panel
 * (escritorio y móvil), registro del día, digestión con texto libre,
 * estadísticas, asistente, ajustes y aviso médico.
 *
 * Uso: node tools/screenshots.mjs   (requiere el dev server en :4200)
 * Salida: docs/screenshots/*.png
 */

import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

// Puppeteer es opcional: no se instala con la app para no pesar 300 MB en cada
// `npm ci`. Se importa aquí para poder dar un mensaje útil en vez de un stack.
let puppeteer;
try {
  puppeteer = (await import('puppeteer')).default;
} catch {
  console.error(
    'Falta puppeteer. Instálalo solo para generar capturas:\n' +
      '  npm install --no-save puppeteer && npm approve-scripts puppeteer\n',
  );
  process.exit(1);
}

const BASE = 'http://127.0.0.1:4200';
const OUT = join(process.cwd(), 'docs', 'screenshots');
mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Cada captura comprueba el estado de la UI antes de disparar: una imagen
 * "bonita" pero vacía (modal cerrado, chat sin respuesta) es peor que un fallo.
 */
function assert(condition, message) {
  if (!condition) throw new Error(`Captura inválida: ${message}`);
}

async function typeInto(page, selector, value) {
  await page.waitForSelector(selector, { visible: true, timeout: 10000 });
  await page.type(selector, value, { delay: 10 });
}

async function clickButtonByText(page, regex) {
  const ok = await page.evaluate((pattern) => {
    const re = new RegExp(pattern);
    const el = [...document.querySelectorAll('button, a')].find((b) =>
      re.test((b.innerText || '').trim()),
    );
    if (!el) return false;
    el.click();
    return true;
  }, regex.source);
  if (!ok) throw new Error(`Botón no encontrado: ${regex}`);
}

/** Siembra la bóveda demo directamente con WebCrypto y entra en la sesión. */
async function seedAndEnter(page) {
  return page.evaluate(async () => {
    const te = new TextEncoder();
    const PIN = '4821';
    const REF = 'DEMO-2026-XXXX'; // normalizado -> DEMO2026XXXX
    const normalized = REF.replace(/[^A-Z0-9]/g, '');

    const sha256Hex = async (input) => {
      const d = await crypto.subtle.digest('SHA-256', te.encode(input));
      return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
    };
    const bufToB64 = (buf) => {
      const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
      let bin = '';
      for (let i = 0; i < bytes.length; i += 0x8000)
        bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      return btoa(bin);
    };

    // Clave AES de la bóveda (idéntico a CryptoService.deriveKey)
    const baseKey = await crypto.subtle.importKey('raw', te.encode(PIN), 'PBKDF2', false, [
      'deriveKey',
    ]);
    const key = await crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: te.encode(normalized), iterations: 210000, hash: 'SHA-256' },
      baseKey,
      { name: 'AES-GCM', length: 256 },
      false, // no extraíble: igual que CryptoService.deriveKey
      ['encrypt', 'decrypt'],
    );

    const iso = (d) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    };

    // ——— Registros demo: ~90 días con patrón ciclico realista ———
    const logs = {};
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    const CYCLE = 28;
    const PERIOD = 5;
    const SYMPTOM_POOL = [
      ['cramps', 'Bajo'],
      ['headache'],
      ['bloating'],
      ['breast'],
      ['acne'],
      ['fatigue'],
      ['cravings'],
      ['insomnia'],
    ];
    const MOODS_BY_PHASE = (phase) =>
      phase === 'menstrual'
        ? ['cansada', 'sensible', 'triste']
        : phase === 'follicular'
          ? ['feliz', 'energetic', 'tranquila']
          : phase === 'ovulation'
            ? ['feliz', 'energetic']
            : ['irritable', 'ansiosa', 'sensible'];

    for (let i = 89; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const cycleDay = 1 + (((d.getTime() % (CYCLE * 86400000)) / 86400000) | 0); // determinista
      const phase =
        cycleDay <= PERIOD
          ? 'menstrual'
          : cycleDay <= 13
            ? 'follicular'
            : cycleDay <= 16
              ? 'ovulation'
              : 'luteal';

      const flow =
        phase === 'menstrual'
          ? cycleDay === 1
            ? 'medium'
            : cycleDay <= 3
              ? 'heavy'
              : 'light'
          : null;
      if (!flow && Math.random() < 0.25 && i !== 0) continue; // algún día sin registro

      const moodPool = MOODS_BY_PHASE(phase);
      const mood = moodPool[Math.floor(Math.random() * moodPool.length)];
      const symptoms = [];
      for (const s of SYMPTOM_POOL)
        if (Math.random() < (phase === 'menstrual' ? 0.5 : 0.18)) symptoms.push(s[0]);

      logs[iso(d)] = {
        date: iso(d),
        flow,
        symptoms,
        mood,
        moodScale:
          phase === 'menstrual'
            ? 2 + Math.floor(Math.random() * 3)
            : phase === 'luteal'
              ? 4 + Math.floor(Math.random() * 3)
              : 6 + Math.floor(Math.random() * 4),
        note:
          i === 0
            ? 'Primer día: usar compresa nocturna y tomar magnesio.'
            : Math.random() < 0.08
              ? 'Mucho dolor lumbar hoy.'
              : '',
        pain:
          phase === 'menstrual'
            ? Math.random() < 0.6
              ? 'moderate'
              : 'mild'
            : Math.random() < 0.1
              ? 'mild'
              : null,
        libido:
          phase === 'ovulation'
            ? 8 + Math.floor(Math.random() * 3)
            : 3 + Math.floor(Math.random() * 4),
        sleep:
          phase === 'luteal'
            ? 3 + Math.floor(Math.random() * 4)
            : 6 + Math.floor(Math.random() * 3),
        stress:
          phase === 'luteal'
            ? Math.random() < 0.5
              ? 'high'
              : 'medium'
            : Math.random() < 0.7
              ? 'low'
              : 'medium',
        bbt:
          phase === 'luteal'
            ? +(36.8 + Math.random() * 0.3).toFixed(1)
            : +(36.3 + Math.random() * 0.25).toFixed(1),
        mucus: phase === 'ovulation' ? 'eggwhite' : phase === 'follicular' ? 'creamy' : 'dry',
        cervixHeight: phase === 'ovulation' ? 'high' : 'low',
        cervixOpening: phase === 'ovulation' ? 'open' : 'closed',
        cervixFirmness: phase === 'ovulation' ? 'soft' : 'firm',
        breast: phase === 'luteal' && Math.random() < 0.5 ? 'moderate' : null,
        digestion: phase === 'menstrual' ? (Math.random() < 0.4 ? 'bloating' : 'normal') : 'normal',
        skin: phase === 'luteal' ? (Math.random() < 0.4 ? 'acne' : 'clear') : 'clear',
        alcohol: Math.random() < 0.15 ? 'light' : 'none',
        meds: '',
        updatedAt: d.getTime(),
      };
    }

    const settings = {
      lastPeriodStart: iso(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 2)),
      cycleLength: CYCLE,
      periodLength: PERIOD,
      onboarded: true,
    };
    const vault = { version: 1, settings, logs, updatedAt: Date.now() };

    const iv = crypto.getRandomValues(new Uint8Array(12));
    const enc = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      te.encode(JSON.stringify(vault)),
    );
    const payload = `${bufToB64(iv)}.${bufToB64(enc)}`;

    // ——— Identidad demo (mismo esquema que StorageService/AuthService) ———
    const userId = 'demo-user-0000-0000-000000000000';
    const refHash = await sha256Hex(`lunacare:ref:${normalized}`);
    const pinVerifier = await sha256Hex(`lunacare:pin:${PIN}`);

    localStorage.setItem(
      'lunacare.index',
      JSON.stringify([{ lookup: refHash, userId, mode: 'anonymous', salt: '' }]),
    );
    localStorage.setItem(`lunacare.vault.${userId}`, payload);
    localStorage.setItem(`lunacare.vault.${userId}.ts`, String(Date.now()));
    localStorage.setItem(
      'lunacare.creds',
      // v2: sin clave AES persistida — la app pedirá el PIN al recargar.
      JSON.stringify({
        session: { userId, mode: 'anonymous', refCode: REF, email: null, createdAt: Date.now() },
        v: 2,
        syncAuth: { kind: 'anon', identifier: refHash, verifier: pinVerifier, token: null },
      }),
    );
    localStorage.setItem('lunacare.prefs', JSON.stringify({ remember: true, syncEnabled: false }));
    return true;
  });
}

async function openModal(page) {
  await page.evaluate(() => {
    const d = document.querySelector('app-dashboard');
    const btn = [...(d?.querySelectorAll('button') ?? [])].find((b) =>
      /Registrar hoy/i.test(b.innerText || ''),
    );
    btn?.click();
  });
  await page.waitForSelector('app-modal section', { visible: true, timeout: 5000 });
  await sleep(400);
}

async function main() {
  const browser = await puppeteer.launch({ headless: true, args: ['--lang=es'] });
  const context = await browser.createBrowserContext({
    locale: 'es-ES',
    timezoneId: 'Europe/Madrid',
  });
  const page = await context.newPage();
  await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 2 });
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle0', timeout: 30000 });
  await sleep(800);

  // 1 — Bienvenida
  await page.screenshot({ path: join(OUT, '01-welcome.png') });
  console.log('✓ 01-welcome.png');

  // Sembrar datos demo. La bóveda arranca cerrada: la clave no se persiste.
  await seedAndEnter(page);
  await page.goto(`${BASE}/desbloquear`, { waitUntil: 'networkidle0', timeout: 30000 });
  await sleep(700);

  // 2 — Pantalla de desbloqueo (PIN). La clave AES nunca se persiste.
  assert(await page.$('#secret'), 'no se ve el campo de PIN en /desbloquear');
  await page.screenshot({ path: join(OUT, '02-unlock.png') });
  console.log('✓ 02-unlock.png');

  await page.type('#secret', '4821');
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) =>
      /Desbloquear/.test(b.textContent || ''),
    );
    btn?.click();
  });
  await page.waitForFunction(() => location.pathname === '/app', { timeout: 20000 });
  await sleep(1000);
  await page.evaluate(() =>
    document.querySelectorAll('app-toasts .animate-pop').forEach((t) => t.remove()),
  );
  await sleep(400);

  // 3 — Panel (escritorio)
  assert(await page.$('app-dashboard app-month-calendar'), 'el panel no ha cargado el calendario');
  assert(
    await page.evaluate(() => document.body.innerText.includes('Próxima regla')),
    'el panel no muestra la predicción de la próxima regla',
  );
  await page.screenshot({ path: join(OUT, '03-dashboard.png') });
  console.log('✓ 03-dashboard.png');

  // 4 — Panel en móvil (la app está pensada primero para el teléfono)
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  await sleep(900);
  assert(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
    'el panel desborda horizontalmente en móvil (390 px)',
  );
  await page.screenshot({ path: join(OUT, '04-dashboard-mobile.png') });
  console.log('✓ 04-dashboard-mobile.png');
  await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 2 });
  await sleep(700);

  // 5 — Registro del día (modal, parte alta)
  await openModal(page);
  await page.screenshot({ path: join(OUT, '05-daily-log.png') });
  console.log('✓ 05-daily-log.png');

  // 6 — Digestión con texto libre: demuestra los 16 campos del registro
  await page.evaluate(() => {
    const sec = [...document.querySelectorAll('app-modal section')].find((s) =>
      /Digestión/.test(s.textContent || ''),
    );
    sec?.scrollIntoView({ block: 'start' });
  });
  await sleep(400);
  await page.evaluate(() => {
    const sec = [...document.querySelectorAll('app-modal section')].find((s) =>
      /Digestión/.test(s.textContent || ''),
    );
    const btn = [...(sec?.querySelectorAll('button') ?? [])].find((b) =>
      /Otros/.test(b.textContent || ''),
    );
    btn?.click();
  });
  await sleep(300);
  await page.waitForSelector('app-modal input.other-input', { visible: true, timeout: 5000 });
  await page.type('app-modal input.other-input', 'Acidez por la tarde', { delay: 15 });
  await sleep(300);
  assert(
    (await page.$eval('app-modal input.other-input', (el) => el.value)) === 'Acidez por la tarde',
    'el texto libre de Digestión no se ha escrito',
  );
  assert(
    await page.evaluate(() => {
      const sec = [...document.querySelectorAll('app-modal section')].find((s) =>
        /Digestión/.test(s.textContent || ''),
      );
      if (!sec) return false;
      const r = sec.getBoundingClientRect();
      return r.top >= 0 && r.bottom <= window.innerHeight;
    }),
    'la sección de Digestión no está visible en el encuadre',
  );
  await page.screenshot({ path: join(OUT, '06-digestion-otros.png') });
  console.log('✓ 06-digestion-otros.png');

  await page.evaluate(() => document.querySelector('app-modal button[aria-label=Cerrar]')?.click());
  await sleep(400);

  // 7 — Estadísticas
  await clickButtonByText(page, /Estadísticas/);
  await sleep(900);
  await page.screenshot({ path: join(OUT, '07-statistics.png') });
  console.log('✓ 07-statistics.png');

  // 8 — Asistente (respuestas calculadas en el dispositivo, sin red)
  await clickButtonByText(page, /^Luna$/);
  await page.waitForSelector('app-assistant button.chip', { visible: true, timeout: 10000 });
  await sleep(500);
  for (const q of ['¿Cuándo me viene la próxima regla?', '¿Cómo ha sido mi ánimo este mes?']) {
    await page.evaluate((text) => {
      const chip = [...document.querySelectorAll('app-assistant button.chip')].find(
        (b) => (b.textContent || '').trim() === text,
      );
      chip?.click();
    }, q);
    await sleep(1200);
  }
  await page.evaluate(() => {
    const log = document.querySelector('app-assistant [aria-live]');
    if (log) log.scrollTop = log.scrollHeight;
  });
  await sleep(300);
  // Saludo + 2 preguntas + 2 respuestas = 5 burbujas; si falta alguna, la
  // respuesta aún no había llegado al disparar la captura.
  assert(
    (await page.$$eval('app-assistant [aria-live] > div', (els) => els.length)) >= 5,
    'el asistente no muestra las dos respuestas esperadas',
  );
  await page.screenshot({ path: join(OUT, '08-assistant.png') });
  console.log('✓ 08-assistant.png');

  // 9 — Ajustes / privacidad
  await clickButtonByText(page, /Ajustes/);
  await sleep(900);
  await page.screenshot({ path: join(OUT, '09-settings.png') });
  console.log('✓ 09-settings.png');

  // 10 — Aviso médico y límites de uso
  await clickButtonByText(page, /^Panel$/);
  await sleep(900);
  await page.evaluate(() => {
    const btn = document.querySelector('app-dashboard button[aria-label*="aviso médico"]');
    btn?.click();
  });
  await page.waitForSelector('app-dashboard app-modal section', { visible: true, timeout: 5000 });
  await sleep(500);
  assert(
    await page.evaluate(() => /Aviso médico/.test(document.body.innerText)),
    'el modal de aviso médico no está abierto',
  );
  await page.screenshot({ path: join(OUT, '10-aviso-medico.png') });
  console.log('✓ 10-aviso-medico.png');

  await browser.close();
  console.log('Listo →', OUT);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
