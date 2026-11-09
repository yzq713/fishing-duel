import puppeteer from 'puppeteer-core';
import fs from 'fs';
const GLB = process.argv[2], OUT = process.argv[3] || 'D:/下载/orbit';
fs.mkdirSync(OUT, { recursive: true });
const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  headless: 'new',
  args: ['--no-sandbox', '--use-angle=d3d11', '--enable-unsafe-swiftshader', '--hide-scrollbars']
});
const page = await browser.newPage();
await page.setViewport({ width: 820, height: 700 });
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 200)));
await page.goto('http://127.0.0.1:8799/_preview_glb.html?_glb=' + GLB, { waitUntil: 'load', timeout: 60000 });
await page.waitForFunction('window.__ready===true || window.__err', { timeout: 60000 });
const info = await page.evaluate(() => window.__info);
console.log('info', JSON.stringify(info));
const R = Math.max(info.size[0], info.size[1], info.size[2]);
const c = info.center;
const N = 6;
for (let i = 0; i < N; i++) {
  const a = (i / N) * Math.PI * 2;
  await page.evaluate((p) => window.__cam(p[0], p[1], p[2]),
    [c[0] + Math.cos(a) * R * 1.25, c[1] + R * 0.42, c[2] + Math.sin(a) * R * 1.25]);
  await new Promise(r => setTimeout(r, 350));
  await page.screenshot({ path: `${OUT}/orbit${i}.png` });
  console.log('orbit', i);
}
await browser.close();
