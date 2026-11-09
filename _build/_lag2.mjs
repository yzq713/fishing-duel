import puppeteer from 'puppeteer-core';
// 用真实 GPU（不挂 swiftshader），测卡顿来源
const b = await puppeteer.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: 'new', args: ['--no-sandbox', '--use-angle=d3d11', '--allow-file-access-from-files', '--window-size=1920,1080'] });
const p = await b.newPage();
await p.setViewport({ width: 1920, height: 1080 });
const errs = [];
p.on('pageerror', e => errs.push(String(e).slice(0, 200)));
await p.goto('file:///C:/Users/ASUS/Documents/Trae-CN/temp_20261108_01/fishing-duel/index.html?v=' + Date.now(), { waitUntil: 'load', timeout: 120000 });
await p.waitForFunction('window.game && window.game.world', { timeout: 90000 });
// 首次进入有「选择游玩设备」遮罩，探针里点掉它（否则截图全是弹窗）
await p.evaluate(() => { const el = document.getElementById('platformOverlay'); if (el && !el.classList.contains('hidden')) document.getElementById('platPC').click(); });
await new Promise(r => setTimeout(r, 250));
await new Promise(r => setTimeout(r, 3000));
const gl = await p.evaluate(() => {
  const g = window.game;
  return { dpr: window.devicePixelRatio, px: g.renderer.getPixelRatio(), size: [g.renderer.domElement.width, g.renderer.domElement.height] };
});
console.log('GL', JSON.stringify(gl));

const bench = (label) => p.evaluate(async (label) => {
  const g = window.game;
  const t = []; let last = performance.now();
  await new Promise(res => { let n = 0; (function tick() { const now = performance.now(); t.push(now - last); last = now; n++; if (n < 200) requestAnimationFrame(tick); else res(); })(); });
  t.sort((a, b) => a - b);
  const info = g.renderer.info.render;
  return { label, p50: +t[100].toFixed(1), p90: +t[180].toFixed(1), p99: +t[198].toFixed(1), calls: info.calls, tris: info.triangles };
});

await p.evaluate(() => document.getElementById('soloBtn').click());
await new Promise(r => setTimeout(r, 400));
await p.evaluate(() => document.getElementById('charNextBtn').click());
await new Promise(r => setTimeout(r, 300));
await p.evaluate(() => document.getElementById('fightBtn').click());
await new Promise(r => setTimeout(r, 2000));
await p.evaluate(() => {
  const g = window.game;
  g.state = 'playing';
  g.player.noGravity = true;
  g.player.pos.set(0, 3, 14); g.player.yaw = Math.PI; g.player.pitch = -0.05;
});

const out = [];
// 1) 普通白天
await p.evaluate(() => { const g = window.game; g.hour = 11; g.wasNight = false; g.setDaymare(false); g.world.setDayTime(11); });
await new Promise(r => setTimeout(r, 700));
out.push(await bench('day-plain'));

// 2) 日魇全开（CSS 滤镜 + 30 蝠 + 暗化）
await p.evaluate(() => { const g = window.game; g.setDaymare(true); g.batMax = 30; g.daymareT = 420; g.world.setBatCount(30); });
await new Promise(r => setTimeout(r, 900));
out.push(await bench('daymare-full'));

// 3) 去掉 canvas CSS 滤镜
await p.evaluate(() => { document.body.classList.remove('daymare'); });
await new Promise(r => setTimeout(r, 300));
out.push(await bench('daymare-noCssFilter'));
await p.evaluate(() => { document.body.classList.add('daymare'); });

// 4) 滤镜保留、蝠群清零
await p.evaluate(() => { window.game.world.setBatCount(0); });
await new Promise(r => setTimeout(r, 300));
out.push(await bench('daymare-noBats'));
await p.evaluate(() => { window.game.world.setBatCount(30); });

// 5) 阴影贴图减半 2048
await p.evaluate(() => {
  const g = window.game; let sun = null;
  g.scene.traverse(o => { if (o.isDirectionalLight && o.castShadow && o.shadow.mapSize.x === 4096) sun = o; });
  if (sun) { sun.shadow.mapSize.set(2048, 2048); if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; } g.renderer.shadowMap.needsUpdate = true; }
  return !!sun;
});
await new Promise(r => setTimeout(r, 500));
out.push(await bench('daymare-shadow2048'));

// 6) 阴影完全冻结
await p.evaluate(() => { window.game.renderer.shadowMap.autoUpdate = false; });
out.push(await bench('daymare-shadowFrozen'));

// 7) DPR 1.0
await p.evaluate(() => { const g = window.game; g.renderer.setPixelRatio(1); window.dispatchEvent(new Event('resize')); });
await new Promise(r => setTimeout(r, 500));
out.push(await bench('daymare-dpr1'));

console.log(JSON.stringify(out, null, 1));
console.log('errs', errs.length, errs.slice(0, 3).join('|'));
await b.close();
