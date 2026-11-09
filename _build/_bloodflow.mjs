import puppeteer from 'puppeteer-core';
const OUT = 'D:/下载/fishprobe/';
const b = await puppeteer.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: 'new', args: ['--no-sandbox','--use-angle=d3d11','--enable-unsafe-swiftshader','--allow-file-access-from-files','--window-size=1280,760'] });
const p = await b.newPage();
await p.setViewport({ width: 1280, height: 760 });
const errs = [];
p.on('pageerror', e => errs.push(String(e).slice(0,240)));
await p.goto('file:///C:/Users/ASUS/Documents/Trae-CN/temp_20261108_01/fishing-duel/index.html?v='+Date.now(), { waitUntil: 'load', timeout: 120000 });
await p.waitForFunction('window.game && window.game.world', { timeout: 90000 });
await new Promise(r=>setTimeout(r,2600));
await p.evaluate(() => document.getElementById('soloBtn').click());
await new Promise(r=>setTimeout(r,400));
await p.evaluate(() => document.getElementById('charNextBtn').click());
await new Promise(r=>setTimeout(r,300));
await p.evaluate(() => document.getElementById('fightBtn').click());
await new Promise(r=>setTimeout(r,2200));

// ---- 1) 入夜掷骰子的概率（200 夜） + 天亮必清 ----
const odds = await p.evaluate(() => {
  const g = window.game;
  g.state = 'playing';
  let hit = 0;
  for (let i = 0; i < 200; i++) {
    g.setBloodNight(false);
    g.wasNight = false;
    g.hour = 19.02;
    g.updateDayNight(0);
    if (g.bloodNight) hit++;
  }
  // 天亮
  g.setBloodNight(true);
  g.wasNight = true;
  g.hour = 6.2;
  g.updateDayNight(0);
  const clearedAtDawn = !g.bloodNight;
  // 白天不能被重新掷中
  let dayHit = 0;
  for (let i = 0; i < 50; i++) { g.hour = 12; g.updateDayNight(0); if (g.bloodNight) dayHit++; }
  return { hit, pct: hit / 2, clearedAtDawn, dayHit };
});

// ---- 2) 完整钓一条朱红裂口 ----
await p.evaluate(() => {
  const g = window.game;
  const E = window.Economy;
  E.fishBag = []; E.items = []; E._write && E._write();
  g.state = 'playing';
  g.hour = 21.5; g.wasNight = true; g.world.setDayTime(21.5);
  g.setBloodNight(true);
  g.player.noGravity = true;
  // 站到海边浅滩
  g.player.pos.set(28, 1.2, 30);
  g.player.yaw = Math.atan2(-28, -30);
  g.waterY = g.world.waterY;
});
await new Promise(r=>setTimeout(r,900));
const catchInfo = await p.evaluate(() => {
  const g = window.game, F = g.fishing;
  F.begin({ sea: true }, 58);
  F.baitCfg = { id: 'secret', name: '秘制香饵', cap: 9, luck: 3.6 };
  F.pickedFish = { name: '朱红裂口', points: 3400, minD: 54, blood: true };
  F.pickedTier = 9;
  F.beginReel();
  const hasModel = !!F.fishModel;
  F.reelProgress = 1;
  F.completeCatch();
  const E = window.Economy;
  return {
    hasModel,
    bag: E.fishBag.map((f) => f.name + '/' + f.points),
    codex: E.codex['朱红裂口'] || 0,
    codexProg: E.codexCount() + '/' + E.codexTotal(),
    notices: Array.from(document.querySelectorAll('#notices .notice')).map((n) => n.textContent).slice(-4)
  };
});
await new Promise(r=>setTimeout(r,600));
await p.screenshot({ path: OUT + 'blood_haul.png' });
console.log(JSON.stringify({ odds, catchInfo }, null, 1), 'errs', errs.length, errs.slice(0,3).join(' | '));
await b.close();
