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
page.on('console', (m) => { const t = m.text(); if (t.includes('[pond]') || m.type() === 'error') console.log(t.slice(0, 200)); });

await page.goto(URL, { waitUntil: 'load', timeout: 60000 });
await page.waitForFunction('window.game && window.game.world', { timeout: 40000 });
await new Promise(r => setTimeout(r, 3000));
await page.evaluate(() => document.getElementById('soloBtn').click());
await new Promise(r => setTimeout(r, 600));
await page.evaluate(() => document.getElementById('charNextBtn').click());
await new Promise(r => setTimeout(r, 600));
await page.evaluate(() => document.getElementById('fightBtn').click());
await new Promise(r => setTimeout(r, 2200));
await page.evaluate(() => {
  const g = window.game;
  g.state = 'playing';
  ['pauseOverlay', 'startOverlay', 'charOverlay', 'weaponOverlay'].forEach((k) => {
    if (g.ui[k]) g.ui[k].classList.add('hidden');
  });
});
await new Promise(r => setTimeout(r, 1200));

// 试几种方式把手中的枪藏掉
const hid = await page.evaluate(() => {
  const g = window.game, p = g.player;
  const keys = Object.keys(p).filter((k) => /weapon|gun|view/i.test(k));
  keys.forEach((k) => {
    const v = p[k];
    if (v && v.isObject3D) v.visible = false;
  });
  return keys;
});
console.log('hid:', JSON.stringify(hid));

const shots = [
  ['dbg_top', { from: [0.1, 30, 25], look: [0, 0, 0] }],
  ['dbg_45', { from: [24, 12, 20], look: [0, 0, 0] }],
  ['dbg_edge', { from: [3, 1.6, 15], look: [0, 0.2, 0] }],
  ['dbg_near', { from: [-9, 1.6, 12], look: [-6, 0.4, 6] }],
  ['dbg_fish', { from: [0.5, 5.5, 7], look: [0, -1.2, 0] }]
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
  await new Promise(r => setTimeout(r, 1200));
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log('shot', name);
}
await browser.close();
