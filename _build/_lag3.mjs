import puppeteer from 'puppeteer-core';
// 关掉 vsync（--disable-gpu-vsync / --disable-frame-rate-limit），帧时间才反映真实 GPU+CPU 开销
const b = await puppeteer.launch({
  executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: 'new',
  args: ['--no-sandbox', '--use-angle=d3d11', '--disable-gpu-vsync', '--disable-frame-rate-limit',
    '--allow-file-access-from-files', '--window-size=1920,1080']
});
const p = await b.newPage();
await p.setViewport({ width: 1920, height: 1080 });
const errs = [];
p.on('pageerror', e => errs.push(String(e).slice(0, 200)));
await p.goto('file:///C:/Users/ASUS/Documents/Trae-CN/temp_20261108_01/fishing-duel/index.html?v=' + Date.now(), { waitUntil: 'load', timeout: 120000 });
await p.waitForFunction('window.game && window.game.world', { timeout: 90000 });
await p.evaluate(() => { const el = document.getElementById('platformOverlay'); if (el && !el.classList.contains('hidden')) document.getElementById('platPC').click(); });
await new Promise(r => setTimeout(r, 400));
await p.evaluate(() => document.getElementById('soloBtn').click());
await new Promise(r => setTimeout(r, 400));
await p.evaluate(() => document.getElementById('charNextBtn').click());
await new Promise(r => setTimeout(r, 300));
await p.evaluate(() => document.getElementById('fightBtn').click());
await new Promise(r => setTimeout(r, 2200));
await p.evaluate(() => {
  const g = window.game;
  g.state = 'playing';
  g.player.noGravity = true;
  g.player.pos.set(0, 3, 14); g.player.yaw = Math.PI; g.player.pitch = -0.05;
});
console.log('GL', JSON.stringify(await p.evaluate(() => ({
  dpr: devicePixelRatio, px: window.game.renderer.getPixelRatio(),
  canvas: [window.game.renderer.domElement.width, window.game.renderer.domElement.height],
  resScale: window.game.resScale
}))));

async function bench(name) {
  const r = await p.evaluate(async () => {
    const t = []; let last = performance.now();
    await new Promise(res => { let n = 0; (function tick() { const now = performance.now(); t.push(now - last); last = now; if (++n < 240) requestAnimationFrame(tick); else res(); })(); });
    t.shift(); t.sort((a, b) => a - b);
    const q = f => +t[Math.floor(t.length * f)].toFixed(2);
    return { p50: q(0.5), p90: q(0.9), p99: q(0.99) };
  });
  console.log(name.padEnd(22), 'p50', String(r.p50).padStart(6), 'p90', String(r.p90).padStart(6), 'p99', String(r.p99).padStart(7));
  return r;
}

const day = () => p.evaluate(() => { const g = window.game; g.hour = 11; g.wasNight = false; g.setDaymare(false); g.world.setDayTime(11); });

await day(); await new Promise(r => setTimeout(r, 700));
const base = await bench('day-plain');

await p.evaluate(() => { const g = window.game; g.setDaymare(true); g.batMax = 30; g.daymareT = 420; g.world.setBatCount(30); });
await new Promise(r => setTimeout(r, 900));
await bench('daymare-full');

await p.evaluate(() => window.game.world.setBatCount(0));
await new Promise(r => setTimeout(r, 300));
await bench('daymare-noBats');
await p.evaluate(() => window.game.world.setBatCount(30));

// 阴影每帧重绘（对比 30Hz 节流）
await p.evaluate(() => { window.game.renderer.shadowMap.autoUpdate = true; });
await new Promise(r => setTimeout(r, 400));
await bench('shadow-everyFrame');
await p.evaluate(() => { window.game.renderer.shadowMap.autoUpdate = false; });
await new Promise(r => setTimeout(r, 400));

// 动态分辨率两档
await p.evaluate(() => { const g = window.game; g.resScale = 0.75; g.resize(); });
await new Promise(r => setTimeout(r, 500));
await bench('res075');
await p.evaluate(() => { const g = window.game; g.resScale = 0.55; g.resize(); });
await new Promise(r => setTimeout(r, 500));
await bench('res055');

// 夜晚（阴影本就冻结）
await p.evaluate(() => { const g = window.game; g.resScale = 1; g.resize(); g.setDaymare(false); g.hour = 23; g.world.setDayTime(23); });
await new Promise(r => setTimeout(r, 900));
await bench('night');

console.log('errs', errs.length, errs.slice(0, 3).join('|'));
console.log('day-plain baseline p50 =', base.p50);
await b.close();
