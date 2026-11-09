// 列出场景里所有"贴在湖岸附近、扁平、材质偏绿"的网格，定位那条绿带是谁。
import puppeteer from 'puppeteer-core';

const URL = 'file:///C:/Users/ASUS/Documents/Trae-CN/temp_20261108_01/fishing-duel/index.html';

const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  headless: 'new',
  args: ['--no-sandbox', '--use-angle=d3d11', '--enable-unsafe-swiftshader',
    '--allow-file-access-from-files', '--window-size=1280,760']
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 760, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 300)));

await page.goto(URL, { waitUntil: 'load', timeout: 60000 });
await page.waitForFunction('window.game && window.game.world', { timeout: 40000 });
await new Promise(r => setTimeout(r, 3000));

const list = await page.evaluate(() => {
  const g = window.game;
  const out = [];
  const bb = new THREE.Box3();
  g.scene.traverse((o) => {
    if (!o.isMesh) return;
    const m = o.material;
    const mn = Array.isArray(m) ? 'array' : (m ? [m.type, m.color ? '#' + m.color.getHexString() : '-', m.map ? 'tex' : 'noTex', m.name || ''].join('|') : 'none');
    o.updateMatrixWorld(true);
    bb.setFromObject(o);
    const sz = bb.getSize(new THREE.Vector3());
    const c = bb.getCenter(new THREE.Vector3());
    const r = Math.hypot(c.x, c.z);
    // 只关心湖岸附近（r 5~14）且高度很薄的东西
    if (r > 15 || Math.abs(c.y) > 4) return;
    out.push({
      chain: (function () { const a = []; let p = o; while (p && a.length < 4) { a.push(p.name || p.type); p = p.parent; } return a.join('<'); })(),
      uuid: o.uuid.slice(0, 8),
      vcnt: o.geometry.attributes.position.count,
      mat: mn,
      center: [+c.x.toFixed(2), +c.y.toFixed(2), +c.z.toFixed(2)],
      size: [+sz.x.toFixed(2), +sz.y.toFixed(2), +sz.z.toFixed(2)],
      r: +r.toFixed(2),
      vis: o.visible
    });
  });
  return out;
});
console.log('共', list.length, '个');
list.forEach((o) => console.log(JSON.stringify(o)));
await browser.close();
