import puppeteer from 'puppeteer-core';
const OUT = 'D:/下载/fishprobe/';
const b = await puppeteer.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: 'new', args: ['--no-sandbox','--use-angle=d3d11','--enable-unsafe-swiftshader','--allow-file-access-from-files','--window-size=1280,760'] });
const p = await b.newPage();
await p.setViewport({ width: 1280, height: 760, deviceScaleFactor: 1.5 });
const errs = [];
p.on('pageerror', e => errs.push(String(e).slice(0,240)));
await p.goto('file:///C:/Users/ASUS/Documents/Trae-CN/temp_20261108_01/fishing-duel/index.html?v='+Date.now(), { waitUntil: 'load', timeout: 120000 });
await p.waitForFunction('window.game && window.game.world', { timeout: 90000 });
// 首次进入有「选择游玩设备」遮罩，探针里点掉它（否则截图全是弹窗）
await p.evaluate(() => { const el = document.getElementById('platformOverlay'); if (el && !el.classList.contains('hidden')) document.getElementById('platPC').click(); });
await new Promise(r => setTimeout(r, 250));
await new Promise(r=>setTimeout(r,2500));
await p.evaluate(()=>document.getElementById('soloBtn').click());
await new Promise(r=>setTimeout(r,400));
await p.evaluate(()=>document.getElementById('charNextBtn').click());
await new Promise(r=>setTimeout(r,300));
await p.evaluate(()=>document.getElementById('fightBtn').click());
await new Promise(r=>setTimeout(r,2400));

// 塞日魇鱼进背包 / 湖里 / 图鉴
const seed = await p.evaluate(() => {
  const E = window.Economy;
  const D = window.DAYMARE_FISH;
  E.balance = 12000;
  E.fishBag = D.map(f => ({ name: f.name, points: f.points, tier: window.fishGradeOf(f.name), sea: true, dist: 60, t: Date.now() }));
  E.pondFish = [];
  D.forEach(f => {
    E.addPondFish(f.name, f.points, window.fishGradeOf(f.name));
    E.codex[f.name] = (E.codex[f.name] || 0) + 2;
  });
  E._write();
  return { bag: E.fishBag.length, pond: E.pondFish.length, codex: E.codexCount() + '/' + E.codexTotal() };
});

// 图鉴（滚到底看日魇组）
await p.evaluate(() => {
  const g = window.game;
  g.state='paused'; g.overlaySource='game'; g.overlayKind='codex';
  document.getElementById('codexOverlay').classList.remove('hidden');
  if (g.renderCodex) g.renderCodex();
  const body = document.getElementById('codexBody');
  body.scrollTop = body.scrollHeight;
});
await new Promise(r=>setTimeout(r,450));
await p.evaluate(() => { const body=document.getElementById('codexBody'); body.scrollTop = body.scrollHeight; });
await new Promise(r=>setTimeout(r,300));
await p.screenshot({ path: OUT + 'daymare_codex.png' });
await p.evaluate(() => document.getElementById('codexOverlay').classList.add('hidden'));

// 观鱼台
const pond = await p.evaluate(() => {
  const g = window.game;
  g.state='paused'; g.overlaySource='game'; g.overlayKind='pond';
  g.renderPond();
  document.getElementById('pondOverlay').classList.remove('hidden');
  return Array.from(document.querySelectorAll('#pondBody .pond-card')).map(c => ({
    n: c.querySelector('.pond-name').textContent,
    icon: !!c.querySelector('.pond-icon svg')
  }));
});
await new Promise(r=>setTimeout(r,450));
await p.screenshot({ path: OUT + 'daymare_pond.png' });
await p.evaluate(() => document.getElementById('pondOverlay').classList.add('hidden'));

// 钓获：日魇鱼（含提示条与 HUD）
const haul = await p.evaluate(() => {
  const g = window.game, E = window.Economy, F = g.fishing;
  g.state='playing';
  E.fishBag = []; E.items = []; E._write && E._write();
  g.hour = 10.6; g.wasNight = false;
  g.world.setDayTime(10.6);
  g.setDaymare(true); g.batMax = 30; g.daymareT = 420; g.batN = 30;
  g.world.setBatCount(30);
  g.player.noGravity = true; g.player.pos.set(30, 1.3, 34);
  g.player.yaw = Math.atan2(30, 34); g.player.pitch = 0.05;
  F.castDist = 48; F.seaCast = true;
  F.begin({ sea: true }, 48);
  F.baitCfg = { id: 'secret', name: '秘制香饵', cap: 9, luck: 3.6 };
  F.pickedFish = { name: '烈日蝠影', points: 3000, minD: 48, daymare: true };
  F.pickedTier = 5; F.beginReel(); F.reelProgress = 1; F.completeCatch();
  return { bag: E.fishBag.map(f=>f.name), tag: (document.querySelector('#notices .notice:last-child')||{}).textContent };
});
await p.waitForFunction('window.game.world.getDayMix() > 0.9', { timeout: 25000, polling: 150 });
// 日魇调色淡入要 4s，钓获提示早过期了 —— 把同一条提示按原样重新弹一次再拍
await p.evaluate((txt) => {
  const g = window.game;
  g.clearNotices();
  if (txt) g.notice(txt, 'good');
}, haul.tag);
await new Promise(r=>setTimeout(r,320));
await p.screenshot({ path: OUT + 'daymare_haul.png' });

// 首领战：进到僵持阶段，拍 HUD 与张力条
const boss = await p.evaluate(() => {
  const g = window.game, F = g.fishing;
  g.state='playing'; g.hour = 11; g.world.setDayTime(11);
  g.setDaymare(true); g.daymareT = 420;
  g.player.pos.set(30, 1.3, 34);
  g.player.yaw = Math.atan2(30, 34) + Math.PI; g.player.pitch = 0.03;
  F.castDist = 58; F.seaCast = true;
  F.begin({ sea: true }, 58);
  F.pickedFish = { name: '日魇之核', points: 5200, minD: 58, daymare: true, boss: true };
  F.pickedTier = 6; F.beginReel();
  let sec = 0;
  for (let i = 0; i < 60 * 40; i++) {
    const phase = F.reelProgress < 0.34 ? 0 : (F.reelProgress < 0.70 ? 1 : 2);
    const cyc = sec % 0.95;
    if (phase < 2) F.reelHold = cyc < 0.6; else F.reelHold = (sec % (1/7)) < (1/14);
    F.updateReel(1/60); sec += 1/60;
    if (F.reelProgress > 0.45 && phase === 1) break;
    if (F.state !== 'reel') break;
  }
  // 别暂停（暂停会把鱼竿/钓线一起藏掉），改成按住并补一点张力，
  // 这样截图时张力条处在「僵持」该有的中间位置
  F.reelHold = true; F.bossTension = 0.56;
  return { state: F.state, prog: +F.reelProgress.toFixed(2), tension: +F.bossTension.toFixed(2), label: F.reelLabel ? F.reelLabel.textContent : '' };
});
await p.waitForFunction('window.game.world.getDayMix() > 0.9', { timeout: 25000, polling: 150 });
await new Promise(r=>setTimeout(r,400));
await p.screenshot({ path: OUT + 'daymare_boss.png' });

console.log(JSON.stringify({ seed, pond, haul, boss }, null, 1), 'errs', errs.length, errs.slice(0,2).join(' | '));
await b.close();
