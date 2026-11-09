import puppeteer from 'puppeteer-core';
const OUT = 'D:/下载/fishprobe/';
const NAMES = ['赤鳍影', '夜魇石斑', '血月鳗', '绯红潮蛇', '朱红裂口'];
const b = await puppeteer.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: 'new', args: ['--no-sandbox','--use-angle=d3d11','--enable-unsafe-swiftshader','--allow-file-access-from-files','--window-size=1400,780'] });
const p = await b.newPage();
await p.setViewport({ width: 1400, height: 780 });
const errs = [];
p.on('pageerror', e => errs.push(String(e).slice(0,240)));
await p.goto('file:///C:/Users/ASUS/Documents/Trae-CN/temp_20261108_01/fishing-duel/index.html?v='+Date.now(), { waitUntil: 'load', timeout: 120000 });
await p.waitForFunction('window.game && window.game.world', { timeout: 90000 });
await new Promise(r=>setTimeout(r,3000));
await p.evaluate(() => document.getElementById('soloBtn').click());
await new Promise(r=>setTimeout(r,400));
await p.evaluate(() => document.getElementById('charNextBtn').click());
await new Promise(r=>setTimeout(r,300));
await p.evaluate(() => document.getElementById('fightBtn').click());
await new Promise(r=>setTimeout(r,2200));

// 1) 站到岸边一块空地，朝海面（让鱼衬着海/天，背景干净）
await p.evaluate(() => {
  const g = window.game;
  g.state='playing';
  ['pauseOverlay','startOverlay','charOverlay','weaponOverlay'].forEach(k=>{ if(g.ui[k]) g.ui[k].classList.add('hidden'); });
  g.hour = 12; g.wasNight = false; g.world.setDayTime(12);
  g.player.noGravity = true;
  g.player.pos.set(6, 3.0, 22);
  g.player.yaw = 0; g.player.pitch = -0.02;
});
await new Promise(r=>setTimeout(r,500));

// 2) 相机矩阵稳定后再按相机方向摆鱼
const placed = await p.evaluate((NAMES) => {
  const g = window.game;
  const cam = g.camera; cam.updateMatrixWorld(true);
  const dir = new THREE.Vector3(); cam.getWorldDirection(dir);
  const right = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0,1,0)).normalize();
  const yaw = Math.atan2(dir.x, dir.z) + Math.PI / 2;
  const models = [];
  NAMES.forEach((n, i) => {
    const m = new window.FishModel(n);
    const base = cam.position.clone().addScaledVector(dir, 3.2).addScaledVector(right, (i - 2) * 1.55);
    base.y = cam.position.y - 0.15;
    m.group.position.copy(base);
    m.group.rotation.set(0, yaw, 0);
    m.group.scale.setScalar(0.8);
    g.scene.add(m.group);
    models.push(m);
  });
  window._bfModels = models;
  let t0 = performance.now();
  window._bfRun = true;
  (function loop(){
    if (!window._bfRun) return;
    const now = performance.now();
    const dt = Math.min(0.033, (now - t0) / 1000); t0 = now;
    models.forEach(m => m.animate(dt, 1));
    requestAnimationFrame(loop);
  })();
  return { n: models.length, camY: +cam.position.y.toFixed(2), dir:[+dir.x.toFixed(2),+dir.y.toFixed(2),+dir.z.toFixed(2)] };
}, NAMES);
await new Promise(r=>setTimeout(r,1200));
await p.screenshot({ path: OUT + 'bloodfish_models.png' });

// 3) 朱红裂口近景
await p.evaluate(() => {
  const g = window.game;
  window._bfRun = false;
  const cam = g.camera; cam.updateMatrixWorld(true);
  const dir = new THREE.Vector3(); cam.getWorldDirection(dir);
  const right = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0,1,0)).normalize();
  window._bfModels.forEach((m, i) => {
    m.group.visible = (i === 4);
    if (i === 4) {
      m.group.position.copy(cam.position.clone().addScaledVector(dir, 1.75).addScaledVector(right, 0.1));
      m.group.position.y = cam.position.y - 0.18;
      m.group.rotation.set(0, Math.atan2(dir.x, dir.z) + Math.PI / 2 - 0.62, 0);
      m.group.scale.setScalar(1.0);
    }
  });
});
await new Promise(r=>setTimeout(r,700));
await p.screenshot({ path: OUT + 'bloodfish_maw.png' });

// 4) 图标条
await p.evaluate((NAMES) => {
  const g = window.game;
  const wrap = document.createElement('div');
  wrap.style.cssText='position:fixed;left:0;top:0;z-index:99999;background:#f6f1e4;padding:16px 18px;display:flex;gap:18px;font:13px sans-serif;color:#2a2a2a';
  NAMES.forEach(n=>{
    const d=document.createElement('div');
    d.style.cssText='width:150px;text-align:center';
    d.innerHTML='<div style="width:150px;height:150px;background:#fff;border:1px solid #d8d0bc;display:flex;align-items:center;justify-content:center">'+g.iconFor(n)+'</div><div style="margin-top:6px">'+n+'</div>';
    wrap.appendChild(d);
  });
  document.body.appendChild(wrap);
}, NAMES);
await new Promise(r=>setTimeout(r,350));
await p.screenshot({ path: OUT + 'bloodfish_icons.png', clip:{x:0,y:0,width:900,height:210} });
console.log('placed', JSON.stringify(placed), 'errs', errs.length, errs.slice(0,2).join(' | '));
await b.close();
