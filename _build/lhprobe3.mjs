import puppeteer from 'puppeteer-core';

const V = Date.now();
const ROOT = 'file:///C:/Users/ASUS/Documents/Trae-CN/temp_20261108_01/fishing-duel/';
const OUT = 'D:/下载/fishprobe/';
const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  headless: 'new',
  args: ['--no-sandbox', '--use-angle=d3d11', '--enable-unsafe-swiftshader',
    '--allow-file-access-from-files', '--window-size=1280,760']
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 760 });
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 200)));
await page.goto(ROOT + 'index.html?v=' + V, { waitUntil: 'load', timeout: 120000 });
await page.waitForFunction('window.game && window.game.world', { timeout: 90000 });
await new Promise((r) => setTimeout(r, 2500));
await page.evaluate(() => document.getElementById('soloBtn').click());
await new Promise((r) => setTimeout(r, 400));
await page.evaluate(() => document.getElementById('charNextBtn').click());
await new Promise((r) => setTimeout(r, 300));
await page.evaluate(() => document.getElementById('fightBtn').click());
await new Promise((r) => setTimeout(r, 2200));

await page.evaluate(() => {
  const g = window.game;
  g.state = 'playing';
  ['pauseOverlay', 'startOverlay', 'charOverlay', 'weaponOverlay'].forEach((k) => { if (g.ui[k]) g.ui[k].classList.add('hidden'); });
  g.hour = 21.5;
  g.world.setDayTime(21.5);
  // 飞到海面上：关掉重力和碰撞，把玩家钉在灯塔外侧
  g.player.noGravity = true;
});

// 用 beamA 的实际方向摆机位：站在光束扫过的海面外侧，回头看塔
async function shot(tag, mode, wait) {
  const info = await page.evaluate((m) => {
    const g = window.game;
    const L = g.world.lighthouse;
    const oc = g.world.group.children.find((c) => c.material && c.material.uniforms && c.material.uniforms.beamA);
    const d = oc ? oc.material.uniforms.beamA.value : { x: 0, y: 1 };
    const dir = { x: d.x, y: d.y };
    const p = g.player;
    if (m === 'pool') {
      // 在高处俯看光斑落点
      const px = L.x + dir.x * 44, pz = L.z + dir.y * 44;
      p.pos.set(px + dir.y * 6, 26, pz - dir.x * 6);
      const dx = L.x + dir.x * 50 - p.pos.x, dz = L.z + dir.y * 50 - p.pos.z;
      const l2 = Math.hypot(dx, dz) || 1;
      p.yaw = Math.atan2(-dx / l2, -dz / l2);
      p.pitch = -0.62;
    } else if (m === 'side') {
      // 侧后方的低机位，看得到塔与海面
      const px = L.x + dir.x * 26 + dir.y * 26, pz = L.z + dir.y * 26 - dir.x * 26;
      p.pos.set(px, 3.2, pz);
      const dx = L.x - px, dz = L.z - pz;
      const l2 = Math.hypot(dx, dz) || 1;
      p.yaw = Math.atan2(-dx / l2, -dz / l2);
      p.pitch = 0.10;
    }
    p.vel && p.vel.set(0, 0, 0);
    return { dir, pos: [p.pos.x.toFixed(1), p.pos.z.toFixed(1)] };
  }, mode);
  await new Promise((r) => setTimeout(r, wait || 260));
  await page.screenshot({ path: OUT + tag + '.png' });
  console.log(tag, JSON.stringify(info));
}

await shot('lh3_pool_a', 'pool', 200);
await new Promise((r) => setTimeout(r, 3200));
await shot('lh3_pool_b', 'pool', 200);
await shot('lh3_side_a', 'side', 260);
await new Promise((r) => setTimeout(r, 5200));
await shot('lh3_side_b', 'side', 260);

await browser.close();
