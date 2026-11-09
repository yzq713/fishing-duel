import puppeteer from 'puppeteer-core';
import fs from 'fs';
const OUT = 'D:/下载/hut3';
fs.mkdirSync(OUT, { recursive: true });
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: 'new', args: ['--no-sandbox','--use-angle=d3d11','--enable-unsafe-swiftshader','--allow-file-access-from-files','--window-size=1280,760'] });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 760, deviceScaleFactor: 1 });
page.on('pageerror', e => console.log('[pageerror]', String(e).slice(0, 300)));
page.on('console', m => { const t = m.text(); if (/\[cliffhut\]/.test(t)) console.log('>>', t.slice(0, 220)); });
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
const w = await page.evaluate(() => { const ww = window.game.world; return { bed: ww.beds && ww.beds[0], shops: { bait: ww.baitShop, gun: ww.gunShop } }; });
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
// 站在内陆草坡上，正对门（门在屋身东侧，世界 -X 方向是海，所以从 +X 侧看）
await aim([b.x + 13.5, 3.0, b.z + 2.5], [b.x - 2, 2.2, b.z]);
await page.screenshot({ path: `${OUT}/1_front.png` });
// 站在海里往岸上看，检查体量和吊脚
await aim([b.x - 9, 1.6, b.z - 3], [b.x + 1, 3.0, b.z]);
await page.screenshot({ path: `${OUT}/2_sea.png` });
// 门口台阶
await aim([b.x + 8.4, 2.2, b.z + 3.2], [b.x + 2, 1.6, b.z]);
await page.screenshot({ path: `${OUT}/3_steps.png` });
// 进屋，站在门内看向床
await aim([b.x + 3.2, 2.65, b.z + 0.2], [b.x - 1.2, 1.9, b.z - 1.6]);
await page.screenshot({ path: `${OUT}/4_in.png` });
console.log('done');
await browser.close();
