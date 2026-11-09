import puppeteer from 'puppeteer-core';
const V = Date.now();
const ROOT = 'file:///C:/Users/ASUS/Documents/Trae-CN/temp_20261108_01/fishing-duel/';
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: 'new', args: ['--no-sandbox','--use-angle=d3d11','--enable-unsafe-swiftshader','--allow-file-access-from-files'] });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 760 });
const errs = [];
page.on('pageerror', e => errs.push(String(e).slice(0,200)));
await page.goto(ROOT + 'index.html?v=' + V, { waitUntil: 'domcontentloaded' });
await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
await page.setCacheEnabled(false);
await page.goto(ROOT + 'index.html?v=' + V, { waitUntil: 'load', timeout: 120000 });
await page.waitForFunction('window.game && window.game.world', { timeout: 90000 });
await new Promise(r => setTimeout(r, 2600));
await page.evaluate(() => document.getElementById('soloBtn').click());
await new Promise(r => setTimeout(r, 400));
await page.evaluate(() => document.getElementById('charNextBtn').click());
await new Promise(r => setTimeout(r, 300));
await page.evaluate(() => document.getElementById('fightBtn').click());
await new Promise(r => setTimeout(r, 2400));
const start = await page.evaluate(() => {
  const g = window.game;
  g.state = 'playing'; g.locked = true;
  const d = g.world.pondDeck;
  const r = Math.hypot(d.x, d.z);
  const ux = d.x / r, uz = d.z / r;
  const px = d.x + ux * 4.2, pz = d.z + uz * 4.2;   // 陆地一侧
  g.player.pos.set(px, g.world.heightAt(px, pz) + 0.1, pz);
  g.player.yaw = Math.atan2(-(d.x - px), -(d.z - pz));
  g.player.selectSlot(3);
  g.input.forward = true;
  return { deck: [d.x.toFixed(2), d.z.toFixed(2)], from: [px.toFixed(2), pz.toFixed(2)] };
});
await new Promise(r => setTimeout(r, 2000));
const end = await page.evaluate(() => {
  const g = window.game;
  g.input.forward = false;
  const d = g.world.pondDeck;
  return {
    pos: [+g.player.pos.x.toFixed(2), +g.player.pos.z.toFixed(2)],
    distToDeck: +Math.hypot(g.player.pos.x - d.x, g.player.pos.z - d.z).toFixed(2),
    nearest: (g.nearestShop() || {}).kind || null
  };
});
await page.screenshot({ path: 'D:/下载/fishprobe/mk_deckwalk.png' });
console.log(JSON.stringify({ start, end, errs }));
await browser.close();
