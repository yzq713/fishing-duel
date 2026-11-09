import puppeteer from 'puppeteer-core';
import fs from 'fs';
const OUT = 'D:/下载/cliffprobe';
fs.mkdirSync(OUT, { recursive: true });
const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  headless: 'new',
  args: ['--no-sandbox', '--use-angle=d3d11', '--enable-unsafe-swiftshader',
    '--allow-file-access-from-files', '--window-size=900,700']
});
const page = await browser.newPage();
await page.setViewport({ width: 900, height: 700, deviceScaleFactor: 1 });
await page.goto('file:///C:/Users/ASUS/Documents/Trae-CN/temp_20261108_01/fishing-duel/_preview_glb.html?_glb=assets/cliff/cliff_small.glb', { waitUntil: 'load' });
await page.waitForFunction('window.__ready === true', { timeout: 40000 });
console.log('info', JSON.stringify(await page.evaluate(() => window.__info)));
console.log('parts', JSON.stringify(await page.evaluate(() => window.__parts)));

const shots = [
  ['front', [0, 0, 1]],
  ['right', [1, 0, 0]],
  ['back', [0, 0, -1]],
  ['left', [-1, 0, 0]],
];
for (const [name, d] of shots) {
  await page.evaluate((dd) => {
    const i = window.__info;
    const c = i.center, R = Math.max(i.size[0], i.size[1], i.size[2]);
    window.__cam(c[0] + dd[0] * R * 1.5, c[1] + R * 0.12, c[2] + dd[2] * R * 1.5);
  }, d);
  await new Promise(r => setTimeout(r, 500));
  await page.screenshot({ path: `${OUT}/${name}.png` });
}
console.log('done');
await browser.close();
