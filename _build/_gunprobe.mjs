import puppeteer from 'puppeteer-core';
const V = Date.now();
const ROOT = 'file:///C:/Users/ASUS/Documents/Trae-CN/temp_20261108_01/fishing-duel/';
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: 'new', args: ['--no-sandbox','--use-angle=d3d11','--enable-unsafe-swiftshader','--allow-file-access-from-files'] });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 760 });
await page.goto(ROOT + 'index.html?v=' + V, { waitUntil: 'domcontentloaded' });
await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
await page.setCacheEnabled(false);
await page.goto(ROOT + 'index.html?v=' + V, { waitUntil: 'load', timeout: 120000 });
await page.waitForFunction('window.game && window.game.world', { timeout: 90000 });
await new Promise(r => setTimeout(r, 3000));
await page.evaluate(() => document.getElementById('soloBtn').click());
await new Promise(r => setTimeout(r, 400));
await page.evaluate(() => document.getElementById('charNextBtn').click());
await new Promise(r => setTimeout(r, 300));
await page.evaluate(() => document.getElementById('fightBtn').click());
await new Promise(r => setTimeout(r, 2500));
const info = await page.evaluate(() => {
  const g = window.game;
  const out = [];
  const wp = g.player.weapon;
  wp.traverse(o => {
    if (!o.isMesh) return;
    const bb = new window.THREE.Box3().setFromObject(o);
    const sz = bb.getSize(new window.THREE.Vector3());
    const ctr = bb.getCenter(new window.THREE.Vector3());
    // 相机空间坐标
    const local = wp.worldToLocal(ctr.clone());
    out.push({
      mesh: o.name || '(anon)',
      parent: o.parent && o.parent.name,
      size: sz.toArray().map(v => +v.toFixed(3)),
      wpos: ctr.toArray().map(v => +v.toFixed(3)),
      lpos: local.toArray().map(v => +v.toFixed(3)),
      color: '#' + o.material.color.getHexString(),
      visible: o.visible && o.parent.visible
    });
  });
  return { gun: g.player.gun.id, meshes: out };
});
console.log(JSON.stringify(info, null, 1).slice(0, 4000));
await browser.close();
