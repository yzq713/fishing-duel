import puppeteer from 'puppeteer-core';
import fs from 'fs';
const OUT = 'D:/下载/fishprobe/dmtiles/';
fs.mkdirSync(OUT, { recursive: true });
const NAMES = ['逆光之群', '白夜蚀翼', '盲光狂潮', '苍白灾厄', '烈日蝠影', '日魇之核'];
// 每种鱼挑最出片的机位：侧鳍鱼走纯侧面，蝠翼鱼走近正视（翼面才展开）
const VIEW = {'逆光之群':[1.58,2.30],'白夜蚀翼':[2.48,1.30],'盲光狂潮':[1.58,1.32],'苍白灾厄':[1.58,1.26],'烈日蝠影':[2.48,1.30],'日魇之核':[2.48,1.28]};
const b = await puppeteer.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: 'new', args: ['--no-sandbox', '--use-angle=d3d11', '--enable-unsafe-swiftshader', '--allow-file-access-from-files', '--window-size=1200,800'] });
const p = await b.newPage();
await p.setViewport({ width: 1200, height: 800, deviceScaleFactor: 2 });
const errs = []; p.on('pageerror', e => errs.push(String(e).slice(0, 240)));
await p.goto('file:///C:/Users/ASUS/Documents/Trae-CN/temp_20261108_01/fishing-duel/index.html?v=' + Date.now(), { waitUntil: 'load', timeout: 120000 });
await p.waitForFunction('window.game && window.game.world', { timeout: 90000 });
// 首次进入有「选择游玩设备」遮罩，探针里点掉它（否则截图全是弹窗）
await p.evaluate(() => { const el = document.getElementById('platformOverlay'); if (el && !el.classList.contains('hidden')) document.getElementById('platPC').click(); });
await new Promise(r => setTimeout(r, 250));
await new Promise(r => setTimeout(r, 2400));
await p.evaluate(() => document.getElementById('soloBtn').click());
await new Promise(r => setTimeout(r, 400));
await p.evaluate(() => document.getElementById('charNextBtn').click());
await new Promise(r => setTimeout(r, 300));
await p.evaluate(() => document.getElementById('fightBtn').click());
await new Promise(r => setTimeout(r, 2400));
await p.evaluate(() => {
  const g = window.game; g.state = 'playing';
  ['hud', 'notices', 'crosshair', 'hurtFx', 'dayVeil'].forEach(id => { const el = document.getElementById(id); if (el) el.style.display = 'none'; });
  g.hour = 11; g.wasNight = false; g.setDaymare(true); g.batMax = 30; g.daymareT = 420;
  g.player.noGravity = true; g.player.pos.set(0, 8, 120); g.player.yaw = Math.PI; g.player.pitch = -0.02;
  g.camera.traverse(o => { if (o.isMesh) o.visible = false; });
});
await p.waitForFunction('window.game.world.getDayMix() > 0.92', { timeout: 25000, polling: 200 });
for (let i = 0; i < NAMES.length; i++) {
  const info = await p.evaluate((name, view) => {
    const g = window.game;
    if (window._t) g.scene.remove(window._t.group);
    const cam = g.camera; cam.updateMatrixWorld(true);
    const dir = new THREE.Vector3(); cam.getWorldDirection(dir);
    const m = new window.FishModel(name);
    if (m.halo && m.halo.parent) m.halo.parent.remove(m.halo);
    g.scene.add(m.group);
    m.group.traverse(o => { if (o.isMesh || o.isSprite || o.isPoints) o.visible = true; });
    m.group.position.copy(cam.position.clone().addScaledVector(dir, 3.4));
    m.group.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(m.group); const sz = new THREE.Vector3(); box.getSize(sz);
    const maxDim = Math.max(sz.x, sz.y, sz.z) || 1;
    m.group.scale.setScalar(view[1] / maxDim);
    // 侧后 3/4 视角：能看到头、背和展开的膜翼
    m.group.rotation.set(0.02, Math.atan2(dir.x, dir.z) + Math.PI / 2 + view[0], 0.02);
    window._t = m;
    let t0 = performance.now();
    (function loop() { if (window._t !== m) return; const now = performance.now();
      m.animate(Math.min(0.033, (now - t0) / 1000), 1); t0 = now; requestAnimationFrame(loop); })();
    return { name, maxDim: +maxDim.toFixed(2) };
  }, NAMES[i], VIEW[NAMES[i]]);
  await new Promise(r => setTimeout(r, 900));
  // 把模型投影到屏幕，按包围盒居中裁切
  const clip = await p.evaluate(() => {
    const g = window.game, cam = g.camera, m = window._t;
    m.group.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(m.group);
    const v = new THREE.Vector3(); let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    for (let k = 0; k < 8; k++) {
      v.set(k & 1 ? box.max.x : box.min.x, k & 2 ? box.max.y : box.min.y, k & 4 ? box.max.z : box.min.z).project(cam);
      x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y);
    }
    const W = innerWidth, H = innerHeight;
    const cx = (x0 + x1) / 2 * 0.5 * W + W / 2, cy = -(y0 + y1) / 2 * 0.5 * H + H / 2;
    const w0 = (x1 - x0) * 0.5 * W, h0 = (y1 - y0) * 0.5 * H;
    const w = 560, h = 310;
    let x = Math.round(Math.min(Math.max(cx - w / 2, 0), W - w));
    let y = Math.round(Math.min(Math.max(cy - h / 2, 0), H - h));
    return { x, y, width: Math.round(w), height: Math.round(h), bbox: [+w0.toFixed(0), +h0.toFixed(0)] };
  });
  await p.screenshot({ path: OUT + `t${i}.png`, clip: { x: clip.x, y: clip.y, width: clip.width, height: clip.height } });
  console.error('tile', i, info.name, JSON.stringify(clip));
}
console.log('done errs', errs.length, errs.slice(0, 2).join(' | '));
await b.close();
