import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: 'new', args: ['--no-sandbox','--use-angle=d3d11','--enable-unsafe-swiftshader','--allow-file-access-from-files','--window-size=1280,760'] });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 760, deviceScaleFactor: 1 });
page.on('pageerror', e => console.log('[pageerror]', String(e).slice(0, 200)));
await page.setCacheEnabled(false);
await page.goto('file:///C:/Users/ASUS/Documents/Trae-CN/temp_20261108_01/fishing-duel/index.html?v=142', { waitUntil: 'load', timeout: 120000 });
await page.waitForFunction('window.game && window.game.world', { timeout: 90000 });
await new Promise(r => setTimeout(r, 4200));
await page.evaluate(() => document.getElementById('soloBtn').click());
await new Promise(r => setTimeout(r, 250));
await page.evaluate(() => document.getElementById('charNextBtn').click());
await new Promise(r => setTimeout(r, 250));
await page.evaluate(() => document.getElementById('fightBtn').click());
await new Promise(r => setTimeout(r, 2200));
await page.evaluate(() => { const g = window.game; g.state = 'playing'; ['pauseOverlay','startOverlay','charOverlay','weaponOverlay'].forEach(k => { if (g.ui[k]) g.ui[k].classList.add('hidden'); }); });

await page.evaluate(() => {
  const E = window.Economy, w = window.game.world;
  E.fishBag = []; E.pondFish = []; E.raised = 0; E.save();
  ['肥鲤鱼', '水晶锦鲤'].forEach((n) => {
    const p = n === '肥鲤鱼' ? 36 : 150;
    const e = E.addPondFish(n, p);
    const f = w.addPondFish(n, p, e.id);
    f.speed = 0; f.r = 0.01;
  });
});
await new Promise(r => setTimeout(r, 700));

for (const [tag, y] of [['a_-0.05', null], ['b_-0.18', -0.15], ['c_-0.30', -0.27]]) {
  await page.evaluate((yy) => {
    const g = window.game, w = g.world;
    w.fishes.forEach((f, i) => {
      if (yy !== null) f.swimY = yy - i * 0.02;
      f.ang = 0.9 + i * 0.55;
      f.speed = 0;
    });
    const f = w.fishes[0];
    const p = g.player;
    const target = f.group.position;
    p.pos.set(target.x - 1.2, target.y + 2.3, target.z + 3.0);
    if (p.vel) p.vel.set(0, 0, 0);
    p.noGravity = true;
    const dx = target.x - p.pos.x, dy = target.y - (p.pos.y + 1.66), dz = target.z - p.pos.z;
    const L = Math.hypot(dx, dz);
    p.yaw = Math.atan2(-dx / L, -dz / L);
    p.pitch = Math.atan2(dy, L);
  }, y);
  await new Promise(r => setTimeout(r, 900));
  await page.screenshot({ path: 'D:/下载/fishprobe/depth_' + tag + '.png' });
}
await browser.close();
