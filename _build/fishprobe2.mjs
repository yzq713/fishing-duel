import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: 'new', args: ['--no-sandbox','--use-angle=d3d11','--enable-unsafe-swiftshader','--allow-file-access-from-files','--window-size=1280,760'] });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 760, deviceScaleFactor: 1 });
page.on('pageerror', e => console.log('[pageerror]', String(e).slice(0, 200)));
page.on('console', m => { if (m.type() === 'error') console.log('[console]', m.text().slice(0, 200)); });
await page.setCacheEnabled(false);
await page.goto('file:///C:/Users/ASUS/Documents/Trae-CN/temp_20261108_01/fishing-duel/index.html?v=102', { waitUntil: 'load', timeout: 120000 });
await page.waitForFunction('window.game && window.game.world', { timeout: 90000 });
await new Promise(r => setTimeout(r, 4200));
await page.evaluate(() => document.getElementById('soloBtn').click());
await new Promise(r => setTimeout(r, 300));
await page.evaluate(() => document.getElementById('charNextBtn').click());
await new Promise(r => setTimeout(r, 300));
await page.evaluate(() => document.getElementById('fightBtn').click());
await new Promise(r => setTimeout(r, 2500));
await page.evaluate(() => { const g = window.game; g.state = 'playing'; ['pauseOverlay','startOverlay','charOverlay','weaponOverlay'].forEach(k => { if (g.ui[k]) g.ui[k].classList.add('hidden'); }); });

// 通过"背包 → 放入湖中"的真实路径放 4 条鱼
const added = await page.evaluate(() => {
  const E = window.Economy;
  const names = ['肥鲤鱼', '小银鱼', '青鱼', '苔背龟鱼'];
  names.forEach(n => E.addFish({ name: n, points: 5, tier: 0, sea: false, dist: 0 }));
  const out = [];
  for (let i = E.fishBag.length - 1; i >= 0; i--) {
    const f = E.raiseFish(i);
    window.game.world.addPondFish(f.name);
    out.push(f.name);
  }
  return { out, raised: E.raised, fishes: window.game.world.fishes.length };
});
console.log('raised', JSON.stringify(added));

// 站到塘边，看水里
await page.evaluate(() => {
  const g = window.game, p = g.player;
  p.pos.set(0, 0.4, 13.5);
  p.yaw = Math.PI;          // 朝 -Z
  if (p.pitch !== undefined) p.pitch = -0.16;
});
await new Promise(r => setTimeout(r, 1500));
const st1 = await page.evaluate(() => window.game.world.fishes.map(f => ({ n: f.name, vis: f.group.visible, x: +f.group.position.x.toFixed(2), y: +f.group.position.y.toFixed(2), z: +f.group.position.z.toFixed(2) })));
console.log('fish', JSON.stringify(st1));
await page.screenshot({ path: 'D:/下载/fishprobe/play1.png' });

// 换个俯视机位
await page.evaluate(() => {
  const cam = window.game.camera;
  cam.position.set(0, 6.5, 12);
  cam.lookAt(0, -0.25, 1.5);
});
await new Promise(r => setTimeout(r, 700));
await page.screenshot({ path: 'D:/下载/fishprobe/play2.png' });

// 用枪打一条鱼（走 hitPrey 判定路径）
const shot = await page.evaluate(() => {
  const g = window.game, w = g.world;
  const f = w.fishes[0];
  const T = window.THREE;
  const camPos = g.camera.getWorldPosition(new T.Vector3());
  const target = f.group.position.clone();
  const dir = target.clone().sub(camPos).normalize();
  const before = { alive: f.alive, vis: f.group.visible, score: g.score, pts: 0 };
  const prey = g.hitPrey(camPos, dir, 120);
  if (prey) { prey.kill(); g.score += prey.points; if (window.Economy) window.Economy.addScore(prey.points); }
  return { found: !!prey, label: prey && prey.label, dist: +target.distanceTo(camPos).toFixed(2), before, after: { alive: f.alive, vis: f.group.visible, respawnT: f.respawnT, score: g.score } };
});
console.log('shot', JSON.stringify(shot));

// 12 秒后是否复活
await new Promise(r => setTimeout(r, 13000));
const back = await page.evaluate(() => window.game.world.fishes.map(f => ({ n: f.name, alive: f.alive, vis: f.group.visible })));
console.log('after12s', JSON.stringify(back));
await browser.close();
