import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: 'new', args: ['--no-sandbox','--use-angle=d3d11','--enable-unsafe-swiftshader','--allow-file-access-from-files','--window-size=1280,760'] });
const page = await browser.newPage();
await page.setCacheEnabled(false);
await page.setViewport({ width: 1280, height: 760, deviceScaleFactor: 1 });
page.on('pageerror', e => console.log('[pageerror]', String(e).slice(0,200)));
await page.goto('file:///C:/Users/ASUS/Documents/Trae-CN/temp_20261108_01/fishing-duel/index.html?v=10', { waitUntil: 'load', timeout: 90000 });
await page.waitForFunction('window.game && window.game.world', { timeout: 60000 });
await new Promise(r => setTimeout(r, 4200));
await page.evaluate(() => document.getElementById('soloBtn').click());
await new Promise(r => setTimeout(r, 300));
await page.evaluate(() => document.getElementById('charNextBtn').click());
await new Promise(r => setTimeout(r, 300));
await page.evaluate(() => document.getElementById('fightBtn').click());
await new Promise(r => setTimeout(r, 2000));
await page.evaluate(() => { const g = window.game; g.state='playing'; ['pauseOverlay','startOverlay','charOverlay','weaponOverlay'].forEach(k=>{ if(g.ui[k]) g.ui[k].classList.add('hidden'); }); });
const shops = await page.evaluate(() => {
  const ww = window.game.world;
  return ['rodShop', 'chestShop', 'bagShop'].map(k => ww[k]).filter(Boolean).map(s => ({ x: s.x, z: s.z, r: s.r }));
});
console.log('SHOPS', JSON.stringify(shops));
const aim = async (from, look) => {
  await page.evaluate((c) => { const p = window.game.player; p.pos.set(c.from[0],c.from[1],c.from[2]); if(p.vel) p.vel.set(0,0,0); p.noGravity = true;
    const dx=c.look[0]-c.from[0], dy=c.look[1]-c.from[1], dz=c.look[2]-c.from[2]; const L=Math.hypot(dx,dz)||1;
    p.yaw=Math.atan2(-dx/L,-dz/L); p.pitch=Math.atan2(dy,L); }, { from, look });
  await new Promise(r => setTimeout(r, 800));
  await page.evaluate(() => { try { window.game.clearNotices(); } catch(e){} });
  await new Promise(r => setTimeout(r, 100));
};
for (let i = 0; i < Math.min(3, shops.length); i++) {
  const s = shops[i];
  // 从岛心方向看铺子：铺子正面朝外，所以从内侧的对面看
  const dx = s.x, dz = s.z; const L = Math.hypot(dx, dz) || 1;
  await aim([s.x - dx / L * 6.5, 2.6, s.z - dz / L * 6.5], [s.x, 1.8, s.z]);
  await page.screenshot({ path: `D:/下载/shop2/s${i}.png` });
}
await browser.close();
