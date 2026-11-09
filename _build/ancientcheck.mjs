import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  headless: 'new',
  args: ['--no-sandbox', '--use-angle=d3d11', '--enable-unsafe-swiftshader', '--allow-file-access-from-files', '--window-size=1280,760']
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 760, deviceScaleFactor: 1 });
page.on('pageerror', e => console.log('[pageerror]', String(e).slice(0, 300)));
page.on('console', m => { if (m.type() === 'error') console.log('[console]', m.text().slice(0, 200)); });
await page.setCacheEnabled(false);
await page.goto('file:///C:/Users/ASUS/Documents/Trae-CN/temp_20261108_01/fishing-duel/index.html?v=' + Date.now(), { waitUntil: 'load', timeout: 120000 });
await page.waitForFunction('window.game && window.game.world', { timeout: 90000 });
await new Promise(r => setTimeout(r, 4200));
await page.evaluate(() => document.getElementById('soloBtn').click());
await new Promise(r => setTimeout(r, 250));
await page.evaluate(() => document.getElementById('charNextBtn').click());
await new Promise(r => setTimeout(r, 250));
await page.evaluate(() => document.getElementById('fightBtn').click());
await new Promise(r => setTimeout(r, 2200));
await page.evaluate(() => {
  const g = window.game;
  g.state = 'playing';
  ['pauseOverlay', 'startOverlay', 'charOverlay', 'weaponOverlay'].forEach(k => { if (g.ui[k]) g.ui[k].classList.add('hidden'); });
});

// ---- 把两条巨兽放进湖里 ----
const setup = await page.evaluate(() => {
  const E = window.Economy, w = window.game.world;
  E.fishBag = []; E.pondFish = []; E.raised = 0; E.save();
  const out = [];
  [['苍龙', 3200], ['恐龙', 3800]].forEach(([n, p], i) => {
    const e = E.addPondFish(n, p);
    E.recordCatch(n);
    const f = w.addPondFish(n, p, e.id);
    f.speed = 0;
    f.ang = 0.9 + i * 1.4;
    f.r = 2.0 + i * 1.3;
    out.push({ name: n, len: f.model.len, y: +f.group.position.y.toFixed(2), scale: +f.group.scale.x.toFixed(2) });
  });
  window.game.renderBackpack();
  return { fishes: w.fishes.length, stat: w.pondStat(), out, codex: E.codexCount() + '/' + E.codexTotal() };
});
console.log('pond', JSON.stringify(setup));

const shoot = async (tag, y, z) => {
  await page.evaluate((yy, zz) => {
    const g = window.game, p = g.player;
    p.pos.set(0.6, 0.35, zz);
    if (p.vel) p.vel.set(0, 0, 0);
    const dx = 0 - p.pos.x, dy = yy - (p.pos.y + 1.66), dz = 0 - p.pos.z;
    const L = Math.hypot(dx, dz);
    p.yaw = Math.atan2(-dx / L, -dz / L);
    p.pitch = Math.atan2(dy, L);
  }, y, z);
  await new Promise(r => setTimeout(r, 900));
  await page.screenshot({ path: 'D:/下载/fishprobe/anc_' + tag + '.png' });
};
await shoot('pond', 0.0, 11.4);
await shoot('close', -0.2, 8.0);

// ---- 图鉴 ----
await page.evaluate(() => {
  const g = window.game;
  document.getElementById('codexBackBtn').textContent = '返回战斗';
  g.renderCodex();
  g.ui.codexOverlay.classList.remove('hidden');
  g.state = 'paused';
});
await new Promise(r => setTimeout(r, 600));
await page.screenshot({ path: 'D:/下载/fishprobe/anc_codex.png' });
// 滚到远古那一组
await page.evaluate(() => {
  const b = document.getElementById('codexBody');
  b.scrollTop = b.scrollHeight;
});
await new Promise(r => setTimeout(r, 400));
await page.screenshot({ path: 'D:/下载/fishprobe/anc_codex_ancient.png' });

// ---- 抽取概率：抛到 80m 外，远古占多少 ----
const dist = await page.evaluate(() => {
  const F = window.game.fishing || window.game.fish;
  const f = window.game.fishing;
  const counts = {};
  f.seaCast = true;
  f.baitUsed = false;
  for (let d of [60, 70, 80]) {
    f.castDist = d;
    const c = {};
    for (let i = 0; i < 600; i++) {
      const p = f.pickFish();
      c[p.picked.name] = (c[p.picked.name] || 0) + 1;
    }
    counts[d] = { 苍龙: c['苍龙'] || 0, 恐龙: c['恐龙'] || 0, kinds: Object.keys(c).length };
  }
  return counts;
});
console.log('pick', JSON.stringify(dist));

// ---- 面板：湖边 HUD ----
const hud = await page.evaluate(() => document.getElementById('pondHud').textContent.trim());
console.log('hud', hud);

// ---- 帧率 ----
const perf = await page.evaluate(() => new Promise((res) => {
  const t = [];
  let last = performance.now(), n = 0;
  function tick() {
    const now = performance.now();
    t.push(now - last); last = now; n++;
    if (n < 120) requestAnimationFrame(tick); else {
      t.sort((a, b) => a - b);
      res({ p50: +t[60].toFixed(2), max: +t[119].toFixed(2), calls: window.game.renderer.info.render.calls, tris: window.game.renderer.info.render.triangles });
    }
  }
  requestAnimationFrame(tick);
}));
console.log('perf', JSON.stringify(perf));

await browser.close();
