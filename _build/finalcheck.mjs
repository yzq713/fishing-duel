import puppeteer from 'puppeteer-core';

const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  headless: 'new',
  args: ['--no-sandbox', '--use-angle=d3d11', '--allow-file-access-from-files']
});
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push('PAGEERROR ' + String(e).slice(0, 240)));
page.on('console', (m) => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text().slice(0, 200)); });

const t0 = Date.now();
await page.goto('file:///C:/Users/ASUS/Documents/Trae-CN/temp_20261108_01/fishing-duel/index.html', { waitUntil: 'load', timeout: 90000 });
await page.waitForFunction('window.game && window.game.world', { timeout: 60000 });
const loadMs = Date.now() - t0;
await new Promise(r => setTimeout(r, 5000));

const stat = await page.evaluate(() => {
  const g = window.game;
  let meshes = 0, tris = 0, marketMeshes = 0;
  // 统计场景里的网格
  const walk = (o) => {
    if (o.isMesh && o.visible) {
      meshes++;
      const geo = o.geometry;
      if (geo && geo.index) tris += geo.index.count / 3;
      const m = geo && geo.attributes && geo.attributes.position;
      if (m) { /* noop */ }
    }
    o.children.forEach(walk);
  };
  // 找到 scene
  let scene = null;
  const hunt = (o) => { if (!scene && o.isScene) scene = o; o.children.forEach(hunt); };
  if (g.camera && g.camera.parent) hunt(g.camera.parent);
  if (scene) walk(scene);
  return {
    state: g.state,
    meshes, tris: Math.round(tris),
    shops: ['baitShop', 'gunShop', 'rodShop', 'chestShop', 'bagShop'].filter(k => !!g.world[k]).length,
    hasInline: !!(window.MARKET_ASSETS && window.MARKET_ASSETS.length > 1000),
    assetKB: window.MARKET_ASSETS ? Math.round(window.MARKET_ASSETS.length / 1024) : 0
  };
});
console.log('加载耗时', loadMs, 'ms');
console.log(JSON.stringify(stat, null, 1));
console.log('错误数', errs.length);
errs.slice(0, 5).forEach(e => console.log(e));
await browser.close();
