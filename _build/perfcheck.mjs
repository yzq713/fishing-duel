import puppeteer from 'puppeteer-core';
const URL = 'file:///C:/Users/ASUS/Documents/Trae-CN/temp_20261108_01/fishing-duel/index.html';
const b = await puppeteer.launch({
  executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  headless: 'new',
  args: ['--no-sandbox', '--use-angle=d3d11', '--enable-unsafe-swiftshader', '--allow-file-access-from-files']
});
const p = await b.newPage();
await p.setViewport({ width: 1280, height: 760 });
const errs = [];
p.on('pageerror', e => errs.push(String(e).slice(0, 200)));
p.on('console', m => { if (m.type() === 'error') errs.push('[console] ' + m.text().slice(0, 200)); });
await p.goto(URL, { waitUntil: 'load', timeout: 60000 });
await p.waitForFunction('window.game && window.game.world', { timeout: 40000 });
await new Promise(r => setTimeout(r, 4000));
const info = await p.evaluate(() => {
  const r = window.game.renderer || window.game.renderer3 || null;
  const rr = r || (window.game.ui && null);
  const out = { hasRenderer: !!r };
  if (r && r.info) { out.calls = r.info.render.calls; out.tris = r.info.render.triangles; out.programs = r.info.programs.length; out.geoms = r.info.memory.geometries; out.textures = r.info.memory.textures; }
  out.lilies = window.game.world ? 'ok' : 'no';
  return out;
});
console.log(JSON.stringify(info));
// 帧时间采样
const ft = await p.evaluate(async () => {
  const t = [];
  let last = performance.now();
  await new Promise(res => {
    let n = 0;
    function tick() {
      const now = performance.now();
      t.push(now - last); last = now; n++;
      if (n < 90) requestAnimationFrame(tick); else res();
    }
    requestAnimationFrame(tick);
  });
  t.sort((a, b) => a - b);
  return { p50: +t[Math.floor(t.length * 0.5)].toFixed(1), p90: +t[Math.floor(t.length * 0.9)].toFixed(1), max: +t[t.length - 1].toFixed(1) };
});
console.log('frame ms', JSON.stringify(ft));
console.log('errors', errs.length, errs.slice(0, 3).join(' | '));
await b.close();
