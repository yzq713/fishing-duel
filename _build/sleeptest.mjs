import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  headless: 'new',
  args: ['--no-sandbox', '--use-angle=d3d11', '--enable-unsafe-swiftshader',
    '--allow-file-access-from-files', '--window-size=1280,760']
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 760 });
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 300)));
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
const b = await page.evaluate(() => window.game.world.beds[0]);
// 站到床边
await page.evaluate((bed) => {
  const p = window.game.player;
  const r = Math.hypot(bed.x, bed.z);
  const ix = -bed.x / r, iz = -bed.z / r;
  p.pos.set(bed.x + ix * 1.3, 0.9, bed.z + iz * 1.3);
  if (p.vel) p.vel.set(0, 0, 0);
  p.noGravity = true;
  p.yaw = Math.atan2(-(bed.x - p.pos.x), -(bed.z - p.pos.z));
  p.pitch = -0.25;
}, b);
await new Promise(r => setTimeout(r, 1200));
const before = await page.evaluate(() => ({ hour: window.game.hour, sleeping: !!window.game.sleeping }));
// 拉近看牌子
await page.screenshot({ path: 'D:/下载/final/g_hut_close.png' });
await page.keyboard.press('KeyF');
await new Promise(r => setTimeout(r, 900));
const mid = await page.evaluate(() => ({ hour: +window.game.hour.toFixed(2), sleeping: !!window.game.sleeping, prompt: (document.querySelector('.promptHint, #promptHint, .hint') || {}).textContent }));
console.log('before', JSON.stringify(before));
console.log('after F', JSON.stringify(mid));
await new Promise(r => setTimeout(r, 2500));
const after = await page.evaluate(() => ({ hour: +window.game.hour.toFixed(2), sleeping: !!window.game.sleeping }));
console.log('later', JSON.stringify(after));
await browser.close();
