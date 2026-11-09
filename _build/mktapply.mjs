import puppeteer from 'puppeteer-core';
import fs from 'fs';
const OUT = 'D:/下载/mktapply';
fs.mkdirSync(OUT, { recursive: true });
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: 'new', args: ['--no-sandbox','--use-angle=d3d11','--enable-unsafe-swiftshader','--allow-file-access-from-files','--window-size=1000,720'] });
const page = await browser.newPage();
await page.setViewport({ width: 1000, height: 720, deviceScaleFactor: 1 });
page.on('pageerror', e => console.log('[err]', String(e).slice(0,300)));
await page.goto('file:///C:/Users/ASUS/Documents/Trae-CN/temp_20261108_01/fishing-duel/_preview_glb.html?_glb=assets/fishmarket/market_opt.glb', { waitUntil: 'load', timeout: 90000 });
await page.waitForFunction('window.__ready === true', { timeout: 60000 });

await page.evaluate(() => {
  const model = window.__model;
  let host = null; model.traverse(o => { if (!host && o.name === 'GLTF_SceneRootNode') host = o; });
  host.children.forEach(c => { c.visible = /Cube015_65|Cube016_66/.test(c.name); });
  const cam = window.__camera;
  cam.position.set(-2.0, 4.2, 0.8); cam.lookAt(-4.6, 3.2, -4.4); cam.far = 200; cam.updateProjectionMatrix();
});
await new Promise(r => setTimeout(r, 600));
await page.screenshot({ path: `${OUT}/0_before.png` });

const log = await page.evaluate(() => {
  const msgs = [];
  const trimMesh = (o) => {
    if (!o.isMesh) return;
    const g = o.geometry, pos = g.attributes.position, idx = g.index;
    if (!pos) { msgs.push('nopos ' + o.name); return; }
    const nTri = Math.round((idx ? idx.count : pos.count) / 3);
    if (nTri < 300) { msgs.push('small ' + o.name + ' ' + nTri); return; }
    const I = (t, k) => (idx ? idx.getX(t * 3 + k) : t * 3 + k);
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
    let topY = -1e9;
    B.forEach(e => { if (e.maxY > topY) topY = e.maxY; });
    let main = null;
    B.forEach(e => { if (e.maxY > topY - 0.2 && (!main || e.n > main.n)) main = e; });
    if (!main) { msgs.push('nomain ' + o.name); return; }
    if (main.n < nTri * 0.05) { msgs.push('frag ' + o.name + ' main=' + main.n + '/' + nTri); return; }
    msgs.push('main ' + o.name + ' n=' + main.n + ' x[' + main.minX.toFixed(2) + ',' + main.maxX.toFixed(2) + '] z[' + main.minZ.toFixed(2) + ',' + main.maxZ.toFixed(2) + ']');
    const drop = new Set();
    B.forEach((e, key) => {
      if (e === main || e.n < 60 || e.minY < 0.45) return;
      const outX = e.minX > main.maxX + 0.35 || e.maxX < main.minX - 0.35;
      if (outX) { drop.add(key); msgs.push('  drop n=' + e.n + ' x[' + e.minX.toFixed(2) + ',' + e.maxX.toFixed(2) + '] y[' + e.minY.toFixed(2) + ',' + e.maxY.toFixed(2) + '] z[' + e.minZ.toFixed(2) + ',' + e.maxZ.toFixed(2) + ']'); }
    });
    if (!drop.size) { msgs.push('  nodrop ' + o.name); return; }
    const keep = []; let cut = 0;
    for (let t = 0; t < nTri; t++) {
      if (drop.has(find(vid[I(t,0)]))) { cut++; continue; }
      keep.push(I(t,0), I(t,1), I(t,2));
    }
    if (!cut) { msgs.push('nocut ' + o.name); return; }
    if (keep.length / 3 < nTri * 0.6) { msgs.push('toomuch ' + o.name); return; }
    g.setIndex(keep);
    msgs.push('CUT ' + o.name + ' ' + nTri + ' -> ' + keep.length / 3);
  };
  const model = window.__model;
  let host = null; model.traverse(o => { if (!host && o.name === 'GLTF_SceneRootNode') host = o; });
  host.children.forEach(c => { if (/Cube015_65|Cube016_66/.test(c.name)) c.traverse(trimMesh); });
  return msgs;
});
console.log(log.join('\n'));
await page.evaluate(() => window.__renderer.render(window.__scene, window.__camera));
await new Promise(r => setTimeout(r, 400));
await page.screenshot({ path: `${OUT}/1_after.png` });
await page.evaluate(() => { const cam = window.__camera; cam.position.set(2.6, 5.2, 2.6); cam.lookAt(-3.4, 2.2, -4.4); cam.updateProjectionMatrix(); window.__renderer.render(window.__scene, window.__camera); });
await new Promise(r => setTimeout(r, 400));
await page.screenshot({ path: `${OUT}/2_wide.png` });
await browser.close();
