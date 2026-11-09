import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: 'new', args: ['--no-sandbox','--use-angle=d3d11','--enable-unsafe-swiftshader','--allow-file-access-from-files'] });
const page = await browser.newPage();
await page.goto('file:///C:/Users/ASUS/Documents/Trae-CN/temp_20261108_01/fishing-duel/_preview_glb.html?_glb=assets/fishmarket/market_opt.glb', { waitUntil: 'load', timeout: 90000 });
await page.waitForFunction('window.__ready === true', { timeout: 60000 });
const GROUPS = {
  red: ['Cube015_65','Cube004_27','Cube006_28','Cube024_36','Cube025_37','Cube026_38','Cube009_29','Cube013_8','Circle_7','Cube030_42','Cube032_43','Cube033_44','Cube034_45','Cube035_46','Cube036_47','Cube017_34','Cube010_31','Cube041_52','Cube042_53','Cube043_54','Cube050_15','Cube051_16','Cube054_4'],
  green: ['Cube016_66','Cube018_35','Cube037_48','Cube038_49','Cube011_32','Cylinder002_33','Cube052_17','Cube053_18','Cube039_50','Cube040_51','Cube008_26'],
  blue: ['Cube012_63','Cube047_60','Cube048_61','Cube049_62','Circle001_30','Circle002_58','Circle003_59','Cube001_22','Cube022_13','Cube023_14'],
  small: ['Cube014_64','Cube002_23','Cube005_24','Cube027_39','Cube028_40','Cube029_41','Cube007_25','Cube044_55','Cube045_56','Cube046_57','Cylinder_5','Cube041_52','Cube042_53','Cube043_54','Cube056_20']
};
const r = await page.evaluate((GROUPS) => {
  const T = window.THREE, model = window.__model;
  model.updateMatrixWorld(true);
  let host = null; model.traverse(o => { if (!host && o.name === 'GLTF_SceneRootNode') host = o; });
  const res = {};
  Object.keys(GROUPS).forEach(kind => {
    const g = new T.Group();
    GROUPS[kind].forEach(n => { const ch = host.children.find(c => c.name === n); if (ch) g.add(ch.clone(true)); });
    g.updateMatrixWorld(true);
    const all = new T.Box3().setFromObject(g);
    const parts = [];
    g.traverse(mesh => {
      if (!mesh.isMesh) return;
      const geo = mesh.geometry, p = geo.attributes.position, idx = geo.index;
      const nTri = idx ? idx.count / 3 : p.count / 3;
      const key = i => `${Math.round(p.getX(i)*1000)}|${Math.round(p.getY(i)*1000)}|${Math.round(p.getZ(i)*1000)}`;
      const map = new Map(); const vid = new Int32Array(p.count);
      for (let i = 0; i < p.count; i++) { const k = key(i); if (!map.has(k)) map.set(k, map.size); vid[i] = map.get(k); }
      const nv = map.size; const par = new Int32Array(nv); for (let i = 0; i < nv; i++) par[i] = i;
      const find = a => { while (par[a] !== a) { par[a] = par[par[a]]; a = par[a]; } return a; };
      const uni = (a,b) => { a = find(a); b = find(b); if (a !== b) par[a] = b; };
      for (let t = 0; t < nTri; t++) { const a = vid[idx?idx.getX(t*3):t*3], b = vid[idx?idx.getX(t*3+1):t*3+1], c = vid[idx?idx.getX(t*3+2):t*3+2]; uni(a,b); uni(b,c); }
      const M = new Map(); const v = new T.Vector3();
      for (let t = 0; t < nTri; t++) {
        const a = vid[idx?idx.getX(t*3):t*3]; const root = find(a);
        let e = M.get(root); if (!e) { e = { n:0, min:[1e9,1e9,1e9], max:[-1e9,-1e9,-1e9] }; M.set(root, e); }
        e.n++;
        for (let k = 0; k < 3; k++) { v.fromBufferAttribute(p, idx?idx.getX(t*3+k):t*3+k); v.applyMatrix4(mesh.matrixWorld);
          e.min[0]=Math.min(e.min[0],v.x); e.min[1]=Math.min(e.min[1],v.y); e.min[2]=Math.min(e.min[2],v.z);
          e.max[0]=Math.max(e.max[0],v.x); e.max[1]=Math.max(e.max[1],v.y); e.max[2]=Math.max(e.max[2],v.z); }
      }
      const list = []; M.forEach(e => list.push({ n:e.n,
        x:[+e.min[0].toFixed(2), +e.max[0].toFixed(2)], y:[+e.min[1].toFixed(2), +e.max[1].toFixed(2)], z:[+e.min[2].toFixed(2), +e.max[2].toFixed(2)] }));
      list.sort((a,b)=>b.n-a.n);
      parts.push({ mesh: mesh.name, tris: nTri, blocks: list.length, top: list.slice(0, 6) });
    });
    res[kind] = { box: { min: all.min.toArray().map(n=>+n.toFixed(2)), max: all.max.toArray().map(n=>+n.toFixed(2)) }, parts };
  });
  return res;
}, GROUPS);
for (const k of Object.keys(r)) {
  console.log('=====', k, 'BOX', JSON.stringify(r[k].box));
  r[k].parts.forEach(p => { console.log('  mesh', p.mesh, 'tris', p.tris, 'blocks', p.blocks); p.top.forEach(b => console.log('     ', JSON.stringify(b))); });
}
await browser.close();
