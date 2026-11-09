import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: 'new', args: ['--no-sandbox','--use-angle=d3d11','--enable-unsafe-swiftshader','--allow-file-access-from-files','--window-size=1280,760'] });
const p = await b.newPage();
await p.setViewport({ width: 1280, height: 760 });
const errs=[];
p.on('pageerror',e=>errs.push('ERR '+String(e).slice(0,300)));
p.on('console',m=>{ if(m.type()==='error') errs.push('CON '+m.text().slice(0,200)); });
await p.goto('file:///C:/Users/ASUS/Documents/Trae-CN/temp_20261108_01/fishing-duel/index.html?v='+Date.now(),{waitUntil:'load',timeout:120000});
await p.waitForFunction('window.game && window.game.world',{timeout:90000});
await new Promise(r=>setTimeout(r,2400));
await p.evaluate(()=>document.getElementById('soloBtn').click());
await new Promise(r=>setTimeout(r,400));
await p.evaluate(()=>document.getElementById('charNextBtn').click());
await new Promise(r=>setTimeout(r,300));
await p.evaluate(()=>document.getElementById('fightBtn').click());
await new Promise(r=>setTimeout(r,2500));
const st = await p.evaluate(()=>({
  daymare: window.game.daymare,
  table: (window.FISH_TABLE.daymare||[]).map(f=>f.name),
  total: window.Economy.codexTotal(),
  bats: window.game.world.getBatCount()
}));
// 强制开日魇
await p.evaluate(()=>{ const g=window.game; g.hour=9; g.wasNight=false; g.state='playing'; g.setDaymare(true); });
await new Promise(r=>setTimeout(r,4200));
const on = await p.evaluate(()=>({
  on: window.game.daymare, bats: window.game.world.getBatCount(),
  mix: +window.game.world.getDayMix().toFixed(2),
  tag: document.getElementById('dayTag').textContent,
  hidden: document.getElementById('dayTag').classList.contains('hidden'),
  veil: +getComputedStyle(document.getElementById('dayVeil')).opacity,
  cls: document.body.className,
  notice: Array.from(document.querySelectorAll('#notices .notice')).map(n=>n.textContent).slice(-2)
}));
console.log(JSON.stringify({st, on}, null, 1), 'errs', errs.length, errs.slice(0,3).join(' | '));
await b.close();
