import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({
  executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: 'new',
  args: ['--no-sandbox', '--use-angle=d3d11', '--disable-gpu-vsync', '--disable-frame-rate-limit',
    '--allow-file-access-from-files', '--window-size=1600,900']
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
  const g = window.game; g.state = 'playing';
  g.player.noGravity = true; g.player.pos.set(0, 3, 14); g.player.yaw = Math.PI; g.player.pitch = -0.05;
  g.hour = 11; g.wasNight = false; g.world.setDayTime(11);
});
await new Promise(r => setTimeout(r, 1000));

const out = await p.evaluate(async () => {
  const g = window.game;
  const frames = async (n) => {
    const t = []; let last = performance.now();
    await new Promise(res => { let i = 0; (function tick() { const now = performance.now(); t.push(+(now - last).toFixed(1)); last = now; if (++i < n) requestAnimationFrame(tick); else res(); })(); });
    return t;
  };
  const mark = async (label, fn) => {
    const s = performance.now(); fn(); const call = +(performance.now() - s).toFixed(1);
    const fr = await frames(4);
    return { label, callMs: call, frames: fr };
  };
  const rows = [];
  rows.push(await mark('world.setDaymare(true)', () => g.world.setDaymare(true)));
  rows.push(await mark('setBatCount(10)', () => g.world.setBatCount(10)));
  rows.push(await mark('body.class+=daymare', () => document.body.classList.add('daymare')));
  rows.push(await mark('dayTag 显示', () => { g.ui.dayTag.classList.remove('hidden'); g.ui.dayTag.textContent = '日魇 · 蝠群 26'; }));
  rows.push(await mark('notice 长文案', () => g.notice('日魇 —— 阳光无法驱散它们。当刺眼的白昼被密集的蝠影遮蔽，深渊中的变异鱼类将借着狂潮浮出水面。', 'bad')));
  rows.push(await mark('setBatCount(30)', () => g.world.setBatCount(30)));
  rows.push(await mark('第二只蝙蝠 (28)', () => g.world.setBatCount(28)));
  rows.push(await mark('清零→再开 10 只', () => g.world.setBatCount(0)));
  rows.push(await mark('第二轮 10 只', () => g.world.setBatCount(10)));
  rows.push(await mark('第三轮 10 只', () => { g.world.setBatCount(0); g.world.setBatCount(10); }));
  return rows;
});
out.forEach(r => console.log(r.label.padEnd(26), 'call', String(r.callMs).padStart(6), 'frames', r.frames.join(' ')));
await b.close();
