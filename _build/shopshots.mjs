import puppeteer from 'puppeteer-core';
import fs from 'fs';

const URL = 'file:///C:/Users/ASUS/Documents/Trae-CN/temp_20261108_01/fishing-duel/index.html';
const OUT = 'D:/下载/fab/game';
fs.mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  headless: 'new',
  args: ['--no-sandbox', '--use-angle=d3d11', '--enable-unsafe-swiftshader',
    '--allow-file-access-from-files', '--window-size=1280,760']
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 760, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 260)));

await page.goto(URL, { waitUntil: 'load', timeout: 60000 });
await page.waitForFunction('window.game && window.game.world', { timeout: 40000 });
await new Promise(r => setTimeout(r, 3000));

await page.evaluate(() => document.getElementById('soloBtn').click());
await new Promise(r => setTimeout(r, 800));
await page.evaluate(() => document.getElementById('charNextBtn').click());
await new Promise(r => setTimeout(r, 800));
await page.evaluate(() => document.getElementById('fightBtn').click());
await new Promise(r => setTimeout(r, 2500));

// headless 下拿不到 pointer lock，手动把状态推到 playing
await page.evaluate(() => {
  const g = window.game;
  g.state = 'playing';
  g.locked = true;
  if (g.ui.pauseOverlay) g.ui.pauseOverlay.classList.add('hidden');
  if (g.ui.startOverlay) g.ui.startOverlay.classList.add('hidden');
  if (g.ui.charOverlay) g.ui.charOverlay.classList.add('hidden');
  if (g.ui.weaponOverlay) g.ui.weaponOverlay.classList.add('hidden');
});
await new Promise(r => setTimeout(r, 1200));
console.log('state:', await page.evaluate(() => window.game.state));

const shots = [
  ['overview', null],
  ['baitShop', 'baitShop'], ['gunShop', 'gunShop'], ['rodShop', 'rodShop'],
  ['chestShop', 'chestShop'], ['bagShop', 'bagShop']
];
for (const [name, key] of shots) {
  if (key) {
    await page.evaluate((k) => {
      const g = window.game, s = g.world[k], p = g.player;
      // 站在店面正前方 11 米、偏 3 米（斜着看，避开正前方的场景杂物）
      const ang = Math.atan2(s.z, s.x);
      const px = s.x - Math.cos(ang) * 13 + Math.sin(ang) * 1.5;
      const pz = s.z - Math.sin(ang) * 13 - Math.cos(ang) * 1.5;
      p.pos.set(px, 3.2, pz);
      if (p.vel) p.vel.set(0, 0, 0);
      const dx = s.x - px, dz = s.z - pz, L = Math.hypot(dx, dz) || 1;
      p.yaw = Math.atan2(-dx / L, -dz / L);
      p.pitch = 0.02;
    }, key);
  } else {
    // 高空俯瞰村子
    await page.evaluate(() => {
      const g = window.game, s = g.world.baitShop, p = g.player;
      p.pos.set(s.x * 1.35, 22, s.z * 1.35);
      if (p.vel) p.vel.set(0, 0, 0);
      const dx = -p.pos.x, dz = -p.pos.z, L = Math.hypot(dx, dz) || 1;
      p.yaw = Math.atan2(-dx / L, -dz / L);
      p.pitch = -0.5;
      p.noGravity = true;
    });
  }
  await new Promise(r => setTimeout(r, 1400));
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log('shot', name);
}
await browser.close();
