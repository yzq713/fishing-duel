import puppeteer from 'puppeteer-core';
import fs from 'fs';
const OUT = 'D:/下载/shopfix';
fs.mkdirSync(OUT, { recursive: true });
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: 'new', args: ['--no-sandbox','--use-angle=d3d11','--enable-unsafe-swiftshader','--allow-file-access-from-files','--window-size=1280,760'] });
const page = await browser.newPage();
await page.setCacheEnabled(false);
await page.setViewport({ width: 1280, height: 760, deviceScaleFactor: 1 });
page.on('pageerror', e => console.log('[pageerror]', String(e).slice(0,250)));
await page.goto('file:///C:/Users/ASUS/Documents/Trae-CN/temp_20261108_01/fishing-duel/index.html?v=32', { waitUntil: 'load', timeout: 90000 });
await page.waitForFunction('window.game && window.game.world', { timeout: 60000 });
await new Promise(r => setTimeout(r, 5000));
await page.evaluate(() => document.getElementById('soloBtn').click());
await new Promise(r => setTimeout(r, 300));
await page.evaluate(() => document.getElementById('charNextBtn').click());
await new Promise(r => setTimeout(r, 300));
await page.evaluate(() => document.getElementById('fightBtn').click());
await new Promise(r => setTimeout(r, 2000));
await page.evaluate(() => { const g = window.game; g.state='playing'; ['pauseOverlay','startOverlay','charOverlay','weaponOverlay'].forEach(k=>{ if(g.ui[k]) g.ui[k].classList.add('hidden'); }); });
const shops = await page.evaluate(() => ['baitShop','gunShop','rodShop','chestShop','bagShop'].map(k => window.game.world[k] ? { k, x: window.game.world[k].x, z: window.game.world[k].z } : null).filter(Boolean));
const aim = async (from, look) => {
  await page.evaluate((c) => { const p = window.game.player; p.pos.set(c.from[0],c.from[1],c.from[2]); if(p.vel) p.vel.set(0,0,0); p.noGravity = true;
    const dx=c.look[0]-c.from[0], dy=c.look[1]-c.from[1], dz=c.look[2]-c.from[2]; const L=Math.hypot(dx,dz)||1;
    p.yaw=Math.atan2(-dx/L,-dz/L); p.pitch=Math.atan2(dy,L); }, { from, look });
  await new Promise(r => setTimeout(r, 800));
  await page.evaluate(() => { try { window.game.clearNotices(); } catch(e){} });
  await new Promise(r => setTimeout(r, 100));
};
for (const s of shops) {
  const L = Math.hypot(s.x, s.z) || 1;
  const ux = -s.x / L, uz = -s.z / L;
  await aim([s.x + ux * 4.2, 3.4, s.z + uz * 4.2], [s.x, 3.2, s.z]);
  await page.screenshot({ path: `${OUT}/${s.k}_a.png` });
  await aim([s.x + ux * 7.5, 2.6, s.z + uz * 7.5], [s.x, 2.0, s.z]);
  await page.screenshot({ path: `${OUT}/${s.k}_b.png` });
}
console.log('done');
await browser.close();
