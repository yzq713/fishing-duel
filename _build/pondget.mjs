import puppeteer from 'puppeteer-core';
import fs from 'fs';

const UID = '524d451b-5084-46f5-bf78-f3d70d5818a4';
const DL = 'D:/下载/pond';
fs.mkdirSync(DL, { recursive: true });
const DLW = DL.replace(/\//g, '\\');
const UD = 'C:/Users/ASUS/AppData/Local/Temp/fabpond';

const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  headless: 'new',
  userDataDir: UD,
  args: ['--no-sandbox', '--disable-gpu', '--window-size=1400,950', '--lang=zh-CN',
    '--no-first-run', '--no-default-browser-check']
});
const page = await browser.newPage();
await page.setViewport({ width: 1400, height: 950 });
page.on('console', (m) => { if (m.type() === 'error') console.log('[err]', m.text().slice(0, 160)); });

const cdp = await page.createCDPSession();
await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: DLW, eventsEnabled: true })
  .catch(async () => { await cdp.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: DLW }); });

await page.goto('https://www.fab.com/listings/' + UID, { waitUntil: 'networkidle2', timeout: 90000 });
await new Promise(r => setTimeout(r, 3000));
await page.screenshot({ path: DL + '/s1.png' });

const clickText = (t) => page.evaluate((txt) => {
  const el = [...document.querySelectorAll('button, a')]
    .find((e) => (e.textContent || '').trim() === txt && e.offsetParent !== null);
  if (el) { el.click(); return true; }
  return false;
}, t);

console.log('click 下载:', await clickText('下载'));
await new Promise(r => setTimeout(r, 3000));
await page.screenshot({ path: DL + '/s2.png' });

// EULA 勾选
const eula = await page.evaluate(() => {
  const cbs = [...document.querySelectorAll('input[type=checkbox]')].filter((c) => c.offsetParent !== null);
  if (!cbs.length) return 0;
  cbs[cbs.length - 1].click();
  return cbs.length;
});
console.log('checkboxes:', eula);
if (eula) {
  await new Promise(r => setTimeout(r, 800));
  console.log('click 接受:', await clickText('接受'));
  await new Promise(r => setTimeout(r, 3000));
}
await page.screenshot({ path: DL + '/s3.png' });

// 列出面板里所有可点的行 / 文件文本
const rows = await page.evaluate(() => {
  const out = [];
  document.querySelectorAll('*').forEach((e) => {
    if (e.children.length === 0) {
      const t = (e.textContent || '').trim();
      if (/\.(glb|gltf|fbx|usdz|zip)$/i.test(t) && t.length < 120) out.push(t);
    }
  });
  return [...new Set(out)];
});
console.log('rows:', JSON.stringify(rows));

// 点 glb 那一行的下载按钮
const hit = await page.evaluate(() => {
  const labels = [...document.querySelectorAll('*')].filter((e) =>
    e.children.length === 0 && /\.glb$/i.test((e.textContent || '').trim()));
  if (!labels.length) return 'label-not-found';
  const label = labels[0];
  let node = label;
  for (let d = 0; d < 9 && node; d++) {
    const btns = [...node.querySelectorAll('button')].filter((b) => b.offsetParent !== null);
    if (btns.length) {
      btns[btns.length - 1].click();
      return 'clicked depth=' + d + ' btns=' + btns.length + ' text=' + (btns[btns.length - 1].innerText || '').slice(0, 30);
    }
    node = node.parentElement;
  }
  return 'no-button-found';
});
console.log('glb click:', hit);

const t0 = Date.now();
let done = false;
while (Date.now() - t0 < 150000) {
  const files = fs.readdirSync(DL);
  const part = files.filter((f) => f.endsWith('.crdownload'));
  const got = files.filter((f) => /\.(glb|zip|gltf|fbx)$/i.test(f));
  if (got.length && !part.length) { done = true; break; }
  await new Promise(r => setTimeout(r, 1000));
}
console.log('downloaded:', done);
console.log('FILES:\n' + fs.readdirSync(DL).map(f => f + '  ' + fs.statSync(DL + '/' + f).size).join('\n'));
await page.screenshot({ path: DL + '/s4.png' });
await browser.close();
