import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  headless: 'new',
  args: ['--no-sandbox', '--use-angle=d3d11', '--enable-unsafe-swiftshader', '--allow-file-access-from-files']
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 200)));
await page.goto('file:///C:/Users/ASUS/Documents/Trae-CN/temp_20261108_01/fishing-duel/index.html', { waitUntil: 'load', timeout: 90000 });
await page.waitForFunction('window.game && window.game.world', { timeout: 60000 });
await new Promise(r => setTimeout(r, 4000));
const out = await page.evaluate(() => {
  const w = window.game.world;
  const bed = w.beds[0];
  // 找到 cliffhut 那个 group：包含 GLB 场景的父级
  let grp = null;
  window.game.scene.traverse((o) => {
    if (!grp && o.type === 'Group' && o.children.some((c) => c.type === 'Group' || (c.isObject3D && c.children.length > 2))) {
      // 粗略：找 y 位置接近且含 3 个子以上的组
    }
  });
  // 直接量：场景里所有 mesh 的 bbox 里，包含 bed 的那个组
  const bb = new THREE.Box3();
  let best = null;
  window.game.scene.traverse((o) => {
    if (o.isMesh && o.parent && o.parent.parent && o.parent.parent.position) {
      const p = o.parent.parent.position;
      if (Math.hypot(p.x - bed.x, p.z - bed.z) < 8 && !best) best = o.parent.parent;
    }
  });
  const info = {};
  if (best) {
    bb.setFromObject(best);
    info.grpPos = best.position.toArray().map(n => +n.toFixed(2));
    info.grpRot = +best.rotation.y.toFixed(3);
    info.bb = [bb.min.toArray().map(n => +n.toFixed(2)), bb.max.toArray().map(n => +n.toFixed(2))];
    info.children = best.children.length;
  }
  info.bed = { x: +bed.x.toFixed(2), z: +bed.z.toFixed(2) };
  const r = Math.hypot(best ? best.position.x : 0, best ? best.position.z : 1);
  info.dirToCenter = [-(best ? best.position.x : 0) / r, -(best ? best.position.z : 0) / r].map(n => +n.toFixed(2));
  info.dirToBed = [(bed.x - best.position.x), (bed.z - best.position.z)].map(n => +n.toFixed(2));
  return info;
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
