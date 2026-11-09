import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: 'new', args: ['--no-sandbox','--use-angle=d3d11','--enable-unsafe-swiftshader','--allow-file-access-from-files'] });
const page = await browser.newPage();
await page.goto('file:///C:/Users/ASUS/Documents/Trae-CN/temp_20261108_01/fishing-duel/_preview_glb.html?_glb=assets/fishmarket/market_opt.glb', { waitUntil: 'load', timeout: 90000 });
await page.waitForFunction('window.__ready === true', { timeout: 60000 });
const r = await page.evaluate(() => {
  const T = window.THREE, model = window.__model;
  model.updateMatrixWorld(true);
  let host = null; model.traverse(o => { if (!host && o.name === 'GLTF_SceneRootNode') host = o; });
  const node = host.children.find(c => c.name === 'Cube015_65');
  let mesh = null; node.traverse(o => { if (o.isMesh) mesh = o; });
  const g = mesh.geometry, p = g.attributes.position, idx = g.index;
  const nTri = idx ? idx.count / 3 : p.count / 3;
  const v = new T.Vector3();
  // x 分箱 0.25m，统计 y>3.2 / y<=3.2 的三角形数，以及 y 范围
  const B = new Map();
  for (let t = 0; t < nTri; t++) {
    let cx = 0, cy = 0, cz = 0;
    for (let k = 0; k < 3; k++) {
      v.fromBufferAttribute(p, idx ? idx.getX(t*3+k) : t*3+k); v.applyMatrix4(mesh.matrixWorld);
      cx += v.x; cy += v.y; cz += v.z;
    }
    cx /= 3; cy /= 3; cz /= 3;
    const bi = Math.round(cx / 0.25) * 0.25;
    let e = B.get(bi); if (!e) { e = { hi: 0, lo: 0, ymin: 1e9, ymax: -1e9, zmin: 1e9, zmax: -1e9 }; B.set(bi, e); }
    if (cy > 3.2) e.hi++; else e.lo++;
    e.ymin = Math.min(e.ymin, cy); e.ymax = Math.max(e.ymax, cy);
    e.zmin = Math.min(e.zmin, cz); e.zmax = Math.max(e.zmax, cz);
  }
  const out = [...B.entries()].sort((a,b)=>a[0]-b[0]).map(([x,e]) => ({ x:+x.toFixed(2), hi:e.hi, lo:e.lo,
    y:[+e.ymin.toFixed(1), +e.ymax.toFixed(1)], z:[+e.zmin.toFixed(1), +e.zmax.toFixed(1)] }));
  return out;
});
r.forEach(x => console.log(JSON.stringify(x)));
await browser.close();
