import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: 'new', args: ['--no-sandbox','--use-angle=d3d11','--enable-unsafe-swiftshader','--allow-file-access-from-files'] });
const page = await browser.newPage();
await page.goto('file:///C:/Users/ASUS/Documents/Trae-CN/temp_20261108_01/fishing-duel/_preview_glb.html?_glb=assets/cliff/cliff_small.glb', { waitUntil: 'load' });
await page.waitForFunction('window.__ready === true', { timeout: 40000 });
const r = await page.evaluate(() => {
  const T = window.THREE, model = window.__model;
  let mesh = null; model.traverse(o => { if (o.isMesh) mesh = o; });
  model.updateMatrixWorld(true);
  const g = mesh.geometry, p = g.attributes.position, idx = g.index;
  const n = idx ? idx.count / 3 : p.count / 3;
  const v = new T.Vector3();
  const tris = [];
  for (let i = 0; i < n; i++) {
    const pts = [];
    let onPlane = 0;
    for (let k = 0; k < 3; k++) {
      v.fromBufferAttribute(p, idx ? idx.getX(i*3+k) : i*3+k);
      mesh.localToWorld(v);
      pts.push([v.x, v.y, v.z]);
      if (Math.abs(v.x + 16.05) < 0.35) onPlane++;
    }
    if (onPlane === 3) {
      const ys = pts.map(q => q[1]), zs = pts.map(q => q[2]);
      tris.push({ y0: +Math.min(...ys).toFixed(1), y1: +Math.max(...ys).toFixed(1), z0: +Math.min(...zs).toFixed(1), z1: +Math.max(...zs).toFixed(1) });
    }
  }
  return { indexed: !!idx, total: n, wall: tris.length, list: tris.sort((a,b)=>b.z1-a.z1).slice(0, 40) };
});
console.log('indexed', r.indexed, 'tris', r.total, 'frontWallTris', r.wall);
console.log(JSON.stringify(r.list));
await browser.close();
