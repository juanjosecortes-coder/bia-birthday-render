const express = require('express');
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json({ limit: '10mb' }));

// ─── Carga fondos como base64 al arrancar ─────────────────────────────────────
function loadBg(filename) {
  try {
    const buf = fs.readFileSync(path.join(__dirname, 'img', filename));
    return 'data:image/png;base64,' + buf.toString('base64');
  } catch (e) {
    console.warn(`⚠️  No se encontró img/${filename}`);
    return '';
  }
}

const BG = {
  confetti: loadBg('bg_confetti.png'),
  purpura:  loadBg('bg_purpura.png'),
};

// ─── Templates HTML (estructura exacta de tus archivos) ───────────────────────
const TEMPLATES = {
  confetti: (bgSrc, fotoUrl, nombre) => `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Cumpleaños</title>
  <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@700;800&display=swap" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      display: flex; justify-content: center; align-items: center;
      min-height: 100vh; background: #0d0d1a; font-family: Arial, sans-serif;
    }
    .card { position: relative; width: 420px; display: inline-block; }
    .card .bg-image { width: 100%; display: block; }
    .photo-slot {
      position: absolute; top: 20%; left: 51%;
      transform: translateX(-50%); width: 42%;
      aspect-ratio: 1 / 1; border-radius: 50%; overflow: hidden;
    }
    .photo-slot img { width: 100%; height: 100%; object-fit: cover; object-position: center top; }
    .name-slot {
      position: absolute; bottom: 85px; left: 53%;
      transform: translateX(-50%); width: 40%; text-align: center;
      color: #dcdcdc; font-family: 'Montserrat', sans-serif;
      font-size: clamp(11px, 3.8vw, 16px); font-weight: 800;
      letter-spacing: 0.04em; line-height: 1.3;
      white-space: normal; word-break: break-word;
    }
  </style>
</head>
<body>
  <div class="card">
    <img class="bg-image" src="${bgSrc}" alt="Cumpleaños">
    <div class="photo-slot"><img src="${fotoUrl}" alt="${nombre}" crossorigin="anonymous"></div>
    <div class="name-slot">${nombre}</div>
  </div>
</body>
</html>`,

  purpura: (bgSrc, fotoUrl, nombre) => `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Cumpleaños</title>
  <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@700;800&display=swap" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      display: flex; justify-content: center; align-items: center;
      min-height: 100vh; background: #0d0d1a; font-family: Arial, sans-serif;
    }
    .card { position: relative; width: 420px; display: inline-block; }
    .card .bg-image { width: 100%; display: block; }
    .photo-slot {
      position: absolute; top: 20%; left: 51%;
      transform: translateX(-50%); width: 179px;
      aspect-ratio: 1 / 1; border-radius: 53%; overflow: hidden;
    }
    .photo-slot img { width: 100%; height: 100%; object-fit: cover; object-position: center top; }
    .name-slot {
      position: absolute; bottom: 85px; left: 53%;
      transform: translateX(-50%); width: 40%; text-align: center;
      color: #dcdcdc; font-family: 'Montserrat', sans-serif;
      font-size: clamp(11px, 3.8vw, 16px); font-weight: 800;
      letter-spacing: 0.04em; line-height: 1.3;
      white-space: normal; word-break: break-word;
    }
  </style>
</head>
<body>
  <div class="card">
    <img class="bg-image" src="${bgSrc}" alt="Cumpleaños">
    <div class="photo-slot"><img src="${fotoUrl}" alt="${nombre}" crossorigin="anonymous"></div>
    <div class="name-slot">${nombre}</div>
  </div>
</body>
</html>`,
};

// ─── Browser reutilizable ─────────────────────────────────────────────────────
let browser = null;

async function getBrowser() {
  if (!browser || !browser.connected) {
    browser = await puppeteer.launch({
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
      headless: 'new',
    });
  }
  return browser;
}

// ─── POST /render ─────────────────────────────────────────────────────────────
app.post('/render', async (req, res) => {
  const { nombre, foto_url, template = 'confetti' } = req.body;

  if (!nombre || !foto_url) {
    return res.status(400).json({ error: 'Se requieren nombre y foto_url' });
  }

  const bgSrc = BG[template] || BG.confetti;
  if (!bgSrc) {
    return res.status(500).json({ error: `Fondo para template "${template}" no encontrado. ¿Pusiste el PNG en img/?` });
  }

  const nombreSafe = nombre.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const buildFn = TEMPLATES[template] || TEMPLATES.confetti;
  const html = buildFn(bgSrc, foto_url, nombreSafe);

  let page;
  try {
    const b = await getBrowser();
    page = await b.newPage();
    await page.setViewport({ width: 420, height: 560, deviceScaleFactor: 2 });
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 30000 });

    // Espera explícita a que todas las imágenes carguen
    await page.evaluate(() =>
      Promise.all(Array.from(document.images).map(img =>
        img.complete ? Promise.resolve() :
        new Promise(r => { img.onload = img.onerror = r; })
      ))
    );

    const card = await page.$('.card');
    const screenshot = await card.screenshot({ type: 'png' });

    res.set('Content-Type', 'image/png');
    res.set('Content-Disposition', 'attachment; filename="cumpleanos.png"');
    res.send(screenshot);

  } catch (err) {
    console.error('Error al renderizar:', err.message);
    res.status(500).json({ error: err.message });
  } finally {
    if (page) await page.close().catch(() => {});
  }
});

// ─── GET /health ──────────────────────────────────────────────────────────────
app.get('/health', (_req, res) =>
  res.json({ ok: true, templates: Object.keys(TEMPLATES), fondos: Object.fromEntries(Object.entries(BG).map(([k,v]) => [k, !!v])) })
);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🎂 Render service corriendo en puerto ${PORT}`));
