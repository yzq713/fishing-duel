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
  // 顶点按位置量化后合并
  const key = (i) => {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    return `${Math.round(x*1000)}|${Math.round(y*1000)}|${Math.round(z*1000)}`;
  };
  const map = new Map(); const vid = new Int32Array(p.count);
  for (let i = 0; i < p.count; i++) {
    const k = key(i);
    if (!map.has(k)) map.set(k, map.size);
    vid[i] = map.get(k);
  }
  const nv = map.size;
  const parent = new Int32Array(nv);
  for (let i = 0; i < nv; i++) parent[i] = i;
  const find = (a) => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
  const uni = (a, b) => { a = find(a); b = find(b); if (a !== b) parent[a] = b; };
  for (let t = 0; t < nTri; t++) {
    const a = vid[idx ? idx.getX(t*3) : t*3], b = vid[idx ? idx.getX(t*3+1) : t*3+1], c = vid[idx ? idx.getX(t*3+2) : t*3+2];
    uni(a, b); uni(b, c);
  }
  // 统计每块：三角形数 + 包围盒（局部坐标，乘 mesh 世界矩阵）
  const boxes = new Map();
  const v = new T.Vector3();
  for (let t = 0; t < nTri; t++) {
    const a = vid[idx ? idx.getX(t*3) : t*3];
    const root = find(a);
    let e = boxes.get(root);
    if (!e) { e = { n: 0, min: [1e9,1e9,1e9], max: [-1e9,-1e9,-1e9] }; boxes.set(root, e); }
    e.n++;
    for (let k = 0; k < 3; k++) {
      v.fromBufferAttribute(p, idx ? idx.getX(t*3+k) : t*3+k);
      v.applyMatrix4(mesh.matrixWorld);
      e.min[0] = Math.min(e.min[0], v.x); e.min[1] = Math.min(e.min[1], v.y); e.min[2] = Math.min(e.min[2], v.z);
      e.max[0] = Math.max(e.max[0], v.x); e.max[1] = Math.max(e.max[1], v.y); e.max[2] = Math.max(e.max[2], v.z);
    }
  }
  const out = [];
  boxes.forEach((e) => out.push({ n: e.n,
    mnY: +e.min[1].toFixed(2), mxY: +e.max[1].toFixed(2),
    cx: +((e.min[0]+e.max[0])/2).toFixed(2), cz: +((e.min[2]+e.max[2])/2).toFixed(2),
    w: +(e.max[0]-e.min[0]).toFixed(2), h: +(e.max[1]-e.min[1]).toFixed(2), d: +(e.max[2]-e.min[2]).toFixed(2) }));
  return { tris: nTri, verts: p.count, merged: nv, parts: out.length, list: out.sort((a,b)=>b.n-a.n) };
});
console.log('TRIS', r.tris, 'VERTS', r.verts, 'MERGED', r.merged, 'PARTS', r.parts);
// 只打印 world x < -4.6 的块
r.list.filter(x => x.cx - x.w/2 < -4.6).forEach(x => console.log('OUT ' + JSON.stringify(x)));
r.list.forEach(x => console.log(JSON.stringify(x)));
await browser.close();
