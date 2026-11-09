import puppeteer from 'puppeteer-core';
const OUT = 'D:/下载/fishprobe/';
const b = await puppeteer.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: 'new', args: ['--no-sandbox','--use-angle=d3d11','--enable-unsafe-swiftshader','--allow-file-access-from-files','--window-size=1280,800'] });
const p = await b.newPage();
await p.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1.5 });
const errs=[]; p.on('pageerror',e=>errs.push(String(e).slice(0,200)));
await p.goto('file:///C:/Users/ASUS/Documents/Trae-CN/temp_20261108_01/fishing-duel/index.html?v='+Date.now(),{waitUntil:'load',timeout:120000});
await p.waitForFunction('window.game && window.game.world',{timeout:90000});
await new Promise(r=>setTimeout(r,2400));
await p.evaluate(()=>document.getElementById('soloBtn').click());
await new Promise(r=>setTimeout(r,400));
await p.evaluate(()=>document.getElementById('charNextBtn').click());
await new Promise(r=>setTimeout(r,300));
await p.evaluate(()=>document.getElementById('fightBtn').click());
await new Promise(r=>setTimeout(r,2000));
const info = await p.evaluate(()=>{
  const g=window.game, E=window.Economy;
  g.state='playing';
  // 点亮 5 种血夜鱼 + 几条普通鱼，避免整屏灰卡
  ['赤鳍影','夜魇石斑','血月鳗','绯红潮蛇','朱红裂口'].forEach(n=>{ E.codex[n]= (E.codex[n]||0)+2; });
  g.state='paused'; g.overlaySource='game'; g.overlayKind='codex';
  document.getElementById('codexOverlay').classList.remove('hidden');
  if (g.renderCodex) g.renderCodex();
  const body = document.getElementById('codexBody');
  const sc = body.closest('.overlay-panel') || body.parentElement;
  body.scrollTop = body.scrollHeight; sc.scrollTop = sc.scrollHeight;
  return { prog: document.getElementById('codexProg').textContent, scrollH: body.scrollHeight, clientH: body.clientHeight,
    groups: Array.from(document.querySelectorAll('#codexBody .cx-hd')).map(e=>e.textContent.trim()) };
});
await new Promise(r=>setTimeout(r,500));
await p.evaluate(()=>{ const body=document.getElementById('codexBody'); body.scrollTop = body.scrollHeight; });
await new Promise(r=>setTimeout(r,400));
await p.screenshot({ path: OUT + 'blood_codex2.png' });
console.log(JSON.stringify(info),'errs',errs.length, errs[0]||'');
await b.close();
