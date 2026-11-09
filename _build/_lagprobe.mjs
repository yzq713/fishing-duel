import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: 'new', args: ['--no-sandbox','--use-angle=d3d11','--enable-unsafe-swiftshader','--allow-file-access-from-files','--window-size=1280,760'] });
const p = await b.newPage();
await p.setViewport({ width: 1280, height: 760 });
const errs = [];
p.on('pageerror', e => errs.push(String(e).slice(0,200)));
await p.goto('file:///C:/Users/ASUS/Documents/Trae-CN/temp_20261108_01/fishing-duel/index.html?v='+Date.now(), { waitUntil: 'load', timeout: 120000 });
await p.waitForFunction('window.game && window.game.world', { timeout: 90000 });
await new Promise(r=>setTimeout(r,3000));

const bench = (label) => p.evaluate(async (label) => {
  const g = window.game;
  const t = []; let last = performance.now();
  await new Promise(res => { let n = 0; (function tick(){ const now = performance.now(); t.push(now - last); last = now; n++; if (n < 150) requestAnimationFrame(tick); else res(); })(); });
  t.sort((a,b)=>a-b);
  const info = g.renderer.info.render;
  return { label, p50:+t[75].toFixed(1), p90:+t[135].toFixed(1), p99:+t[148].toFixed(1), max:+t[149].toFixed(1), calls: info.calls, tris: info.triangles };
});

// 进入对局
await p.evaluate(() => document.getElementById('soloBtn').click());
await new Promise(r=>setTimeout(r,400));
await p.evaluate(() => document.getElementById('charNextBtn').click());
await new Promise(r=>setTimeout(r,300));
await p.evaluate(() => document.getElementById('fightBtn').click());
await new Promise(r=>setTimeout(r,2000));
await p.evaluate(() => {
  const g = window.game;
  g.state='playing';
  ['pauseOverlay','startOverlay','charOverlay','weaponOverlay'].forEach(k=>{ if(g.ui[k]) g.ui[k].classList.add('hidden'); });
  g.player.noGravity = true;
  g.player.pos.set(0, 3, 14);   // 岸边看湖
  g.player.yaw = Math.PI; g.player.pitch = -0.05;
});

const out = [];
out.push(await bench('day-full'));
// 1) 夜晚全开（光束+spot+海面光斑）
await p.evaluate(() => { const g=window.game; g.hour=22; g.world.setDayTime(22); });
await new Promise(r=>setTimeout(r,600));
out.push(await bench('night-full'));
// 2) 夜晚关掉 beam group + spot
await p.evaluate(() => {
  const w = window.game.world;
  if (w.lhBeam) { w.lhBeam.root.visible = false; if (w.lhBeam.spot) w.lhBeam.spot.intensity = 0; }
  if (w.lhReef) w.lhReef.foam.visible = false;
});
out.push(await bench('night-nobeam'));
// 3) 夜晚再把海面 beamOn 置 0（着色器光斑关掉，只留环境）
await p.evaluate(() => {
  const w = window.game.world;
  w.group.traverse(o=>{ if (o.material && o.material.uniforms && o.material.uniforms.beamOn) o.material.uniforms.beamOn.value = 0; });
});
out.push(await bench('night-no-ocean-beam'));
console.log(JSON.stringify(out, null, 1));
console.log('errs', errs.length, errs.slice(0,3).join('|'));
await b.close();
