// 探针：把相机摆到 dbg_fish 的位置，在左下角区域打一串射线，
// 逐个报告命中的物体名 / 材质名 / 三角号 / 坐标，用来确认那条绿带到底是谁。
import puppeteer from 'puppeteer-core';

const URL = 'file:///C:/Users/ASUS/Documents/Trae-CN/temp_20261108_01/fishing-duel/index.html';

const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  headless: 'new',
  args: ['--no-sandbox', '--use-angle=d3d11', '--enable-unsafe-swiftshader',
    '--allow-file-access-from-files', '--window-size=1280,760']
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 760, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 300)));

await page.goto(URL, { waitUntil: 'load', timeout: 60000 });
await page.waitForFunction('window.game && window.game.world', { timeout: 40000 });
await new Promise(r => setTimeout(r, 2500));
await page.evaluate(() => document.getElementById('soloBtn').click());
await new Promise(r => setTimeout(r, 500));
await page.evaluate(() => document.getElementById('charNextBtn').click());
await new Promise(r => setTimeout(r, 500));
await page.evaluate(() => document.getElementById('fightBtn').click());
await new Promise(r => setTimeout(r, 2000));
await page.evaluate(() => {
  const g = window.game;
  g.state = 'playing';
  ['pauseOverlay', 'startOverlay', 'charOverlay', 'weaponOverlay'].forEach((k) => {
    if (g.ui[k]) g.ui[k].classList.add('hidden');
  });
});
await new Promise(r => setTimeout(r, 800));

// 相机摆到 dbg_fish 那一帧
await page.evaluate(() => {
  const p = window.game.player;
  p.pos.set(0.5, 5.5, 7);
  if (p.vel) p.vel.set(0, 0, 0);
  p.noGravity = true;
  const dx = 0 - 0.5, dy = -1.2 - 5.5, dz = 0 - 7;
  const L = Math.hypot(dx, dz);
  p.yaw = Math.atan2(-dx / L, -dz / L);
  p.pitch = Math.atan2(dy, L);
});
await new Promise(r => setTimeout(r, 1200));

const res = await page.evaluate(() => {
  const g = window.game;
  const cam = g.camera;
  const ray = new THREE.Raycaster();
  ray.far = 400;
  const out = [];
  // 左下角绿带大概在 px(0,580) 一带，扫一片网格
  for (let px = 40; px <= 340; px += 30) {
    for (let py = 560; py <= 700; py += 20) {
      const ndc = new THREE.Vector2((px / 1280) * 2 - 1, -(py / 760) * 2 + 1);
      ray.setFromCamera(ndc, cam);
      const hits = ray.intersectObjects(g.scene.children, true).filter((h) => h.object.visible);
      if (!hits.length) continue;
      const h = hits[0];
      const o = h.object;
      out.push({
        px, py,
        obj: o.name || '(unnamed)',
        parent: o.parent ? o.parent.name : '',
        mat: o.material && o.material.name ? o.material.name : '(none)',
        tri: h.face ? h.faceIndex : -1,
        p: [+h.point.x.toFixed(2), +h.point.y.toFixed(2), +h.point.z.toFixed(2)],
        chain: (function(){ const a=[]; let o2=o; while(o2 && a.length<6){ a.push(o2.name||o2.type); o2=o2.parent; } return a.join('<'); })(),
        matInfo: Array.isArray(o.material) ? 'array' : (o.material ? [o.material.type, o.material.color ? '#'+o.material.color.getHexString() : '-', !!o.material.map].join(' ') : 'none'),
        vcnt: o.geometry ? o.geometry.attributes.position.count : -1,
        uuid: (o.uuid||'').slice(0,8),
        d: +h.distance.toFixed(2),
        n: h.face ? [+h.face.normal.x.toFixed(2), +h.face.normal.y.toFixed(2), +h.face.normal.z.toFixed(2)] : null
      });
    }
  }
  return out;
});
console.log(JSON.stringify(res, null, 0).replace(/\},\{/g, '},\n{'));
await browser.close();
