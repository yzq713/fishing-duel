import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: 'new', args: ['--no-sandbox','--use-angle=d3d11','--enable-unsafe-swiftshader','--allow-file-access-from-files'] });
const page = await browser.newPage();
await page.setCacheEnabled(false);
await page.goto('file:///C:/Users/ASUS/Documents/Trae-CN/temp_20261108_01/fishing-duel/index.html?v=21', { waitUntil: 'load', timeout: 90000 });
await page.waitForFunction('window.game && window.game.world', { timeout: 60000 });
await new Promise(r => setTimeout(r, 5000));
const r = await page.evaluate(() => {
  const T = window.THREE, ww = window.game.world, scene = window.game.scene;
  const root = ww.group || scene;
  const shops = ['baitShop','gunShop','rodShop','chestShop','bagShop'].map(k => ww[k] ? { k, x: ww[k].x, z: ww[k].z } : null).filter(Boolean);
  const out = {};
  shops.forEach(s => {
    // 找位置匹配的商店 group
    let grp = null, best = 1e9;
    root.children.forEach(ch => {
      const d = Math.hypot(ch.position.x - s.x, ch.position.z - s.z);
      if (d < best) { best = d; grp = ch; }
    });
    if (!grp || best > 1) { out[s.k] = 'group not found ' + best.toFixed(2); return; }
    grp.updateMatrixWorld(true);
    const y0 = grp.position.y;
    const list = [];
    grp.traverse(o => {
      if (!o.isMesh) return;
      const b = new T.Box3().setFromObject(o);
      list.push({
        name: o.name,
        minY: +(b.min.y - y0).toFixed(2), maxY: +(b.max.y - y0).toFixed(2),
        x: +b.getCenter(new T.Vector3()).x.toFixed(2), z: +b.getCenter(new T.Vector3()).z.toFixed(2),
        w: +(b.max.x-b.min.x).toFixed(2), h: +(b.max.y-b.min.y).toFixed(2), dp: +(b.max.z-b.min.z).toFixed(2),
        tris: o.geometry.index ? o.geometry.index.count/3 : o.geometry.attributes.position.count/3
      });
    });
    out[s.k] = { pos: { x: +s.x.toFixed(2), z: +s.z.toFixed(2), y0: +y0.toFixed(2) }, n: list.length,
      high: list.filter(m => m.minY > 2.6).sort((a,b)=>b.minY-a.minY) };
  });
  return out;
});
for (const k of Object.keys(r)) {
  const v = r[k];
  if (typeof v === 'string') { console.log(k, v); continue; }
  console.log('===', k, JSON.stringify(v.pos), 'meshes', v.n, 'high', v.high.length);
  v.high.forEach(m => console.log('  ', JSON.stringify(m)));
}
await browser.close();
