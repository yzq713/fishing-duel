import puppeteer from 'puppeteer-core';
import fs from 'fs';

const UID = 'c27207bd-1949-4734-9329-65b9f1ec2a5a';
const UD = 'C:/Users/ASUS/AppData/Local/Temp/fabprof';
const DL = 'D:/下载/fab';
fs.mkdirSync(DL, { recursive: true });
const DLW = DL.replace(/\//g, '\\');

const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  headless: 'new',
  userDataDir: UD,
  args: ['--no-sandbox', '--disable-gpu', '--window-size=1400,950', '--lang=zh-CN',
    '--no-first-run', '--no-default-browser-check']
});
const page = await browser.newPage();
await page.setViewport({ width: 1400, height: 950 });
const cdp = await page.createCDPSession();
await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: DLW, eventsEnabled: true }).catch(async () => {
  await cdp.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: DLW });
});

const net = [];
page.on('response', (r) => {
  const u = r.url();
  if (/\.(glb|gltf|zip|usdz)(\?|$)/i.test(u)) net.push('RES ' + r.status() + ' ' + u.slice(0, 200));
});

await page.goto('https://www.fab.com/listings/' + UID, { waitUntil: 'networkidle2', timeout: 60000 });
await new Promise(r => setTimeout(r, 2500));

async function clickText(txt) {
  return page.evaluate((t) => {
    const el = [...document.querySelectorAll('button, a, span, div')].find((e) =>
      (e.textContent || '').trim() === t && e.offsetParent !== null);
    if (el) { el.click(); return true; }
    return false;
  }, txt);
}

console.log('step1 download:', await clickText('下载'));
await new Promise(r => setTimeout(r, 2500));

// 勾选 EULA 复选框（可能在 label 里的 input）
const checked = await page.evaluate(() => {
  const cbs = [...document.querySelectorAll('input[type=checkbox]')];
  if (!cbs.length) return 'no-checkbox';
  cbs[cbs.length - 1].click();
  return 'checked:' + cbs.length;
});
console.log('step2 checkbox:', checked);
await new Promise(r => setTimeout(r, 800));
await page.screenshot({ path: DL + '/eula.png' });

console.log('step3 accept:', await clickText('接受'));
await new Promise(r => setTimeout(r, 2000));
await page.screenshot({ path: DL + '/after_accept.png' });

// 等下载完成（最多 90 秒）
const t0 = Date.now();
let done = false;
while (Date.now() - t0 < 90000) {
  const files = fs.readdirSync(DL);
  const part = files.filter((f) => f.endsWith('.crdownload'));
  const zips = files.filter((f) => /\.(zip|glb|gltf|usdz)$/i.test(f));
  if (zips.length && !part.length) { done = true; break; }
  await new Promise(r => setTimeout(r, 1000));
}
console.log('downloaded:', done);
console.log('FILES:', fs.readdirSync(DL).map(f => f + ' ' + fs.statSync(DL + '/' + f).size).join('\n'));
console.log('NET:\n' + net.slice(-10).join('\n'));
await page.screenshot({ path: DL + '/final.png' });
await browser.close();
