import puppeteer from 'puppeteer-core';
const V = process.argv[2] || '341';
const URL = 'file:///C:/Users/ASUS/Documents/Trae-CN/temp_20261108_01/fishing-duel/index.html?v=' + V;
const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  headless: 'new',
  args: ['--no-sandbox', '--use-angle=d3d11', '--enable-unsafe-swiftshader', '--allow-file-access-from-files', '--window-size=1280,760']
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 760, deviceScaleFactor: 1 });
const errs = [];
page.on('pageerror', e => { errs.push(String(e).slice(0, 240)); console.log('[pageerror]', String(e).slice(0, 240)); });
page.on('console', m => { if (m.type() === 'error') { errs.push(m.text().slice(0, 200)); console.log('[console]', m.text().slice(0, 200)); } });

await page.goto(URL, { waitUntil: 'domcontentloaded' });
await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
await page.setCacheEnabled(false);
await page.goto(URL, { waitUntil: 'load', timeout: 120000 });
await page.waitForFunction('window.game && window.game.world', { timeout: 90000 });
await new Promise(r => setTimeout(r, 3800));
await page.evaluate(() => document.getElementById('soloBtn').click());
await new Promise(r => setTimeout(r, 250));
await page.evaluate(() => document.getElementById('charNextBtn').click());
await new Promise(r => setTimeout(r, 250));
await page.evaluate(() => document.getElementById('fightBtn').click());
await new Promise(r => setTimeout(r, 2000));
await page.evaluate(() => {
  const g = window.game; g.state = 'playing';
  ['pauseOverlay', 'startOverlay', 'charOverlay', 'weaponOverlay'].forEach(k => { if (g.ui[k]) g.ui[k].classList.add('hidden'); });
});

// 走真实收杆流程：completeCatch 会经过 hooks.score / hooks.bag
const first = await page.evaluate(() => {
  const g = window.game, f = g.fishing;
  f.state = 'reel';
  f.pickedFish = { name: '水晶锦鲤', points: 150 };
  f.pickedTier = 5;
  f.castDist = 21;
  f.seaCast = false;
  f.completeCatch();
  return { codex: JSON.parse(JSON.stringify(window.Economy.codex)), bag: window.Economy.fishBag.length, got: window.Economy.codexCount() };
});
console.log('catch-1', JSON.stringify(first));
await new Promise(r => setTimeout(r, 2300));
const note1 = await page.evaluate(() => document.getElementById('notices').textContent.trim().slice(-60));
console.log('notice-1', JSON.stringify(note1));

// 同种鱼再钓一条：不应再弹「图鉴解锁」，但次数要 +1
const second = await page.evaluate(() => {
  const g = window.game, f = g.fishing;
  f.state = 'reel';
  f.pickedFish = { name: '水晶锦鲤', points: 150 };
  f.pickedTier = 5;
  f.castDist = 22;
  f.completeCatch();
  return { codex: JSON.parse(JSON.stringify(window.Economy.codex)), got: window.Economy.codexCount() };
});
console.log('catch-2', JSON.stringify(second));
await new Promise(r => setTimeout(r, 2300));
const note2 = await page.evaluate(() => document.getElementById('notices').textContent.trim().slice(-60));
console.log('notice-2', JSON.stringify(note2));

// 图鉴面板里这条鱼应显示「已钓 2」
await page.keyboard.press('KeyB');
await new Promise(r => setTimeout(r, 300));
await page.keyboard.press('KeyB');
await new Promise(r => setTimeout(r, 200));
await page.keyboard.press('KeyJ');
await new Promise(r => setTimeout(r, 500));
const card = await page.evaluate(() => {
  const el = Array.from(document.querySelectorAll('#codexBody .cx-card')).find(c => c.textContent.includes('水晶锦鲤'));
  return { text: el ? el.textContent.replace(/\s+/g, ' ').trim() : null, state: window.game.state };
});
console.log('card', JSON.stringify(card));
await page.screenshot({ path: 'D:/下载/fishprobe/codex_one.png' });

// 帧率
await page.keyboard.press('KeyJ');
await new Promise(r => setTimeout(r, 400));
const perf = await page.evaluate(() => new Promise((res) => {
  const ts = []; let last = performance.now(); let n = 0;
  const tick = () => { const t = performance.now(); ts.push(t - last); last = t; n++; if (n < 120) requestAnimationFrame(tick); else { ts.sort((a, b) => a - b); res({ p50: +ts[60].toFixed(1), max: +ts[ts.length - 1].toFixed(1), state: window.game.state }); } };
  requestAnimationFrame(tick);
}));
console.log('frame', JSON.stringify(perf));
console.log('errors', errs.length);
await browser.close();
