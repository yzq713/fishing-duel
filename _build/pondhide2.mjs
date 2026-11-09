// 按谓词隐藏网格（不依赖 uuid），逐个候选拍同一帧，定位那条绿带。
import puppeteer from 'puppeteer-core';

const URL = 'file:///C:/Users/ASUS/Documents/Trae-CN/temp_20261108_01/fishing-duel/index.html';
const OUT = 'D:/下载/fab/game';

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
await page.evaluate(() => document.getElementById('soloBtn').click());
await new Promise(r => setTimeout(r, 500));
await page.evaluate(() => document.getElementById('charNextBtn').click());
await new Promise(r => setTimeout(r, 500));
await page.evaluate(() => document.getElementById('fightBtn').click());
await new Promise(r => setTimeout(r, 2000));
await page.evaluate(() => {
  const g = window.game;
  g.state = 'playing';
  ['pauseOverlay', 'startOverlay', 'charOverlay', 'weaponOverlay'].forEach((k) => {
    if (g.ui[k]) g.ui[k].classList.add('hidden');
  });
});
await new Promise(r => setTimeout(r, 800));
await page.evaluate(() => {
  const p = window.game.player;
  p.pos.set(0.5, 5.5, 7);
  if (p.vel) p.vel.set(0, 0, 0);
  p.noGravity = true;
  const dx = -0.5, dy = -6.7, dz = -7;
  const L = Math.hypot(dx, dz);
  p.yaw = Math.atan2(-dx / L, -dz / L);
  p.pitch = Math.atan2(dy, L);
});
await new Promise(r => setTimeout(r, 1200));

// 先列出所有 InstancedMesh 的规模，看看谁是芦苇（140 个）
const insts = await page.evaluate(() => {
  const out = [];
  let i = 0;
  window.game.scene.traverse((o) => {
    if (o.isInstancedMesh) out.push({ idx: i, count: o.count, color: o.material && o.material.color ? '#' + o.material.color.getHexString() : '-' });
    i++;
  });
  return out;
});
console.log('instanced:', JSON.stringify(insts));

const cases = [
  ['y_all', null],
  ['y_noreeds', 'o.isInstancedMesh && o.count===140'],
  ['y_noinst', 'o.isInstancedMesh'],
  ['y_grassfield', 'o.isInstancedMesh && (o.count===undefined ? false : o.count>200)']
];
for (const [name, pred] of cases) {
  await page.evaluate((code) => {
    const g = window.game;
    g.scene.traverse((o) => { o.userData.__h = o.visible; });
    if (!code) return;
    const f = new Function('o', 'return !!(' + code + ')');
    g.scene.traverse((o) => { if (f(o)) o.visible = false; });
  }, pred);
  await new Promise(r => setTimeout(r, 450));
  await page.screenshot({ path: `${OUT}/${name}.png` });
  await page.evaluate(() => { window.game.scene.traverse((o) => { if (o.userData.__h !== undefined) o.visible = o.userData.__h; }); });
  console.log('shot', name);
}
await browser.close();
