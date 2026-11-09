import puppeteer from 'puppeteer-core';
const V = process.argv[2] || '251';
const URL = 'file:///C:/Users/ASUS/Documents/Trae-CN/temp_20261108_01/fishing-duel/index.html?v=' + V;
const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  headless: 'new',
  args: ['--no-sandbox', '--use-angle=d3d11', '--enable-unsafe-swiftshader', '--allow-file-access-from-files', '--window-size=1280,760']
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 760, deviceScaleFactor: 1 });
const errs = [];
page.on('pageerror', e => { errs.push(String(e).slice(0, 200)); console.log('[pageerror]', String(e).slice(0, 200)); });
page.on('console', m => { if (m.type() === 'error') { errs.push(m.text().slice(0, 200)); console.log('[console]', m.text().slice(0, 200)); } });
await page.goto(URL, { waitUntil: 'domcontentloaded' });
await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
await page.setCacheEnabled(false);
await page.goto(URL, { waitUntil: 'load', timeout: 120000 });
await page.waitForFunction('window.game && window.game.world', { timeout: 90000 });
await new Promise(r => setTimeout(r, 4200));
await page.evaluate(() => document.getElementById('soloBtn').click());
await new Promise(r => setTimeout(r, 250));
await page.evaluate(() => document.getElementById('charNextBtn').click());
await new Promise(r => setTimeout(r, 250));
await page.evaluate(() => document.getElementById('fightBtn').click());
await new Promise(r => setTimeout(r, 2000));
await page.evaluate(() => {
  const g = window.game; g.state = 'playing';
  ['pauseOverlay', 'startOverlay', 'charOverlay', 'weaponOverlay'].forEach(k => { if (g.ui[k]) g.ui[k].classList.add('hidden'); });
  const E = window.Economy;
  E.pondFish = []; E.raised = 0;
  [['星界鳐', 2400], ['水晶锦鲤', 150], ['小银鱼', 20]].forEach(([n, p]) => {
    const e = E.addPondFish(n, p, window.fishGradeOf(n));
    g.world.addPondFish(e.name, e.points, e.id, e.tier);
  });
});

const pre = await page.evaluate(() => ({
  rate: +window.game.world.pondStat().rate.toFixed(2),
  list: window.game.world.fishes.map(f => `${f.name} g${f.tier}`)
}));
console.log('pond', JSON.stringify(pre));

// 打死亡神域那条（分值最高）
const kill = await page.evaluate(() => {
  const g = window.game, w = g.world, T = window.THREE;
  const f = w.fishes.find(x => x.points > 1000) || w.fishes[0];
  const camPos = g.camera.getWorldPosition(new T.Vector3());
  // 站到鱼旁边对准它
  const dir = f.group.position.clone().sub(camPos).normalize();
  const prey = g.hitPrey(camPos, dir, 200);
  const label = prey ? prey.label : null;
  if (prey) { prey.kill(); g.score += prey.points; }
  return {
    hit: !!prey, label, target: f.name,
    notice: document.getElementById('notices').textContent.trim().slice(-64),
    pondFish: window.Economy.pondFish.length,
    rate: +w.pondStat().rate.toFixed(2)
  };
});
console.log('kill', JSON.stringify(kill));
await new Promise(r => setTimeout(r, 1600));
const hud = await page.evaluate(() => ({
  hud: document.getElementById('pondHud').textContent.trim(),
  fishes: window.game.world.fishes.filter(f => f.alive).length
}));
console.log('after', JSON.stringify(hud));

// 保存后重载，看品质是否落盘
await page.evaluate(() => window.Economy.save());
await page.setCacheEnabled(false);
await page.goto(URL.replace('v=' + V, 'v=' + (+V + 1)), { waitUntil: 'load' });
await page.waitForFunction('window.game && window.game.world', { timeout: 90000 });
await new Promise(r => setTimeout(r, 3200));
const reload = await page.evaluate(() => ({
  pondFish: window.Economy.pondFish.map(f => `${f.name}/g${f.tier}/+${window.Economy.pondRateFor(f).toFixed(1)}`),
  fishes: window.game.world.fishes.map(f => `${f.name}/g${f.tier}`),
  rate: +window.game.world.pondStat().rate.toFixed(2)
}));
console.log('reload', JSON.stringify(reload));
console.log('errors', errs.length);
await browser.close();
