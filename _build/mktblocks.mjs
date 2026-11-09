import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: 'new', args: ['--no-sandbox','--use-angle=d3d11','--enable-unsafe-swiftshader','--allow-file-access-from-files'] });
const page = await browser.newPage();
await page.goto('file:///C:/Users/ASUS/Documents/Trae-CN/temp_20261108_01/fishing-duel/_preview_glb.html?_glb=assets/fishmarket/market_opt.glb', { waitUntil: 'load', timeout: 90000 });
await page.waitForFunction('window.__ready === true', { timeout: 60000 });
const GROUPS = {
  red: ['Cube015_65'],
  green: ['Cube016_66'],
  blue: ['Cube012_63'],
  small: ['Cube014_64']
};
const r = await page.evaluate((GROUPNAMES) => {
  const model = window.__model;
  model.updateMatrixWorld(true);
  let host = null; model.traverse(o => { if (!host && o.name === 'GLTF_SceneRootNode') host = o; });
  const out = {};
  Object.keys(GROUPNAMES).forEach(kind => {
    GROUPNAMES[kind].forEach(name => {
      const node = host.children.find(c => c.name === name);
      if (!node) { out[kind] = 'missing ' + name; return; }
      const bb = new window.THREE.Box3().setFromObject(node);
      const res = { box: { min: bb.min.toArray().map(n=>+n.toFixed(2)), max: bb.max.toArray().map(n=>+n.toFixed(2)) }, meshes: [] };
      node.traverse(mesh => {
        if (!mesh.isMesh) return;
        const g = mesh.geometry, p = g.attributes.position, idx = g.index;
        const nTri = (idx ? idx.count : p.count) / 3;
        const key = i => Math.round(p.getX(i)*200) + '|' + Math.round(p.getY(i)*200) + '|' + Math.round(p.getZ(i)*200);
        const map = new Map(); const vid = new Int32Array(p.count);
        for (let i = 0; i < p.count; i++) { const k = key(i); let v = map.get(k); if (v === undefined) { v = map.size; map.set(k, v); } vid[i] = v; }
        const nv = map.size, par = new Int32Array(nv);
        for (let i = 0; i < nv; i++) par[i] = i;
        const find = a => { while (par[a] !== a) { par[a] = par[par[a]]; a = par[a]; } return a; };
        const uni = (a,b) => { a = find(a); b = find(b); if (a !== b) par[a] = b; };
        const I = (t,k) => (idx ? idx.getX(t*3+k) : t*3+k);
        for (let t = 0; t < nTri; t++) { uni(vid[I(t,0)], vid[I(t,1)]); uni(vid[I(t,1)], vid[I(t,2)]); }
        const B = new Map();
        for (let t = 0; t < nTri; t++) {
          const r0 = find(vid[I(t,0)]);
          let e = B.get(r0); if (!e) { e = { n:0, min:[1e9,1e9,1e9], max:[-1e9,-1e9,-1e9] }; B.set(r0, e); }
          e.n++;
          for (let k = 0; k < 3; k++) { const vi = I(t,k);
            const x = p.getX(vi), y = p.getY(vi), z = p.getZ(vi);
            if (x<e.min[0]) e.min[0]=x; if (x>e.max[0]) e.max[0]=x;
            if (y<e.min[1]) e.min[1]=y; if (y>e.max[1]) e.max[1]=y;
            if (z<e.min[2]) e.min[2]=z; if (z>e.max[2]) e.max[2]=z; }
        }
        const list = []; B.forEach(e => { if (e.n >= 100) list.push({ n: e.n,
          x: [+e.min[0].toFixed(2), +e.max[0].toFixed(2)], y: [+e.min[1].toFixed(2), +e.max[1].toFixed(2)], z: [+e.min[2].toFixed(2), +e.max[2].toFixed(2)] }); });
        list.sort((a,b)=>b.n-a.n);
        res.meshes.push({ name: mesh.name, tris: Math.round(nTri), blocks: list.length, list: list.slice(0, 12) });
      });
      out[kind] = res;
    });
  });
  return out;
}, GROUPS);
for (const k of Object.keys(r)) {
  const v = r[k];
  if (typeof v === 'string') { console.log(k, v); continue; }
  console.log('=====', k, 'BOX', JSON.stringify(v.box));
  v.meshes.forEach(m => { console.log('  ', m.name, 'tris', m.tris, 'blocks', m.blocks); m.list.forEach(b => console.log('     ', JSON.stringify(b))); });
}
await browser.close();
