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
  const T = window.THREE;
  const model = window.__model;
  const box = new T.Box3().setFromObject(model);
  const rc = new T.Raycaster();
  const cast = (o, d) => {
    rc.set(new T.Vector3(o[0], o[1], o[2]), new T.Vector3(d[0], d[1], d[2]));
    const h = rc.intersectObject(model, true);
    return h.length ? [h[0].point.x, h[0].point.y, h[0].point.z].map(n => +n.toFixed(2)) : null;
  };
  const out = { box: [box.min.toArray().map(n => +n.toFixed(1)), box.max.toArray().map(n => +n.toFixed(1))] };
  // 前墙：从 -X 打，用很多 y 找出墙面的上下边界
  out.frontY = [];
  for (let y = 0; y <= 60; y += 2) {
    const h = cast([-120, y, 0], [1, 0, 0]);
    out.frontY.push([y, h ? h[0] : null]);
  }
  // 门中心竖线（z=10 左右）：看有没有凹陷/门窗
  out.frontZ = [];
  for (let z = -40; z <= 36; z += 2) {
    const h = cast([-120, 20, z], [1, 0, 0]);
    out.frontZ.push([z, h ? h[0] : null]);
  }
  // 后墙
  out.back = cast([120, 20, 0], [-1, 0, 0]);
  // 侧墙
  out.leftZ = cast([0, 20, 120], [0, 0, -1]);
  out.rightZ = cast([0, 20, -120], [0, 0, 1]);
  // 从上往下：屋顶 / 露台
  out.down = [];
  for (let z = -40; z <= 36; z += 4) {
    const h = cast([-8, 120, z], [0, -1, 0]);
    out.down.push([z, h ? h[1] : null]);
  }
  // 从下往上：有没有地板
  out.up = [];
  for (const p of [[-8, 0], [-8, 10], [0, 10], [10, 10], [10, -10], [0, -10]]) {
    const h = cast([p[0], -80, p[1]], [0, 1, 0]);
    out.up.push([p, h ? h[1] : null]);
  }
  return out;
});
console.log('BOX', JSON.stringify(res.box));
console.log('FRONT-Y', JSON.stringify(res.frontY));
console.log('FRONT-Z', JSON.stringify(res.frontZ));
console.log('BACK', JSON.stringify(res.back), 'LEFTZ', JSON.stringify(res.leftZ), 'RIGHTZ', JSON.stringify(res.rightZ));
console.log('DOWN', JSON.stringify(res.down));
console.log('UP', JSON.stringify(res.up));
await browser.close();
