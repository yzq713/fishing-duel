import puppeteer from 'puppeteer-core';
const V = process.argv[2] || '210';
const URL = 'file:///C:/Users/ASUS/Documents/Trae-CN/temp_20261108_01/fishing-duel/index.html?v=' + V;
const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  headless: 'new',
  args: ['--no-sandbox', '--use-angle=d3d11', '--enable-unsafe-swiftshader', '--allow-file-access-from-files', '--window-size=1280,760']
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 760, deviceScaleFactor: 1 });
page.on('pageerror', e => console.log('[pageerror]', String(e).slice(0, 300)));
page.on('console', m => { if (m.type() === 'error') console.log('[console]', m.text().slice(0, 200)); });

const boot = async (v) => {
  await page.setCacheEnabled(false);
  await page.goto(URL.replace('v=' + V, 'v=' + v), { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction('window.game && window.game.world', { timeout: 90000 });
  await new Promise(r => setTimeout(r, 4200));
  await page.evaluate(() => document.getElementById('soloBtn').click());
  await new Promise(r => setTimeout(r, 250));
  await page.evaluate(() => document.getElementById('charNextBtn').click());
  await new Promise(r => setTimeout(r, 250));
  await page.evaluate(() => document.getElementById('fightBtn').click());
  await new Promise(r => setTimeout(r, 2200));
  await page.evaluate(() => {
    const g = window.game; g.state = 'playing';
    ['pauseOverlay', 'startOverlay', 'charOverlay', 'weaponOverlay'].forEach(k => { if (g.ui[k]) g.ui[k].classList.add('hidden'); });
  });
};

await page.goto(URL, { waitUntil: 'domcontentloaded' });
await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
await boot(V);

// 1) 品质 → 每秒产出
const table = await page.evaluate(() => {
  const E = window.Economy;
  const names = ['小银鱼', '苔背龟鱼', '彩虹鳟', '月光水灯鱼', '锦鲤', '水晶锦鲤', '九尾锦鲤', '锤头骨鲨', '时之鲤', '太初龙鲤'];
  const pts = [20, 40, 50, 46, 92, 150, 330, 480, 780, 1600];
  return names.map((n, i) => {
    const g = window.fishGradeOf(n);
    return {
      name: n, grade: g, gname: window.FISH_GRADES[g].name, points: pts[i],
      rate: +E.pondRateOf(pts[i], g).toFixed(2)
    };
  });
});
console.log('== 品质 vs 每秒产出');
table.forEach(r => console.log(`  ${r.gname}(g${r.grade})  ${r.name}  ${r.points}分  → +${r.rate}/秒`));

// 2) 走 UI：10 条不同品质的鱼放进湖里
const r1 = await page.evaluate((rows) => {
  const E = window.Economy;
  E.fishBag = []; E.pondFish = []; E.raised = 0; E.save();
  rows.forEach(r => E.addFish({ name: r.name, points: r.points, tier: window.fishGradeOf(r.name), sea: true, dist: 20 }));
  for (let i = 0; i < rows.length; i++) {
    window.game.renderBackpack();
    const btn = document.querySelector('#bpFish .fc-raise');
    if (btn) btn.click();
  }
  const st = window.game.world.pondStat();
  return {
    pondFish: E.pondFish.map(f => `${f.name}(g${f.tier}):+${E.pondRateFor(f).toFixed(1)}`),
    fishes: window.game.world.fishes.length,
    rate: +st.rate.toFixed(2),
    expected: +E.pondStat().rate.toFixed(2),
    hud: document.getElementById('pondHud').textContent.trim()
  };
}, table);
console.log('after-raise', JSON.stringify(r1, null, 0));

// 3) 实测每秒加分
const before = await page.evaluate(() => ({ score: window.game.score, bal: window.Economy.balance }));
await new Promise(r => setTimeout(r, 3200));
const after = await page.evaluate(() => ({ score: window.game.score, bal: window.Economy.balance, rate: +window.game.world.pondStat().rate.toFixed(2) }));
console.log('income', JSON.stringify({ before, after, delta: after.score - before.score, perSec: ((after.score - before.score) / 3.2).toFixed(1), rate: after.rate }));

// 4) 背包面板截图（看「放养 +x/秒」是否排得下）
await page.evaluate(() => {
  const E = window.Economy;
  E.fishBag = [];
  [['星界鳐', 2400], ['太初龙鲤', 1600], ['水晶锦鲤', 150], ['彩虹鳟', 50], ['小银鱼', 20]]
    .forEach(([n, p]) => E.addFish({ name: n, points: p, tier: window.fishGradeOf(n), sea: true, dist: 26 }));
  window.game.renderBackpack();
  document.getElementById('backpackOverlay').classList.remove('hidden');
});
await new Promise(r => setTimeout(r, 700));
await page.screenshot({ path: 'D:/下载/fishprobe/grade_bag.png' });

// 5) 塘边 HUD 截图
await page.evaluate(() => {
  document.getElementById('backpackOverlay').classList.add('hidden');
  const p = window.game.player;
  p.pos.set(0, 0.4, 14); p.noGravity = true;
  p.yaw = Math.atan2(0, 1); p.pitch = -0.22;
});
await new Promise(r => setTimeout(r, 1400));
await page.screenshot({ path: 'D:/下载/fishprobe/grade_hud.png' });

// 6) 老存档迁移：pondFish 只有名字+分值、没有 tier
await page.evaluate(() => {
  const key = 'fishingDuel.economy.v1';
  const d = JSON.parse(localStorage.getItem(key) || '{}');
  d.pondFish = [{ id: 'old1', name: '九尾锦鲤', points: 330 }, { id: 'old2', name: '小银鱼', points: 20 }];
  d.raised = 2;
  localStorage.setItem(key, JSON.stringify(d));
});
await boot(String(+V + 1));
const mig = await page.evaluate(() => ({
  pondFish: window.Economy.pondFish.map(f => `${f.name}:tier=${f.tier}:+${window.Economy.pondRateFor(f).toFixed(1)}`),
  fishes: window.game.world.fishes.map(f => `${f.name}:g${f.tier}`),
  rate: +window.game.world.pondStat().rate.toFixed(2),
  hud: document.getElementById('pondHud').textContent.trim()
}));
console.log('old-save', JSON.stringify(mig));

// 7) 帧率
const perf = await page.evaluate(() => new Promise((res) => {
  const r = window.game.renderer; const ts = []; let last = performance.now();
  let n = 0;
  const tick = () => { const t = performance.now(); ts.push(t - last); last = t; n++; if (n < 120) requestAnimationFrame(tick); else { ts.sort((a, b) => a - b); res({ p50: +ts[60].toFixed(1), max: +ts[ts.length - 1].toFixed(1) }); } };
  requestAnimationFrame(tick);
}));
console.log('frame', JSON.stringify(perf));
await browser.close();
