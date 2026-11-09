import puppeteer from 'puppeteer-core';
import fs from 'fs';
const OUT = 'D:/下载/fishprobe';
fs.mkdirSync(OUT, { recursive: true });
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: 'new', args: ['--no-sandbox','--use-angle=d3d11','--enable-unsafe-swiftshader','--allow-file-access-from-files','--window-size=1280,760'] });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 760, deviceScaleFactor: 1 });
page.on('pageerror', e => console.log('[pageerror]', String(e).slice(0, 200)));
await page.setCacheEnabled(false);
await page.goto('file:///C:/Users/ASUS/Documents/Trae-CN/temp_20261108_01/fishing-duel/index.html?v=103', { waitUntil: 'load', timeout: 120000 });
await page.waitForFunction('window.game && window.game.world', { timeout: 90000 });
await new Promise(r => setTimeout(r, 4200));
await page.evaluate(() => document.getElementById('soloBtn').click());
await new Promise(r => setTimeout(r, 300));
await page.evaluate(() => document.getElementById('charNextBtn').click());
await new Promise(r => setTimeout(r, 300));
await page.evaluate(() => document.getElementById('fightBtn').click());
await new Promise(r => setTimeout(r, 2200));
await page.evaluate(() => { const g = window.game; g.state = 'playing'; ['pauseOverlay','startOverlay','charOverlay','weaponOverlay'].forEach(k => { if (g.ui[k]) g.ui[k].classList.add('hidden'); }); });

const aim = async (from, look) => {
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
  await new Promise(r => setTimeout(r, 900));
};

// 空塘
await aim([6, 7, 20], [0, 0, 0]);
await page.screenshot({ path: `${OUT}/empty_pond.png` });
await aim([0, 2.2, 14], [0, -0.2, 4]);
await page.screenshot({ path: `${OUT}/empty_eye.png` });

// 放 4 条鱼
const added = await page.evaluate(() => {
  const E = window.Economy;
  ['肥鲤鱼', '小银鱼', '青鱼', '苔背龟鱼'].forEach(n => E.addFish({ name: n, points: 5, tier: 0, sea: false, dist: 0 }));
  for (let i = E.fishBag.length - 1; i >= 0; i--) { const f = E.raiseFish(i); window.game.world.addPondFish(f.name); }
  return { raised: E.raised, fishes: window.game.world.fishes.length };
});
console.log('added', JSON.stringify(added));
await new Promise(r => setTimeout(r, 1500));
await aim([6, 7, 20], [0, 0, 0]);
await page.screenshot({ path: `${OUT}/fish_top.png` });
await aim([0, 2.2, 14], [0, -0.2, 4]);
await page.screenshot({ path: `${OUT}/fish_eye.png` });
await aim([2, 1.6, 8], [0, -0.3, 2]);
await page.screenshot({ path: `${OUT}/fish_near.png` });
const st = await page.evaluate(() => window.game.world.fishes.map(f => ({ n: f.name, x: +f.group.position.x.toFixed(1), y: +f.group.position.y.toFixed(2), z: +f.group.position.z.toFixed(1) })));
console.log('fish', JSON.stringify(st));
await browser.close();
