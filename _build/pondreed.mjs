// 检查芦苇 InstancedMesh 里每个实例的实际世界包围盒，揪出被拉长的那几个。
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

const res = await page.evaluate(() => {
  let inst = null;
  window.game.scene.traverse((o) => { if (!inst && o.isInstancedMesh && o.count === 140) inst = o; });
  if (!inst) return 'no reeds';
  const g = inst.geometry;
  g.computeBoundingBox();
  const out = { geoBB: [g.boundingBox.min.toArray(), g.boundingBox.max.toArray()], rows: [] };
  const m = new THREE.Matrix4();
  const pos = new THREE.Vector3(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
  for (let i = 0; i < inst.count; i++) {
    inst.getMatrixAt(i, m);
    m.decompose(pos, q, sc);
    out.rows.push({
      i,
      p: [+pos.x.toFixed(2), +pos.y.toFixed(2), +pos.z.toFixed(2)],
      s: [+sc.x.toFixed(2), +sc.y.toFixed(2), +sc.z.toFixed(2)]
    });
  }
  // 挑出 scale 异常的
  out.bad = out.rows.filter((r) => r.s[0] > 2 || r.s[1] > 2 || r.s[2] > 2);
  return out;
});
console.log('geoBB', JSON.stringify(res.geoBB));
console.log('bad', JSON.stringify(res.bad));
// 靠近 (-1.2,0.2,9.0) 的实例
console.log('near', JSON.stringify(res.rows.filter(r => Math.hypot(r.p[0] + 1.2, r.p[2] - 9.0) < 2.2)));
await browser.close();
