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
await new Promise(r => setTimeout(r, 1200));
const out = await p.evaluate(async () => {
  const g = window.game;
  const seq = async (n) => { const t=[]; let last=performance.now();
    await new Promise(res=>{let i=0;(function tick(){const now=performance.now();t.push(+(now-last).toFixed(1));last=now;if(++i<n)requestAnimationFrame(tick);else res();})();});
    return t; };
  const r = {};
  r.idle = (await seq(30)).slice(1);            // 静止不动，看阴影节流实际节奏
  // 每帧强制阴影重绘
  g.renderer.shadowMap.needsUpdate = true;
  r.forceShadow = (await seq(30)).slice(1);
  return r;
});
console.log('idle       ', out.idle.join(' '));
console.log('forceShadow', out.forceShadow.join(' '));
await b.close();
