import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: 'new', args: ['--no-sandbox','--use-angle=d3d11','--enable-unsafe-swiftshader','--allow-file-access-from-files','--window-size=1280,760'] });
const p = await b.newPage();
await p.setViewport({ width: 1280, height: 760 });
const errs = [];
p.on('pageerror', e => errs.push(String(e).slice(0,240)));
await p.goto('file:///C:/Users/ASUS/Documents/Trae-CN/temp_20261108_01/fishing-duel/index.html?v='+Date.now(), { waitUntil:'load', timeout:120000 });
await p.waitForFunction('window.game && window.game.world', { timeout:90000 });
await new Promise(r=>setTimeout(r,2400));
await p.evaluate(()=>document.getElementById('soloBtn').click());
await new Promise(r=>setTimeout(r,400));
await p.evaluate(()=>document.getElementById('charNextBtn').click());
await new Promise(r=>setTimeout(r,300));
await p.evaluate(()=>document.getElementById('fightBtn').click());
await new Promise(r=>setTimeout(r,2400));

const out = await p.evaluate(() => {
  const g = window.game, F = g.fishing, E = window.Economy;
  g.state = 'playing'; F.castDist = 60; F.seaCast = true;
  const start = () => {
    F.begin({ sea: true }, 60);
    F.pickedFish = { name: '日魇之核', points: 5200, minD: 58, daymare: true, boss: true };
    F.pickedTier = 6; F.beginReel();
  };

  // A) 纯按住：应断线（张力满）
  start();
  let holdT = 0;
  for (let i = 0; i < 1200; i++) {
    F.reelHold = true; F.updateReel(1/60); holdT += 1/60;
    if (F.state !== 'reel') break;
  }
  const holdRes = { sec: +holdT.toFixed(1), state: F.state, tension: +F.bossTension.toFixed(2), prog: +F.reelProgress.toFixed(2) };

  // B) 人类节奏：按住 0.6s / 松 0.35s，破防阶段每秒 7 次点
  E.fishBag = [];
  start();
  const phases = [];
  let sec = 0;
  for (let i = 0; i < 60 * 80; i++) {
    const phase = F.reelProgress < 0.34 ? 0 : (F.reelProgress < 0.70 ? 1 : 2);
    const cyc = sec % 0.95;
    if (phase < 2) F.reelHold = cyc < 0.6;
    else F.reelHold = (sec % (1/7)) < (1/14);
    F.updateReel(1/60); sec += 1/60;
    if (phases[phases.length - 1] !== F.bossPhase) phases.push(F.bossPhase);
    if (F.state !== 'reel') break;
  }
  const humanRes = {
    sec: +sec.toFixed(1), phases, state: F.state, prog: +F.reelProgress.toFixed(2),
    tension: +F.bossTension.toFixed(2), bag: E.fishBag.map(f => f.name),
    codex: E.codex['日魇之核'] || 0
  };

  // C) 相机的 label 文案
  start();
  F.reelHold = true; F.updateReel(1/60);
  const label = F.reelLabel ? F.reelLabel.textContent : '';
  return { holdRes, humanRes, label };
});
console.log(JSON.stringify(out, null, 1), 'errs', errs.length, errs.slice(0,2).join(' | '));
await b.close();
