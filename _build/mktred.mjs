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
  const b0 = new T.Box3().setFromObject(node); const s0 = b0.getSize(new T.Vector3());
  const out = [];
  node.traverse(o => {
    if (!o.isMesh) return;
    const b = new T.Box3().setFromObject(o); const s = b.getSize(new T.Vector3()); const c = b.getCenter(new T.Vector3());
    out.push({ n: o.name || '(mesh)', mat: (o.material && (o.material.name||o.material.type))||'?',
      mnY:+b.min.y.toFixed(2), mxY:+b.max.y.toFixed(2), cx:+c.x.toFixed(2), cz:+c.z.toFixed(2),
      w:+s.x.toFixed(2), h:+s.y.toFixed(2), d:+s.z.toFixed(2),
      tris: o.geometry.index ? o.geometry.index.count/3 : o.geometry.attributes.position.count/3 });
  });
  return { box: { min: b0.min.toArray().map(n=>+n.toFixed(2)), max: b0.max.toArray().map(n=>+n.toFixed(2)) }, n: out.length, list: out };
});
console.log('RED BOX', JSON.stringify(r.box), 'meshes', r.n);
r.list.sort((a,b)=>b.mxY-a.mxY).forEach(x=>console.log(JSON.stringify(x)));
await browser.close();
