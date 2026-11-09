import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  headless: 'new',
  args: ['--no-sandbox', '--use-angle=d3d11', '--enable-unsafe-swiftshader',
    '--allow-file-access-from-files', '--window-size=1280,760']
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 760 });
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 200)));
await page.goto('file:///C:/Users/ASUS/Documents/Trae-CN/temp_20261108_01/fishing-duel/index.html', { waitUntil: 'load', timeout: 90000 });
await page.waitForFunction('window.game && window.game.world', { timeout: 60000 });
await new Promise(r => setTimeout(r, 4500));
await page.evaluate(() => document.getElementById('soloBtn').click());
await new Promise(r => setTimeout(r, 400));
await page.evaluate(() => document.getElementById('charNextBtn').click());
await new Promise(r => setTimeout(r, 400));
await page.evaluate(() => document.getElementById('fightBtn').click());
await new Promise(r => setTimeout(r, 2000));
await page.evaluate(() => {
  const g = window.game;
  g.state = 'playing';
  ['pauseOverlay', 'startOverlay', 'charOverlay', 'weaponOverlay'].forEach((k) => { if (g.ui[k]) g.ui[k].classList.add('hidden'); });
  g.hour = 21.0;
  if (g.world.setDayTime) g.world.setDayTime(g.hour);
});
await new Promise(r => setTimeout(r, 1200));
const L = await page.evaluate(() => window.game.world.lighthouse);
const pos = [[6, 3, 30], [-4, 3, 26], [12, 2.2, 34]];
for (let i = 0; i < pos.length; i++) {
  await page.evaluate((c) => {
    const p = window.game.player;
    p.pos.set(c.from[0], c.from[1], c.from[2]);
    if (p.vel) p.vel.set(0, 0, 0);
    p.noGravity = true;
    const dx = c.look[0] - c.from[0], dy = c.look[1] - c.from[1], dz = c.look[2] - c.from[2];
    const L2 = Math.hypot(dx, dz) || 1;
    p.yaw = Math.atan2(-dx / L2, -dz / L2);
    p.pitch = Math.atan2(dy, L2);
  }, { from: pos[i], look: [L.x, 9, L.z] });
  await new Promise(r => setTimeout(r, 1000));
  await page.screenshot({ path: `D:/下载/final/lhn${i}.png` });
  console.log('shot', i);
}
await browser.close();
