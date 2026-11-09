import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: 'new', args: ['--no-sandbox','--use-angle=d3d11','--enable-unsafe-swiftshader','--allow-file-access-from-files','--window-size=1280,760'] });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 760, deviceScaleFactor: 1 });
page.on('pageerror', e => console.log('[pageerror]', String(e).slice(0, 200)));
await page.setCacheEnabled(false);
await page.goto('file:///C:/Users/ASUS/Documents/Trae-CN/temp_20261108_01/fishing-duel/index.html?v=160', { waitUntil: 'load', timeout: 120000 });
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
  ['肥鲤鱼', '水晶锦鲤', '九尾锦鲤', '小银鱼'].forEach((n, i) => {
    const p = [36, 150, 330, 20][i];
    const e = E.addPondFish(n, p);
    const f = w.addPondFish(n, p, e.id);
    f.speed = 0;
    f.ang = 0.4 + i * 0.55;   // 铺开在池塘里
    f.r = 2.6 + i * 1.1;
  });
});
await new Promise(r => setTimeout(r, 700));

const shoot = async (tag, y) => {
  await page.evaluate((yy) => {
    const g = window.game, p = g.player;
    if (yy !== null) g.world.fishes.forEach((f, i) => { f.swimY = yy - i * 0.03; });
    // 站在池塘南岸看湖心
    p.pos.set(0.4, 0.35, 12.6);
    if (p.vel) p.vel.set(0, 0, 0);
    p.noGravity = false;
    const dx = 0 - p.pos.x, dy = 0.1 - (p.pos.y + 1.66), dz = 0 - p.pos.z;
    const L = Math.hypot(dx, dz);
    p.yaw = Math.atan2(-dx / L, -dz / L);
    p.pitch = Math.atan2(dy, L);
  }, y);
  await new Promise(r => setTimeout(r, 1200));
  await page.screenshot({ path: 'D:/下载/fishprobe/depth_' + tag + '.png' });
  return page.evaluate(() => window.game.player.pos.toArray().map(v => +v.toFixed(1)));
};
console.log('a', JSON.stringify(await shoot('a', -0.02)));
console.log('b', JSON.stringify(await shoot('b', -0.14)));
console.log('c', JSON.stringify(await shoot('c', -0.26)));
await browser.close();
