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

await page.goto('https://www.fab.com/listings/' + UID, { waitUntil: 'networkidle2', timeout: 60000 });
await new Promise(r => setTimeout(r, 2500));

const clickText = (t) => page.evaluate((txt) => {
  const el = [...document.querySelectorAll('button, a')].find((e) => (e.textContent || '').trim() === txt && e.offsetParent !== null);
  if (el) { el.click(); return true; }
  return false;
}, t);

await clickText('下载');
await new Promise(r => setTimeout(r, 2500));

// 若出现 EULA 则勾选接受
const eula = await page.evaluate(() => {
  const cbs = [...document.querySelectorAll('input[type=checkbox]')];
  if (!cbs.length) return false;
  cbs[cbs.length - 1].click();
  return true;
});
if (eula) {
  await new Promise(r => setTimeout(r, 600));
  await clickText('接受');
  await new Promise(r => setTimeout(r, 2500));
}

// 在面板中找 glb 行并点下载
const hit = await page.evaluate(() => {
  const all = [...document.querySelectorAll('*')];
  const label = all.find((e) => e.children.length === 0 && /stylize_fish_market\.glb/i.test(e.textContent || ''));
  if (!label) return 'label-not-found';
  let node = label;
  for (let d = 0; d < 8 && node; d++) {
    const btns = node.querySelectorAll('button');
    if (btns.length) {
      // 点击最后一个按钮（下载图标）
      const b = btns[btns.length - 1];
      b.click();
      return 'clicked-btn-in-depth-' + d + ' btns=' + btns.length;
    }
    node = node.parentElement;
  }
  return 'no-button-found';
});
console.log('glb click:', hit);

// 等下载完成
const t0 = Date.now();
let ok = false;
while (Date.now() - t0 < 120000) {
  const files = fs.readdirSync(DL);
  const part = files.filter((f) => f.endsWith('.crdownload'));
  const glb = files.filter((f) => /\.glb$/i.test(f));
  if (glb.length && !part.length) { ok = true; break; }
  await new Promise(r => setTimeout(r, 1000));
}
console.log('downloaded glb:', ok);
console.log('FILES:\n' + fs.readdirSync(DL).map(f => f + '  ' + fs.statSync(DL + '/' + f).size).join('\n'));
await page.screenshot({ path: DL + '/glb_done.png' });
await browser.close();
