import puppeteer from 'puppeteer-core';
import fs from 'fs';

const UID = 'c27207bd-1949-4734-9329-65b9f1ec2a5a';
const UD = 'C:/Users/ASUS/AppData/Local/Temp/fabprof';
const DL = 'D:/下载/fab';
fs.mkdirSync(DL, { recursive: true });

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
await cdp.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: DL.replace(/\//g, '\\') });
await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: DL.replace(/\//g, '\\'), eventsEnabled: true }).catch(() => {});

const net = [];
page.on('response', (r) => {
  const u = r.url();
  if (/\.(glb|gltf|zip|usdz)(\?|$)/i.test(u) || /download/i.test(u)) net.push(r.status() + ' ' + u.slice(0, 180));
});
page.on('request', (r) => {
  const u = r.url();
  if (/download|\.glb|\.zip/i.test(u)) net.push('REQ ' + r.method() + ' ' + u.slice(0, 180));
});

await page.goto('https://www.fab.com/listings/' + UID, { waitUntil: 'networkidle2', timeout: 60000 });
await new Promise(r => setTimeout(r, 2500));

// 点击"下载"
const clicked = await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find((e) => (e.textContent || '').trim() === '下载');
  if (b) { b.click(); return true; }
  return false;
});
console.log('clicked download:', clicked);
await new Promise(r => setTimeout(r, 5000));
await page.screenshot({ path: DL + '/after_click.png' });

// 看是否弹出格式选择
const dlg = await page.evaluate(() => {
  const txt = document.body.innerText;
  const idx = txt.indexOf('下载');
  return {
    hasLogin: /登录|Sign in|Log in/i.test(txt),
    snippet: txt.slice(0, 1200)
  };
});
console.log('PAGE TEXT:', JSON.stringify(dlg).slice(0, 1500));
console.log('NET:\n' + net.slice(-25).join('\n'));
console.log('FILES:', fs.readdirSync(DL).join(', '));
await browser.close();
