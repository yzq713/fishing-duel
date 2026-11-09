import puppeteer from 'puppeteer-core';
const V = process.argv[2] || '310';
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

await page.screenshot({ path: 'D:/下载/fishprobe/codex_menu.png' });

// 1) 主页点「图鉴」：全未知
await page.evaluate(() => document.getElementById('codexBtn').click());
await new Promise(r => setTimeout(r, 500));
const fresh = await page.evaluate(() => ({
  total: window.Economy.codexTotal(),
  got: window.Economy.codexCount(),
  prog: document.getElementById('codexProg').textContent,
  cards: document.querySelectorAll('#codexBody .cx-card').length,
  locked: document.querySelectorAll('#codexBody .cx-card.locked').length,
  firstLocked: document.querySelector('#codexBody .cx-card.locked').textContent.trim(),
  tip: document.getElementById('codexTip').textContent
}));
console.log('fresh', JSON.stringify(fresh));
await page.screenshot({ path: 'D:/下载/fishprobe/codex_empty.png' });

// 2) 钓到 8 种（含海鱼与神域）+ 另一个没钓到的保持未知
const rec = await page.evaluate(() => {
  const E = window.Economy;
  const hook = window.game.fishing.hooks;
  const names = ['小银鱼', '青鱼', '彩虹鳟', '月光水灯鱼', '九尾锦鲤', '太初龙鲤', '海带鱼', '星界鳐'];
  const news = [];
  names.forEach((n, i) => { if (hook.score(window.FISH_TABLE.pond.concat(window.FISH_TABLE.sea).find(f => f.name === n).points, n) !== undefined) news.push(n); });
  // 重复钓一条，次数应 +1
  hook.score(20, '小银鱼');
  window.game.renderCodex();
  return {
    got: E.codexCount(), total: E.codexTotal(),
    codex: E.codex,
    prog: document.getElementById('codexProg').textContent,
    bar: document.getElementById('codexBar').style.width
  };
});
console.log('after-catch', JSON.stringify(rec));
await new Promise(r => setTimeout(r, 2400));
const notice = await page.evaluate(() => document.getElementById('notices').textContent.trim().slice(-40));
console.log('notice', JSON.stringify(notice));
await page.screenshot({ path: 'D:/下载/fishprobe/codex_mixed.png' });

// 3) 关掉图鉴 → 进游戏 → 按 J 打开
await page.evaluate(() => document.getElementById('codexBackBtn').click());
await new Promise(r => setTimeout(r, 300));
const menuBack = await page.evaluate(() => ({
  codexHidden: document.getElementById('codexOverlay').classList.contains('hidden'),
  startShown: !document.getElementById('startOverlay').classList.contains('hidden')
}));
console.log('menu-back', JSON.stringify(menuBack));

await page.evaluate(() => document.getElementById('soloBtn').click());
await new Promise(r => setTimeout(r, 250));
await page.evaluate(() => document.getElementById('charNextBtn').click());
await new Promise(r => setTimeout(r, 250));
await page.evaluate(() => document.getElementById('fightBtn').click());
await new Promise(r => setTimeout(r, 2200));
await page.evaluate(() => {
  const g = window.game; g.state = 'playing';
  ['pauseOverlay', 'startOverlay', 'charOverlay', 'weaponOverlay'].forEach(k => { if (g.ui[k]) g.ui[k].classList.add('hidden'); });
});
await page.keyboard.press('KeyJ');
await new Promise(r => setTimeout(r, 600));
const ingame = await page.evaluate(() => ({
  state: window.game.state,
  open: !document.getElementById('codexOverlay').classList.contains('hidden'),
  backLabel: document.getElementById('codexBackBtn').textContent,
  locked: document.querySelectorAll('#codexBody .cx-card.locked').length
}));
console.log('ingame-open', JSON.stringify(ingame));
await page.screenshot({ path: 'D:/下载/fishprobe/codex_ingame.png' });
await page.keyboard.press('KeyJ');
await new Promise(r => setTimeout(r, 500));
const closed = await page.evaluate(() => ({
  state: window.game.state,
  open: !document.getElementById('codexOverlay').classList.contains('hidden')
}));
console.log('ingame-close', JSON.stringify(closed));

// 4) 存档持久化
await page.evaluate(() => window.Economy.save());
await page.setCacheEnabled(false);
await page.goto(URL.replace('v=' + V, 'v=' + (+V + 1)), { waitUntil: 'load' });
await page.waitForFunction('window.game && window.game.world', { timeout: 90000 });
await new Promise(r => setTimeout(r, 3000));
const persist = await page.evaluate(() => ({
  got: window.Economy.codexCount(),
  total: window.Economy.codexTotal(),
  sample: Object.keys(window.Economy.codex).slice(0, 6).map(k => k + ':' + window.Economy.codex[k])
}));
console.log('persist', JSON.stringify(persist));
console.log('errors', errs.length);
await browser.close();
