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

// 1) 天亮掷骰概率 + 入夜必清
const odds = await p.evaluate(() => {
  const g = window.game; g.state = 'playing';
  let hit = 0;
  for (let i = 0; i < 200; i++) {
    g.setDaymare(false);
    g.wasNight = true; g.hour = 6.02; g.updateDayNight(0);
    if (g.daymare) hit++;
  }
  g.setDaymare(true); g.wasNight = false; g.hour = 19.05; g.updateDayNight(0);
  const clearedAtDusk = !g.daymare;
  let dayHit = 0;
  for (let i = 0; i < 60; i++) { g.hour = 12; g.wasNight = false; g.updateDayNight(0); if (g.daymare) dayHit++; }
  return { hit, pct: hit / 2, clearedAtDusk, dayHit };
});

// 2) 蝠群爬升 + 高潮
const ramp = await p.evaluate(() => {
  const g = window.game;
  g.setDaymare(true); g.batMax = 30; g.daymareT = 0; g.hour = 8;
  const seq = [];
  for (let i = 0; i < 5; i++) {
    g.daymareT = i * 80; g.updateDaymare(0);
    seq.push({ t: i * 80, n: g.batN, climax: g.daymareClimax });
  }
  g.daymareT = 400; g.updateDaymare(0);
  seq.push({ t: 400, n: g.batN, climax: g.daymareClimax });
  return seq;
});

// 3) 抽取分布
const dist = await p.evaluate(() => {
  const g = window.game, F = g.fishing;
  g.setDaymare(true); g.daymareT = 400; g.updateDaymare(0); window.Daymare.climax = true;
  window.Daymare.bossed = true;
  F.seaCast = true; F.castDist = 45; F.baitCfg = { id: 'secret', name: '秘制香饵', cap: 9, luck: 3.6 };
  const cnt = {};
  for (let i = 0; i < 600; i++) { const r = F.pickFish(); cnt[r.picked.name] = (cnt[r.picked.name] || 0) + 1; }
  window.Daymare.bossed = false;
  let boss = 0;
  for (let i = 0; i < 400; i++) { const r = F.pickFish(); if (r.boss) boss++; }
  const bossedAfter = window.Daymare.bossed;
  window.Daymare.active = false;
  let leak = 0;
  for (let i = 0; i < 200; i++) { const r = F.pickFish(); if (r.picked.daymare) leak++; }
  return { cnt, boss, bossedAfter, leak };
});

// 4) 完整钓一条日魇鱼
const haul = await p.evaluate(() => {
  const g = window.game, E = window.Economy, F = g.fishing;
  E.fishBag = []; E.items = []; E._write && E._write();
  g.state = 'playing'; g.setDaymare(true); g.daymareT = 400; window.Daymare.climax = true;
  g.hour = 11; g.world.setDayTime(11);
  g.player.noGravity = true; g.player.pos.set(28, 1.2, 32);
  F.castDist = 45; F.seaCast = true;
  F.begin({ sea: true }, 45);
  F.baitCfg = { id: 'secret', name: '秘制香饵', cap: 9, luck: 3.6 };
  F.pickedFish = { name: '苍白灾厄', points: 2800, minD: 40, daymare: true };
  F.pickedTier = 5; F.beginReel(); F.reelProgress = 1; F.completeCatch();
  return {
    bag: E.fishBag.map(f => f.name), codex: E.codex['苍白灾厄'] || 0,
    total: E.codexCount() + '/' + E.codexTotal(),
    notices: Array.from(document.querySelectorAll('#notices .notice')).map(n => n.textContent.trim()).slice(-3)
  };
});

// 5) 首领：断线路径 vs 成功路径
const boss = await p.evaluate(() => {
  const g = window.game, F = g.fishing;
  g.state = 'playing'; F.castDist = 60; F.seaCast = true;
  const start = () => {
    F.begin({ sea: true }, 60);
    F.pickedFish = { name: '日魇之核', points: 5200, minD: 58, daymare: true, boss: true };
    F.pickedTier = 6; F.beginReel();
  };
  start();
  let brokeState = null;
  for (let i = 0; i < 600; i++) {
    F.reelHold = true; F.updateReel(1 / 60);
    if (F.state !== 'reel') { brokeState = F.state; break; }
  }
  start();
  const phases = [];
  for (let i = 0; i < 9000; i++) {
    const phase = F.reelProgress < 0.34 ? 0 : (F.reelProgress < 0.70 ? 1 : 2);
    if (phase < 2) F.reelHold = (i % 30) < 16;
    else F.reelHold = (i % 4) < 2;
    F.updateReel(1 / 60);
    if (phases[phases.length - 1] !== F.bossPhase) phases.push(F.bossPhase);
    if (F.state !== 'reel') break;
  }
  return {
    brokeState, phases, finalState: F.state,
    prog: +F.reelProgress.toFixed(2), tension: +F.bossTension.toFixed(2),
    bag: window.Economy.fishBag.map(f => f.name)
  };
});

// 6) 图标 + 图鉴分组
const ui = await p.evaluate(() => {
  const g = window.game, E = window.Economy;
  const names = ['逆光之群','白夜蚀翼','盲光狂潮','苍白灾厄','烈日蝠影','日魇之核'];
  const icons = names.map(n => { const s = g.iconFor(n); return { n, len: s.length, svg: s.indexOf('<svg') === 0 }; });
  names.forEach(n => { E.codex[n] = (E.codex[n] || 0) + 1; });
  g.state = 'paused'; g.overlaySource = 'game'; g.overlayKind = 'codex';
  document.getElementById('codexOverlay').classList.remove('hidden');
  if (g.renderCodex) g.renderCodex();
  const groups = Array.from(document.querySelectorAll('#codexBody .cx-hd')).map(e => e.textContent.trim());
  document.getElementById('codexOverlay').classList.add('hidden');
  return { icons, groups, prog: document.getElementById('codexProg').textContent };
});
console.log(JSON.stringify({ odds, ramp, dist, haul, boss, ui }, null, 1), 'errs', errs.length, errs.slice(0,2).join(' | '));
await b.close();
