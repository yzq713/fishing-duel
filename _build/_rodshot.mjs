import puppeteer from 'puppeteer-core';
const V = Date.now();
const ROOT = 'file:///C:/Users/ASUS/Documents/Trae-CN/temp_20261108_01/fishing-duel/';
const OUT = 'D:/下载/fishprobe/';
const errs = [];
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: 'new', args: ['--no-sandbox','--use-angle=d3d11','--enable-unsafe-swiftshader','--allow-file-access-from-files'] });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 760 });
page.on('pageerror', e => errs.push(e.message));
await page.goto(ROOT + 'index.html?v=' + V, { waitUntil: 'domcontentloaded' });
await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
await page.setCacheEnabled(false);
await page.goto(ROOT + 'index.html?v=' + V, { waitUntil: 'load', timeout: 120000 });
await page.waitForFunction('window.game && window.game.world', { timeout: 90000 });
await new Promise(r => setTimeout(r, 2800));
await page.evaluate(() => document.getElementById('soloBtn').click());
await new Promise(r => setTimeout(r, 450));
await page.evaluate(() => document.getElementById('charNextBtn').click());
await new Promise(r => setTimeout(r, 350));
await page.evaluate(() => document.getElementById('fightBtn').click());
await new Promise(r => setTimeout(r, 2400));
// 走到岸边、面向湖，取出鱼竿并蓄力
const st = await page.evaluate(() => {
  const g = window.game;
  const w = g.world;
  // 湖边：pond 中心 + 半径方向
  const a = 1.35, r = w.pondRadiusAt ? w.pondRadiusAt(a) : 8;
  const px = w.pond.x + Math.cos(a) * (r + 2.4);
  const pz = w.pond.z + Math.sin(a) * (r + 2.4);
  g.player.pos.set(px, w.heightAt(px, pz) + 0.1, pz);
  g.player.yaw = a + Math.PI;      // 面向湖心
  g.player.pitch = -0.12;
  g.player.selectSlot(2);
  g.player.setAim(false);
  g.player.frozen = false;
  g.fishing.startCharge();
  return { rod: g.player.slots[2], state: g.state, pond: [w.pond.x, w.pond.z] };
});
await new Promise(r => setTimeout(r, 700));
await page.screenshot({ path: OUT + 'fx_cast.png' });
const charge = await page.evaluate(() => ({ power: window.game.fishing.charge ? +window.game.fishing.charge.toFixed(2) : null, busy: window.game.fishing.busy }));
console.log('CAST ' + JSON.stringify({ ...st, ...charge }));
console.log('ERRS ' + errs.length + (errs.length ? ' :: ' + errs[0] : ''));
await browser.close();
