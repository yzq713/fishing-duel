import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: 'new', args: ['--no-sandbox','--use-angle=d3d11','--enable-unsafe-swiftshader','--allow-file-access-from-files'] });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 760 });
page.on('pageerror', e => console.log('PAGEERROR', e.message));
page.on('console', m => { if (m.type() === 'error') console.log('CONSOLE', m.text()); });
await page.setCacheEnabled(false);
await page.goto('file:///C:/Users/ASUS/Documents/Trae-CN/temp_20261108_01/fishing-duel/index.html?v=101', { waitUntil: 'load', timeout: 120000 });
await page.waitForFunction('window.game && window.game.world', { timeout: 90000 });
await new Promise(r => setTimeout(r, 4000));

const info = await page.evaluate(() => {
  const w = window.game.world;
  const out = { fishesBefore: w.fishes.length, raisedSeed: window.Economy ? window.Economy.raised : null };
  // 直接投三条不同的鱼
  const names = ['肥鲤鱼', '小银鱼', '青鱼'];
  const added = [];
  names.forEach(n => {
    try { const f = w.addPondFish(n); added.push({ n, ok: !!f, vis: f && f.group.visible, y: f && +f.group.position.y.toFixed(2) }); }
    catch (e) { added.push({ n, err: String(e && e.message || e) }); }
  });
  out.added = added;
  out.fishesAfter = w.fishes.length;
  out.pond = { x: w.pond.x, z: w.pond.z, r: w.pond.r, waterY: w.waterY };
  // 世界坐标下的包围盒
  window.game.scene.updateMatrixWorld(true);
  out.bbox = w.fishes.slice(-3).map(f => {
    const b = new window.THREE.Box3().setFromObject(f.group);
    return { name: f.name, minY: +b.min.y.toFixed(2), maxY: +b.max.y.toFixed(2), cx: +b.getCenter(new window.THREE.Vector3()).x.toFixed(2), cz: +b.getCenter(new window.THREE.Vector3()).z.toFixed(2) };
  });
  return out;
});
console.log(JSON.stringify(info, null, 1));

// 等两秒让它们游起来，然后从斜上方拍塘
await new Promise(r => setTimeout(r, 2500));
const pos = await page.evaluate(() => {
  const w = window.game.world, g = window.game;
  const cam = g.camera;
  // 站到塘边看塘
  g.player.pos.set(0, 0, 15.5);
  cam.position.set(0, 7.5, 16);
  cam.lookAt(0, -0.3, 2);
  return w.fishes.map(f => ({ n: f.name, alive: f.alive, vis: f.group.visible, x: +f.group.position.x.toFixed(2), y: +f.group.position.y.toFixed(2), z: +f.group.position.z.toFixed(2) }));
});
console.log(JSON.stringify(pos, null, 1));
await new Promise(r => setTimeout(r, 800));
await page.screenshot({ path: 'D:/下载/fishprobe/pond1.png' });
// 平视水面
await page.evaluate(() => {
  const cam = window.game.camera;
  cam.position.set(0, 1.2, 11.5);
  cam.lookAt(0, -0.3, 0);
});
await new Promise(r => setTimeout(r, 500));
await page.screenshot({ path: 'D:/下载/fishprobe/pond2.png' });
await browser.close();
