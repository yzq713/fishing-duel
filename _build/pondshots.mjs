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
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 300)));
page.on('console', (m) => { if (m.type() === 'error') console.log('[console]', m.text().slice(0, 200)); });

await page.goto(URL, { waitUntil: 'load', timeout: 60000 });
await page.waitForFunction('window.game && window.game.world', { timeout: 40000 });
await new Promise(r => setTimeout(r, 3000));

await page.evaluate(() => document.getElementById('soloBtn').click());
await new Promise(r => setTimeout(r, 700));
await page.evaluate(() => document.getElementById('charNextBtn').click());
await new Promise(r => setTimeout(r, 700));
await page.evaluate(() => document.getElementById('fightBtn').click());
await new Promise(r => setTimeout(r, 2200));

await page.evaluate(() => {
  const g = window.game;
  g.state = 'playing';
  g.locked = true;
  ['pauseOverlay', 'startOverlay', 'charOverlay', 'weaponOverlay'].forEach((k) => {
    if (g.ui[k]) g.ui[k].classList.add('hidden');
  });
});
await new Promise(r => setTimeout(r, 1200));
console.log('state:', await page.evaluate(() => window.game.state));

// 湖的现场数据
console.log(await page.evaluate(() => {
  const w = window.game.world;
  return JSON.stringify({
    pond: w.pond, top: w.pondTopY,
    shops: ['baitShop', 'gunShop', 'rodShop', 'chestShop', 'bagShop'].map((k) => (w[k] ? [k, +w[k].x.toFixed(1), +w[k].z.toFixed(1)] : [k, null]))
  });
}));

// 先拍白天，再切夜里补一张，确认水面没被压死
const shots = [
  // 站在湖东岸，朝湖心平视
  ['pondA', { from: [19, 0.6, 6], look: [0, 0, 0] }],
  // 从西岸看，斜角度
  ['pondB', { from: [-17, 1.2, -9], look: [2, 0, 2] }],
  // 贴水面低角度，看白沫与荷叶
  ['pondC', { from: [13.5, 0.25, -2], look: [0, 0.1, 0] }],
  // 高空俯瞰整个岛
  ['pondTop', { from: [0, 34, 30], look: [0, 0, 0] }]
];

for (const [name, cfg] of shots) {
  await page.evaluate((c) => {
    const g = window.game, p = g.player;
    p.pos.set(c.from[0], c.from[1], c.from[2]);
    if (p.vel) p.vel.set(0, 0, 0);
    p.noGravity = true;
    const dx = c.look[0] - c.from[0], dy = c.look[1] - c.from[1], dz = c.look[2] - c.from[2];
    const L = Math.hypot(dx, dz) || 1;
    p.yaw = Math.atan2(-dx / L, -dz / L);
    p.pitch = Math.atan2(dy, L);
  }, cfg);
  await new Promise(r => setTimeout(r, 1300));
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log('shot', name);
}


// 夜间：确认新水色在夜色下不会发黑
await page.evaluate(() => {
  const g = window.game, p = g.player;
  g.hour = 21.5;
  if (g.world.setDayTime) g.world.setDayTime(g.hour);
  p.pos.set(19, 0.6, 6);
  if (p.vel) p.vel.set(0, 0, 0);
  p.noGravity = true;
  const dx = -19, dz = -6, L = Math.hypot(dx, dz);
  p.yaw = Math.atan2(-dx / L, -dz / L);
  p.pitch = -0.12;
});
await new Promise(r => setTimeout(r, 1500));
await page.screenshot({ path: `${OUT}/pondNight.png` });
console.log('shot pondNight');

await browser.close();
