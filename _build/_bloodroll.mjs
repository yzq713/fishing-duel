import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: 'new', args: ['--no-sandbox','--enable-unsafe-swiftshader','--allow-file-access-from-files'] });
const p = await b.newPage();
const errs = [];
p.on('pageerror', e => errs.push(String(e).slice(0,200)));
await p.goto('file:///C:/Users/ASUS/Documents/Trae-CN/temp_20261108_01/fishing-duel/index.html?v='+Date.now(), { waitUntil: 'load', timeout: 120000 });
await p.waitForFunction('window.game && window.game.world', { timeout: 90000 });
const res = await p.evaluate(() => {
  const F = window.game.fishing;
  const E = window.Economy;
  const roll = (n, dist, baitCfg, blood) => {
    const out = {};
    F.seaCast = true;
    F.castDist = dist;
    F.baitCfg = baitCfg;
    window.BloodNight.active = blood;
    for (let i = 0; i < n; i++) {
      const r = F.pickFish();
      out[r.picked.name] = (out[r.picked.name] || 0) + 1;
    }
    const bloodNames = window.BLOOD_FISH.map(f => f.name);
    const bloodHit = Object.keys(out).filter(k => bloodNames.includes(k)).reduce((s, k) => s + out[k], 0);
    return { total: n, bloodHit, pct: +(bloodHit / n * 100).toFixed(1), out };
  };
  const baits = {
    worm: { id: 'worm', name: '蚯蚓', cap: 3, luck: 1.0 },
    shrimp: { id: 'shrimp', name: '虾肉', cap: 5, luck: 1.7 },
    secret: { id: 'secret', name: '秘制香饵', cap: 9, luck: 3.6 }
  };
  return {
    bloodSecret: roll(600, 60, baits.secret, true),
    bloodShrimp: roll(600, 60, baits.shrimp, true),
    bloodWorm: roll(600, 60, baits.worm, true),
    bloodEmpty: roll(400, 60, null, true),
    normalSecret: roll(400, 60, baits.secret, false),
    bloodShallow: roll(400, 10, baits.secret, true)
  };
});
console.log(JSON.stringify(res, null, 1));
console.log('errs', errs.length);
await b.close();
