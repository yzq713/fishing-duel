import puppeteer from 'puppeteer-core';
const V = Date.now();
const ROOT = 'file:///C:/Users/ASUS/Documents/Trae-CN/temp_20261108_01/fishing-duel/';
const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  headless: 'new',
  args: ['--no-sandbox', '--use-angle=d3d11', '--enable-unsafe-swiftshader', '--allow-file-access-from-files']
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 760 });
page.on('console', (m) => { if (m.text().includes('lighthouse')) console.log('[log]', m.text()); });
await page.goto(ROOT + 'index.html?v=' + V, { waitUntil: 'load', timeout: 120000 });
await page.waitForFunction('window.game && window.game.world', { timeout: 90000 });
await new Promise((r) => setTimeout(r, 6000));
const out = await page.evaluate(() => {
  const THREE = window.THREE;
  const w = window.game.world;
  const L = w.lighthouse;
  let grp = null;
  w.group.children.forEach((c) => {
    if (Math.abs(c.position.x - L.x) < 0.6 && Math.abs(c.position.z - L.z) < 0.6) grp = c;
  });
  if (!grp) return { err: 'no group' };
  const res = { L, kids: [], meshes: [] };
  grp.children.forEach((k) => res.kids.push({ type: k.type, y: +k.position.y.toFixed(2), name: k.name }));
  grp.traverse((o) => {
    if (!o.isMesh) return;
    const bb = new THREE.Box3().setFromObject(o);
    const s = bb.getSize(new THREE.Vector3());
    res.meshes.push({
      n: o.name, mat: o.material && o.material.name,
      size: [+s.x.toFixed(2), +s.y.toFixed(2), +s.z.toFixed(2)],
      minY: +bb.min.y.toFixed(2), maxY: +bb.max.y.toFixed(2),
      col: o.material && o.material.color ? '#' + o.material.color.getHex().toString(16) : '',
      map: !!(o.material && o.material.map)
    });
  });
  const bb = new THREE.Box3().setFromObject(grp);
  res.total = { minY: +bb.min.y.toFixed(2), maxY: +bb.max.y.toFixed(2), size: bb.getSize(new THREE.Vector3()).toArray().map((v) => +v.toFixed(2)) };
  return res;
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
