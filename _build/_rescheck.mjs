import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({
  executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: 'new',
  args: ['--no-sandbox','--use-angle=d3d11','--allow-file-access-from-files','--window-size=1280,760']
});
const p = await b.newPage();
await p.setViewport({ width: 1280, height: 760, deviceScaleFactor: 1.5 });
const errs=[]; p.on('pageerror',e=>errs.push(String(e).slice(0,200)));
await p.goto('file:///C:/Users/ASUS/Documents/Trae-CN/temp_20261108_01/fishing-duel/index.html?v='+Date.now(), { waitUntil: 'load', timeout: 120000 });
await p.waitForFunction('window.game && window.game.world', { timeout: 90000 });
await p.evaluate(() => { const el=document.getElementById('platformOverlay'); if (el && !el.classList.contains('hidden')) document.getElementById('platPC').click(); });
await new Promise(r=>setTimeout(r,400));
await p.evaluate(() => document.getElementById('soloBtn').click());
await new Promise(r=>setTimeout(r,300));
await p.evaluate(() => document.getElementById('charNextBtn').click());
await new Promise(r=>setTimeout(r,250));
await p.evaluate(() => document.getElementById('fightBtn').click());
await new Promise(r=>setTimeout(r,2400));
await p.evaluate(() => {
  const g=window.game; g.state='playing';
  g.player.noGravity=true; g.player.pos.set(0,3,14); g.player.yaw=Math.PI; g.player.pitch=-0.05;
  g.hour=11; g.wasNight=false; g.world.setDayTime(11);
});
await new Promise(r=>setTimeout(r,900));
await p.screenshot({ path: 'D:/下载/fishprobe/res_100.png' });
await p.evaluate(() => { const g=window.game; g.resScale=0.66; g.resize(); });
await new Promise(r=>setTimeout(r,700));
await p.screenshot({ path: 'D:/下载/fishprobe/res_066.png' });
const info = await p.evaluate(() => ({ scale: window.game.resScale, canvas: [window.game.renderer.domElement.width, window.game.renderer.domElement.height] }));
console.log(JSON.stringify(info), 'errs', errs.length, errs.slice(0,2).join('|'));
await b.close();
