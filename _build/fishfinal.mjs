import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: 'new', args: ['--no-sandbox','--use-angle=d3d11','--enable-unsafe-swiftshader','--allow-file-access-from-files','--window-size=1280,760'] });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 760, deviceScaleFactor: 1 });
page.on('pageerror', e => console.log('[pageerror]', String(e).slice(0, 300)));
page.on('console', m => { if (m.type() === 'error') console.log('[console]', m.text().slice(0, 200)); });
await page.setCacheEnabled(false);
await page.goto('file:///C:/Users/ASUS/Documents/Trae-CN/temp_20261108_01/fishing-duel/index.html?v=180', { waitUntil: 'load', timeout: 120000 });
await page.waitForFunction('window.game && window.game.world', { timeout: 90000 });
await new Promise(r => setTimeout(r, 4200));
// 空湖：HUD 不应该有「湖中养鱼」
const empty = await page.evaluate(() => {
  try { localStorage.clear(); } catch (e) {}
  const h = document.getElementById('pondHud');
  return { hidden: h.classList.contains('hidden'), fishes: window.game.world.fishes.length, sepHidden: document.getElementById('pondSep').classList.contains('hidden') };
});
console.log('empty', JSON.stringify(empty));
await page.evaluate(() => document.getElementById('soloBtn').click());
await new Promise(r => setTimeout(r, 250));
await page.evaluate(() => document.getElementById('charNextBtn').click());
await new Promise(r => setTimeout(r, 250));
await page.evaluate(() => document.getElementById('fightBtn').click());
await new Promise(r => setTimeout(r, 2200));
await page.evaluate(() => { const g = window.game; g.state = 'playing'; ['pauseOverlay','startOverlay','charOverlay','weaponOverlay'].forEach(k => { if (g.ui[k]) g.ui[k].classList.add('hidden'); }); });

// 放 3 条鱼
await page.evaluate(() => {
  const E = window.Economy, w = window.game.world;
  E.fishBag = []; E.pondFish = []; E.raised = 0; E.save();
  ['肥鲤鱼', '水晶锦鲤', '九尾锦鲤'].forEach((n, i) => {
    const p = [36, 150, 330][i];
    const e = E.addPondFish(n, p);
    const f = w.addPondFish(n, p, e.id);
    f.ang = 0.5 + i * 0.7; f.r = 3.0 + i; f.speed = 0.3;
  });
});

// 打死一条，抓死亡动画三帧
const kill = await page.evaluate(() => {
  const g = window.game, w = g.world, T = window.THREE;
  const f = w.fishes[1];
  const camPos = g.camera.getWorldPosition(new T.Vector3());
  const dir = f.group.position.clone().sub(camPos).normalize();
  const prey = g.hitPrey(camPos, dir, 200);
  if (prey) { prey.kill(); g.score += prey.points; window.Economy.addScore(prey.points); }
  return { label: prey && prey.label, alive: f.alive, pond: window.Economy.pondFish.length };
});
console.log('kill', JSON.stringify(kill));

// 站岸边拍
await page.evaluate(() => {
  const p = window.game.player;
  p.pos.set(0.4, 0.35, 12.6);
  if (p.vel) p.vel.set(0, 0, 0);
  const dx = 0 - p.pos.x, dy = 0.1 - (p.pos.y + 1.66), dz = 0 - p.pos.z;
  const L = Math.hypot(dx, dz);
  p.yaw = Math.atan2(-dx / L, -dz / L);
  p.pitch = Math.atan2(dy, L);
});
await new Promise(r => setTimeout(r, 700));
await page.screenshot({ path: 'D:/下载/fishprobe/kill_1.png' });
await new Promise(r => setTimeout(r, 800));
await page.screenshot({ path: 'D:/下载/fishprobe/kill_2.png' });
await new Promise(r => setTimeout(r, 2600));
await page.screenshot({ path: 'D:/下载/fishprobe/kill_3.png' });
const fin = await page.evaluate(() => ({ fishes: window.game.world.fishes.length, pond: window.Economy.pondFish.length, rate: +window.game.world.pondStat().rate.toFixed(2) }));
console.log('final', JSON.stringify(fin));

// 性能与渲染统计
const perf = await page.evaluate(() => new Promise((res) => {
  const r = window.game.renderer.info;
  const times = [];
  let last = performance.now(), n = 0;
  const tick = () => {
    const now = performance.now();
    times.push(now - last); last = now; n++;
    if (n < 120) requestAnimationFrame(tick);
    else {
      times.sort((a, b) => a - b);
      res({ calls: r.render.calls, tris: r.render.triangles, programs: r.programs ? r.programs.length : 0,
        geoms: r.memory.geometries, textures: r.memory.textures,
        p50: +times[Math.floor(times.length * 0.5)].toFixed(1), max: +times[times.length - 1].toFixed(1) });
    }
  };
  requestAnimationFrame(tick);
}));
console.log('perf', JSON.stringify(perf));

// 背包里的养鱼提示
await page.evaluate(() => { window.game.renderBackpack(); });
const chip = await page.evaluate(() => document.getElementById('bpKinds').textContent.trim());
console.log('kinds', chip);
await browser.close();
