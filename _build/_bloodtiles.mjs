import puppeteer from 'puppeteer-core';
import fs from 'fs';
const OUT = 'D:/下载/fishprobe/tiles/';
fs.mkdirSync(OUT, { recursive: true });
const NAMES = ['赤鳍影', '夜魇石斑', '血月鳗', '绯红潮蛇', '朱红裂口'];
const BOOST = { '赤鳍影': 1.0, '夜魇石斑': 1.0, '血月鳗': 1.12, '绯红潮蛇': 1.62, '朱红裂口': 1.0 };
const b = await puppeteer.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: 'new', args: ['--no-sandbox','--use-angle=d3d11','--enable-unsafe-swiftshader','--allow-file-access-from-files','--window-size=1200,800'] });
const p = await b.newPage();
await p.setViewport({ width: 1200, height: 800, deviceScaleFactor: 2 });
const errs = [];
p.on('pageerror', e => errs.push(String(e).slice(0,240)));
await p.goto('file:///C:/Users/ASUS/Documents/Trae-CN/temp_20261108_01/fishing-duel/index.html?v='+Date.now(), { waitUntil: 'load', timeout: 120000 });
await p.waitForFunction('window.game && window.game.world', { timeout: 90000 });
await new Promise(r=>setTimeout(r,2400));
await p.evaluate(() => document.getElementById('soloBtn').click());
await new Promise(r=>setTimeout(r,400));
await p.evaluate(() => document.getElementById('charNextBtn').click());
await new Promise(r=>setTimeout(r,300));
await p.evaluate(() => document.getElementById('fightBtn').click());
await new Promise(r=>setTimeout(r,2000));

await p.evaluate(() => {
  const g = window.game;
  g.state = 'playing';
  ['hud','notices','crosshair','hurtFx','bloodVeil'].forEach(id=>{ const el=document.getElementById(id); if(el) el.style.display='none'; });
  g.player.noGravity = true;
  g.player.pos.set(0, 30, 0);
  g.player.yaw = 0; g.player.pitch = 0;
  g.scene.traverse(o=>{ if (o.isMesh || o.isSprite || o.isPoints) o.visible = false; });
  g.scene.background = new THREE.Color(0x0b0407);
  g.scene.fog = null;
  g.scene.add(new THREE.HemisphereLight(0x7a4048, 0x080102, 1.15));
  const key = new THREE.DirectionalLight(0xfff2ea, 2.0); key.position.set(-2.4, 3.4, 3.2); g.scene.add(key);
  const rim = new THREE.DirectionalLight(0xff2a18, 2.6); rim.position.set(3.6, 1.0, -3.4); g.scene.add(rim);
  const fill = new THREE.DirectionalLight(0x4466aa, 0.6); fill.position.set(3.0, -1.2, 2.4); g.scene.add(fill);
  window._tile = null;
});

for (let i = 0; i < NAMES.length; i++) {
  const info = await p.evaluate((name, boost) => {
    window.__boost = boost;
    const g = window.game;
    if (window._tile) { g.scene.remove(window._tile.group); window._tile = null; }
    const cam = g.camera; cam.updateMatrixWorld(true);
    const dir = new THREE.Vector3(); cam.getWorldDirection(dir);
    const m = new window.FishModel(name);
    m.group.traverse(o=>{ if (o.isMesh || o.isSprite || o.isPoints) o.visible = true; });
    // 分级光晕球在纯黑背景上是一团灰雾，去掉并把它排除出包围盒
    if (m.halo && m.halo.parent) m.halo.parent.remove(m.halo);
    g.scene.add(m.group);
    m.group.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(m.group);
    const size = new THREE.Vector3(); box.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    const s = (2.2 / maxDim) * (window.__boost || 1);
    m.group.scale.setScalar(s);
    m.group.updateMatrixWorld(true);
    const yaw = Math.atan2(dir.x, dir.z) + Math.PI / 2 + 0.34;
    m.group.position.copy(cam.position.clone().addScaledVector(dir, 3.0));
    m.group.rotation.set(0.04, yaw, 0.03);
    window._tile = m;
    window._tileRun = true;
    let t0 = performance.now();
    (function loop(){
      if (!window._tileRun) return;
      const now = performance.now(); const dt = Math.min(0.033, (now-t0)/1000); t0 = now;
      m.animate(dt, 1);
      requestAnimationFrame(loop);
    })();
    return { name, s: +s.toFixed(3), size: [+size.x.toFixed(2), +size.y.toFixed(2), +size.z.toFixed(2)] };
  }, NAMES[i], BOOST[NAMES[i]]);
  await new Promise(r=>setTimeout(r, 900));
  await p.screenshot({ path: OUT + `t${i}.png`, clip: { x: 300, y: 200, width: 600, height: 400 } });
  console.error('tile', i, JSON.stringify(info));
}
console.log('done errs', errs.length, errs.slice(0,2).join(' | '));
await b.close();
