import puppeteer from 'puppeteer-core';
const OUT = 'D:/下载/fishprobe/';
const NAMES = ['赤鳍影', '夜魇石斑', '血月鳗', '绯红潮蛇', '朱红裂口'];
const b = await puppeteer.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: 'new', args: ['--no-sandbox','--use-angle=d3d11','--enable-unsafe-swiftshader','--allow-file-access-from-files','--window-size=1500,760'] });
const p = await b.newPage();
await p.setViewport({ width: 1500, height: 760, deviceScaleFactor: 1.5 });
const errs = [];
p.on('pageerror', e => errs.push(String(e).slice(0,240)));
await p.goto('file:///C:/Users/ASUS/Documents/Trae-CN/temp_20261108_01/fishing-duel/index.html?v='+Date.now(), { waitUntil: 'load', timeout: 120000 });
await p.waitForFunction('window.game && window.game.world', { timeout: 90000 });
await new Promise(r=>setTimeout(r,2600));
await p.evaluate(() => document.getElementById('soloBtn').click());
await new Promise(r=>setTimeout(r,400));
await p.evaluate(() => document.getElementById('charNextBtn').click());
await new Promise(r=>setTimeout(r,300));
await p.evaluate(() => document.getElementById('fightBtn').click());
await new Promise(r=>setTimeout(r,2200));

// ---- 摄影棚：隐藏世界与 HUD，只留鱼 ----
await p.evaluate(() => {
  const g = window.game;
  g.state = 'playing';
  ['hud','notices','crosshair','hurtFx','bloodVeil'].forEach(id=>{ const el=document.getElementById(id); if(el) el.style.display='none'; });
  document.querySelectorAll('#notices .notice').forEach(n=>n.remove());
  g.player.noGravity = true;
  g.player.pos.set(0, 30, 0);
  g.player.yaw = 0; g.player.pitch = 0;
  g.scene.traverse(o=>{ if (o.isMesh || o.isSprite || o.isPoints) o.visible = false; });
  g.scene.background = new THREE.Color(0x0a0306);
  g.scene.fog = null;
  // 自建三点光
  const hemi = new THREE.HemisphereLight(0x6a3038, 0x050102, 1.05); g.scene.add(hemi);
  const key = new THREE.DirectionalLight(0xfff0e8, 1.9); key.position.set(-2.5, 3.2, 3.0); g.scene.add(key);
  const rim = new THREE.DirectionalLight(0xff2a18, 2.4); rim.position.set(3.4, 1.2, -3.6); g.scene.add(rim);
  const fill = new THREE.DirectionalLight(0x4a6fa8, 0.55); fill.position.set(3.0, -1.0, 2.0); g.scene.add(fill);
});
await new Promise(r=>setTimeout(r,600));

const placed = await p.evaluate((NAMES) => {
  const g = window.game;
  const cam = g.camera; cam.updateMatrixWorld(true);
  const dir = new THREE.Vector3(); cam.getWorldDirection(dir);
  const right = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0,1,0)).normalize();
  const yaw = Math.atan2(dir.x, dir.z) + Math.PI / 2;
  const models = [];
  // 两排：后排 3 条小的，前排 2 条大的
  const LAYOUT = [
    { i: 0, x: -1.18, row: 0 }, { i: 1, x: 0, row: 0 }, { i: 2, x: 1.18, row: 0 },
    { i: 3, x: -0.86, row: 1 }, { i: 4, x: 0.86, row: 1 }
  ];
  LAYOUT.forEach((L) => {
    const m = new window.FishModel(NAMES[L.i]);
    const depth = L.row === 0 ? 4.6 : 3.0;
    const base = cam.position.clone().addScaledVector(dir, depth).addScaledVector(right, L.x * 1.42);
    base.y = cam.position.y + (L.row === 0 ? 1.22 : -0.92);
    m.group.position.copy(base);
    m.group.rotation.set(0, yaw + L.x * 0.10, 0);
    m.group.scale.setScalar(L.row === 0 ? 0.80 : 0.98);
    m.group.traverse(o=>{ if (o.isMesh || o.isSprite || o.isPoints) o.visible = true; });
    g.scene.add(m.group);
    models[L.i] = m;
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
  return { n: models.length, cam:[+cam.position.x.toFixed(1),+cam.position.y.toFixed(1),+cam.position.z.toFixed(1)] };
}, NAMES);
await new Promise(r=>setTimeout(r,1400));
await p.screenshot({ path: OUT + 'blood_fish_sheet.png' });

// ---- 朱红裂口近景 ----
await p.evaluate(() => {
  const g = window.game;
  const cam = g.camera; cam.updateMatrixWorld(true);
  const dir = new THREE.Vector3(); cam.getWorldDirection(dir);
  const right = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0,1,0)).normalize();
  window._bfModels.forEach((m, i) => {
    m.group.visible = (i === 4);
    if (i === 4) {
      m.group.position.copy(cam.position.clone().addScaledVector(dir, 2.3).addScaledVector(right, 0.35));
      m.group.position.y = cam.position.y - 0.20;
      m.group.rotation.set(0, Math.atan2(dir.x, dir.z) + Math.PI / 2 - 0.55, 0.06);
      m.group.scale.setScalar(1.15);
    }
  });
});
await new Promise(r=>setTimeout(r,900));
await p.screenshot({ path: OUT + 'blood_maw_closeup.png' });

// ---- 血夜钓获：正常世界 + 清晰提示条 ----
await p.reload({ waitUntil: 'load' });
await p.waitForFunction('window.game && window.game.world', { timeout: 90000 });
await new Promise(r=>setTimeout(r,2200));
await p.evaluate(() => document.getElementById('soloBtn').click());
await new Promise(r=>setTimeout(r,400));
await p.evaluate(() => document.getElementById('charNextBtn').click());
await new Promise(r=>setTimeout(r,300));
await p.evaluate(() => document.getElementById('fightBtn').click());
await new Promise(r=>setTimeout(r,2200));
const haul = await p.evaluate(() => {
  const g = window.game, E = window.Economy;
  g.state='playing';
  E.fishBag = []; E.items = []; E.balance = 0; E._write && E._write();
  g.hour = 21.6; g.wasNight = true; g.world.setDayTime(21.6); g.setBloodNight(true);
  g.player.noGravity = true;
  g.player.pos.set(34, 2.3, 38);
  g.player.pitch = 0.02;
  return true;
});
// 等血色世界完全淡入（轮询 mix），再抛竿收鱼
await p.waitForFunction('window.game.world.getBloodMix() > 0.9', { timeout: 20000, polling: 200 });
const haulInfo = await p.evaluate(() => {
  const g = window.game, E = window.Economy;
  const F = g.fishing;
  F.begin({ sea: true }, 56);
  F.baitCfg = { id: 'secret', name: '秘制香饵', cap: 8, luck: 3.6 };
  F.pickedFish = { name: '朱红裂口', points: 3400, minD: 54, blood: true };
  F.pickedTier = 9; F.beginReel();
  F.reelProgress = 1; F.completeCatch();
  return { bag: E.fishBag.map(f=>f.name), items: E.items.map(i=>i.name), mix: +g.world.getBloodMix().toFixed(2),
    notices: Array.from(document.querySelectorAll('#notices .notice')).map(n=>n.textContent.trim()).slice(-4) };
});
await new Promise(r=>setTimeout(r,380));
await p.screenshot({ path: OUT + 'blood_haul2.png' });
console.log(JSON.stringify({ placed, haulInfo }, null, 1), 'errs', errs.length, errs.slice(0,3).join(' | '));
await b.close();
