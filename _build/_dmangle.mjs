import puppeteer from 'puppeteer-core';
const OUT = 'D:/下载/fishprobe/dmtiles/';
const b = await puppeteer.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: 'new', args: ['--no-sandbox', '--use-angle=d3d11', '--enable-unsafe-swiftshader', '--allow-file-access-from-files', '--window-size=1200,800'] });
const p = await b.newPage();
await p.setViewport({ width: 1200, height: 800, deviceScaleFactor: 2 });
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
for (let i = 0; i < 4; i++) {
  await p.evaluate((k) => {
    const g = window.game;
    if (window._t) g.scene.remove(window._t.group);
    const cam = g.camera; cam.updateMatrixWorld(true);
    const dir = new THREE.Vector3(); cam.getWorldDirection(dir);
    const m = new window.FishModel('白夜蚀翼');
    if (m.halo && m.halo.parent) m.halo.parent.remove(m.halo);
    g.scene.add(m.group);
    m.group.traverse(o => { if (o.isMesh || o.isSprite || o.isPoints) o.visible = true; });
    m.group.position.copy(cam.position.clone().addScaledVector(dir, 3.4));
    m.group.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(m.group); const sz = new THREE.Vector3(); box.getSize(sz);
    m.group.scale.setScalar(1.42 / (Math.max(sz.x, sz.y, sz.z) || 1));
    m.group.rotation.set(0.02, Math.atan2(dir.x, dir.z) + Math.PI / 2 + 1.58 + k * 0.9, 0.02);
    window._t = m;
    let t0 = performance.now();
    (function loop() { if (window._t !== m) return; const now = performance.now();
      m.animate(Math.min(0.033, (now - t0) / 1000), 1); t0 = now; requestAnimationFrame(loop); })();
  }, i);
  await new Promise(r => setTimeout(r, 800));
  await p.screenshot({ path: OUT + `a${i}.png`, clip: { x: 340, y: 250, width: 520, height: 300 } });
}
console.log('ok');
await b.close();
