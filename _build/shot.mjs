import puppeteer from 'puppeteer-core';
const url = process.argv[2], out = process.argv[3] || 'shot.png';
const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  headless: 'new',
  args: ['--use-angle=d3d11','--no-sandbox','--disable-gpu-sandbox','--hide-scrollbars','--window-size=1000,700']
});
const page = await browser.newPage();
await page.setViewport({ width: 1000, height: 700, deviceScaleFactor: 1 });
page.on('pageerror', e => console.log('[pageerror]', String(e).slice(0, 200)));
await page.goto(url, { waitUntil: 'load', timeout: 30000 });
try { await page.waitForFunction('window.__ready===true', { timeout: 20000 }); } catch { console.log('WAIT TIMEOUT'); }
await new Promise(r => setTimeout(r, 500));
const log = await page.evaluate(() => document.getElementById('log') ? document.getElementById('log').textContent : '');
console.log('---LOG---\n' + log);
await page.screenshot({ path: out });
await browser.close();
console.log('shot ->', out);
