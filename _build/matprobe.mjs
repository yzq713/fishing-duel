import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  headless: 'new',
  args: ['--no-sandbox', '--use-angle=d3d11', '--enable-unsafe-swiftshader', '--allow-file-access-from-files']
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 200)));
await page.goto('file:///C:/Users/ASUS/Documents/Trae-CN/temp_20261108_01/fishing-duel/index.html', { waitUntil: 'load', timeout: 90000 });
await page.waitForFunction('window.game && window.game.world', { timeout: 60000 });
await new Promise(r => setTimeout(r, 4500));
const out = await page.evaluate(() => {
  const res = [];
  const bed = window.game.world.beds[0];
  window.game.scene.traverse((o) => {
    if (!o.isMesh || !o.material || !o.material.name) return;
    const m = o.material;
    const p = new THREE.Vector3();
    o.getWorldPosition(p);
    if (Math.hypot(p.x - bed.x, p.z - bed.z) > 12) return;
    res.push({
      name: m.name, type: m.type,
      color: m.color ? m.color.toArray().map(n => +n.toFixed(2)) : null,
      metal: m.metalness, rough: m.roughness,
      emissive: m.emissive ? m.emissive.getHexString() : null,
      map: !!m.map, env: m.envMapIntensity
    });
  });
  return res.slice(0, 8);
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
