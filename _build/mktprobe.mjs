import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: 'new', args: ['--no-sandbox','--use-angle=d3d11','--enable-unsafe-swiftshader','--allow-file-access-from-files'] });
const page = await browser.newPage();
await page.goto('file:///C:/Users/ASUS/Documents/Trae-CN/temp_20261108_01/fishing-duel/_preview_glb.html?_glb=assets/fishmarket/market_opt.glb', { waitUntil: 'load', timeout: 90000 });
await page.waitForFunction('window.__ready === true', { timeout: 60000 });
const r = await page.evaluate(() => {
  const T = window.THREE, model = window.__model;
  model.updateMatrixWorld(true);
  const whole = new T.Box3().setFromObject(model);
  const host = (() => { let h = null; model.traverse(o => { if (!h && o.name === 'GLTF_SceneRootNode') h = o; }); return h || model; })();
  const out = [];
  host.children.forEach(ch => {
    const b = new T.Box3().setFromObject(ch);
    const s = b.getSize(new T.Vector3()), c = b.getCenter(new T.Vector3());
    out.push({ n: ch.name, mnY: +b.min.y.toFixed(2), mxY: +b.max.y.toFixed(2),
      cx: +c.x.toFixed(2), cz: +c.z.toFixed(2), w: +s.x.toFixed(2), h: +s.y.toFixed(2), d: +s.z.toFixed(2) });
  });
  return { total: host.children.length, box: { min: whole.min.toArray().map(n=>+n.toFixed(1)), max: whole.max.toArray().map(n=>+n.toFixed(1)) }, list: out };
});
console.log('NODES', r.total, 'BOX', JSON.stringify(r.box));
r.list.sort((a,b)=> (b.mnY - a.mnY)).forEach(x => console.log(JSON.stringify(x)));
await browser.close();
