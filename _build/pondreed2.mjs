// 只留芦苇，其他全隐藏，从两个角度看这一片，确认那条"长条"是什么。
import puppeteer from 'puppeteer-core';

const URL = 'file:///C:/Users/ASUS/Documents/Trae-CN/temp_20261108_01/fishing-duel/index.html';
const OUT = 'D:/下载/fab/game';

const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  headless: 'new',
  args: ['--no-sandbox', '--use-angle=d3d11', '--enable-unsafe-swiftshader',
    '--allow-file-access-from-files', '--window-size=1280,760']
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 760, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 300)));
await page.goto(URL, { waitUntil: 'load', timeout: 60000 });
await page.waitForFunction('window.game && window.game.world', { timeout: 40000 });
await new Promise(r => setTimeout(r, 3000));
await page.evaluate(() => document.getElementById('soloBtn').click());
await new Promise(r => setTimeout(r, 500));
await page.evaluate(() => document.getElementById('charNextBtn').click());
await new Promise(r => setTimeout(r, 500));
await page.evaluate(() => document.getElementById('fightBtn').click());
await new Promise(r => setTimeout(r, 2000));
await page.evaluate(() => {
  const g = window.game;
  g.state = 'playing';
  ['pauseOverlay', 'startOverlay', 'charOverlay', 'weaponOverlay'].forEach((k) => {
    if (g.ui[k]) g.ui[k].classList.add('hidden');
  });
});

// 只留芦苇 + 天空，其余 mesh 全隐藏
await page.evaluate(() => {
  const g = window.game;
  let reeds = null;
  g.scene.traverse((o) => { if (!reeds && o.isInstancedMesh && o.count === 140) reeds = o; });
  window.__reeds = reeds;
  g.scene.traverse((o) => { if (o.isMesh && o !== reeds) o.visible = false; });
});

const views = [
  ['r_fish', [0.5, 5.5, 7], [0, -1.2, 0]],
  ['r_side', [-1.2, 1.2, 12.5], [-1.0, 0.4, 9.2]],
  ['r_top', [-1.0, 6.0, 10.0], [-1.0, 0, 9.2]]
];
for (const [name, from, look] of views) {
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
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log('shot', name);
}
await browser.close();
