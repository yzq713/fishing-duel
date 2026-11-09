import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: 'new', args: ['--no-sandbox','--use-angle=d3d11','--enable-unsafe-swiftshader','--allow-file-access-from-files','--window-size=1280,820'] });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 820, deviceScaleFactor: 1 });
const errs = [];
page.on('pageerror', e => errs.push(String(e).slice(0, 200)));
page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 160)); });
await page.setCacheEnabled(false);
await page.goto('file:///C:/Users/ASUS/Documents/Trae-CN/temp_20261108_01/fishing-duel/index.html?v=200', { waitUntil: 'load', timeout: 120000 });
await page.waitForFunction('window.game && window.game.world', { timeout: 90000 });
await new Promise(r => setTimeout(r, 4500));
await page.screenshot({ path: 'D:/下载/fishprobe/menu.png' });
const footOverflow = await page.evaluate(() => {
  const p = document.querySelector('.foot');
  if (!p) return null;
  const r = p.getBoundingClientRect();
  return { h: Math.round(r.height), w: Math.round(r.width), bottom: Math.round(r.bottom), vh: window.innerHeight };
});
console.log('foot', JSON.stringify(footOverflow));

// 进游戏，湖边有鱼
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
  ['肥鲤鱼', '锦鲤', '水晶锦鲤', '九尾锦鲤'].forEach((n, i) => {
    const p = [36, 92, 150, 330][i];
    const e = E.addPondFish(n, p);
    const f = w.addPondFish(n, p, e.id);
    f.ang = 0.3 + i * 0.8; f.r = 2.8 + i * 0.9; f.speed = 0.25;
  });
  const p = window.game.player;
  p.pos.set(0.4, 0.35, 12.6);
  const dx = 0 - p.pos.x, dy = 0.1 - (p.pos.y + 1.66), dz = 0 - p.pos.z;
  const L = Math.hypot(dx, dz);
  p.yaw = Math.atan2(-dx / L, -dz / L); p.pitch = Math.atan2(dy, L);
});
await new Promise(r => setTimeout(r, 1600));
await page.screenshot({ path: 'D:/下载/fishprobe/pond_final.png' });
await new Promise(r => setTimeout(r, 2400));
await page.screenshot({ path: 'D:/下载/fishprobe/pond_final2.png' });
const st = await page.evaluate(() => ({
  fishes: window.game.world.fishes.map(f => ({ n: f.name, alive: f.alive, y: +f.group.position.y.toFixed(2) })),
  rate: +window.game.world.pondStat().rate.toFixed(2),
  hud: document.getElementById('pondHud').textContent.trim(),
  score: window.game.score, bal: window.Economy.balance
}));
console.log('state', JSON.stringify(st));
console.log('errors', JSON.stringify(errs));
await browser.close();
