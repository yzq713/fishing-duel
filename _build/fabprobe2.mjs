import puppeteer from 'puppeteer-core';

const UID = 'c27207bd-1949-4734-9329-65b9f1ec2a5a';
const UD = 'C:/Users/ASUS/AppData/Local/Temp/fabprof';
const DL = 'D:/下载/fab';

const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  headless: 'new',
  userDataDir: UD,
  args: ['--no-sandbox', '--disable-gpu', '--window-size=1400,900', '--lang=zh-CN',
    '--no-first-run', '--no-default-browser-check', '--hide-crash-restore-bubble',
    '--disable-session-crashed-bubble', '--disable-features=msEdgeStartupBoost',
    '--restore-last-session=false']
});

const page = await browser.newPage();
await page.setViewport({ width: 1400, height: 900 });
const client = await page.createCDPSession();
await client.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: DL });

const hits = [];
page.on('response', (res) => {
  const u = res.url();
  if (/download|\.glb|\.gltf|\.zip|\.usdz|cdn/i.test(u)) hits.push(res.status() + ' ' + u.slice(0, 200));
});

await page.goto('https://www.fab.com/listings/' + UID, { waitUntil: 'networkidle2', timeout: 60000 });
await new Promise(r => setTimeout(r, 3000));

// 登录状态
const me = await page.evaluate(async () => {
  try {
    const r = await fetch('/i/users/me', { credentials: 'include' });
    return { status: r.status, body: (await r.text()).slice(0, 400) };
  } catch (e) { return { err: String(e) }; }
});
console.log('ME:', JSON.stringify(me).slice(0, 500));

// 探测下载端点
const probe = await page.evaluate(async (uid) => {
  const out = {};
  for (const path of [
    `/i/listings/${uid}/download`,
    `/i/listings/${uid}/downloads`,
    `/i/asset-downloads/${uid}`,
    `/i/listings/${uid}`
  ]) {
    try {
      const r = await fetch(path, { credentials: 'include' });
      out[path] = r.status + ' :: ' + (await r.text()).slice(0, 200);
    } catch (e) { out[path] = 'ERR ' + String(e).slice(0, 80); }
  }
  return out;
}, UID);
console.log('PROBE:', JSON.stringify(probe, null, 1).slice(0, 2000));

// 找下载按钮
const btns = await page.evaluate(() => {
  const out = [];
  document.querySelectorAll('button, a').forEach((el) => {
    const t = (el.textContent || '').trim();
    if (t && t.length < 24 && /下载|Download|获取|Get/i.test(t)) {
      out.push({ tag: el.tagName, text: t, cls: (el.className || '').toString().slice(0, 60) });
    }
  });
  return out;
});
console.log('BTNS:', JSON.stringify(btns, null, 1));

console.log('HITS:', hits.slice(-30).join('\n'));
await page.screenshot({ path: DL + '/fab_page.png' });
await browser.close();
