import puppeteer from 'puppeteer-core';
import fs from 'fs';
const OUT = 'D:/下载/final2';
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
page.on('console', (m) => { const t = m.text(); if (/\[(lighthouse|cliffhut)\]/.test(t)) console.log('>>', t.slice(0, 160)); });
await page.goto('file:///C:/Users/ASUS/Documents/Trae-CN/temp_20261108_01/fishing-duel/index.html', { waitUntil: 'load', timeout: 90000 });
await page.waitForFunction('window.game && window.game.world', { timeout: 60000 });
await new Promise(r => setTimeout(r, 4500));
await page.evaluate(() => document.getElementById('soloBtn').click());
await new Promise(r => setTimeout(r, 400));
await page.evaluate(() => document.getElementById('charNextBtn').click());
await new Promise(r => setTimeout(r, 400));
await page.evaluate(() => document.getElementById('fightBtn').click());
await new Promise(r => setTimeout(r, 2200));
await page.evaluate(() => {
  const g = window.game;
  g.state = 'playing';
  ['pauseOverlay', 'startOverlay', 'charOverlay', 'weaponOverlay'].forEach((k) => { if (g.ui[k]) g.ui[k].classList.add('hidden'); });
});
const w = await page.evaluate(() => {
  const ww = window.game.world;
  return { bed: ww.beds[0], lh: ww.lighthouse };
});
console.log('WORLD', JSON.stringify(w));

const aim = async (from, look) => {
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
  await new Promise(r => setTimeout(r, 1000));
  await page.evaluate(() => { try { window.game.clearNotices(); } catch (e) {} });
  await new Promise(r => setTimeout(r, 120));
};

const b = w.bed, L = w.lh;
// 灯塔：站在岛的东岸边（离塔约 26m），塔身 17m 刚好撑满画面
const lhCam = [L.x + 12, 3.2, L.z - 23];
const lhLook = [L.x, 9.5, L.z];

console.log('LH', JSON.stringify(L));

await aim(lhCam, lhLook);
await page.screenshot({ path: `${OUT}/1_lighthouse_day.png` });

await aim([b.x + 6.6, 1.9, b.z + 4.2], [-39.0, 2.2, -10.3]);
await page.screenshot({ path: `${OUT}/2_hut_day.png` });

await aim([-8, 26, 30], [0, 0, -2]);
await page.screenshot({ path: `${OUT}/3_overview.png` });

// 夜
await page.evaluate(() => {
  const g = window.game;
  g.hour = 21.5;
  if (g.world.setDayTime) g.world.setDayTime(g.hour);
});
await new Promise(r => setTimeout(r, 1400));
await aim(lhCam, lhLook);
await page.screenshot({ path: `${OUT}/4_lighthouse_night.png` });
await aim([b.x + 6.6, 1.9, b.z + 4.2], [-39.0, 2.2, -10.3]);
await page.screenshot({ path: `${OUT}/5_hut_night.png` });

console.log('done');
await browser.close();
