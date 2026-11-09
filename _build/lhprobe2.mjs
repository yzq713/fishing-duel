import puppeteer from 'puppeteer-core';

const V = Date.now();
const ROOT = 'file:///C:/Users/ASUS/Documents/Trae-CN/temp_20261108_01/fishing-duel/';
const OUT = 'D:/下载/fishprobe/';
const errs = [];
const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  headless: 'new',
  args: ['--no-sandbox', '--use-angle=d3d11', '--enable-unsafe-swiftshader',
    '--allow-file-access-from-files', '--window-size=1280,760']
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 760 });
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
await page.goto(ROOT + 'index.html?v=' + V, { waitUntil: 'load', timeout: 120000 });
await page.waitForFunction('window.game && window.game.world', { timeout: 90000 });
await new Promise((r) => setTimeout(r, 2500));
await page.evaluate(() => document.getElementById('soloBtn').click());
await new Promise((r) => setTimeout(r, 400));
await page.evaluate(() => document.getElementById('charNextBtn').click());
await new Promise((r) => setTimeout(r, 300));
await page.evaluate(() => document.getElementById('fightBtn').click());
await new Promise((r) => setTimeout(r, 2500));

const info = await page.evaluate(() => {
  const g = window.game;
  g.state = 'playing';
  ['pauseOverlay', 'startOverlay', 'charOverlay', 'weaponOverlay'].forEach((k) => { if (g.ui[k]) g.ui[k].classList.add('hidden'); });
  const L = g.world.lighthouse;
  return { L, r: Math.hypot(L.x, L.z), islandR: g.world.islandRadiusAt(Math.atan2(L.z, L.x)) };
});
console.log(JSON.stringify(info));

async function shoot(tag, cam, hour, wait) {
  await page.evaluate((c) => {
    const g = window.game;
    g.hour = c.hour;
    if (g.world.setDayTime) g.world.setDayTime(c.hour);
    const p = g.player;
    p.pos.set(c.from[0], c.from[1], c.from[2]);
    if (p.vel) p.vel.set(0, 0, 0);
    p.noGravity = true;
    const dx = c.look[0] - c.from[0], dy = c.look[1] - c.from[1], dz = c.look[2] - c.from[2];
    const L2 = Math.hypot(dx, dz) || 1;
    p.yaw = Math.atan2(-dx / L2, -dz / L2);
    p.pitch = Math.atan2(dy, L2);
  }, { ...cam, hour });
  await new Promise((r) => setTimeout(r, wait || 1200));
  await page.screenshot({ path: OUT + tag + '.png' });
  console.log('shot', tag);
}

const L = info.L;
const ux = L.x / info.r, uz = L.z / info.r;
const ix = -ux, iz = -uz;   // 指向岛内的反方向（外海）

// 1) 岸上白天
await shoot('lh2_shore_day', {
  from: [ux * (info.islandR + 2), 3.4, uz * (info.islandR + 2)], look: [L.x, 9, L.z]
}, 10.6);
// 2) 水线白天近景
await shoot('lh2_water_day', {
  from: [L.x + ix * 20, 1.4, L.z + iz * 20], look: [L.x, 4.0, L.z]
}, 11.2);
// 3) 岸上夜里
await shoot('lh2_shore_night', {
  from: [ux * (info.islandR + 2), 3.4, uz * (info.islandR + 2)], look: [L.x, 9, L.z]
}, 21.0, 1600);
// 4) 海上回望（能看到水面光斑）
await shoot('lh2_sea_night', {
  from: [L.x + ix * 34, 2.2, L.z + iz * 34], look: [L.x, 7, L.z]
}, 21.0, 2600);
// 5) 高空俯视（看水面光斑与礁石轮廓）
await shoot('lh2_top_night', {
  from: [L.x + 6, 46, L.z + 16], look: [L.x + 4, 0, L.z - 8]
}, 21.0, 3400);
// 6) 远看整座塔（礁石与海面）
await shoot('lh2_far_night', {
  from: [ux * (info.islandR - 6), 8, uz * (info.islandR - 6)], look: [L.x, 6, L.z]
}, 21.4, 4200);

console.log('ERRS ' + errs.length + (errs.length ? ' :: ' + errs.slice(0, 4).join(' | ') : ''));
await browser.close();
