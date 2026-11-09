import puppeteer from 'puppeteer-core';
import fs from 'fs';
const OUT = 'D:/下载/shopclose';
fs.mkdirSync(OUT, { recursive: true });
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: 'new', args: ['--no-sandbox','--use-angle=d3d11','--enable-unsafe-swiftshader','--allow-file-access-from-files','--window-size=1280,760'] });
const page = await browser.newPage();
await page.setCacheEnabled(false);
await page.setViewport({ width: 1280, height: 760, deviceScaleFactor: 1 });
await page.goto('file:///C:/Users/ASUS/Documents/Trae-CN/temp_20261108_01/fishing-duel/index.html?v=22', { waitUntil: 'load', timeout: 90000 });
await page.waitForFunction('window.game && window.game.world', { timeout: 60000 });
await new Promise(r => setTimeout(r, 5000));
await page.evaluate(() => document.getElementById('soloBtn').click());
await new Promise(r => setTimeout(r, 300));
await page.evaluate(() => document.getElementById('charNextBtn').click());
await new Promise(r => setTimeout(r, 300));
await page.evaluate(() => document.getElementById('fightBtn').click());
await new Promise(r => setTimeout(r, 2000));
await page.evaluate(() => { const g = window.game; g.state='playing'; ['pauseOverlay','startOverlay','charOverlay','weaponOverlay'].forEach(k=>{ if(g.ui[k]) g.ui[k].classList.add('hidden'); }); });
// 隐藏枪，避免挡视线
await page.evaluate(() => { const g = window.game; if (g.weaponView) g.weaponView.visible = false; if (g.viewModel) g.viewModel.visible = false; });
const shops = await page.evaluate(() => ['baitShop','gunShop'].map(k => ({ k, x: window.game.world[k].x, z: window.game.world[k].z })));
const aim = async (from, look) => {
  await page.evaluate((c) => { const p = window.game.player; p.pos.set(c.from[0],c.from[1],c.from[2]); if(p.vel) p.vel.set(0,0,0); p.noGravity = true;
    const dx=c.look[0]-c.from[0], dy=c.look[1]-c.from[1], dz=c.look[2]-c.from[2]; const L=Math.hypot(dx,dz)||1;
    p.yaw=Math.atan2(-dx/L,-dz/L); p.pitch=Math.atan2(dy,L); }, { from, look });
  await new Promise(r => setTimeout(r, 850));
  await page.evaluate(() => { try { window.game.clearNotices(); } catch(e){} });
  await new Promise(r => setTimeout(r, 100));
};
for (const s of shops) {
  const L = Math.hypot(s.x, s.z) || 1;
  const ux = -s.x / L, uz = -s.z / L;   // 朝岛心方向
  // 正面近景，仰视棚顶
  await aim([s.x + ux * 3.2, 2.0, s.z + uz * 3.2], [s.x, 2.9, s.z]);
  await page.screenshot({ path: `${OUT}/${s.k}_canopy.png` });
  // 招牌特写（招牌在局部 -X, +Z 侧）
  await aim([s.x + ux * 2.4, 1.55, s.z + uz * 2.4], [s.x, 1.6, s.z]);
  await page.screenshot({ path: `${OUT}/${s.k}_sign.png` });
}
await browser.close();
