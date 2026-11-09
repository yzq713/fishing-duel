// 通用 GLB 三视角截图 + 调试信息
// node glbshot.mjs <glb相对路径> <输出目录>
import puppeteer from 'puppeteer-core';
import fs from 'fs';

const GLB = process.argv[2];
const OUT = process.argv[3] || 'D:/下载/fab';
fs.mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  headless: 'new',
  args: ['--no-sandbox', '--use-angle=d3d11', '--enable-unsafe-swiftshader', '--hide-scrollbars']
});
const page = await browser.newPage();
await page.setViewport({ width: 1000, height: 760, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 300)));
await page.goto('http://127.0.0.1:8799/_preview_glb.html?_glb=' + GLB, { waitUntil: 'load', timeout: 60000 });
await page.waitForFunction('window.__ready===true || window.__err', { timeout: 60000 });
await new Promise(r => setTimeout(r, 600));
const dbg = await page.evaluate(() => (window.__dbg ? window.__dbg() : { no: 1 }));
console.log('DBG', JSON.stringify(dbg));
const parts = await page.evaluate(() => window.__parts || []);
if (process.argv[4] === '-p') console.log(parts.join('\n'));
for (const i of [0, 1, 2]) {
  await page.evaluate((k) => window.__view(k), i);
  await new Promise(r => setTimeout(r, 400));
  await page.screenshot({ path: `${OUT}/glb${i}.png` });
  console.log('shot', i);
}
await browser.close();
