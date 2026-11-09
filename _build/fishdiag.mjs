import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: 'new', args: ['--no-sandbox','--use-angle=d3d11','--enable-unsafe-swiftshader','--allow-file-access-from-files','--window-size=1280,760'] });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 760, deviceScaleFactor: 1 });
page.on('pageerror', e => console.log('[pageerror]', String(e).slice(0, 300)));
await page.setCacheEnabled(false);
await page.goto('file:///C:/Users/ASUS/Documents/Trae-CN/temp_20261108_01/fishing-duel/index.html?v=132', { waitUntil: 'load', timeout: 120000 });
await page.waitForFunction('window.game && window.game.world', { timeout: 90000 });
await new Promise(r => setTimeout(r, 4200));
await page.evaluate(() => document.getElementById('soloBtn').click());
await new Promise(r => setTimeout(r, 250));
await page.evaluate(() => document.getElementById('charNextBtn').click());
await new Promise(r => setTimeout(r, 250));
await page.evaluate(() => document.getElementById('fightBtn').click());
await new Promise(r => setTimeout(r, 2200));
await page.evaluate(() => { const g = window.game; g.state = 'playing'; ['pauseOverlay','startOverlay','charOverlay','weaponOverlay'].forEach(k => { if (g.ui[k]) g.ui[k].classList.add('hidden'); }); });

// 1) 单个 FishModel 的形状尺寸
const model = await page.evaluate(() => {
  const out = [];
  ['小银鱼', '九尾锦鲤', '水晶锦鲤'].forEach((n) => {
    const m = new window.FishModel(n);
    m.group.updateMatrixWorld(true);
    const b = new window.THREE.Box3().setFromObject(m.group);
    const kids = [];
    m.group.traverse((o) => {
      if (!o.isMesh && !o.isSprite && !o.isPoints) return;
      const bb = new window.THREE.Box3().setFromObject(o);
      kids.push({ t: o.type, name: o.name, minY: +bb.min.y.toFixed(2), maxY: +bb.max.y.toFixed(2), vis: o.visible });
    });
    out.push({ n, minY: +b.min.y.toFixed(2), maxY: +b.max.y.toFixed(2), minX: +b.min.x.toFixed(2), maxX: +b.max.x.toFixed(2), kids: kids.slice(0, 8), nkids: kids.length });
  });
  return out;
});
console.log('models', JSON.stringify(model, null, 1));

// 2) 放一条鱼，站到它旁边看
const st = await page.evaluate(() => {
  const E = window.Economy, w = window.game.world;
  E.fishBag = []; E.pondFish = []; E.raised = 0; E.save();
  const entry = E.addPondFish('九尾锦鲤', 330);
  const f = w.addPondFish('九尾锦鲤', 330, entry.id);
  return { pos: f.group.position.toArray().map(v => +v.toFixed(2)), swimY: +f.swimY.toFixed(2), scale: f.group.scale.x };
});
console.log('fish', JSON.stringify(st));
await new Promise(r => setTimeout(r, 800));

const look = async (dist, h) => {
  await page.evaluate((c) => {
    const g = window.game, f = g.world.fishes[0], p = g.player;
    const fp = f.group.position;
    // 站在鱼的正南方 dist 米处
    p.pos.set(fp.x, fp.y + c.h - 1.66, fp.z + c.dist);
    if (p.vel) p.vel.set(0, 0, 0);
    p.noGravity = true;
    const dx = 0, dz = -c.dist, dy = (fp.y - (p.pos.y + 1.66));
    p.yaw = Math.atan2(-dx, -dz);
    p.pitch = Math.atan2(dy, Math.abs(dz));
  }, { dist, h });
  await new Promise(r => setTimeout(r, 900));
};
await look(2.6, 0.6);
await page.screenshot({ path: 'D:/下载/fishprobe/d1.png' });
const posNow = await page.evaluate(() => window.game.world.fishes[0].group.position.toArray().map(v => +v.toFixed(2)));
await look(4.5, 1.0);
await page.screenshot({ path: 'D:/下载/fishprobe/d2.png' });
console.log('pos', JSON.stringify(posNow));
await browser.close();
