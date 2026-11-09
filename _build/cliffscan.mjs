import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  headless: 'new',
  args: ['--no-sandbox', '--use-angle=d3d11', '--enable-unsafe-swiftshader',
    '--allow-file-access-from-files', '--window-size=800,600']
});
const page = await browser.newPage();
await page.goto('file:///C:/Users/ASUS/Documents/Trae-CN/temp_20261108_01/fishing-duel/_preview_glb.html?_glb=assets/cliff/cliff_small.glb', { waitUntil: 'load' });
await page.waitForFunction('window.__ready === true', { timeout: 40000 });

const res = await page.evaluate(() => {
  const THREE_ = window.THREE;
  const model = window.__model;
  const box = new THREE_.Box3().setFromObject(model);
  const rc = new THREE_.Raycaster();
  const dirX = new THREE_.Vector3(1, 0, 0);
  const hitX = (y, z) => {
    rc.set(new THREE_.Vector3(box.min.x - 50, y, z), dirX);
    const h = rc.intersectObject(model, true);
    return h.length ? +h[0].point.x.toFixed(2) : null;
  };
  const dirZ = new THREE_.Vector3(0, 0, -1);
  const hitZ = (x, y) => {
    rc.set(new THREE_.Vector3(x, y, box.max.z + 50), dirZ);
    const h = rc.intersectObject(model, true);
    return h.length ? +h[0].point.z.toFixed(2) : null;
  };
  const dirYd = new THREE_.Vector3(0, -1, 0);
  const hitY = (x, z) => {
    rc.set(new THREE_.Vector3(x, box.max.y + 50, z), dirYd);
    const h = rc.intersectObject(model, true);
    return h.length ? +h[0].point.y.toFixed(2) : null;
  };

  // 正面（-X）逐行扫描：找出墙面的 x 平面以及门的凹陷
  const rows = {};
  for (let y = 2; y <= 74; y += 2) {
    const line = [];
    for (let z = -44; z <= 40; z += 2) line.push(hitX(y, z));
    rows[y] = line;
  }
  // 屋顶/地板高度
  const cols = {};
  for (let z = -44; z <= 40; z += 4) cols[z] = hitY(0, z);
  return { box: { min: box.min.toArray().map(n => +n.toFixed(1)), max: box.max.toArray().map(n => +n.toFixed(1)) }, rows, cols };
});
console.log('BOX', JSON.stringify(res.box));
// 打印每行的中位数与异常段（门/窗凹陷）
for (const y of Object.keys(res.rows)) {
  const line = res.rows[y];
  const vals = line.filter(v => v != null);
  if (!vals.length) { console.log(y, 'empty'); continue; }
  const sorted = [...vals].sort((a, b) => a - b);
  const med = sorted[Math.floor(sorted.length / 2)];
  const dev = line.map(v => (v == null ? '.' : Math.abs(v - med) > 1.5 ? '#' : '-')).join('');
  console.log(String(y).padStart(3), 'med', med.toFixed(1).padStart(7), dev);
}
console.log('FLOOR', JSON.stringify(res.cols));
await browser.close();
