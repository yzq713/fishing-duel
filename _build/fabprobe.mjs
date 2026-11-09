import puppeteer from 'puppeteer-core';

const UD = 'C:/Users/ASUS/AppData/Local/Temp/fabprof';
const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  headless: 'new',
  userDataDir: UD,
  args: ['--no-sandbox', '--disable-gpu', '--window-size=1200,800', '--lang=zh-CN']
});
const page = await browser.newPage();
await page.setViewport({ width: 1200, height: 800 });
await page.goto('https://www.fab.com/', { waitUntil: 'domcontentloaded', timeout: 45000 });
await new Promise(r => setTimeout(r, 4000));

const info = await page.evaluate(async () => {
  const out = { keys: [], cookies: document.cookie.slice(0, 300) };
  try {
    for (let i = 0; i < localStorage.length; i++) out.keys.push(localStorage.key(i));
  } catch (e) { out.lsErr = String(e); }
  try {
    const r = await fetch('https://www.fab.com/i/users/me', { credentials: 'include' });
    out.meStatus = r.status;
    out.meBody = (await r.text()).slice(0, 300);
  } catch (e) { out.meErr = String(e); }
  return out;
});
console.log(JSON.stringify(info, null, 1).slice(0, 3000));
await browser.close();
