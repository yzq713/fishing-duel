import puppeteer from 'puppeteer-core';
const URL = 'file:///C:/Users/ASUS/Documents/Trae-CN/temp_20261108_01/fishing-duel/index.html?v=170';
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: 'new', args: ['--no-sandbox','--use-angle=d3d11','--enable-unsafe-swiftshader','--allow-file-access-from-files','--window-size=1280,760'] });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 760, deviceScaleFactor: 1 });
page.on('pageerror', e => console.log('[pageerror]', String(e).slice(0, 300)));
page.on('console', m => { if (m.type() === 'error') console.log('[console]', m.text().slice(0, 200)); });

const boot = async (v) => {
  await page.setCacheEnabled(false);
  await page.goto(URL.replace('v=170', 'v=' + v), { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction('window.game && window.game.world', { timeout: 90000 });
  await new Promise(r => setTimeout(r, 4200));
  await page.evaluate(() => document.getElementById('soloBtn').click());
  await new Promise(r => setTimeout(r, 250));
  await page.evaluate(() => document.getElementById('charNextBtn').click());
  await new Promise(r => setTimeout(r, 250));
  await page.evaluate(() => document.getElementById('fightBtn').click());
  await new Promise(r => setTimeout(r, 2200));
  await page.evaluate(() => { const g = window.game; g.state = 'playing'; ['pauseOverlay','startOverlay','charOverlay','weaponOverlay'].forEach(k => { if (g.ui[k]) g.ui[k].classList.add('hidden'); }); });
};

// 清掉旧存档，从干净状态开始
await page.goto(URL, { waitUntil: 'domcontentloaded' });
await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
await boot(120);

// 1) 走真实 UI 路径：塞 3 条鱼进背包 → 点「放入湖中」
const r1 = await page.evaluate(async () => {
  const E = window.Economy;
  E.fishBag = [];
  E.pondFish = []; E.raised = 0; E.save();
  [['小银鱼', 20], ['肥鲤鱼', 36], ['九尾锦鲤', 330], ['水晶锦鲤', 150]]
    .forEach(([n, p]) => E.addFish({ name: n, points: p, tier: 0, sea: true, dist: 0 }));
  for (let i = 0; i < 4; i++) {
    window.game.renderBackpack();
    const btn = document.querySelector('#bpFish .fc-raise');
    if (btn) btn.click();
  }
  return { pondFish: E.pondFish.map(f => f.name + ':' + f.points), fishes: window.game.world.fishes.length, rate: +window.game.world.pondStat().rate.toFixed(2) };
});
console.log('after-raise', JSON.stringify(r1));

// 2) 跑 4 秒，看每秒是否加分
const before = await page.evaluate(() => ({ score: window.game.score, bal: window.Economy.balance }));
await new Promise(r => setTimeout(r, 4200));
const after = await page.evaluate(() => ({
  score: window.game.score, bal: window.Economy.balance,
  hud: document.getElementById('pondHud').textContent.trim(),
  hidden: document.getElementById('pondHud').classList.contains('hidden')
}));
console.log('income', JSON.stringify({ before, after, delta: after.score - before.score }));

// 3) 用枪打死一条
const shot = await page.evaluate(() => {
  const g = window.game, w = g.world, T = window.THREE;
  const f = w.fishes[0];
  const camPos = g.camera.getWorldPosition(new T.Vector3());
  const dir = f.group.position.clone().sub(camPos).normalize();
  const prey = g.hitPrey(camPos, dir, 120);
  if (prey) { prey.kill(); g.score += prey.points; window.Economy.addScore(prey.points); }
  const el = document.getElementById('notices');
  return { hit: !!prey, label: prey && prey.label, alive: f.alive,
    pondFish: window.Economy.pondFish.length, fishes: w.fishes.length,
    notice: el ? el.textContent.trim().slice(-40) : '' };
});
console.log('shot', JSON.stringify(shot));
await new Promise(r => setTimeout(r, 4500));
const gone = await page.evaluate(() => ({
  fishes: window.game.world.fishes.length,
  pondFish: window.Economy.pondFish.length,
  hud: document.getElementById('pondHud').textContent.trim(),
  rate: +window.game.world.pondStat().rate.toFixed(2),
  score: window.game.score, bal: window.Economy.balance
}));
console.log('after-death-anim', JSON.stringify(gone));

// 4) HUD 截图
await page.evaluate(() => {
  const p = window.game.player;
  p.pos.set(0, 0.4, 14); p.noGravity = true;
  const dx = 0 - p.pos.x, dz = 0 - p.pos.z, L = Math.hypot(dx, dz);
  p.yaw = Math.atan2(-dx / L, -dz / L); p.pitch = -0.25;
});
await new Promise(r => setTimeout(r, 1200));
await page.screenshot({ path: 'D:/下载/fishprobe/hud.png' });

// 5) 重载，看鱼是否被记住（2 条）
await boot(121);
const reload = await page.evaluate(() => ({
  pondFish: window.Economy.pondFish.map(f => f.name + ':' + f.points).join(','),
  fishes: window.game.world.fishes.length,
  rate: +window.game.world.pondStat().rate.toFixed(2),
  hud: document.getElementById('pondHud').textContent.trim()
}));
console.log('reload', JSON.stringify(reload));
await browser.close();
