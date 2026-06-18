const express = require('express');
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

function fetchImageAsBase64(url) {
  return new Promise((resolve) => {
    try {
      const protocol = url.startsWith('https') ? https : http;
      protocol.get(url, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return fetchImageAsBase64(res.headers.location).then(resolve);
        }
        const chunks = [];
        res.on('data', chunk => chunks.push(chunk));
        res.on('end', () => {
          const contentType = res.headers['content-type'] || 'image/jpeg';
          const base64 = Buffer.concat(chunks).toString('base64');
          resolve(`data:${contentType.split(';')[0]};base64,${base64}`);
        });
        res.on('error', () => resolve(''));
      }).on('error', () => resolve(''));
    } catch (e) { resolve(''); }
  });
}

const app = express();
app.use(express.json({ limit: '50mb' }));

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

const TEMPLATES = {
  confetti: (bgSrc, fotoUrl, nombre) => `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"><style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { display:flex; justify-content:center; align-items:center; min-height:100vh; background:#0d0d1a; }
  .card { position:relative; width:420px; display:inline-block; overflow:hidden; }
  .card .bg-image { width:100%; display:block; }
  .photo-slot { position:absolute; top:20%; left:51%; transform:translateX(-50%); width:42%; aspect-ratio:1/1; border-radius:50%; overflow:hidden; }
  .photo-slot img { width:100%; height:100%; object-fit:cover; object-position:center top; }
  .name-slot { position:absolute; bottom:85px; left:50%; transform:translateX(-50%); width:55%; text-align:center; color:#dcdcdc; font-family:Arial,sans-serif; font-size:clamp(11px,3.8vw,16px); font-weight:800; letter-spacing:0.04em; line-height:1.3; white-space:normal; word-break:break-word; }
</style></head><body>
  <div class="card">
    <img class="bg-image" src="${bgSrc}">
    <div class="photo-slot"><img src="${fotoUrl}" alt="${nombre}"></div>
    <div class="name-slot">${nombre}</div>
  </div>
</body></html>`,

  purpura: (bgSrc, fotoUrl, nombre) => `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"><style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { display:flex; justify-content:center; align-items:center; min-height:100vh; background:#0d0d1a; }
  .card { position:relative; width:420px; display:inline-block; overflow:hidden; }
  .card .bg-image { width:100%; display:block; }
  .photo-slot { position:absolute; top:20%; left:51%; transform:translateX(-50%); width:179px; aspect-ratio:1/1; border-radius:53%; overflow:hidden; }
  .photo-slot img { width:100%; height:100%; object-fit:cover; object-position:center top; }
  .name-slot { position:absolute; bottom:85px; left:50%; transform:translateX(-50%); width:55%; text-align:center; color:#dcdcdc; font-family:Arial,sans-serif; font-size:clamp(11px,3.8vw,16px); font-weight:800; letter-spacing:0.04em; line-height:1.3; white-space:normal; word-break:break-word; }
</style></head><body>
  <div class="card">
    <img class="bg-image" src="${bgSrc}">
    <div class="photo-slot"><img src="${fotoUrl}" alt="${nombre}"></div>
    <div class="name-slot">${nombre}</div>
  </div>
</body></html>`,
};

function buildCombinedHtml(cards) {
  const cardDivs = cards.map(({ bgSrc, fotoBase64, nombre, template }) => {
    const isConfetti = template !== 'purpura';
    const photoW = isConfetti ? '42%' : '179px';
    const photoR = isConfetti ? '50%' : '53%';
    return `
    <div style="position:relative;width:420px;flex-shrink:0;overflow:hidden;">
      <img style="width:100%;display:block;" src="${bgSrc}">
      <div style="position:absolute;top:20%;left:51%;transform:translateX(-50%);width:${photoW};aspect-ratio:1/1;border-radius:${photoR};overflow:hidden;">
        <img style="width:100%;height:100%;object-fit:cover;object-position:center top;" src="${fotoBase64}">
      </div>
      <div style="position:absolute;bottom:85px;left:50%;transform:translateX(-50%);width:55%;text-align:center;color:#dcdcdc;font-family:Arial,sans-serif;font-size:clamp(11px,3.8vw,16px);font-weight:800;letter-spacing:0.04em;line-height:1.3;white-space:normal;word-break:break-word;">${nombre}</div>
    </div>`;
  }).join('');

  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { display:flex; flex-direction:row; gap:8px; background:#0d0d1a; padding:0; margin:0; }
</style></head>
<body>${cardDivs}</body></html>`;
}

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

app.post('/render', async (req, res) => {
  const { nombre, foto_url, template = 'confetti' } = req.body;
  if (!nombre || !foto_url) return res.status(400).json({ error: 'Se requieren nombre y foto_url' });
  const bgSrc = BG[template] || BG.confetti;
  const nombreSafe = nombre.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const buildFn = TEMPLATES[template] || TEMPLATES.confetti;
  const fotoBase64 = await fetchImageAsBase64(foto_url);
  const html = buildFn(bgSrc, fotoBase64, nombreSafe);
  let page;
  try {
    const b = await getBrowser();
    page = await b.newPage();
    await page.setViewport({ width: 420, height: 800, deviceScaleFactor: 2 });
    await page.setContent(html, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.evaluate(() => Promise.all(Array.from(document.images).map(img =>
      img.complete ? Promise.resolve() : new Promise(r => { img.onload = img.onerror = r; })
    )));
    const card = await page.$('.card');
    const screenshot = await card.screenshot({ type: 'png' });
    res.set('Content-Type', 'image/png');
    res.set('Content-Disposition', 'attachment; filename="cumpleanos.png"');
    res.send(screenshot);
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    if (page) await page.close().catch(() => {});
  }
});

app.post('/render-batch', async (req, res) => {
  const { people } = req.body;
  if (!people?.length) return res.status(400).json({ error: 'Se requiere array people' });
  const cards = await Promise.all(people.map(async (p) => {
    const template = p.template || 'confetti';
    const bgSrc = BG[template] || BG.confetti;
    const fotoBase64 = p.foto_url ? await fetchImageAsBase64(p.foto_url) : '';
    const nombre = (p.nombre || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return { bgSrc, fotoBase64, nombre, template };
  }));
  const totalWidth = people.length * 420 + (people.length - 1) * 8;
  const html = buildCombinedHtml(cards);
  let page;
  try {
    const b = await getBrowser();
    page = await b.newPage();
    await page.setViewport({ width: totalWidth + 20, height: 800, deviceScaleFactor: 2 });
    await page.setContent(html, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.evaluate(() => Promise.all(Array.from(document.images).map(img =>
      img.complete ? Promise.resolve() : new Promise(r => { img.onload = img.onerror = r; })
    )));
    const bodyHeight = await page.evaluate(() => {
      const imgs = document.querySelectorAll('div[style*="position:relative"]');
      let maxH = 0;
      imgs.forEach(el => { if (el.offsetHeight > maxH) maxH = el.offsetHeight; });
      return maxH || document.body.scrollHeight;
    });
    const screenshot = await page.screenshot({
      type: 'png',
      clip: { x: 0, y: 0, width: totalWidth, height: bodyHeight }
    });
    res.set('Content-Type', 'image/png');
    res.set('Content-Disposition', 'attachment; filename="cumpleanos.png"');
    res.send(screenshot);
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    if (page) await page.close().catch(() => {});
  }
});

app.get('/health', (_req, res) =>
  res.json({ ok: true, templates: Object.keys(TEMPLATES), fondos: Object.fromEntries(Object.entries(BG).map(([k,v]) => [k, !!v])) })
);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🎂 Render service corriendo en puerto ${PORT}`));
