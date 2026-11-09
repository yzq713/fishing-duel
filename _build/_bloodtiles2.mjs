import puppeteer from 'puppeteer-core';
import fs from 'fs';
const OUT = 'D:/下载/fishprobe/tiles2/';
fs.mkdirSync(OUT, { recursive: true });
const NAMES = ['赤鳍影', '夜魇石斑', '血月鳗', '绯红潮蛇', '朱红裂口'];
const BOOST = { '赤鳍影': 1.0, '夜魇石斑': 1.0, '血月鳗': 1.32, '绯红潮蛇': 1.2, '朱红裂口': 1.0 };
const b = await puppeteer.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: 'new', args: ['--no-sandbox','--use-angle=d3d11','--enable-unsafe-swiftshader','--allow-file-access-from-files','--window-size=1280,800'] });
const p = await b.newPage();
await p.setViewport({ width: 1280, height: 800, deviceScaleFactor: 2 });
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

// 血夜 + 站到海面上方，镜头前方全是红色海天
await p.evaluate(() => {
  const g = window.game;
  g.state = 'playing';
  ['hud','notices','crosshair','hurtFx','bloodVeil'].forEach(id=>{ const el=document.getElementById(id); if(el) el.style.display='none'; });
  g.hour = 21.8; g.wasNight = true; g.world.setDayTime(21.8); g.setBloodNight(true);
  g.player.noGravity = true;
  g.player.pos.set(0, 9, 120);
  g.player.yaw = Math.PI; g.player.pitch = -0.02;
  g.camera.traverse(o=>{ if (o.isMesh) o.visible = false; });
});
await p.waitForFunction('window.game.world.getBloodMix() > 0.95', { timeout: 25000, polling: 200 });

for (let i = 0; i < NAMES.length; i++) {
  const info = await p.evaluate((name, boost) => {
    const g = window.game;
    if (window._tile) g.scene.remove(window._tile.group);
    const cam = g.camera; cam.updateMatrixWorld(true);
    const dir = new THREE.Vector3(); cam.getWorldDirection(dir);
    const m = new window.FishModel(name);
    if (m.halo && m.halo.parent) m.halo.parent.remove(m.halo);
    g.scene.add(m.group);
    m.group.traverse(o=>{ if (o.isMesh || o.isSprite || o.isPoints) o.visible = true; });
    m.group.position.copy(cam.position.clone().addScaledVector(dir, 2.65));
    m.group.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(m.group);
    const sz = new THREE.Vector3(); box.getSize(sz);
    const maxDim = Math.max(sz.x, sz.y, sz.z) || 1;
    m.group.scale.setScalar((1.72 / maxDim) * boost);
    m.group.rotation.set(0.03, Math.atan2(dir.x, dir.z) + Math.PI / 2 + 1.87, 0.02);
    window._tile = m;
    let t0 = performance.now();
    (function loop(){ if (window._tile !== m) return; const now = performance.now();
      m.animate(Math.min(0.033,(now-t0)/1000), 1); t0 = now; requestAnimationFrame(loop); })();
    return { name, maxDim: +maxDim.toFixed(2), scale: +m.group.scale.x.toFixed(2) };
  }, NAMES[i], BOOST[NAMES[i]]);
  await new Promise(r=>setTimeout(r, 850));
  await p.screenshot({ path: OUT + `t${i}.png`, clip: { x: 385, y: 255, width: 560, height: 292 } });
  console.error('tile', i, JSON.stringify(info));
}
console.log('done errs', errs.length, errs.slice(0,2).join(' | '));
await b.close();
