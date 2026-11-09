import puppeteer from 'puppeteer-core';
import fs from 'fs';
const OUT = 'D:/下载/final3';
fs.mkdirSync(OUT, { recursive: true });
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: 'new', args: ['--no-sandbox','--use-angle=d3d11','--enable-unsafe-swiftshader','--allow-file-access-from-files','--window-size=1280,760'] });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 760, deviceScaleFactor: 1 });
await page.setCacheEnabled(false);
page.on('pageerror', e => console.log('[pageerror]', String(e).slice(0,250)));
page.on('console', m => { const t = m.text(); if (/\[(cliffhut|lighthouse)\]/.test(t)) console.log('>>', t.slice(0,180)); });
await page.goto('file:///C:/Users/ASUS/Documents/Trae-CN/temp_20261108_01/fishing-duel/index.html?v=9', { waitUntil: 'load', timeout: 90000 });
await page.waitForFunction('window.game && window.game.world', { timeout: 60000 });
await new Promise(r => setTimeout(r, 4200));
await page.evaluate(() => document.getElementById('soloBtn').click());
await new Promise(r => setTimeout(r, 300));
await page.evaluate(() => document.getElementById('charNextBtn').click());
await new Promise(r => setTimeout(r, 300));
await page.evaluate(() => document.getElementById('fightBtn').click());
await new Promise(r => setTimeout(r, 2000));
await page.evaluate(() => { const g = window.game; g.state='playing'; ['pauseOverlay','startOverlay','charOverlay','weaponOverlay'].forEach(k=>{ if(g.ui[k]) g.ui[k].classList.add('hidden'); }); });
const w = await page.evaluate(() => { const ww = window.game.world; return { bed: ww.beds[0], shops: ww.shopSpots || null }; });
const b = w.bed;
const aim = async (from, look) => {
  await page.evaluate((c) => { const p = window.game.player; p.pos.set(c.from[0],c.from[1],c.from[2]); if(p.vel) p.vel.set(0,0,0); p.noGravity = true;
    const dx=c.look[0]-c.from[0], dy=c.look[1]-c.from[1], dz=c.look[2]-c.from[2]; const L=Math.hypot(dx,dz)||1;
    p.yaw=Math.atan2(-dx/L,-dz/L); p.pitch=Math.atan2(dy,L); }, { from, look });
  await new Promise(r => setTimeout(r, 850));
  await page.evaluate(() => { try { window.game.clearNotices(); } catch(e){} });
  await new Promise(r => setTimeout(r, 100));
};
// 1 外观（门口正对）
await aim([b.x + 14.5, 3.1, b.z + 2.2], [b.x - 2.4, 2.2, b.z - 0.2]);
await page.screenshot({ path: `${OUT}/1_house.png` });
// 2 从门内看屋里
await aim([b.x + 4.6, 2.55, b.z + 0.1], [b.x - 3.0, 1.6, b.z - 1.5]);
await page.screenshot({ path: `${OUT}/2_room.png` });
// 3 屋里回看门口
await aim([b.x - 3.8, 2.7, b.z + 2.2], [b.x + 3.0, 1.9, b.z - 0.6]);
await page.screenshot({ path: `${OUT}/3_room_back.png` });
// 4 夜景
await page.evaluate(() => { const g = window.game; g.hour = 21.3; if (g.world.setDayTime) g.world.setDayTime(g.hour); });
await new Promise(r => setTimeout(r, 1300));
await aim([b.x + 14.5, 3.1, b.z + 2.2], [b.x - 2.4, 2.2, b.z - 0.2]);
await page.screenshot({ path: `${OUT}/4_night.png` });
await aim([b.x + 4.6, 2.55, b.z + 0.1], [b.x - 3.0, 1.6, b.z - 1.5]);
await page.screenshot({ path: `${OUT}/5_night_room.png` });
console.log('done');
await browser.close();
