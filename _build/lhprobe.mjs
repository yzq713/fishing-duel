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
  const r = Math.hypot(L.x, L.z);
  return { L, r, islandR: g.world.islandRadiusAt(Math.atan2(L.z, L.x)) };
});
console.log(JSON.stringify(info));

async function shoot(tag, cam, hour) {
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
    if (c.fov && g.camera) { g.camera.fov = c.fov; g.camera.updateProjectionMatrix(); }
  }, { ...cam, hour });
  await new Promise((r) => setTimeout(r, 1300));
  await page.screenshot({ path: OUT + tag + '.png' });
  console.log('shot', tag);
}

const L = info.L;
const dirx = L.x / info.r, dirz = L.z / info.r;
// 从岸上看向灯塔
await shoot('lh_shore_day', {
  from: [dirx * (info.islandR + 2), 3.2, dirz * (info.islandR + 2)],
  look: [L.x, 9, L.z], fov: 55
}, 10.5);
// 近岸低角度看礁石与水线
await shoot('lh_rocks_day', {
  from: [L.x - dirx * 24, 1.6, L.z - dirz * 24],
  look: [L.x, 3.2, L.z], fov: 55
}, 11.0);
// 夜间全景（看有没有光）
await shoot('lh_shore_night', {
  from: [dirx * (info.islandR + 2), 3.2, dirz * (info.islandR + 2)],
  look: [L.x, 9, L.z], fov: 55
}, 21.0);
// 夜间近景
await shoot('lh_close_night', {
  from: [L.x - dirx * 24, 1.6, L.z - dirz * 24],
  look: [L.x, 9, L.z], fov: 55
}, 21.0);

console.log('ERRS ' + errs.length + (errs.length ? ' :: ' + errs.slice(0, 4).join(' | ') : ''));
await browser.close();
