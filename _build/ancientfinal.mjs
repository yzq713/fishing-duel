import puppeteer from 'puppeteer-core';
const V = Date.now();
const URL = 'file:///C:/Users/ASUS/Documents/Trae-CN/temp_20261108_01/fishing-duel/index.html?v=' + V;
const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  headless: 'new',
  args: ['--no-sandbox', '--use-angle=d3d11', '--enable-unsafe-swiftshader', '--allow-file-access-from-files', '--window-size=1280,760']
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 760, deviceScaleFactor: 1 });
const errs = [];
page.on('pageerror', e => { errs.push(String(e).slice(0, 240)); console.log('[pageerror]', String(e).slice(0, 240)); });
page.on('console', m => { if (m.type() === 'error') { errs.push(m.text().slice(0, 200)); console.log('[console]', m.text().slice(0, 200)); } });
await page.goto(URL, { waitUntil: 'domcontentloaded' });
await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
await page.setCacheEnabled(false);
await page.goto(URL, { waitUntil: 'load', timeout: 120000 });
await page.waitForFunction('window.game && window.game.world', { timeout: 90000 });
await new Promise(r => setTimeout(r, 3800));

// 空档先看一眼图鉴里的远古组
await page.evaluate(() => document.getElementById('codexBtn').click());
await new Promise(r => setTimeout(r, 500));
await page.evaluate(() => { const b = document.getElementById('codexBody'); b.scrollTop = b.scrollHeight; });
await new Promise(r => setTimeout(r, 300));
await page.screenshot({ path: 'D:/下载/fishprobe/anc_locked.png' });
const locked = await page.evaluate(() => {
  const el = Array.from(document.querySelectorAll('#codexBody .cx-hd')).find(h => h.textContent.includes('远古'));
  return { head: el ? el.textContent.trim() : null, prog: document.getElementById('codexProg').textContent };
});
console.log('locked', JSON.stringify(locked));
await page.evaluate(() => document.getElementById('codexBackBtn').click());

// 进游戏
await page.evaluate(() => document.getElementById('soloBtn').click());
await new Promise(r => setTimeout(r, 250));
await page.evaluate(() => document.getElementById('charNextBtn').click());
await new Promise(r => setTimeout(r, 250));
await page.evaluate(() => document.getElementById('fightBtn').click());
await new Promise(r => setTimeout(r, 2000));
await page.evaluate(() => {
  const g = window.game; g.state = 'playing';
  ['pauseOverlay', 'startOverlay', 'charOverlay', 'weaponOverlay'].forEach(k => { if (g.ui[k]) g.ui[k].classList.add('hidden'); });
});

// 真实收杆：钓到苍龙
const c1 = await page.evaluate(() => {
  const g = window.game, f = g.fishing;
  f.state = 'reel';
  f.pickedFish = { name: '苍龙', points: 3200 };
  f.pickedTier = 7;
  f.castDist = 80;
  f.seaCast = true;
  f.completeCatch();
  return { codex: JSON.parse(JSON.stringify(window.Economy.codex)), bag: window.Economy.fishBag.map(x => x.name + ':' + x.points + ':g' + x.tier) };
});
console.log('catch-苍龙', JSON.stringify(c1));
await new Promise(r => setTimeout(r, 400));
await page.screenshot({ path: 'D:/下载/fishprobe/anc_catch.png' });
await new Promise(r => setTimeout(r, 2000));
console.log('notice', JSON.stringify(await page.evaluate(() => document.getElementById('notices').textContent.replace(/\s+/g, ' ').trim().slice(-90))));

// 再钓一条恐龙
await page.evaluate(() => {
  const g = window.game, f = g.fishing;
  f.state = 'reel';
  f.pickedFish = { name: '恐龙', points: 3800 };
  f.pickedTier = 7;
  f.castDist = 85;
  f.seaCast = true;
  f.completeCatch();
});
await new Promise(r => setTimeout(r, 2400));

// 背包里两条鱼都点「放入湖中」
const raised = await page.evaluate(() => {
  window.game.renderBackpack();
  document.getElementById('backpackOverlay').classList.remove('hidden');
  const btns = Array.from(document.querySelectorAll('#bpFish .fc-raise'));
  btns.forEach(b => b.click());
  return {
    pond: window.Economy.pondFish.map(f => f.name + ':' + f.tier + ':' + f.points),
    stat: window.game.world.pondStat(),
    fishes: window.game.world.fishes.length,
    coins: document.getElementById('backpackOverlay').textContent.match(/放养 \+[\d.]+/g)
  };
});
console.log('raised', JSON.stringify(raised));
await new Promise(r => setTimeout(r, 400));
await page.screenshot({ path: 'D:/下载/fishprobe/anc_bag.png' });
await page.evaluate(() => document.getElementById('bpBackBtn').click());
await new Promise(r => setTimeout(r, 600));

// 站岸边看湖
await page.evaluate(() => {
  const g = window.game, p = g.player;
  const fs = g.world.fishes;
  fs.forEach((f, i) => { f.speed = 0.22; f.ang = 0.7 + i * 1.6; f.r = 1.8 + i * 1.2; });
  p.pos.set(0.4, 0.35, 9.4);
  if (p.vel) p.vel.set(0, 0, 0);
  const dx = 0 - p.pos.x, dy = -0.1 - (p.pos.y + 1.66), dz = 0 - p.pos.z;
  const L = Math.hypot(dx, dz);
  p.yaw = Math.atan2(-dx / L, -dz / L);
  p.pitch = Math.atan2(dy, L);
});
await new Promise(r => setTimeout(r, 1200));
await page.screenshot({ path: 'D:/下载/fishprobe/anc_pond2.png' });

// 图鉴：远古组应 2/2
await page.keyboard.press('KeyJ');
await new Promise(r => setTimeout(r, 500));
await page.evaluate(() => { const b = document.getElementById('codexBody'); b.scrollTop = b.scrollHeight; });
await new Promise(r => setTimeout(r, 400));
await page.screenshot({ path: 'D:/下载/fishprobe/anc_codex2.png' });
const codex = await page.evaluate(() => ({
  prog: document.getElementById('codexProg').textContent,
  cards: Array.from(document.querySelectorAll('#codexBody .cx-card')).slice(-2).map(c => c.textContent.replace(/\s+/g, ' ').trim())
}));
console.log('codex', JSON.stringify(codex));
await page.keyboard.press('KeyJ');
await new Promise(r => setTimeout(r, 400));

// 帧率
const perf = await page.evaluate(() => new Promise((res) => {
  const t = []; let last = performance.now(), n = 0;
  function tick() {
    const now = performance.now(); t.push(now - last); last = now; n++;
    if (n < 140) requestAnimationFrame(tick);
    else { t.sort((a, b) => a - b); res({ p50: +t[70].toFixed(2), max: +t[139].toFixed(2) }); }
  }
  requestAnimationFrame(tick);
}));
console.log('perf', JSON.stringify(perf), 'errs', errs.length);
await browser.close();
