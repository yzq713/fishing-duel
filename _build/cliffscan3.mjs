import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: 'new', args: ['--no-sandbox','--use-angle=d3d11','--enable-unsafe-swiftshader','--allow-file-access-from-files'] });
const page = await browser.newPage();
await page.goto('file:///C:/Users/ASUS/Documents/Trae-CN/temp_20261108_01/fishing-duel/_preview_glb.html?_glb=assets/cliff/cliff_small.glb', { waitUntil: 'load' });
await page.waitForFunction('window.__ready === true', { timeout: 40000 });
const r = await page.evaluate(() => {
  const T = window.THREE, model = window.__model;
  const box = new T.Box3().setFromObject(model);
  const rc = new T.Raycaster();
  const down = (x, z) => { rc.set(new T.Vector3(x, box.max.y + 60, z), new T.Vector3(0,-1,0)); const h = rc.intersectObject(model, true); return h.length ? +h[0].point.y.toFixed(1) : null; };
  const roofX = []; for (let x = -44; x <= 44; x += 3) roofX.push([x, down(x, 8)]);
  const roofX0 = []; for (let x = -44; x <= 44; x += 3) roofX0.push([x, down(x, -14)]);
  // 三角形统计：按 x 分区
  const pos = model.getObjectByProperty('isMesh', true) || null;
  let mesh = null; model.traverse(o => { if (o.isMesh) mesh = o; });
  const g = mesh.geometry, p = g.attributes.position, idx = g.index;
  const n = idx ? idx.count / 3 : p.count / 3;
  const bins = new Array(18).fill(0);
  let ymin = 1e9, ymax = -1e9;
  for (let i = 0; i < n; i++) {
    const a = idx ? idx.getX(i*3) : i*3, b = idx ? idx.getX(i*3+1) : i*3+1, c = idx ? idx.getX(i*3+2) : i*3+2;
    const cx = (p.getX(a)+p.getX(b)+p.getX(c))/3;
    const bi = Math.max(0, Math.min(17, Math.floor((cx + 45) / 5)));
    bins[bi]++;
  }
  return { tris: n, roofX, roofX0, bins };
});
console.log('TRIS', r.tris);
console.log('ROOF@z=8', JSON.stringify(r.roofX));
console.log('ROOF@z=-14', JSON.stringify(r.roofX0));
console.log('BINS(x -45..45 by 5)', JSON.stringify(r.bins));
await browser.close();
