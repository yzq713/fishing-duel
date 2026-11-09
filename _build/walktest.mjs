import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: 'new', args: ['--no-sandbox','--use-angle=d3d11','--enable-unsafe-swiftshader','--allow-file-access-from-files','--window-size=1280,760'] });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 760, deviceScaleFactor: 1 });
page.on('pageerror', e => console.log('[pageerror]', String(e).slice(0,200)));
await page.goto('file:///C:/Users/ASUS/Documents/Trae-CN/temp_20261108_01/fishing-duel/index.html', { waitUntil: 'load', timeout: 90000 });
await page.waitForFunction('window.game && window.game.world', { timeout: 60000 });
await new Promise(r => setTimeout(r, 4200));
await page.evaluate(() => document.getElementById('soloBtn').click());
await new Promise(r => setTimeout(r, 300));
await page.evaluate(() => document.getElementById('charNextBtn').click());
await new Promise(r => setTimeout(r, 300));
await page.evaluate(() => document.getElementById('fightBtn').click());
await new Promise(r => setTimeout(r, 2000));
await page.evaluate(() => { const g = window.game; g.state='playing'; ['pauseOverlay','startOverlay','charOverlay','weaponOverlay'].forEach(k=>{ if(g.ui[k]) g.ui[k].classList.add('hidden'); }); });
const b = await page.evaluate(() => window.game.world.beds[0]);
console.log('bed', JSON.stringify(b));
// 站到台阶东侧 3m，面朝房子（世界 -X）
const start = await page.evaluate((bb) => {
  const g = window.game, p = g.player;
  p.pos.set(bb.x + 12.0, 2.0, bb.z + 1.62);
  if (p.vel) p.vel.set(0,0,0);
  p.yaw = Math.atan2(1, 0);   // 朝 -X
  p.noGravity = false;
  return { x: p.pos.x, y: p.pos.y, z: p.pos.z };
}, b);
console.log('start', JSON.stringify(start));
await page.keyboard.down('KeyW');
const path = [];
for (let i = 0; i < 12; i++) {
  await new Promise(r => setTimeout(r, 400));
  path.push(await page.evaluate(() => { const p = window.game.player; return [+p.pos.x.toFixed(2), +p.pos.y.toFixed(2), +p.pos.z.toFixed(2)]; }));
}
await page.keyboard.up('KeyW');
console.log('path', JSON.stringify(path));
await page.screenshot({ path: 'D:/下载/hut3/7_walked_in.png' });
// 到床边按 F 睡觉
const near = await page.evaluate((bb) => {
  const p = window.game.player;
  return { d: Math.hypot(p.pos.x - bb.x, p.pos.z - bb.z), hour: window.game.hour };
}, b);
console.log('near bed', JSON.stringify(near));
await page.keyboard.press('KeyF');
await new Promise(r => setTimeout(r, 1200));
console.log('after F', JSON.stringify(await page.evaluate(() => ({ hour: +window.game.hour.toFixed(2), sleeping: window.game.sleeping }))));
await page.screenshot({ path: 'D:/下载/hut3/8_sleep.png' });
await browser.close();
