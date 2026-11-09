import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: 'new', args: ['--no-sandbox','--use-angle=d3d11','--enable-unsafe-swiftshader','--allow-file-access-from-files'] });
const page = await browser.newPage();
page.on('pageerror', e => console.log('[err]', String(e).slice(0,200)));
await page.goto('file:///C:/Users/ASUS/Documents/Trae-CN/temp_20261108_01/fishing-duel/_preview_glb.html?_glb=assets/fishmarket/market_opt.glb', { waitUntil: 'load', timeout: 90000 });
await page.waitForFunction('window.__ready === true', { timeout: 60000 });
const r = await page.evaluate(() => {
  const model = window.__model;
  let host = null; model.traverse(o => { if (!host && o.name === 'GLTF_SceneRootNode') host = o; });
  const out = [];
  host.children.forEach(c => {
    if (c.name === 'Cube015_65') {
      out.push('MATCH ' + c.name + ' type=' + c.type);
      let n = 0;
      c.traverse(o => {
        if (o.isMesh) { n++; out.push('  mesh ' + o.name + ' hasIdx=' + !!o.geometry.index + ' posCount=' + (o.geometry.attributes.position ? o.geometry.attributes.position.count : 'none') + ' drawRange=' + JSON.stringify(o.geometry.drawRange)); }
      });
      out.push('  meshes ' + n);
    }
  });
  return out;
});
console.log(r.join('\n'));
await browser.close();
