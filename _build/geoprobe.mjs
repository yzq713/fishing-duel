import puppeteer from 'puppeteer-core';
const GLB = process.argv[2];
const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  headless: 'new',
  args: ['--no-sandbox', '--use-angle=d3d11', '--enable-unsafe-swiftshader']
});
const page = await browser.newPage();
await page.setViewport({ width: 600, height: 400 });
await page.goto('http://127.0.0.1:8799/_preview_glb.html?_glb=' + GLB, { waitUntil: 'load', timeout: 60000 });
await page.waitForFunction('window.__ready===true || window.__err', { timeout: 60000 });
const res = await page.evaluate(() => {
  const model = window.__model;
  const box = new THREE.Box3().setFromObject(model);
  const out = { bbox: [box.min.toArray().map(n => +n.toFixed(2)), box.max.toArray().map(n => +n.toFixed(2))], up: [] };
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), n = new THREE.Vector3(), m = new THREE.Matrix4();
  model.updateMatrixWorld(true);
  model.traverse((o) => {
    if (!o.isMesh) return;
    m.copy(o.matrixWorld);
    const g = o.geometry, pos = g.attributes.position, idx = g.index;
    const cnt = idx ? idx.count : pos.count;
    for (let i = 0; i < cnt; i += 3) {
      const ia = idx ? idx.getX(i) : i, ib = idx ? idx.getX(i + 1) : i + 1, ic = idx ? idx.getX(i + 2) : i + 2;
      a.fromBufferAttribute(pos, ia).applyMatrix4(m);
      b.fromBufferAttribute(pos, ib).applyMatrix4(m);
      c.fromBufferAttribute(pos, ic).applyMatrix4(m);
      e1.subVectors(b, a); e2.subVectors(c, a);
      n.crossVectors(e1, e2);
      const ar = n.length() / 2;
      if (ar < 1) continue;
      n.normalize();
      if (Math.abs(n.y) < 0.93) continue;
      const ctr = a.clone().add(b).add(c).multiplyScalar(1 / 3);
      out.up.push({ y: +ctr.y.toFixed(2), x: +ctr.x.toFixed(1), z: +ctr.z.toFixed(1), a: +ar.toFixed(0) });
    }
  });
  // 按 y 聚类，输出每层的高度和水平范围
  const lv = new Map();
  out.up.forEach((t) => { const k = Math.round(t.y / 2) * 2; const o2 = lv.get(k) || { n: 0, a: 0, minx: 1e9, maxx: -1e9, minz: 1e9, maxz: -1e9 }; o2.n++; o2.a += t.a; o2.minx = Math.min(o2.minx, t.x); o2.maxx = Math.max(o2.maxx, t.x); o2.minz = Math.min(o2.minz, t.z); o2.maxz = Math.max(o2.maxz, t.z); lv.set(k, o2); });
  out.levels = [...lv.entries()].filter(([, v]) => v.a > 200).sort((p, q) => q[1].a - p[1].a).slice(0, 12)
    .map(([k, v]) => ({ y: k, tris: v.n, area: Math.round(v.a), x: [v.minx, v.maxx], z: [v.minz, v.maxz] }));
  out.total = out.up.length;
  delete out.up;
  return out;
});
console.log(JSON.stringify(res, null, 1));
await browser.close();
