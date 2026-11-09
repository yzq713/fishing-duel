import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: 'new', args: ['--no-sandbox','--use-angle=d3d11','--enable-unsafe-swiftshader','--allow-file-access-from-files'] });
const page = await browser.newPage();
await page.goto('file:///C:/Users/ASUS/Documents/Trae-CN/temp_20261108_01/fishing-duel/_preview_glb.html?_glb=assets/cliff/cliff_small.glb', { waitUntil: 'load' });
await page.waitForFunction('window.__ready === true', { timeout: 40000 });
const r = await page.evaluate(() => {
  const T = window.THREE, model = window.__model;
  const box = new T.Box3().setFromObject(model);
  const rc = new T.Raycaster();
  const probe = (o, d) => { rc.set(new T.Vector3(o[0],o[1],o[2]), new T.Vector3(d[0],d[1],d[2])); const h = rc.intersectObject(model, true); return h.length ? [h[0].point.x,h[0].point.y,h[0].point.z].map(n=>+n.toFixed(2)) : null; };
  const deck = [];   // 露台面：从上看
  for (let z = -40; z <= 30; z += 5) for (let x = -36; x <= -20; x += 4) { const h = probe([x, 60, z], [0,-1,0]); deck.push([x, z, h ? h[1] : null]); }
  const canopy = []; // 顶棚下沿：从下看
  for (let z = -30; z <= 30; z += 4) { const h = probe([-25, -14, z], [0,1,0]); canopy.push([z, h ? h[1] : null]); }
  // 前墙根部：找地板与门坎
  const sill = [];
  for (let y = -12; y <= 4; y += 1) { const h = probe([-120, y, 8], [1,0,0]); sill.push([y, h ? h[0] : null]); }
  return { deck, canopy, sill };
});
const ys = r.deck.filter(d => d[2] != null).map(d => d[2]);
console.log('DECK top min/max', Math.min(...ys), Math.max(...ys), 'rows', r.deck.length);
console.log('CANOPY', JSON.stringify(r.canopy));
console.log('SILL', JSON.stringify(r.sill));
await browser.close();
