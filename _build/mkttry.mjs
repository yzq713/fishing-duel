import puppeteer from 'puppeteer-core';
import fs from 'fs';
const OUT = 'D:/下载/mkttry';
fs.mkdirSync(OUT, { recursive: true });
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: 'new', args: ['--no-sandbox','--use-angle=d3d11','--enable-unsafe-swiftshader','--allow-file-access-from-files','--window-size=1000,720'] });
const page = await browser.newPage();
await page.setViewport({ width: 1000, height: 720, deviceScaleFactor: 1 });
await page.goto('file:///C:/Users/ASUS/Documents/Trae-CN/temp_20261108_01/fishing-duel/_preview_glb.html?_glb=assets/fishmarket/market_opt.glb', { waitUntil: 'load', timeout: 90000 });
await page.waitForFunction('window.__ready === true', { timeout: 60000 });

// 只留红白大棚，其他全隐藏
await page.evaluate(() => {
  const model = window.__model;
  let host = null; model.traverse(o => { if (!host && o.name === 'GLTF_SceneRootNode') host = o; });
  host.children.forEach(c => { c.visible = (c.name === 'Cube015_65'); });
  const cam = window.__camera;
  cam.position.set(-2.2, 3.9, 0.6);
  cam.lookAt(-5.2, 3.3, -4.2);
  cam.far = 200; cam.updateProjectionMatrix();
});
await new Promise(r => setTimeout(r, 600));
await page.screenshot({ path: `${OUT}/0_before.png` });

for (const thr of [-5.55, -5.05, -4.55]) {
  await page.evaluate((thr) => {
    const T = window.THREE, model = window.__model;
    let host = null; model.traverse(o => { if (!host && o.name === 'GLTF_SceneRootNode') host = o; });
    const node = host.children.find(c => c.name === 'Cube015_65');
    let mesh = null; node.traverse(o => { if (o.isMesh) mesh = o; });
    if (!mesh.userData.__origIdx) mesh.userData.__origIdx = Array.from(mesh.geometry.index.array);
    const g = mesh.geometry, p = g.attributes.position;
    const orig = mesh.userData.__origIdx;
    const v = new T.Vector3(); const keep = []; let cut = 0;
    for (let t = 0; t < orig.length / 3; t++) {
      let cx = 0;
      for (let k = 0; k < 3; k++) { v.fromBufferAttribute(p, orig[t*3+k]); v.applyMatrix4(mesh.matrixWorld); cx += v.x; }
      if (cx / 3 < thr) { cut += 3; continue; }
      keep.push(orig[t*3], orig[t*3+1], orig[t*3+2]);
    }
    g.setIndex(keep);
    g.index.needsUpdate = true;
    console.log('thr', thr, 'cutTris', cut/3, 'left', keep.length/3);
  }, thr);
  await page.evaluate(() => window.__renderer.render(window.__scene, window.__camera));
  await new Promise(r => setTimeout(r, 400));
  await page.screenshot({ path: `${OUT}/1_thr${String(thr).replace('-','m').replace('.','_')}.png` });
}
await browser.close();
