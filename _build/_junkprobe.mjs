import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: 'new', args: ['--no-sandbox','--use-angle=d3d11','--enable-unsafe-swiftshader','--allow-file-access-from-files'] });
const p = await b.newPage();
await p.setViewport({ width: 1280, height: 760 });
const errs = [];
p.on('pageerror', e => errs.push(String(e).slice(0,200)));
await p.goto('file:///C:/Users/ASUS/Documents/Trae-CN/temp_20261108_01/fishing-duel/index.html?v='+Date.now(), { waitUntil: 'load', timeout: 120000 });
await p.waitForFunction('window.game && window.game.world', { timeout: 90000 });
await new Promise(r=>setTimeout(r,2500));
// 清档，让背包空
await p.evaluate(()=>{ localStorage.removeItem('fishduel_save_v1'); });
await p.reload({ waitUntil: 'load' });
await new Promise(r=>setTimeout(r,2500));
const res = await p.evaluate(()=>{
  const g = window.game;
  // 直接构造钓鱼实例太麻烦：itemRoll 是 hooks 上的闭包，在 game.js 里创建钓鱼时传入。
  // 这里手动走 game.fishing.hooks（Fishing 实例保存在 game.fishing）
  const F = g.fishing;
  const E = window.Economy;
  const counts = {};
  let dropped = 0, full = 0;
  for (let i=0;i<500;i++){
    E.fishBag.length = 0; E.items.length = 0;   // 保证不满
    const r = F.hooks.itemRoll(true, 9);
    if (r===null) { /* 没掉 */ } else { dropped++; counts[r.name]=(counts[r.name]||0)+1; }
  }
  // 满背包时的行为
  E.fishBag.length = 20;
  const fullTest = F.hooks.itemRoll(true, 9);
  return { dropped, counts, fullTest, hasSpace: E.hasSpace(), used: E.usedSpace(), cap: E.bagCapacity };
});
console.log(JSON.stringify(res), 'errs', errs.length);
await b.close();
