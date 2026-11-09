import puppeteer from 'puppeteer-core';
const V = process.argv[2] || '231';
const URL = 'file:///C:/Users/ASUS/Documents/Trae-CN/temp_20261108_01/fishing-duel/index.html?v=' + V;
const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  headless: 'new',
  args: ['--no-sandbox', '--use-angle=d3d11', '--enable-unsafe-swiftshader', '--allow-file-access-from-files', '--window-size=1280,760']
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 760, deviceScaleFactor: 1 });
page.on('pageerror', e => console.log('[pageerror]', String(e).slice(0, 300)));
await page.goto(URL, { waitUntil: 'domcontentloaded' });
await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
await page.setCacheEnabled(false);
await page.goto(URL, { waitUntil: 'load', timeout: 120000 });
await page.waitForFunction('window.game && window.game.world', { timeout: 90000 });
await new Promise(r => setTimeout(r, 4200));
await page.evaluate(() => document.getElementById('soloBtn').click());
await new Promise(r => setTimeout(r, 250));
await page.evaluate(() => document.getElementById('charNextBtn').click());
await new Promise(r => setTimeout(r, 250));
await page.evaluate(() => document.getElementById('fightBtn').click());
await new Promise(r => setTimeout(r, 2000));
await page.evaluate(() => {
  const g = window.game; g.state = 'playing';
  ['pauseOverlay', 'startOverlay', 'charOverlay', 'weaponOverlay'].forEach(k => { if (g.ui[k]) g.ui[k].classList.add('hidden'); });
  const E = window.Economy;
  E.pondFish = []; E.raised = 0;
  [['九尾锦鲤', 330], ['时之鲤', 780]].forEach(([n, p]) => E.addPondFish(n, p, window.fishGradeOf(n)));
  E.pondFish.forEach(f => g.world.addPondFish(f.name, f.points, f.id, f.tier));
  g.score = 0; E.balance = 0; g.pondAcc = 0; g.pondTick = 0;
});
const rate = await page.evaluate(() => window.game.world.pondStat().rate);
console.log('rate', rate.toFixed(2));
for (const wait of [2000, 2000, 2000, 2000]) {
  await new Promise(r => setTimeout(r, wait));
  const st = await page.evaluate(() => ({ score: window.game.score, acc: +window.game.pondAcc.toFixed(1), tick: +window.game.pondTick.toFixed(2), hud: document.getElementById('pondHud').textContent.trim() }));
  console.log('t+', JSON.stringify(st));
}
await browser.close();
