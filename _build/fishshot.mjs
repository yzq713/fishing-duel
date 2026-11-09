import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: 'new', args: ['--no-sandbox','--use-angle=d3d11','--enable-unsafe-swiftshader','--allow-file-access-from-files','--window-size=1280,760'] });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 760, deviceScaleFactor: 1 });
page.on('pageerror', e => console.log('[pageerror]', String(e).slice(0, 300)));
page.on('console', m => { if (m.type() === 'error') console.log('[console]', m.text().slice(0, 200)); });
await page.setCacheEnabled(false);
await page.goto('file:///C:/Users/ASUS/Documents/Trae-CN/temp_20261108_01/fishing-duel/index.html?v=141', { waitUntil: 'load', timeout: 120000 });
await page.waitForFunction('window.game && window.game.world', { timeout: 90000 });
await new Promise(r => setTimeout(r, 4200));
await page.evaluate(() => document.getElementById('soloBtn').click());
await new Promise(r => setTimeout(r, 250));
await page.evaluate(() => document.getElementById('charNextBtn').click());
await new Promise(r => setTimeout(r, 250));
await page.evaluate(() => document.getElementById('fightBtn').click());
await new Promise(r => setTimeout(r, 2200));
await page.evaluate(() => { const g = window.game; g.state = 'playing'; ['pauseOverlay','startOverlay','charOverlay','weaponOverlay'].forEach(k => { if (g.ui[k]) g.ui[k].classList.add('hidden'); }); });

const info = await page.evaluate(() => {
  const E = window.Economy, w = window.game.world;
  E.fishBag = []; E.pondFish = []; E.raised = 0; E.save();
  // 一条小的、一条中等、一条大的，看破水面的高度是否合适
  [['小银鱼', 20], ['肥鲤鱼', 36], ['九尾锦鲤', 330], ['水晶锦鲤', 150]].forEach(([n, p]) => E.addFish({ name: n, points: p, tier: 0, sea: true, dist: 0 }));
  for (let i = 0; i < 4; i++) { window.game.renderBackpack(); const b = document.querySelector('#bpFish .fc-raise'); if (b) b.click(); }
  return w.fishes.map(f => {
    const b = new window.THREE.Box3().setFromObject(f.group);
    return { n: f.name, swimY: +f.swimY.toFixed(2), top: +b.max.y.toFixed(2), bot: +b.min.y.toFixed(2) };
  });
});
console.log('fish', JSON.stringify(info));

const aim = async (from, look, wait = 1100) => {
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
  await new Promise(r => setTimeout(r, wait));
};

await aim([0, 3.0, 15], [0, 0, 2]);
await page.screenshot({ path: 'D:/下载/fishprobe/v2_far.png' });
await aim([0, 1.5, 9], [0, -0.1, 0]);
await page.screenshot({ path: 'D:/下载/fishprobe/v2_near.png' });
await aim([-2, 8, 8], [0, 0, 0]);
await page.screenshot({ path: 'D:/下载/fishprobe/v2_top.png' });
await browser.close();
