import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: 'new', args: ['--no-sandbox','--use-angle=d3d11','--enable-unsafe-swiftshader','--allow-file-access-from-files','--window-size=1280,760'] });
const p = await b.newPage();
await p.setViewport({ width: 1280, height: 760 });
const errs = [];
p.on('pageerror', e => errs.push(String(e).slice(0,240)));
await p.goto('file:///C:/Users/ASUS/Documents/Trae-CN/temp_20261108_01/fishing-duel/index.html?v='+Date.now(), { waitUntil: 'load', timeout: 120000 });
await p.waitForFunction('window.game && window.game.world', { timeout: 90000 });
await new Promise(r=>setTimeout(r,2500));

// 1) 白天的血夜残留检查
const day = await p.evaluate(() => ({
  tagHidden: document.getElementById('bloodTag').classList.contains('hidden'),
  veil: +getComputedStyle(document.getElementById('bloodVeil')).opacity,
  cls: document.body.className,
  blood: window.game.bloodNight,
  bloodMix: +window.game.world.getBloodMix().toFixed(2)
}));

// 2) 防抖存档：加鱼+杂物后等 400ms，重载看是否还在
await p.evaluate(() => {
  const E = window.Economy;
  E.fishBag = []; E.items = []; E.balance = 500;
  E.addFish({ name: '血月鳗', points: 1260, tier: 7, sea: true, dist: 34 });
  E.addItem({ name: '珍珠', kind: '珍宝', sea: true });
  E.addScore(77);
});
await new Promise(r=>setTimeout(r, 600));
await p.reload({ waitUntil: 'load' });
await p.waitForFunction('window.game && window.game.world', { timeout: 90000 });
const persisted = await p.evaluate(() => ({
  fish: window.Economy.fishBag.map(f=>f.name),
  items: window.Economy.items.map(i=>i.name),
  bal: window.Economy.balance,
  itemCap: window.Economy.itemCapacity
}));

// 3) 杂物侧袋上限
const cap = await p.evaluate(() => {
  const E = window.Economy;
  E.items = [];
  let ok = 0;
  for (let i=0;i<20;i++){ if (E.addItem({ name: '贝壳', kind: '材料' })) ok++; }
  const blocked = E.addItem({ name: '珍珠', kind: '珍宝' });
  return { added: ok, blocked, cap: E.itemCapacity, list: E.items.length };
});
console.log(JSON.stringify({ day, persisted, cap }, null, 1), 'errs', errs.length, errs.slice(0,2).join(' | '));
await b.close();
