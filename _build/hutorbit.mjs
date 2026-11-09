import puppeteer from 'puppeteer-core';
import fs from 'fs';
const OUT = 'D:/下载/new';
fs.mkdirSync(OUT, { recursive: true });
const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  headless: 'new',
  args: ['--no-sandbox', '--use-angle=d3d11', '--enable-unsafe-swiftshader', '--allow-file-access-from-files']
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 760 });
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 200)));
await page.goto('file:///C:/Users/ASUS/Documents/Trae-CN/temp_20261108_01/fishing-duel/index.html', { waitUntil: 'load', timeout: 90000 });
await page.waitForFunction('window.game && window.game.world', { timeout: 60000 });
await new Promise(r => setTimeout(r, 4000));
await page.evaluate(() => document.getElementById('soloBtn').click());
await new Promise(r => setTimeout(r, 400));
await page.evaluate(() => document.getElementById('charNextBtn').click());
await new Promise(r => setTimeout(r, 400));
await page.evaluate(() => document.getElementById('fightBtn').click());
await new Promise(r => setTimeout(r, 2000));
await page.evaluate(() => {
  const g = window.game;
  g.state = 'playing';
  ['pauseOverlay', 'startOverlay', 'charOverlay', 'weaponOverlay'].forEach((k) => { if (g.ui[k]) g.ui[k].classList.add('hidden'); });
});
const c = await page.evaluate(() => window.game.world.beds[0]);
for (let i = 0; i < 4; i++) {
  const a = (i / 4) * Math.PI * 2 + 0.4;
  await page.evaluate((p) => {
    const pl = window.game.player;
    pl.pos.set(p.x, p.y, p.z);
    if (pl.vel) pl.vel.set(0, 0, 0);
    pl.noGravity = true;
    const dx = p.tx - p.x, dy = p.ty - p.y, dz = p.tz - p.z;
    const L = Math.hypot(dx, dz) || 1;
    pl.yaw = Math.atan2(-dx / L, -dz / L);
    pl.pitch = Math.atan2(dy, L);
  }, { x: c.x + Math.cos(a) * 13, y: 5.5, z: c.z + Math.sin(a) * 13, tx: c.x, ty: 2.2, tz: c.z });
  await new Promise(r => setTimeout(r, 900));
  await page.screenshot({ path: `${OUT}/orbit${i}.png` });
  console.log('orbit', i);
}
await browser.close();
