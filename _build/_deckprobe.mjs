import puppeteer from 'puppeteer-core';
const V = Date.now();
const ROOT = 'file:///C:/Users/ASUS/Documents/Trae-CN/temp_20261108_01/fishing-duel/';
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: 'new', args: ['--no-sandbox','--use-angle=d3d11','--enable-unsafe-swiftshader','--allow-file-access-from-files'] });
const page = await browser.newPage();
await page.setViewport({ width: 1000, height: 640 });
await page.goto(ROOT + 'index.html?v=' + V, { waitUntil: 'load', timeout: 120000 });
await page.waitForFunction('window.game && window.game.world', { timeout: 90000 });
await new Promise(r => setTimeout(r, 2500));
const out = await page.evaluate(() => {
  const w = window.game.world;
  const rows = [];
  for (let k = 0; k < 24; k++) {
    const a = -0.5 + k * (Math.PI * 2 / 24);
    const rr = w.pondRadiusAt(a) + 2.3;
    const x = Math.cos(a) * rr, z = Math.sin(a) * rr;
    const h = w.heightAt(x, z);
    let hmin = 1e9, hmax = -1e9;
    for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) {
      const hh = w.heightAt(x + i * 1.14, z + j * 0.75);
      hmin = Math.min(hmin, hh); hmax = Math.max(hmax, hh);
    }
    let nd = 1e9;
    for (const c of w.colliders) {
      const nx = Math.max(c.minX, Math.min(x, c.maxX));
      const nz = Math.max(c.minZ, Math.min(z, c.maxZ));
      nd = Math.min(nd, Math.hypot(x - nx, z - nz));
    }
    rows.push({ a: +a.toFixed(2), x: +x.toFixed(1), z: +z.toFixed(1), h: +h.toFixed(2), spread: +(hmax - hmin).toFixed(2), hmax: +hmax.toFixed(2), near: +nd.toFixed(2) });
  }
  return rows;
});
console.log(out.map(r => JSON.stringify(r)).join('\n'));
await browser.close();
