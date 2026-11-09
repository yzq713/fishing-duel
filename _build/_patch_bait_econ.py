import io, re
p = 'js/economy.js'
s = io.open(p, encoding='utf-8').read()

# ---------- 1) 鱼饵表 + 杂物收购价 ----------
anchor = "  const BAG_ORDER = ['cloth', 'canvas', 'leather', 'steel', 'abyss'];\n  window.BAGS = BAGS;\n"
assert s.count(anchor) == 1
bait_block = anchor + """
  // ================= 鱼饵 =================
  // 每抛一竿消耗一份。cap = 这档饵能钓到的最高品质等级（0..9），
  // luck = 高品质鱼的权重倍率。空钩 cap 只有 2，只能钓到精良及以下 ——
  // 玩家口径：「不带鱼饵也能钓，但钓不到好鱼；饵越好，好鱼概率越高」。
  const BAITS = {
    worm:   { id: 'worm',   name: '蚯蚓',     tier: 0, price: 8,   pack: 10, cap: 3, luck: 1.0, color: '#a9784c',
              desc: '挖两下就有一条，只招得来普通鱼' },
    shrimp: { id: 'shrimp', name: '虾肉饵',   tier: 1, price: 22,  pack: 10, cap: 5, luck: 1.7, color: '#e08a6a',
              desc: '腥味重，传说以下的鱼都会咬' },
    lure:   { id: 'lure',   name: '亮片假饵', tier: 2, price: 60,  pack: 10, cap: 7, luck: 2.5, color: '#7fd0f0',
              desc: '反光诱鱼，稀有鱼明显变多' },
    secret: { id: 'secret', name: '秘制香饵', tier: 3, price: 150, pack: 10, cap: 9, luck: 3.6, color: '#e8b96a',
              desc: '老渔夫的方子，连远古巨兽都会咬' }
  };
  const BAIT_ORDER = ['worm', 'shrimp', 'lure', 'secret'];
  window.BAITS = BAITS;
  window.BAIT_ORDER = BAIT_ORDER;

  // 海里/湖边捡到的杂物收购价（鱼市与背包里都能卖）
  const ITEM_PRICES = { '海藻': 30, '贝壳': 70, '旧瓶子': 110, '珍珠': 420, '海玻璃': 95, '鱼骨': 45 };
  window.ITEM_PRICES = ITEM_PRICES;
"""
s = s.replace(anchor, bait_block)

# ---------- 2) 状态字段 ----------
old = "    bagId: 'cloth',\n    ownedBags: ['cloth'],\n    bait: 0,\n"
assert s.count(old) == 1
new = """    bagId: 'cloth',
    ownedBags: ['cloth'],
    // 鱼饵按「品种 → 份数」存在背包里（不再是单独一个数字）。
    // 老存档里的 bait: N 会在 load() 里折算成 N 份蚯蚓。
    baits: { worm: 0, shrimp: 0, lure: 0, secret: 0 },
    // 当前挂在钩上的那一种；null = 空钩（能钓，但钓不到好鱼）
    baitSel: null,
"""
s = s.replace(old, new)

# ---------- 3) load ----------
old = "          if (typeof d.bait === 'number') this.bait = d.bait;\n"
assert s.count(old) == 1
new = """          if (d.baits && typeof d.baits === 'object') {
            BAIT_ORDER.forEach((k) => {
              if (typeof d.baits[k] === 'number') this.baits[k] = Math.max(0, Math.floor(d.baits[k]));
            });
          } else if (typeof d.bait === 'number' && d.bait > 0) {
            // 老存档：只有一笼统的「鱼饵份数」，折成最普通的蚯蚓
            this.baits.worm = Math.max(0, Math.floor(d.bait));
          }
          if (typeof d.baitSel === 'string' && BAITS[d.baitSel]) this.baitSel = d.baitSel;
          if (this.baitSel && this.baitCount(this.baitSel) <= 0) this.baitSel = null;
"""
s = s.replace(old, new)

# ---------- 4) save ----------
old = "          bait: this.bait,\n"
assert s.count(old) == 1
new = """          baits: this.baits,
          baitSel: this.baitSel,
          bait: this.totalBait(),
"""
s = s.replace(old, new)

# ---------- 5) 鱼饵方法 ----------
old = """    addBait(n) {
      this.bait = Math.max(0, this.bait + n);
      this.save();
    },

    useBait() {
      if (this.bait <= 0) return false;
      this.bait -= 1;
      this.save();
      return true;
    },

    buyBait(n, cost) {
      if (this.balance < cost) return false;
      this.balance -= cost;
      this.bait += n;
      this.save();
      return true;
    },
"""
assert s.count(old) == 1
new = """    // 所有鱼饵的总份数（HUD / 背包角标用）
    totalBait() {
      let n = 0;
      BAIT_ORDER.forEach((k) => { n += this.baits[k] || 0; });
      return n;
    },

    baitCount(id) {
      return Math.max(0, this.baits[id] || 0);
    },

    // 老接口兼容：给数字就当成「蚯蚓几份」，给 id 就进对应品种
    addBait(id, n) {
      if (typeof id === 'number') { n = id; id = 'worm'; }
      if (!BAITS[id]) return false;
      const add = Math.floor(n || 0);
      if (!add) return false;
      this.baits[id] = Math.max(0, (this.baits[id] || 0) + add);
      this.save();
      return true;
    },

    // 装钩：背包里点「使用」，之后每抛一竿自动消耗一份
    loadBait(id) {
      if (!BAITS[id] || this.baitCount(id) <= 0) return false;
      this.baitSel = id;
      this.save();
      return true;
    },

    unloadBait() {
      this.baitSel = null;
      this.save();
    },

    // 抛竿时调用：消耗一份当前挂的饵，返回这档饵的参数。
    // 空钩 / 用光了 → 返回 null（仍然能钓，只是钓不到好鱼）。
    consumeBait() {
      const id = this.baitSel;
      if (!id || this.baitCount(id) <= 0) {
        if (id) { this.baitSel = null; this.save(); }
        return null;
      }
      const b = BAITS[id];
      this.baits[id] -= 1;
      const left = this.baits[id];
      if (left <= 0) this.baitSel = null;
      this.save();
      return { id, name: b.name, cap: b.cap, luck: b.luck, left, color: b.color };
    },

    buyBait(id, n) {
      const b = BAITS[id];
      if (!b) return false;
      const count = Math.max(1, Math.floor(n || 1));
      const cost = b.price * count;
      if (this.balance < cost) return false;
      this.balance -= cost;
      this.baits[id] = (this.baits[id] || 0) + count;
      this.save();
      return true;
    },

    // ---------------- 卖出（鱼市 / 背包） ----------------
    // 鱼在钓上来时已经计过一次分，鱼市按分值的 30% 收，别让一条鱼被算两遍全价。
    fishPrice(f) {
      const p = f && typeof f.points === 'number' ? f.points : 20;
      return Math.max(5, Math.round(p * 0.3));
    },

    itemPrice(name) {
      return ITEM_PRICES[name] || 40;
    },

    sellFish(index) {
      if (index < 0 || index >= this.fishBag.length) return null;
      const f = this.fishBag.splice(index, 1)[0];
      const price = this.fishPrice(f);
      this.balance += price;
      this.save();
      return { fish: f, price };
    },

    sellAllFish() {
      let price = 0, n = 0;
      while (this.fishBag.length) {
        const f = this.fishBag.pop();
        price += this.fishPrice(f);
        n++;
      }
      if (n) { this.balance += price; this.save(); }
      return { n, price };
    },

    sellItem(index) {
      if (index < 0 || index >= this.items.length) return null;
      const it = this.items.splice(index, 1)[0];
      const price = this.itemPrice(it.name);
      this.balance += price;
      this.save();
      return { item: it, price };
    },

    sellAllItems() {
      let price = 0, n = 0;
      while (this.items.length) {
        const it = this.items.pop();
        price += this.itemPrice(it.name);
        n++;
      }
      if (n) { this.balance += price; this.save(); }
      return { n, price };
    },
"""
s = s.replace(old, new)

# ---------- 6) 掉落里的鱼饵带上品种 ----------
old = """    { tier: 'common', w: 22, kind: 'bait',   min: 2,    max: 5,    name: '鱼饵' },"""
new = """    { tier: 'common', w: 22, kind: 'bait',   min: 2,    max: 5,    name: '鱼饵', baitId: 'worm' },"""
assert s.count(old) == 1
s = s.replace(old, new)
old = """    { tier: 'fine',   w: 20, kind: 'bait',   min: 6,    max: 12,   name: '鱼饵罐' },"""
new = """    { tier: 'fine',   w: 20, kind: 'bait',   min: 6,    max: 12,   name: '鱼饵罐', baitId: 'shrimp' },"""
assert s.count(old) == 1
s = s.replace(old, new)
old = """    { tier: 'rare',   w: 20, kind: 'bait',   min: 20,   max: 36,   name: '鱼饵桶' },"""
new = """    { tier: 'rare',   w: 20, kind: 'bait',   min: 20,   max: 36,   name: '鱼饵桶', baitId: 'lure' },"""
assert s.count(old) == 1
s = s.replace(old, new)

old = """      } else if (l.kind === 'bait') {
        const n = Math.round(l.min + Math.random() * (l.max - l.min));
        this.bait += n;
        out.text = '+' + n + ' 份鱼饵';
"""
assert s.count(old) == 1
new = """      } else if (l.kind === 'bait') {
        const n = Math.round(l.min + Math.random() * (l.max - l.min));
        const bid = BAITS[l.baitId] ? l.baitId : 'worm';
        this.addBait(bid, n);
        out.name = BAITS[bid].name;
        out.text = '+' + n + ' 份' + BAITS[bid].name;
"""
s = s.replace(old, new)

io.open(p, 'w', encoding='utf-8', newline='\n').write(s)
print('economy patched')
