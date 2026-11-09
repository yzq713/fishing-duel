import puppeteer from 'puppeteer-core';
import fs from 'fs';
const OUT = 'D:/下载/mkttry2';
fs.mkdirSync(OUT, { recursive: true });
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: 'new', args: ['--no-sandbox','--use-angle=d3d11','--enable-unsafe-swiftshader','--allow-file-access-from-files','--window-size=1000,720'] });
const page = await browser.newPage();
await page.setViewport({ width: 1000, height: 720, deviceScaleFactor: 1 });
await page.goto('file:///C:/Users/ASUS/Documents/Trae-CN/temp_20261108_01/fishing-duel/_preview_glb.html?_glb=assets/fishmarket/market_opt.glb', { waitUntil: 'load', timeout: 90000 });
await page.waitForFunction('window.__ready === true', { timeout: 60000 });

await page.evaluate(() => {
  const model = window.__model;
  let host = null; model.traverse(o => { if (!host && o.name === 'GLTF_SceneRootNode') host = o; });
  host.children.forEach(c => { c.visible = (c.name === 'Cube015_65' || c.name === 'Cube016_66'); });
  const cam = window.__camera;
  cam.position.set(-2.0, 4.2, 0.8);
  cam.lookAt(-4.6, 3.2, -4.4);
  cam.far = 200; cam.updateProjectionMatrix();
});
await new Promise(r => setTimeout(r, 600));
await page.screenshot({ path: `${OUT}/0_before.png` });

const log = await page.evaluate(() => {
 try {
  const T = window.THREE, model = window.__model;
  let host = null; model.traverse(o => { if (!host && o.name === 'GLTF_SceneRootNode') host = o; });
  const msgs = [];
  const trimMesh = (o) => {
    if (!o.isMesh) return;
    const g = o.geometry, pos = g.attributes.position, idx = g.index;
    if (!pos) return;
    const nTri = (idx ? idx.count : pos.count) / 3;
    const I = (t, k) => (idx ? idx.getX(t * 3 + k) : t * 3 + k);
    if (nTri < 300) return;
    const map = new Map(), vid = new Int32Array(pos.count);
    for (let i = 0; i < pos.count; i++) {
      const k = Math.round(pos.getX(i)*200) + '|' + Math.round(pos.getY(i)*200) + '|' + Math.round(pos.getZ(i)*200);
      let v = map.get(k); if (v === undefined) { v = map.size; map.set(k, v); }
      vid[i] = v;
    }
    const nv = map.size, par = new Int32Array(nv);
    for (let i = 0; i < nv; i++) par[i] = i;
    const find = (a) => { while (par[a] !== a) { par[a] = par[par[a]]; a = par[a]; } return a; };
    const uni = (a, b) => { a = find(a); b = find(b); if (a !== b) par[a] = b; };
    for (let t = 0; t < nTri; t++) { uni(vid[I(t,0)], vid[I(t,1)]); uni(vid[I(t,1)], vid[I(t,2)]); }
    const B = new Map();
    for (let t = 0; t < nTri; t++) {
      const r = find(vid[I(t,0)]);
      let e = B.get(r);
      if (!e) { e = { n:0, minX:1e9, maxX:-1e9, minY:1e9, maxY:-1e9, minZ:1e9, maxZ:-1e9 }; B.set(r, e); }
      e.n++;
      for (let k = 0; k < 3; k++) {
        const vi = I(t,k), x = pos.getX(vi), y = pos.getY(vi), z = pos.getZ(vi);
        if (x < e.minX) e.minX = x; if (x > e.maxX) e.maxX = x;
        if (y < e.minY) e.minY = y; if (y > e.maxY) e.maxY = y;
        if (z < e.minZ) e.minZ = z; if (z > e.maxZ) e.maxZ = z;
      }
    }
    let main = null; B.forEach(e => { if (!main || e.n > main.n) main = e; });
    if (!main || main.n < nTri * 0.3) return;
    const keep = []; let cut = 0;
    for (let t = 0; t < nTri; t++) {
      const e = B.get(find(vid[idx.getX(t*3)]));
      let drop = false;
      if (e !== main && e.n >= 60 && e.minY > 0.45) {
        const ox = Math.min(e.maxX, main.maxX) - Math.max(e.minX, main.minX);
        const oz = Math.min(e.maxZ, main.maxZ) - Math.max(e.minZ, main.minZ);
        if (ox <= 0.05 || oz <= 0.05) drop = true;
      }
      if (drop) cut++; else keep.push(I(t,0), I(t,1), I(t,2));
    }
    if (!cut || keep.length/3 < nTri * 0.6) return;
    g.setIndex(keep);
    msgs.push(`${o.name} ${nTri}->${keep.length/3} cut ${cut}`);
  };
  host.children.forEach(c => { if (/^Cube015_65$|^Cube016_66$/.test(c.name)) c.traverse(trimMesh); });
  msgs.push('scanned ' + host.children.length + ' children');
  return msgs;
 } catch (e) { return ['ERR ' + String(e)]; }
});
console.log(log.join('\n'));
await page.evaluate(() => window.__renderer.render(window.__scene, window.__camera));
await new Promise(r => setTimeout(r, 400));
await page.screenshot({ path: `${OUT}/1_after.png` });

// 换个更远的视角
await page.evaluate(() => {
  const cam = window.__camera;
  cam.position.set(2.5, 5.0, 2.5); cam.lookAt(-3.4, 2.2, -4.4);
  cam.updateProjectionMatrix();
  window.__renderer.render(window.__scene, window.__camera);
});
await new Promise(r => setTimeout(r, 400));
await page.screenshot({ path: `${OUT}/2_after_wide.png` });
await browser.close();
