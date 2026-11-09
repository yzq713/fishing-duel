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
await new Promise(r => setTimeout(r, 3500));
const out = await page.evaluate(() => {
  const w = window.game.world;
  const a = Math.atan2(-6, -30) + 0.06;
  const R = w.islandRadiusAt(a);
  const rows = [];
  for (let r = R - 4; r <= R + 10; r += 0.5) {
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    rows.push([+r.toFixed(1), +w.heightAt(x, z).toFixed(2)]);
  }
  // 附近的树（palms）
  const trees = (w.palms || []).map(p => [
    +p.group.position.x.toFixed(1), +p.group.position.z.toFixed(1)
  ]);
  return { R: +R.toFixed(2), a: +a.toFixed(3), rows, trees };
});
console.log('R', out.R, 'a', out.a);
console.log('heights', out.rows.map(r => r[0] + ':' + r[1]).join(' '));
console.log('trees', out.trees.map(t => '(' + t[0] + ',' + t[1] + ')').join(' '));
await browser.close();
