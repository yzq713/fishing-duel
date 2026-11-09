import puppeteer from 'puppeteer-core';
const V = Date.now();
const ROOT = 'file:///C:/Users/ASUS/Documents/Trae-CN/temp_20261108_01/fishing-duel/';
const OUT = 'D:/下载/fishprobe/';
const b = await puppeteer.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: 'new', args: ['--no-sandbox', '--use-angle=d3d11', '--enable-unsafe-swiftshader', '--allow-file-access-from-files', '--window-size=1280,760'] });
const p = await b.newPage();
await p.setViewport({ width: 1280, height: 760 });
await p.goto(ROOT + 'index.html?v=' + V, { waitUntil: 'load', timeout: 120000 });
await p.waitForFunction('window.game && window.game.world', { timeout: 90000 });
await new Promise(r => setTimeout(r, 3000));
await p.evaluate(() => document.getElementById('soloBtn').click());
await new Promise(r => setTimeout(r, 400));
await p.evaluate(() => document.getElementById('charNextBtn').click());
await new Promise(r => setTimeout(r, 300));
await p.evaluate(() => document.getElementById('fightBtn').click());
await new Promise(r => setTimeout(r, 2200));
await p.evaluate(() => {
  const g = window.game, L = g.world.lighthouse;
  g.state = 'playing';
  ['pauseOverlay', 'startOverlay', 'charOverlay', 'weaponOverlay'].forEach(k => { if (g.ui[k]) g.ui[k].classList.add('hidden'); });
  g.hour = 11.2; g.world.setDayTime(11.2);
  const px = L.x - L.x / Math.hypot(L.x, L.z) * 20, pz = L.z - L.z / Math.hypot(L.x, L.z) * 20;
  const pp = g.player; pp.noGravity = true; pp.pos.set(px, 1.4, pz);
  const dx = L.x - px, dz = L.z - pz, l2 = Math.hypot(dx, dz);
  pp.yaw = Math.atan2(-dx / l2, -dz / l2); pp.pitch = 0.12;
  // 把灯塔组里的 mesh 分类
  const grp = g.world.group.children.find(c => Math.abs(c.position.x - L.x) < 0.6 && Math.abs(c.position.z - L.z) < 0.6);
  const list = [];
  grp.traverse(o => { if (o.isMesh && o.material && o.material.map) list.push(o); else if (o.isMesh) list.push(o); });
  window._lhMeshes = list;
  return list.length;
});
await new Promise(r => setTimeout(r, 900));
await p.screenshot({ path: OUT + 'id_all.png' });
const info = await p.evaluate(() => {
  const out = [];
  window._lhMeshes.forEach((o, i) => { if (o.isMesh) out.push([i, o.material.name || '(no-name)', o.material.map ? 'tex' : 'flat', o.material.vertexColors ? 'vc' : '']); });
  return out.filter(x => x[1].toLowerCase().includes('rock') || x[3] === 'vc' || x[2] === 'flat');
});
console.log(JSON.stringify(info));
// 只隐藏名带 Rock 的
await p.evaluate(() => { window._lhMeshes.forEach(o => { if (o.material && /rock/i.test(o.material.name || '')) o.visible = false; }); });
await new Promise(r => setTimeout(r, 400));
await p.screenshot({ path: OUT + 'id_norock.png' });
await b.close();
