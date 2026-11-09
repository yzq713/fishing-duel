import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: 'new', args: ['--no-sandbox','--use-angle=d3d11','--enable-unsafe-swiftshader','--allow-file-access-from-files','--window-size=1280,760'] });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 760, deviceScaleFactor: 1 });
page.on('pageerror', e => console.log('[pageerror]', String(e).slice(0, 200)));
await page.setCacheEnabled(false);
await page.goto('file:///C:/Users/ASUS/Documents/Trae-CN/temp_20261108_01/fishing-duel/index.html?v=143', { waitUntil: 'load', timeout: 120000 });
await page.waitForFunction('window.game && window.game.world', { timeout: 90000 });
await new Promise(r => setTimeout(r, 4200));
await page.evaluate(() => document.getElementById('soloBtn').click());
await new Promise(r => setTimeout(r, 250));
await page.evaluate(() => document.getElementById('charNextBtn').click());
await new Promise(r => setTimeout(r, 250));
await page.evaluate(() => document.getElementById('fightBtn').click());
await new Promise(r => setTimeout(r, 2200));
await page.evaluate(() => { const g = window.game; g.state = 'playing'; ['pauseOverlay','startOverlay','charOverlay','weaponOverlay'].forEach(k => { if (g.ui[k]) g.ui[k].classList.add('hidden'); }); });

const diag = await page.evaluate(() => {
  const E = window.Economy, w = window.game.world, T = window.THREE;
  E.fishBag = []; E.pondFish = []; E.raised = 0; E.save();
  const e = E.addPondFish('肥鲤鱼', 36);
  const f = w.addPondFish('肥鲤鱼', 36, e.id);
  f.speed = 0; f.r = 0.01; f.ang = 1.2;
  window.__f = f;
  return { swimY: f.swimY, pos: f.group.position.toArray(), parent: f.group.parent && f.group.parent.type };
});
console.log('diag', JSON.stringify(diag));
await new Promise(r => setTimeout(r, 600));

const meshInfo = await page.evaluate(() => {
  const f = window.__f, T = window.THREE;
  const out = { visible: f.group.visible, worldPos: f.group.position.toArray().map(v => +v.toFixed(2)), mats: [] };
  f.group.traverse((o) => {
    if (!o.isMesh) return;
    const m = o.material;
    const bb = new T.Box3().setFromObject(o);
    out.mats.push({
      cls: m.type, vc: !!m.vertexColors, op: m.opacity, tr: m.transparent,
      depthWrite: m.depthWrite, side: m.side, visible: o.visible,
      minY: +bb.min.y.toFixed(2), maxY: +bb.max.y.toFixed(2),
      color: m.color ? '#' + m.color.getHexString() : null
    });
  });
  return out;
});
console.log('mesh', JSON.stringify(meshInfo, null, 1));

// 镜头对准鱼，先隐藏水面
await page.evaluate(() => {
  const g = window.game, f = window.__f, p = g.player;
  const t = f.group.position;
  p.pos.set(t.x + 0.9, t.y + 1.5, t.z + 2.4);
  if (p.vel) p.vel.set(0, 0, 0);
  p.noGravity = true;
  const dx = t.x - p.pos.x, dy = t.y - (p.pos.y + 1.66), dz = t.z - p.pos.z;
  const L = Math.hypot(dx, dz);
  p.yaw = Math.atan2(-dx / L, -dz / L);
  p.pitch = Math.atan2(dy, L);
});
await new Promise(r => setTimeout(r, 900));
await page.screenshot({ path: 'D:/下载/fishprobe/e1_water.png' });

await page.evaluate(() => {
  const w = window.game.world;
  const hidden = [];
  w.group.traverse((o) => {
    if (o.isMesh && o.geometry && o.geometry.type === 'ShapeGeometry') { o.visible = false; hidden.push(o.id); }
  });
  return hidden.length;
});
await new Promise(r => setTimeout(r, 500));
await page.screenshot({ path: 'D:/下载/fishprobe/e2_nowater.png' });
const vis = await page.evaluate(() => window.__f.group.position.toArray().map(v => +v.toFixed(2)));
console.log('pos2', JSON.stringify(vis));
await browser.close();
