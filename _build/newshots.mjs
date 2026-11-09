import puppeteer from 'puppeteer-core';
import fs from 'fs';
const OUT = 'D:/下载/new';
fs.mkdirSync(OUT, { recursive: true });
const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  headless: 'new',
  args: ['--no-sandbox', '--use-angle=d3d11', '--enable-unsafe-swiftshader',
    '--allow-file-access-from-files', '--window-size=1280,760']
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 760, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 300)));
page.on('console', (m) => { const t = m.text(); if (/\[(pond|lighthouse|cliffhut)\]|error/i.test(t)) console.log('>>', t.slice(0, 200)); });
await page.goto('file:///C:/Users/ASUS/Documents/Trae-CN/temp_20261108_01/fishing-duel/index.html', { waitUntil: 'load', timeout: 90000 });
await page.waitForFunction('window.game && window.game.world', { timeout: 60000 });
await new Promise(r => setTimeout(r, 4000));
await page.evaluate(() => document.getElementById('soloBtn').click());
await new Promise(r => setTimeout(r, 500));
await page.evaluate(() => document.getElementById('charNextBtn').click());
await new Promise(r => setTimeout(r, 500));
await page.evaluate(() => document.getElementById('fightBtn').click());
await new Promise(r => setTimeout(r, 2200));
await page.evaluate(() => {
  const g = window.game;
  g.state = 'playing';
  ['pauseOverlay', 'startOverlay', 'charOverlay', 'weaponOverlay'].forEach((k) => { if (g.ui[k]) g.ui[k].classList.add('hidden'); });
});
await new Promise(r => setTimeout(r, 1000));
const info = await page.evaluate(() => {
  const w = window.game.world;
  return { lighthouse: w.lighthouse, pond: w.pond, beds: (w.beds || []).length };
});
console.log('INFO', JSON.stringify(info));
const b = await page.evaluate(() => window.game.world.beds[0] || null);
const L2 = await page.evaluate(() => window.game.world.lighthouse);
console.log('BED', JSON.stringify(b), 'LH', JSON.stringify(L2));
// 站在屋子朝岛心一侧 9m 处看它
const rr0 = Math.hypot(b.x, b.z);
const inx = -b.x / rr0, inz = -b.z / rr0;   // 朝岛心
const shots = [
  ['hut_front', [b.x + inx * 8, 2.6, b.z + inz * 8], [b.x, 2.2, b.z]],
  ['hut_sea', [b.x - inx * 11, 3.4, b.z - inz * 11], [b.x, 3.0, b.z]],
  ['hut_side', [b.x + inx * 9 + 6, 4.5, b.z + inz * 9 - 5], [b.x, 2.2, b.z]],
  ['hut_top', [b.x + inx * 9, 12, b.z + inz * 9], [b.x, 2.0, b.z]],
  ['lh_from_shore', [L2.x * 0.55 + (-30) * 0.45, 3.0, L2.z * 0.55 + (-6) * 0.45], [L2.x, 6.0, L2.z]],
  ['lh_wide', [-12, 16, 14], [L2.x, 6.0, L2.z]],
  ['pond_noveg', [0.5, 6, 16], [0, 0, 0]]
];
for (const [name, from, look] of shots) {
  await page.evaluate((c) => {
    const p = window.game.player;
    p.pos.set(c.from[0], c.from[1], c.from[2]);
    if (p.vel) p.vel.set(0, 0, 0);
    p.noGravity = true;
    const dx = c.look[0] - c.from[0], dy = c.look[1] - c.from[1], dz = c.look[2] - c.from[2];
    const L = Math.hypot(dx, dz) || 1;
    p.yaw = Math.atan2(-dx / L, -dz / L);
    p.pitch = Math.atan2(dy, L);
  }, { from, look });
  await new Promise(r => setTimeout(r, 1100));
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log('shot', name);
}
await browser.close();
