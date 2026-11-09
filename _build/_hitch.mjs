import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({
  executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: 'new',
  args: ['--no-sandbox', '--use-angle=d3d11', '--disable-gpu-vsync', '--disable-frame-rate-limit',
    '--allow-file-access-from-files', '--window-size=1600,900']
});
const p = await b.newPage();
await p.setViewport({ width: 1600, height: 900 });
const errs = []; p.on('pageerror', e => errs.push(String(e).slice(0, 200)));
const t0 = Date.now();
await p.goto('file:///C:/Users/ASUS/Documents/Trae-CN/temp_20261108_01/fishing-duel/index.html?v=' + Date.now(), { waitUntil: 'load', timeout: 120000 });
await p.waitForFunction('window.game && window.game.world', { timeout: 90000 });
console.log('boot ms', Date.now() - t0);
await p.evaluate(() => { const el = document.getElementById('platformOverlay'); if (el && !el.classList.contains('hidden')) document.getElementById('platPC').click(); });
await new Promise(r => setTimeout(r, 400));
await p.evaluate(() => document.getElementById('soloBtn').click());
await new Promise(r => setTimeout(r, 300));
await p.evaluate(() => document.getElementById('charNextBtn').click());
await new Promise(r => setTimeout(r, 250));
await p.evaluate(() => document.getElementById('fightBtn').click());
await new Promise(r => setTimeout(r, 2500));
await p.evaluate(() => {
  const g = window.game; g.state = 'playing';
  g.player.noGravity = true; g.player.pos.set(0, 3, 14); g.player.yaw = Math.PI; g.player.pitch = -0.05;
  g.hour = 11; g.wasNight = false; g.setDaymare(false); g.world.setDayTime(11);
});
await new Promise(r => setTimeout(r, 1200));

// 采 180 帧，第 40 帧触发日魇、第 110 帧掉 30 只蝙蝠（模拟事件从 0 到满额）
const res = await p.evaluate(async () => {
  const g = window.game;
  const t = []; let last = performance.now(); let n = 0;
  await new Promise(res => {
    (function tick() {
      const now = performance.now(); t.push(+(now - last).toFixed(1)); last = now;
      if (n === 40) { g.setDaymare(true); g.batMax = 30; }
      if (n === 110) { g.daymareT = 420; g.world.setBatCount(30); }
      if (++n < 200) requestAnimationFrame(tick); else res();
    })();
  });
  const body = t.slice(5);
  const sorted = [...body].sort((a, b) => a - b);
  return {
    p50: sorted[Math.floor(sorted.length * 0.5)],
    p99: sorted[Math.floor(sorted.length * 0.99)],
    max: Math.max(...body),
    maxIdx: body.indexOf(Math.max(...body)) + 5,
    aroundTrigger: t.slice(36, 46),
    aroundSwarm: t.slice(106, 118)
  };
});
console.log(JSON.stringify(res, null, 1));
console.log('errs', errs.length, errs.slice(0, 2).join('|'));
await b.close();
