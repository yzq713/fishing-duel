# -*- coding: utf-8 -*-
"""经济系统：开局只有手枪；换更高一级鱼竿 = 枪械全部重新购买。"""
import io, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
P = os.path.join(ROOT, 'js', 'economy.js')
s = io.open(P, encoding='utf-8').read()

reps = [
# ---- 初始只给手枪 ----
("""    balance: 0,
    ownedGuns: ['rifle', 'smg', 'sniper'],""",
 """    balance: 0,
    // 开局只配发手枪（用户口径：一根竹竿 + 一把手枪）
    ownedGuns: ['pistol'],"""),
("""    loadout: ['rifle'],""",
 """    loadout: ['pistol'],"""),
("""    ownedRods: ['bamboo'],
    rod: 'bamboo',""",
 """    ownedRods: ['bamboo'],
    rod: 'bamboo',
    // 拿到过的最高鱼竿档位。换到更高一档 = 进入新钓季，枪械执照作废要重买。
    rodPeak: 0,"""),
# ---- 存档 ----
("""          if (Array.isArray(d.ownedGuns)) this.ownedGuns = d.ownedGuns;""",
 """          if (Array.isArray(d.ownedGuns)) this.ownedGuns = d.ownedGuns;
          if (typeof d.rodPeak === 'number') this.rodPeak = Math.max(0, Math.round(d.rodPeak));"""),
("""          ownedGuns: this.ownedGuns,
          loadout: this.loadout,
          ownedRods: this.ownedRods,
          rod: this.rod,""",
 """          ownedGuns: this.ownedGuns,
          loadout: this.loadout,
          ownedRods: this.ownedRods,
          rod: this.rod,
          rodPeak: this.rodPeak,"""),
# ---- 掉落池 ----
("""    { tier: 'epic',   w: 20, kind: 'gun',    pick: ['db', 'dmr', 'lmg', 'minigun'], name: '枪械兑换券' },""",
 """    { tier: 'epic',   w: 20, kind: 'gun',    pick: ['shotgun', 'rifle'], name: '枪械兑换券' },"""),
("""    { tier: 'legend', w: 22, kind: 'gun',    pick: ['sniper', 'amr', 'railgun'],  name: '顶级枪械券' }""",
 """    { tier: 'legend', w: 22, kind: 'gun',    pick: ['sniper', 'minigun', 'railgun'],  name: '顶级枪械券' }"""),
]

for a, b in reps:
    assert s.count(a) == 1, (a[:46], s.count(a))
    s = s.replace(a, b)

# ---- 新增 sanitize / resetGunsForRod，并改写 buyRod ----
old_buy = """    buyGun(id) {
      const g = window.GUNS && window.GUNS[id];
      if (!g || this.ownedGuns.includes(id) || this.balance < g.price) return false;
      this.balance -= g.price;
      this.ownedGuns.push(id);
      this.save();
      return true;
    },

    buyRod(id) {
      const r = window.RODS && window.RODS[id];
      if (!r || this.ownedRods.includes(id) || this.balance < r.price) return false;
      this.balance -= r.price;
      this.ownedRods.push(id);
      this.rod = id;
      this.save();
      return true;
    },
"""
new_buy = """    buyGun(id) {
      const g = window.GUNS && window.GUNS[id];
      if (!g || this.ownedGuns.includes(id) || this.balance < g.price) return false;
      this.balance -= g.price;
      this.ownedGuns.push(id);
      this.save();
      return true;
    },

    // 换更高一档鱼竿 = 进入新的钓季：除了随身手枪，所有枪的执照全部作废，
    // 想再用就得重新买。玩家口径：「每解锁更高一级的鱼竿，所有解锁了的枪就要重新购买」。
    resetGunsForRod(tier) {
      const t = Math.max(0, Math.round(tier || 0));
      if (t <= this.rodPeak) return false;
      this.rodPeak = t;
      const free = Object.keys(window.GUNS || {}).filter((id) => (window.GUNS[id].price || 0) <= 0);
      this.ownedGuns = free.length ? free.slice() : ['pistol'];
      if (!this.ownedGuns.includes('pistol')) this.ownedGuns.unshift('pistol');
      this.loadout = ['pistol'];
      this.save();
      if (typeof this.onGunsReset === 'function') this.onGunsReset(t, this.ownedGuns.slice());
      return true;
    },

    // 老存档清洗：删掉已经不存在的枪（这次砍掉 6 把）、补上 rodPeak。
    // 脚本加载顺序里 player.js 在 economy.js 之后，所以不能读档时做，得等 Game 起来再调。
    sanitize() {
      const G = window.GUNS || {};
      const had = this.ownedGuns.length;
      this.ownedGuns = this.ownedGuns.filter((id) => !!G[id]);
      if (!this.ownedGuns.includes('pistol')) this.ownedGuns.unshift('pistol');
      this.loadout = (this.loadout || []).filter((id) => !!G[id] && this.ownedGuns.includes(id));
      if (!this.loadout.length) this.loadout = ['pistol'];
      // 老存档没有 rodPeak：按已经买到的最高档补出来，免得下次升级时反而没重置
      if (!this.rodPeak) {
        this.ownedRods.forEach((id) => {
          const r = window.RODS && window.RODS[id];
          if (r && r.tier > this.rodPeak) this.rodPeak = r.tier;
        });
      }
      if (had !== this.ownedGuns.length) this.save();
      return this.ownedGuns.length;
    },

    buyRod(id) {
      const r = window.RODS && window.RODS[id];
      if (!r || this.ownedRods.includes(id) || this.balance < r.price) return false;
      this.balance -= r.price;
      this.ownedRods.push(id);
      this.rod = id;
      this.save();
      // 更高一档 → 枪械重置（要先 save 再重置，resetGunsForRod 自己也会存）
      this.resetGunsForRod(r.tier);
      if (typeof this.onRodChanged === 'function') this.onRodChanged(id);
      return true;
    },

    // 宝箱开出的鱼竿也走同一个「升级即重置枪械」的口径
    grantRod(id) {
      const r = window.RODS && window.RODS[id];
      if (!r) return false;
      if (this.ownedRods.indexOf(id) < 0) this.ownedRods.push(id);
      this.resetGunsForRod(r.tier);
      this.save();
      return true;
    },
"""
assert s.count(old_buy) == 1
s = s.replace(old_buy, new_buy)

# ---- 宝箱里的鱼竿改走 grantRod ----
old = """          if (this.ownedRods.indexOf(id) < 0) {
            this.ownedRods.push(id);
            out.text = '解锁鱼竿「' + rod.name + '」';
          } else {"""
new = """          if (this.ownedRods.indexOf(id) < 0) {
            this.grantRod(id);
            out.text = '解锁鱼竿「' + rod.name + '」（枪械已重置）';
          } else {"""
assert s.count(old) == 1
s = s.replace(old, new)

io.open(P, 'w', encoding='utf-8').write(s)
print('OK economy.js')
