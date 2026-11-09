import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({
  executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: 'new',
  args: ['--no-sandbox','--use-angle=d3d11','--disable-gpu-vsync','--disable-frame-rate-limit','--allow-file-access-from-files','--window-size=1600,900']
});
const p = await b.newPage();
await p.setViewport({ width: 1600, height: 900 });
await p.goto('file:///C:/Users/ASUS/Documents/Trae-CN/temp_20261108_01/fishing-duel/index.html?v=' + Date.now(), { waitUntil: 'load', timeout: 120000 });
await p.waitForFunction('window.game && window.game.world', { timeout: 90000 });
await p.evaluate(() => { const el = document.getElementById('platformOverlay'); if (el && !el.classList.contains('hidden')) document.getElementById('platPC').click(); });
await new Promise(r => setTimeout(r, 400));
await p.evaluate(() => document.getElementById('soloBtn').click());
await new Promise(r => setTimeout(r, 300));
await p.evaluate(() => document.getElementById('charNextBtn').click());
await new Promise(r => setTimeout(r, 250));
await p.evaluate(() => document.getElementById('fightBtn').click());
await new Promise(r => setTimeout(r, 2500));
await p.evaluate(() => {
  const g = window.game; g.state='playing';
  g.player.noGravity = true; g.player.pos.set(0, 3, 14); g.player.yaw = Math.PI; g.player.pitch = -0.05;
  g.hour = 11; g.wasNight = false; g.world.setDayTime(11);
});
await new Promise(r => setTimeout(r, 1000));

const out = await p.evaluate(async () => {
  const g = window.game;
  const frames = async (n) => { const t=[]; let last=performance.now();
    await new Promise(res=>{let i=0;(function tick(){const now=performance.now();t.push(+(now-last).toFixed(1));last=now;if(++i<n)requestAnimationFrame(tick);else res();})();});
    return Math.max(...t); };
  const r = {};
  // A: 正常触发（第一次画蝙蝠）
  g.setDaymare(true); r.A_firstBatFrame = await frames(6);
  g.setDaymare(false); g.world.setBatCount(0); await frames(4);
  // B: 再开一次（已编译）
  g.world.setBatCount(10); r.B_secondBatFrame = await frames(6);
  g.world.setBatCount(0); await frames(4);
  // C: 彻底关掉阴影更新后再开
  const sm = g.renderer.shadowMap;
  sm.autoUpdate = false; sm.needsUpdate = false;
  Object.defineProperty(sm, 'needsUpdate', { get: () => false, set: () => {}, configurable: true });
  g.world.setBatCount(10); r.C_noShadow = await frames(6);
  g.world.setBatCount(0); await frames(4);
  // D: 阴影恢复后再验证一次
  delete sm.needsUpdate;
  sm.needsUpdate = true; await frames(4);
  g.world.setBatCount(10); r.D_shadowBack = await frames(6);
  return r;
});
console.log(JSON.stringify(out, null, 1));
await b.close();
