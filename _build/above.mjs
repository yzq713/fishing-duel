import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: 'new', args: ['--no-sandbox','--use-angle=d3d11','--enable-unsafe-swiftshader','--allow-file-access-from-files'] });
const page = await browser.newPage();
await page.setCacheEnabled(false);
await page.goto('file:///C:/Users/ASUS/Documents/Trae-CN/temp_20261108_01/fishing-duel/index.html?v=33', { waitUntil: 'load', timeout: 90000 });
await page.waitForFunction('window.game && window.game.world', { timeout: 60000 });
await new Promise(r => setTimeout(r, 5000));
const r = await page.evaluate(() => {
  const T = window.THREE, scene = window.game.scene, ww = window.game.world;
  const shops = ['baitShop','gunShop'].map(k => ww[k]);
  const out = [];
  scene.updateMatrixWorld(true);
  shops.forEach((s, si) => {
    const y0 = ww.heightAt(s.x, s.z);
    scene.traverse((o) => {
      if (!o.isMesh) return;
      const b = new T.Box3().setFromObject(o);
      const c = b.getCenter(new T.Vector3());
      const d = Math.hypot(c.x - s.x, c.z - s.z);
      if (d > 4.5) return;
      if (b.min.y - y0 < 2.6) return;
      out.push({ shop: si, name: o.name, parent: o.parent ? o.parent.name : '', d: +d.toFixed(1),
        minY: +(b.min.y - y0).toFixed(2), maxY: +(b.max.y - y0).toFixed(2),
        w: +(b.max.x-b.min.x).toFixed(2), h: +(b.max.y-b.min.y).toFixed(2), dp: +(b.max.z-b.min.z).toFixed(2),
        tris: Math.round((o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count)/3) });
    });
  });
  return out.sort((a,b)=>b.minY-a.minY);
});
r.forEach(x => console.log(JSON.stringify(x)));
await browser.close();
