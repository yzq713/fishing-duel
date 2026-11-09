import puppeteer from 'puppeteer-core';
const OUT = 'D:/下载/fishprobe/';
const b = await puppeteer.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: 'new', args: ['--no-sandbox','--use-angle=d3d11','--enable-unsafe-swiftshader','--allow-file-access-from-files','--window-size=1280,760'] });
const p = await b.newPage();
await p.setViewport({ width: 1280, height: 760 });
const errs = [];
p.on('pageerror', e => errs.push(String(e).slice(0,240)));
await p.goto('file:///C:/Users/ASUS/Documents/Trae-CN/temp_20261108_01/fishing-duel/index.html?v='+Date.now(), { waitUntil: 'load', timeout: 120000 });
await p.waitForFunction('window.game && window.game.world', { timeout: 90000 });
await new Promise(r=>setTimeout(r,2500));

// 给存档里塞血夜鱼（背包 + 湖里），验证图鉴/背包/观鱼台都能正确显示
const seed = await p.evaluate(() => {
  const E = window.Economy;
  E.balance = 12000;
  E.fishBag = window.BLOOD_FISH.map((f) => ({ name: f.name, points: f.points, tier: window.fishGradeOf(f.name), sea: true, dist: 60, t: Date.now() }));
  E.pondFish = [];
  window.BLOOD_FISH.forEach((f, i) => {
    E.addPondFish(f.name, f.points, window.fishGradeOf(f.name));
    E.codex[f.name] = (E.codex[f.name] || 0) + 2;
  });
  E._write();
  return { bag: E.fishBag.length, pond: E.pondFish.length, codexTotal: E.codexTotal(), codexCount: E.codexCount() };
});
await p.reload({ waitUntil: 'load' });
await new Promise(r=>setTimeout(r,2600));
await p.evaluate(() => document.getElementById('soloBtn').click());
await new Promise(r=>setTimeout(r,400));
await p.evaluate(() => document.getElementById('charNextBtn').click());
await new Promise(r=>setTimeout(r,300));
await p.evaluate(() => document.getElementById('fightBtn').click());
await new Promise(r=>setTimeout(r,2200));

// 图鉴
const codex = await p.evaluate(() => {
  const g = window.game;
  g.state='paused'; g.overlaySource='game'; g.overlayKind='codex';
  g.renderCodex();
  document.getElementById('codexOverlay').classList.remove('hidden');
  return { prog: document.getElementById('codexProg').textContent, groups: Array.from(document.querySelectorAll('#codexBody .cx-hd')).map(e=>e.textContent) };
});
await new Promise(r=>setTimeout(r,400));
await p.screenshot({ path: OUT + 'blood_codex.png' });
await p.evaluate(() => document.getElementById('codexOverlay').classList.add('hidden'));

// 背包
await p.evaluate(() => {
  const g = window.game;
  g.state='paused'; g.overlaySource='game'; g.overlayKind='bag';
  g.renderBackpack();
  document.getElementById('backpackOverlay').classList.remove('hidden');
});
await new Promise(r=>setTimeout(r,400));
await p.screenshot({ path: OUT + 'blood_bag.png' });
await p.evaluate(() => document.getElementById('backpackOverlay').classList.add('hidden'));

// 观鱼台
const pond = await p.evaluate(() => {
  const g = window.game;
  g.state='paused'; g.overlaySource='game'; g.overlayKind='pond';
  g.renderPond();
  document.getElementById('pondOverlay').classList.remove('hidden');
  return Array.from(document.querySelectorAll('#pondBody .pond-card')).map(c=>({
    n: c.querySelector('.pond-name').textContent,
    svg: !!c.querySelector('.pond-icon svg')
  }));
});
await new Promise(r=>setTimeout(r,400));
await p.screenshot({ path: OUT + 'blood_pondview.png' });
console.log(JSON.stringify({ seed, codex, pond }), 'errs', errs.length, errs.slice(0,2).join(' | '));
await b.close();
