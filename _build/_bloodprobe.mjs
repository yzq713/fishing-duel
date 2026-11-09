import puppeteer from 'puppeteer-core';
const OUT = 'D:/下载/fishprobe/';
const b = await puppeteer.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: 'new', args: ['--no-sandbox','--use-angle=d3d11','--enable-unsafe-swiftshader','--allow-file-access-from-files','--window-size=1280,760'] });
const p = await b.newPage();
await p.setViewport({ width: 1280, height: 760 });
const errs = [];
p.on('pageerror', e => errs.push(String(e).slice(0,240)));
p.on('console', m => { if (m.type()==='error') errs.push('[c] ' + m.text().slice(0,200)); });
await p.goto('file:///C:/Users/ASUS/Documents/Trae-CN/temp_20261108_01/fishing-duel/index.html?v='+Date.now(), { waitUntil: 'load', timeout: 120000 });
await p.waitForFunction('window.game && window.game.world', { timeout: 90000 });
await new Promise(r=>setTimeout(r,3000));
await p.evaluate(() => document.getElementById('soloBtn').click());
await new Promise(r=>setTimeout(r,400));
await p.evaluate(() => document.getElementById('charNextBtn').click());
await new Promise(r=>setTimeout(r,300));
await p.evaluate(() => document.getElementById('fightBtn').click());
await new Promise(r=>setTimeout(r,2200));
const setup = await p.evaluate(() => {
  const g = window.game;
  g.state='playing';
  ['pauseOverlay','startOverlay','charOverlay','weaponOverlay'].forEach(k=>{ if(g.ui[k]) g.ui[k].classList.add('hidden'); });
  g.hour = 21.3; g.wasNight = true; g.world.setDayTime(21.3);
  g.setBloodNight(true);
  g.player.noGravity = true;
  g.player.pos.set(0, 3.2, 15);
  g.player.yaw = Math.PI; g.player.pitch = -0.02;
  return { blood: g.bloodNight, tag: !document.getElementById('bloodTag').classList.contains('hidden'), cls: document.body.classList.contains('blood-night') };
});
await new Promise(r=>setTimeout(r,4200));
await p.screenshot({ path: OUT + 'blood_pond.png' });
// 转身看灯塔方向
await p.evaluate(() => {
  const g = window.game, L = g.world.lighthouse;
  const ux = L.x/Math.hypot(L.x,L.z), uz = L.z/Math.hypot(L.x,L.z);
  g.player.pos.set(ux*26, 3.4, uz*26);
  g.player.yaw = Math.atan2(-(L.x-ux*26), -(L.z-uz*26));
  g.player.pitch = 0.02;
});
await new Promise(r=>setTimeout(r,1200));
await p.screenshot({ path: OUT + 'blood_lh.png' });
// 天空/血月视角
await p.evaluate(() => {
  const g = window.game;
  g.player.pos.set(0, 4.2, 16);
  g.player.yaw = Math.atan2(126, 148); // 朝血月
  g.player.pitch = 0.42;
});
await new Promise(r=>setTimeout(r,900));
await p.screenshot({ path: OUT + 'blood_moon.png' });
console.log('setup', JSON.stringify(setup), 'errs', errs.length, errs.slice(0,3).join(' | '));
await b.close();
