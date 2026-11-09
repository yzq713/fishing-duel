import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: 'new', args: ['--no-sandbox','--use-angle=d3d11','--enable-unsafe-swiftshader','--allow-file-access-from-files'] });
const page = await browser.newPage();
page.on('pageerror', e => console.log('[err]', String(e).slice(0,300)));
await page.goto('file:///C:/Users/ASUS/Documents/Trae-CN/temp_20261108_01/fishing-duel/_preview_glb.html?_glb=assets/fishmarket/market_opt.glb', { waitUntil: 'load', timeout: 90000 });
await page.waitForFunction('window.__ready === true', { timeout: 60000 });
const r = await page.evaluate(() => {
  const model = window.__model;
  let host = null; model.traverse(o => { if (!host && o.name === 'GLTF_SceneRootNode') host = o; });
  const diag = [];
  for (const c of host.children) {
    if (!/Cube015_65|Cube016_66/.test(c.name)) continue;
    diag.push('node ' + c.name);
    c.traverse((o) => {
      if (!o.isMesh) return;
      const pos = o.geometry.attributes.position, idx = o.geometry.index;
      diag.push('  mesh ' + o.name + ' nTri=' + ((idx ? idx.count : pos.count) / 3) + ' isMesh=' + o.isMesh + ' visible=' + o.visible);
    });
  }
  return diag;
});
console.log(r.join('\n'));
await browser.close();
