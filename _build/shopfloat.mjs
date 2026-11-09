import puppeteer from 'puppeteer-core';
import fs from 'fs';
const OUT = 'D:/下载/shopfloat';
fs.mkdirSync(OUT, { recursive: true });
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: 'new', args: ['--no-sandbox','--use-angle=d3d11','--enable-unsafe-swiftshader','--allow-file-access-from-files','--window-size=1280,760'] });
const page = await browser.newPage();
await page.setCacheEnabled(false);
await page.setViewport({ width: 1280, height: 760, deviceScaleFactor: 1 });
page.on('pageerror', e => console.log('[pageerror]', String(e).slice(0,200)));
await page.goto('file:///C:/Users/ASUS/Documents/Trae-CN/temp_20261108_01/fishing-duel/index.html?v=20', { waitUntil: 'load', timeout: 90000 });
await page.waitForFunction('window.game && window.game.world', { timeout: 60000 });
await new Promise(r => setTimeout(r, 4500));
await page.evaluate(() => document.getElementById('soloBtn').click());
await new Promise(r => setTimeout(r, 300));
await page.evaluate(() => document.getElementById('charNextBtn').click());
await new Promise(r => setTimeout(r, 300));
await page.evaluate(() => document.getElementById('fightBtn').click());
await new Promise(r => setTimeout(r, 2000));
await page.evaluate(() => { const g = window.game; g.state='playing'; ['pauseOverlay','startOverlay','charOverlay','weaponOverlay'].forEach(k=>{ if(g.ui[k]) g.ui[k].classList.add('hidden'); }); });

const shops = await page.evaluate(() => {
  const ww = window.game.world;
  return ['baitShop','gunShop','rodShop','chestShop','bagShop'].map(k => ww[k] ? { k, x: ww[k].x, z: ww[k].z } : null).filter(Boolean);
});
console.log('SHOPS', JSON.stringify(shops));

const floats = await page.evaluate((shops) => {
  const T = window.THREE, scene = window.game.scene;
  const ww = window.game.world;
  const out = [];
  scene.updateMatrixWorld(true);
  shops.forEach((s) => {
    const y0 = ww.heightAt ? ww.heightAt(s.x, s.z) : 0;
    scene.traverse((o) => {
      if (!o.isMesh) return;
      const b = new T.Box3().setFromObject(o);
      const c = b.getCenter(new T.Vector3());
      const sz = b.getSize(new T.Vector3());
      const d = Math.hypot(c.x - s.x, c.z - s.z);
      if (d > 9) return;
      if (b.min.y - y0 > 1.0) {
        out.push({ shop: s.k, d: +d.toFixed(1), minY: +(b.min.y - y0).toFixed(2), maxY: +(b.max.y - y0).toFixed(2),
          cx: +(c.x - s.x).toFixed(2), cz: +(c.z - s.z).toFixed(2),
          w: +sz.x.toFixed(2), h: +sz.y.toFixed(2), dp: +sz.z.toFixed(2),
          mat: (o.material && (o.material.name || o.material.type)) || '?', geo: o.geometry.type, n: o.geometry.attributes.position.count });
      }
    });
  });
  return out.sort((a,b)=>b.minY-a.minY);
}, shops);
console.log('FLOATS', floats.length);
floats.slice(0, 40).forEach(f => console.log(JSON.stringify(f)));

const aim = async (from, look) => {
  await page.evaluate((c) => { const p = window.game.player; p.pos.set(c.from[0],c.from[1],c.from[2]); if(p.vel) p.vel.set(0,0,0); p.noGravity = true;
    const dx=c.look[0]-c.from[0], dy=c.look[1]-c.from[1], dz=c.look[2]-c.from[2]; const L=Math.hypot(dx,dz)||1;
    p.yaw=Math.atan2(-dx/L,-dz/L); p.pitch=Math.atan2(dy,L); }, { from, look });
  await new Promise(r => setTimeout(r, 800));
  await page.evaluate(() => { try { window.game.clearNotices(); } catch(e){} });
  await new Promise(r => setTimeout(r, 100));
};
for (let i = 0; i < shops.length; i++) {
  const s = shops[i];
  const dx = s.x, dz = s.z; const L = Math.hypot(dx, dz) || 1;
  const cx = s.x - dx / L * 7.5, cz = s.z - dz / L * 7.5;
  await aim([cx, 2.7, cz], [s.x, 1.6, s.z]);
  await page.screenshot({ path: `${OUT}/${i}_${s.k}.png` });
  // 高一点俯看，浮空物更明显
  await aim([cx, 5.2, cz], [s.x, 1.4, s.z]);
  await page.screenshot({ path: `${OUT}/${i}_${s.k}_high.png` });
}
console.log('done');
await browser.close();
