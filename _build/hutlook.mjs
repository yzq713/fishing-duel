import puppeteer from 'puppeteer-core';
import fs from 'fs';
const OUT = 'D:/下载/hut2';
fs.mkdirSync(OUT, { recursive: true });
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: 'new', args: ['--no-sandbox','--use-angle=d3d11','--enable-unsafe-swiftshader','--allow-file-access-from-files','--window-size=1280,760'] });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 760, deviceScaleFactor: 1 });
page.on('pageerror', e => console.log('[pageerror]', String(e).slice(0, 300)));
page.on('console', m => { const t = m.text(); if (/\[(lighthouse|cliffhut)\]/.test(t)) console.log('>>', t.slice(0, 200)); });
await page.goto('file:///C:/Users/ASUS/Documents/Trae-CN/temp_20261108_01/fishing-duel/index.html', { waitUntil: 'load', timeout: 90000 });
await page.waitForFunction('window.game && window.game.world', { timeout: 60000 });
await new Promise(r => setTimeout(r, 4500));
await page.evaluate(() => document.getElementById('soloBtn').click());
await new Promise(r => setTimeout(r, 300));
await page.evaluate(() => document.getElementById('charNextBtn').click());
await new Promise(r => setTimeout(r, 300));
await page.evaluate(() => document.getElementById('fightBtn').click());
await new Promise(r => setTimeout(r, 2000));
await page.evaluate(() => { const g = window.game; g.state='playing'; ['pauseOverlay','startOverlay','charOverlay','weaponOverlay'].forEach(k=>{ if(g.ui[k]) g.ui[k].classList.add('hidden'); }); });
const w = await page.evaluate(() => { const ww = window.game.world; return { bed: ww.beds && ww.beds[0] }; });
console.log('WORLD', JSON.stringify(w));
const b = w.bed;
const aim = async (from, look) => {
  await page.evaluate((c) => {
    const p = window.game.player;
    p.pos.set(c.from[0], c.from[1], c.from[2]);
    if (p.vel) p.vel.set(0,0,0);
    p.noGravity = true;
    const dx = c.look[0]-c.from[0], dy = c.look[1]-c.from[1], dz = c.look[2]-c.from[2];
    const L = Math.hypot(dx,dz)||1;
    p.yaw = Math.atan2(-dx/L, -dz/L); p.pitch = Math.atan2(dy, L);
  }, { from, look });
  await new Promise(r => setTimeout(r, 900));
  await page.evaluate(() => { try { window.game.clearNotices(); } catch(e){} });
  await new Promise(r => setTimeout(r, 120));
};
if (b) {
  // 站在草地上朝房子看
  await aim([b.x + 16, 2.2, b.z + 6], [b.x - 1, 2.6, b.z]);
  await page.screenshot({ path: `${OUT}/1_outside.png` });
  // 走到门口
  await aim([b.x + 7.2, 2.4, b.z + 0.4], [b.x, 2.2, b.z]);
  await page.screenshot({ path: `${OUT}/2_door.png` });
  // 屋里
  await aim([b.x + 1.2, 2.6, b.z + 1.0], [b.x - 2.5, 1.8, b.z - 1.2]);
  await page.screenshot({ path: `${OUT}/3_inside.png` });
  // 侧面看比例
  await aim([b.x + 4, 2.0, b.z + 14], [b.x + 4, 2.4, b.z]);
  await page.screenshot({ path: `${OUT}/4_side.png` });
}
console.log('done');
await browser.close();
