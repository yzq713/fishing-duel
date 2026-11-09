/* 经济系统：积分持久化、武器/鱼竿解锁与装备（localStorage） */
(function () {
  const KEY = 'fishingDuel.economy.v1';

  // 湖中养鱼：每条鱼每秒产出的积分，下标 = 品质等级
  // （0 普通、1 优良、2 精良、3 稀有、4 史诗、5 传说、6 神话、7 远古、8 深渊、9 神域）
  const POND_GRADE_RATE = [0.6, 1.3, 2.4, 4.2, 7.2, 12, 19, 29, 42, 58];
  window.POND_GRADE_RATE = POND_GRADE_RATE;
  // 养鱼被动产出的全局系数：原速率几十秒就回本、挂机积分涨太快，整体压到 1/4，
  // 让一条鱼约 2-3 分钟才回本，养鱼退为主动钓鱼的补充。以后想再调只改这里。
  const POND_RATE_MULT = 0.25;

  // 积分获取全面降速（降低积分膨胀、拉长成长节奏）：所有主动/被动积分入口统一走这里，
  // 想恢复原速度把对应系数改回 1 即可。
  const ECON = {
    catchScore: 0.6,   // 钓鱼/打鸟即时得分（addScore）
    sellFish: 0.2,     // 卖鱼（原固定 0.3）
    pondRate: 0.6,     // 养鱼被动（在 POND_RATE_MULT=0.25 基础上再乘，最终约 0.15）
    lootPoints: 0.6    // 掉落里的纯积分/背包满折算
  };
  window.ECON = ECON;

  // 可选角色与特长
  const CHARACTERS = {
    angler:      { id: 'angler', name: '老渔夫', perk: '钓鱼判定区 +30%，收杆更容易', zone: 1.3, dmg: 1,    swim: 1,   luck: 1 },
    gunslinger:  { id: 'gunslinger', name: '快枪手', perk: '枪械伤害 +12%',          zone: 1,   dmg: 1.12, swim: 1,   luck: 1 },
    diver:       { id: 'diver', name: '追风者', perk: '陆地移动速度 +15%，跑图更快', zone: 1,   dmg: 1,    swim: 1, move: 1.15, luck: 1 },
    lucky:       { id: 'lucky', name: '幸运星', perk: '稀有鱼出现概率 +25%',         zone: 1,   dmg: 1,    swim: 1,   luck: 1.25 }
  };
  window.CHARACTERS = CHARACTERS;

  // ================= 背包（容量） =================
  // 原来容量写死 20 格，钓满就得反复跑回岸上倒货。现在改成五档背包，
  // 在「背包商店」里买更贵的包直接扩容。
  const BAGS = {
    cloth:   { id: 'cloth',   name: '粗布背包', cap: 20, price: 0,    desc: '粗麻缝的，装 20 格' },
    canvas:  { id: 'canvas',  name: '帆布背包', cap: 30, price: 800,  desc: '加厚防水帆布，装 30 格' },
    leather: { id: 'leather', name: '皮革背包', cap: 45, price: 2500, desc: '浸油牛皮，装 45 格' },
    steel:   { id: 'steel',   name: '钢架背包', cap: 60, price: 5500, desc: '内衬钢架，装 60 格' },
    abyss:   { id: 'abyss',   name: '深渊背包', cap: 80, price: 12000, desc: '深海材料缝合，装 80 格' }
  };
  const BAG_ORDER = ['cloth', 'canvas', 'leather', 'steel', 'abyss'];
  window.BAGS = BAGS;

  // ================= 鱼饵 =================
  // 每抛一竿消耗一份。cap = 这档饵能钓到的最高品质等级（0..9），
  // luck = 高品质鱼的权重倍率。空钩 cap 只有 2，只能钓到精良及以下 ——
  // 玩家口径：「不带鱼饵也能钓，但钓不到好鱼；饵越好，好鱼概率越高」。
  const BAITS = {
    worm:   { id: 'worm',   name: '蚯蚓',     tier: 0, price: 15,  pack: 10, cap: 3, luck: 1.0, color: '#a9784c',
              desc: '挖两下就有一条，只能钓到中小型鱼' },
    shrimp: { id: 'shrimp', name: '虾肉饵',   tier: 1, price: 40,  pack: 10, cap: 5, luck: 1.7, color: '#e08a6a',
              desc: '腥味重，传说以下的鱼都会咬' },
    lure:   { id: 'lure',   name: '亮片假饵', tier: 2, price: 110,  pack: 10, cap: 7, luck: 2.5, color: '#7fd0f0',
              desc: '反光诱鱼，稀有鱼明显变多' },
    secret: { id: 'secret', name: '秘制香饵', tier: 3, price: 280, pack: 10, cap: 9, luck: 3.6, color: '#e8b96a',
              desc: '老渔夫的方子，连远古巨兽都会咬' }
  };
  const BAIT_ORDER = ['worm', 'shrimp', 'lure', 'secret'];
  window.BAITS = BAITS;
  window.BAIT_ORDER = BAIT_ORDER;

  // 海里/湖边捡到的杂物收购价（鱼市与背包里都能卖）
  const ITEM_PRICES = { '海藻': 30, '贝壳': 70, '旧瓶子': 110, '珍珠': 420, '海玻璃': 95, '鱼骨': 45 };
  window.ITEM_PRICES = ITEM_PRICES;

  // ================= 宝箱（按稀有度随机掉落） =================
  // 越贵的箱子开出的件数越多、稀有度权重越高。
  const CHESTS = {
    wood:  { id: 'wood',  name: '旧木箱', price: 450,  rolls: 1, tone: '#c8a878',
             note: '最普通的箱子，多半是零钱和鱼饵',
             weights: { common: 62, fine: 26, rare: 9,   epic: 2.6, legend: 0.4 } },
    iron:  { id: 'iron',  name: '铁皮箱', price: 1400,  rolls: 2, tone: '#9fb0bc',
             note: '铁皮包边，掉落两件',
             weights: { common: 44, fine: 33, rare: 17,  epic: 5,   legend: 1 } },
    gold:  { id: 'gold',  name: '鎏金箱', price: 3300, rolls: 3, tone: '#ffc861',
             note: '铜锁鎏金，掉落三件，史诗概率明显更高',
             weights: { common: 26, fine: 33, rare: 26,  epic: 12,  legend: 3 } },
    abyss: { id: 'abyss', name: '深渊箱', price: 9000, rolls: 5, tone: '#b06cff',
             note: '深海打捞上来的黑箱，连出传说',
             weights: { common: 8,  fine: 24, rare: 34,  epic: 25,  legend: 9 } }
  };
  window.CHESTS = CHESTS;

  // 稀有度本身的分级名（和鱼的十级体系无关，这里是"获得物"的稀有度）
  const LOOT_TIERS = {
    common: { id: 'common', name: '普通', color: '#c2ccd2' },
    fine:   { id: 'fine',   name: '优良', color: '#8ed36a' },
    rare:   { id: 'rare',   name: '稀有', color: '#5fb8f0' },
    epic:   { id: 'epic',   name: '史诗', color: '#e070e8' },
    legend: { id: 'legend', name: '传说', color: '#ffae3a' }
  };
  window.LOOT_TIERS = LOOT_TIERS;

  const LOOT = [
    // ---- 普通 ----
    { tier: 'common', w: 30, kind: 'points', min: 60,   max: 170,  name: '零钱袋' },
    { tier: 'common', w: 22, kind: 'bait',   min: 2,    max: 5,    name: '鱼饵', baitId: 'worm' },
    { tier: 'common', w: 20, kind: 'ammo',   min: 12,   max: 30,   name: '子弹' },
    { tier: 'common', w: 18, kind: 'item',   pick: ['海藻', '贝壳', '旧瓶子', '海玻璃'], name: '海边杂物' },
    { tier: 'common', w: 10, kind: 'points', min: 180,  max: 320,  name: '鼓鼓的钱夹' },
    // ---- 优良 ----
    { tier: 'fine',   w: 30, kind: 'points', min: 260,  max: 470,  name: '积分袋' },
    { tier: 'fine',   w: 24, kind: 'ammo',   min: 40,   max: 80,   name: '弹药盒' },
    { tier: 'fine',   w: 20, kind: 'bait',   min: 6,    max: 12,   name: '鱼饵罐', baitId: 'shrimp' },
    { tier: 'fine',   w: 16, kind: 'item',   pick: ['珍珠', '贝壳', '海玻璃'], name: '海产小箱' },
    { tier: 'fine',   w: 10, kind: 'fish',   grade: 2,  name: '一尾好鱼' },
    // ---- 稀有 ----
    { tier: 'rare',   w: 32, kind: 'points', min: 700,  max: 1250, name: '钱箱' },
    { tier: 'rare',   w: 26, kind: 'ammo',   min: 90,   max: 165,  name: '制式弹药箱' },
    { tier: 'rare',   w: 22, kind: 'fish',   grade: 4,  name: '稀有渔获' },
    { tier: 'rare',   w: 20, kind: 'bait',   min: 20,   max: 36,   name: '鱼饵桶', baitId: 'lure' },
    // ---- 史诗 ----
    { tier: 'epic',   w: 32, kind: 'points', min: 1700, max: 2800, name: '积分宝匣' },
    { tier: 'epic',   w: 26, kind: 'fish',   grade: 6,  name: '史诗渔获' },
    { tier: 'epic',   w: 22, kind: 'rod',    pick: ['carbon', 'master'], name: '鱼竿兑换券' },
    { tier: 'epic',   w: 20, kind: 'gun',    pick: ['shotgun', 'rifle'], name: '枪械兑换券' },
    // ---- 传说 ----
    { tier: 'legend', w: 30, kind: 'points', min: 4200, max: 6800, name: '传说宝藏' },
    { tier: 'legend', w: 24, kind: 'fish',   grade: 8,  name: '传说渔获' },
    { tier: 'legend', w: 24, kind: 'rod',    pick: ['astral', 'void', 'genesis'], name: '顶级鱼竿券' },
    { tier: 'legend', w: 22, kind: 'gun',    pick: ['sniper', 'rifle'],  name: '顶级枪械券' }
  ];

  const Economy = {
    balance: 0,
    // 开局只配发手枪（用户口径：一根竹竿 + 一把手枪）
    ownedGuns: ['pistol'],
    // 出战武器槽：以前只存在 game 实例里，重开一局就回到 ['rifle']。
    // 玩家升级鱼竿 / 切换鱼竿后常常顺手开新局，一进去发现枪全没了——
    // 就是这个"槽位没落盘"造成的。现在跟着存档一起持久化。
    loadout: ['pistol'],
    ownedRods: ['bamboo'],
    rod: 'bamboo',
    // 拿到过的最高鱼竿档位。换到更高一档 = 进入新钓季，枪械执照作废要重买。
    rodPeak: 0,
    ammoStock: 60,
    // 当前选用的子弹种类（对应 AMMO_TYPES）
    ammoType: 'standard',
    // 体力等级（1-10）：打鸟攒经验升级，等级越高体力上限越高；解锁新鱼竿会重置
    stamLevel: 1,
    stamExp: 0,
    fishBag: [],
    items: [],
    bagCapacity: 20,
    // 杂物侧袋：珍珠/贝壳/海藻等单独一格容量，不再和鱼抢主袋。
    // 以前鱼满 20 条时 itemRoll 直接判「背包满」，珍珠贝壳就再也不掉了。
    itemCapacity: 12,
    bagId: 'cloth',
    ownedBags: ['cloth'],
    // 鱼饵按「品种 → 份数」存在背包里（不再是单独一个数字）。
    // 老存档里的 bait: N 会在 load() 里折算成 N 份蚯蚓。
    baits: { worm: 0, shrimp: 0, lure: 0, secret: 0 },
    // 当前挂在钩上的那一种；null = 空钩（能钓，但钓不到好鱼）
    baitSel: null,
    // 湖里养的鱼（每条 { id, name, points }）。raised 只是它的条数，
    // 单独留一份是为了兼容老存档：老档只记了条数，没记鱼种。
    pondFish: [],
    raised: 0,
    character: 'angler',
    // 图鉴：鱼名 → 累计钓获条数。没出现在这里的鱼种，图鉴里显示「未知」。
    codex: {},
    stats: { games: 0, kills: 0, headshots: 0, catches: 0, totalScore: 0, best: 0 },

    load() {
      try {
        const d = JSON.parse(localStorage.getItem(KEY));
        if (d && typeof d === 'object') {
          if (typeof d.balance === 'number') this.balance = d.balance;
          if (Array.isArray(d.ownedGuns)) this.ownedGuns = d.ownedGuns;
          if (typeof d.rodPeak === 'number') this.rodPeak = Math.max(0, Math.round(d.rodPeak));
          if (Array.isArray(d.loadout) && d.loadout.length) this.loadout = d.loadout.slice(0, 2);
          if (Array.isArray(d.ownedRods)) this.ownedRods = d.ownedRods;
          if (typeof d.rod === 'string') this.rod = d.rod;
          if (typeof d.ammoStock === 'number') this.ammoStock = d.ammoStock;
          if (typeof d.ammoType === 'string' && window.AMMO_TYPES && window.AMMO_TYPES[d.ammoType]) this.ammoType = d.ammoType;
          if (typeof d.stamLevel === 'number') this.stamLevel = Math.max(1, Math.min(10, Math.round(d.stamLevel)));
          if (typeof d.stamExp === 'number') this.stamExp = Math.max(0, d.stamExp);
          if (Array.isArray(d.fishBag)) this.fishBag = d.fishBag;
          if (Array.isArray(d.items)) this.items = d.items;
          if (typeof d.bagCapacity === 'number') this.bagCapacity = d.bagCapacity;
          if (typeof d.itemCapacity === 'number') this.itemCapacity = Math.max(4, Math.min(24, Math.round(d.itemCapacity)));
          if (Array.isArray(d.ownedBags)) this.ownedBags = d.ownedBags;
          if (typeof d.bagId === 'string' && BAGS[d.bagId]) this.bagId = d.bagId;
          // 容量以背包为准，老存档里那个写死的 bagCapacity 可能对不上
          if (BAGS[this.bagId]) this.bagCapacity = BAGS[this.bagId].cap;
          if (d.baits && typeof d.baits === 'object') {
            BAIT_ORDER.forEach((k) => {
              if (typeof d.baits[k] === 'number') this.baits[k] = Math.max(0, Math.floor(d.baits[k]));
            });
          } else if (typeof d.bait === 'number' && d.bait > 0) {
            // 老存档：只有一笼统的「鱼饵份数」，折成最普通的蚯蚓
            this.baits.worm = Math.max(0, Math.floor(d.bait));
          }
          if (typeof d.baitSel === 'string' && BAITS[d.baitSel]) this.baitSel = d.baitSel;
          if (this.baitSel && this.baitCount(this.baitSel) <= 0) this.baitSel = null;
          if (Array.isArray(d.pondFish)) {
            this.pondFish = d.pondFish.filter((f) => f && typeof f.name === 'string')
              .map((f, i) => {
                const e = { id: f.id || 'p' + i, name: f.name, points: Math.max(1, f.points || 20) };
                if (typeof f.tier === 'number') e.tier = Math.max(0, Math.round(f.tier));
                return e;
              });
          }
          if (typeof d.raised === 'number') this.raised = d.raised;
          // 老存档：只记了条数（raised）没有明细，按条数补出明细，鱼种交给 game 兜底
          if (!this.pondFish.length && this.raised > 0) {
            for (let i = 0; i < Math.min(30, this.raised); i++) {
              this.pondFish.push({ id: 'old' + i, name: '', points: 20 });
            }
          }
          this.raised = this.pondFish.length;
          if (d.codex && typeof d.codex === 'object' && !Array.isArray(d.codex)) {
            Object.keys(d.codex).forEach((k) => {
              const n = d.codex[k];
              if (typeof n === 'number' && n > 0) this.codex[k] = n;
            });
          }
          // 老存档没有图鉴：把背包里和湖里已有的鱼当成"见过"，别让老玩家的收藏一片空白
          if (!Object.keys(this.codex).length) {
            this.fishBag.concat(this.pondFish).forEach((f) => {
              if (f && f.name) this.codex[f.name] = (this.codex[f.name] || 0) + 1;
            });
          }
          if (typeof d.character === 'string') this.character = d.character;
          if (d.stats && typeof d.stats === 'object') Object.assign(this.stats, d.stats);
        }
      } catch (e) { /* 忽略损坏的存档 */ }
    },

    // 立即写盘的真正实现（原 save() 主体）
    _write() {
      try {
        localStorage.setItem(KEY, JSON.stringify({
          balance: this.balance,
          ownedGuns: this.ownedGuns,
          loadout: this.loadout,
          ownedRods: this.ownedRods,
          rod: this.rod,
          rodPeak: this.rodPeak,
          ammoStock: this.ammoStock,
          ammoType: this.ammoType,
          stamLevel: this.stamLevel,
          stamExp: this.stamExp,
          fishBag: this.fishBag,
          items: this.items,
          bagCapacity: this.bagCapacity,
          itemCapacity: this.itemCapacity,
          bagId: this.bagId,
          ownedBags: this.ownedBags,
          baits: this.baits,
          baitSel: this.baitSel,
          bait: this.totalBait(),
          pondFish: this.pondFish,
          raised: this.raised,
          character: this.character,
          codex: this.codex,
          stats: this.stats
        }));
      } catch (e) { /* 隐私模式等场景下静默失败 */ }
    },

    // 防抖保存：钓一条鱼会连着触发 addScore/addFish/itemRoll 三四次 save()，
    // localStorage 是同步 IO，整包 JSON 每次都写一遍就是周期性掉帧。
    // 攒 300ms 合并成一次写盘；关页/切后台时立刻冲刷，不怕丢档。
    save() {
      if (this._saveT) return;
      this._saveT = setTimeout(() => {
        this._saveT = 0;
        this._write();
      }, 300);
      if (!this._flushBound) {
        this._flushBound = true;
        const flush = () => {
          if (this._saveT) { clearTimeout(this._saveT); this._saveT = 0; this._write(); }
        };
        window.addEventListener('beforeunload', flush);
        window.addEventListener('pagehide', flush);
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'hidden') flush();
        });
      }
    },

    // 主袋容量：只数鱼。杂物走 hasItemSpace() 的侧袋，互不挤占
    usedSpace() {
      return this.fishBag.length;
    },

    hasSpace() {
      return this.fishBag.length < this.bagCapacity;
    },

    // 杂物侧袋：钓鱼捡到的珍珠/贝壳/海藻等，独立计数
    hasItemSpace() {
      return this.items.length < this.itemCapacity;
    },

    // 渔获入背包；背包满时返回 false（鱼放生）
    addFish(f) {
      if (!this.hasSpace()) return false;
      this.fishBag.push(Object.assign({ t: Date.now() }, f));
      this.save();
      return true;
    },

    // 杂物/材料入背包：海藻、贝壳、漂流瓶、珍珠等
    addItem(it) {
      if (!this.hasItemSpace()) return false;
      this.items.push(Object.assign({ t: Date.now() }, it));
      this.save();
      return true;
    },

    // 取出渔获（放入湖中 / 丢到地上）
    takeFish(index) {
      if (index < 0 || index >= this.fishBag.length) return null;
      const f = this.fishBag.splice(index, 1)[0];
      this.save();
      return f;
    },

    takeItem(index) {
      if (index < 0 || index >= this.items.length) return null;
      const it = this.items.splice(index, 1)[0];
      this.save();
      return it;
    },

    // 从背包取出并放进湖里养
    raiseFish(index) {
      const f = this.takeFish(index);
      if (!f) return null;
      this.raised += 1;
      this.save();
      return f;
    },

    // ---------------- 湖中养鱼（每秒产出积分） ----------------
    // 产出由「品质」决定：普通 0.6/秒 → 优良 1.3 → 精良 2.4 → 稀有 4.2 → 史诗 7.2
    // → 传说 12 → 神话 19 → 远古 29 → 深渊 42 → 神域 58。品质差一档，产出大约翻倍。
    // 同一品质里再按分值给一点加成（最多 +20%，2400 分的封顶），
    // 这样「品质越高每秒越多」是铁律，同品质的两条鱼也还分得出高低。
    pondRateOf(points, tier) {
      const g = Math.max(0, Math.min(POND_GRADE_RATE.length - 1, Math.round(tier || 0)));
      // 同品质内按分值加成，上限 40%：远古（29）封顶 40.6 仍低于深渊（42）的下限，
      // 品质规则不会被「低一档但分值极高」的鱼顶翻；3200/3800 分两条史前巨兽也还能分出高低。
      const bonus = 1 + Math.min(0.40, Math.max(0, points || 20) / 9000);
      return POND_GRADE_RATE[g] * bonus * POND_RATE_MULT * ECON.pondRate;
    },

    // 一条鱼的品质：存了 tier 就用 tier，老存档只有名字时按名字查（fish.js 的 grade 表）
    pondGradeOf(f) {
      if (f && typeof f.tier === 'number' && f.tier >= 0) return f.tier;
      if (f && f.name && window.fishGradeOf) return window.fishGradeOf(f.name) || 0;
      return 0;
    },

    // 直接对存档条目算速率（world 里的鱼实体、HUD、背包都用这一条）
    pondRateFor(f) {
      if (!f) return 0;
      return this.pondRateOf(f.points, this.pondGradeOf(f));
    },

    pondStat() {
      let rate = 0;
      this.pondFish.forEach((f) => { rate += this.pondRateFor(f); });
      return { n: this.pondFish.length, rate };
    },

    // ---------------- 图鉴 ----------------
    // 钓到一条鱼就记一笔；返回 true 表示这是该鱼种第一次进图鉴（用来弹「图鉴新增」）。
    recordCatch(name) {
      if (!name) return false;
      const isNew = !this.codex[name];
      this.codex[name] = (this.codex[name] || 0) + 1;
      this.save();
      return isNew;
    },

    // 图鉴里所有鱼种（淡水在前、海鱼在后，顺序同钓鱼表里的"由近到远"）
    codexSpecies() {
      const t = window.FISH_TABLE || { pond: [], sea: [] };
      // 血夜异种 / 日魇异种也要算进图鉴总数：不然「图鉴解锁 N/45」的提示永远差几条
      return (t.pond || []).concat(t.sea || []).concat(t.blood || []).concat(t.daymare || []);
    },

    codexCount() {
      return this.codexSpecies().filter((f) => this.codex[f.name] > 0).length;
    },

    codexTotal() {
      return this.codexSpecies().length;
    },

    // 养进湖里：登记明细，返回带 id 的条目（world 里的鱼实体用同一个 id）
    addPondFish(name, points, tier) {
      const f = {
        id: 'p' + Date.now().toString(36) + Math.floor(Math.random() * 1e4),
        name,
        points: Math.max(1, points || 20),
        tier: typeof tier === 'number' ? Math.max(0, Math.round(tier)) : (window.fishGradeOf ? window.fishGradeOf(name) || 0 : 0)
      };
      this.pondFish.push(f);
      this.raised = this.pondFish.length;
      this.save();
      return f;
    },

    // 湖里的鱼被打死了：从明细里划掉，产出立刻少一条
    dropPondFish(id) {
      const i = this.pondFish.findIndex((f) => f.id === id);
      if (i < 0) return null;
      const f = this.pondFish.splice(i, 1)[0];
      this.raised = this.pondFish.length;
      this.save();
      return f;
    },

    // 所有鱼饵的总份数（HUD / 背包角标用）
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
      return Math.max(5, Math.round(p * ECON.sellFish));
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

    setCharacter(id) {
      this.character = id;
      this.save();
    },

    // 回合得分入账（钓鱼/打鸟即时积分，统一乘 catchScore 降速）
    addScore(n) {
      this.balance += Math.max(0, Math.floor(n * ECON.catchScore));
      this.save();
    },

    ownsGun(id) {
      const g = window.GUNS && window.GUNS[id];
      return !!g && (g.price === 0 || this.ownedGuns.includes(id));
    },

    ownsRod(id) {
      const r = window.RODS && window.RODS[id];
      return !!r && (r.price === 0 || this.ownedRods.includes(id));
    },

    // 装备按定义顺序（价格由低到高）逐级解锁。
    // 返回 'owned'（已拥有）/ 'available'（紧接的下一级，可购买）/ 'locked'（前一级未解锁，显示未知）
    rodUnlockState(id) {
      const keys = Object.keys(window.RODS || {});
      const i = keys.indexOf(id);
      if (i < 0) return 'locked';
      if (this.ownsRod(id)) return 'owned';
      if (i === 0) return 'available';
      return this.ownsRod(keys[i - 1]) ? 'available' : 'locked';
    },

    gunUnlockState(id) {
      const keys = Object.keys(window.GUNS || {});
      const i = keys.indexOf(id);
      if (i < 0) return 'locked';
      if (this.ownsGun(id)) return 'owned';
      if (i === 0) return 'available';
      return this.ownsGun(keys[i - 1]) ? 'available' : 'locked';
    },

    buyGun(id) {
      const g = window.GUNS && window.GUNS[id];
      if (!g || this.ownedGuns.includes(id) || this.gunUnlockState(id) !== 'available' || this.balance < g.price) return false;
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
      // 换季刷新体力等级：回到 1 级、经验清零、子弹恢复普通弹
      this.stamLevel = 1;
      this.stamExp = 0;
      this.ammoType = 'standard';
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
      if (!r || this.ownedRods.includes(id) || this.rodUnlockState(id) !== 'available' || this.balance < r.price) return false;
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

    equipRod(id) {
      if (!this.ownsRod(id)) return false;
      this.rod = id;
      this.save();
      if (typeof this.onRodChanged === 'function') this.onRodChanged(id);
      return true;
    },


    // ---------------- 背包 ----------------
    bagDef() {
      return BAGS[this.bagId] || BAGS.cloth;
    },

    ownsBag(id) {
      const b = BAGS[id];
      return !!b && (b.price === 0 || this.ownedBags.indexOf(id) >= 0);
    },

    // 买包 = 解锁 + 立刻换上（容量同时生效，不用二次操作）
    buyBag(id) {
      const b = BAGS[id];
      if (!b) return false;
      if (this.ownedBags.indexOf(id) < 0 && b.price > 0) {
        if (this.balance < b.price) return false;
        this.balance -= b.price;
        this.ownedBags.push(id);
      }
      this.bagId = id;
      this.bagCapacity = b.cap;
      this.save();
      return true;
    },

    equipBag(id) {
      const b = BAGS[id];
      if (!b || !this.ownsBag(id)) return false;
      this.bagId = id;
      this.bagCapacity = b.cap;
      this.save();
      return true;
    },

    // ---------------- 宝箱 ----------------
    _rollTier(weights) {
      let total = 0;
      for (const k in weights) total += weights[k];
      let r = Math.random() * total;
      for (const k in weights) {
        r -= weights[k];
        if (r <= 0) return k;
      }
      return 'common';
    },

    _rollLoot(tier) {
      const pool = LOOT.filter((l) => l.tier === tier);
      if (!pool.length) return null;
      let total = 0;
      for (let i = 0; i < pool.length; i++) total += pool[i].w;
      let r = Math.random() * total;
      for (let i = 0; i < pool.length; i++) {
        r -= pool[i].w;
        if (r <= 0) return pool[i];
      }
      return pool[0];
    },

    // 按稀有度抽一条鱼：从所有 grade >= minGrade 的鱼里等概率挑
    _randomFish(minGrade) {
      const T = window.FISH_TYPES;
      if (!T) return null;
      const names = Object.keys(T).filter((n) => (T[n].grade || 0) >= (minGrade || 0));
      if (!names.length) return null;
      const name = names[Math.floor(Math.random() * names.length)];
      const g = T[name].grade || 0;
      // 宝箱开出的鱼按鱼表里的分值走（远古巨兽抽到就是 3200/3800 分），
      // 只有表里查不到的才退回按品质估。
      let pts = 0;
      const tb = window.FISH_TABLE;
      if (tb) {
        const all = (tb.pond || []).concat(tb.sea || []);
        const hit = all.find((f) => f.name === name);
        if (hit) pts = hit.points;
      }
      if (!pts) pts = Math.round((g + 1) * 26 + Math.random() * 46);
      return {
        name,
        points: pts,
        tier: g,
        sea: false,
        dist: 0
      };
    },

    _applyLoot(l) {
      const ti = LOOT_TIERS[l.tier] || LOOT_TIERS.common;
      const out = { tier: l.tier, tierName: ti.name, color: ti.color, name: l.name, kind: l.kind, text: '' };
      if (l.kind === 'points') {
        const n = Math.round((l.min + Math.random() * (l.max - l.min)) * ECON.lootPoints);
        this.balance += n;
        out.text = '+' + n + ' 积分';
      } else if (l.kind === 'bait') {
        const n = Math.round(l.min + Math.random() * (l.max - l.min));
        const bid = BAITS[l.baitId] ? l.baitId : 'worm';
        this.addBait(bid, n);
        out.name = BAITS[bid].name;
        out.text = '+' + n + ' 份' + BAITS[bid].name;
      } else if (l.kind === 'ammo') {
        const n = Math.round(l.min + Math.random() * (l.max - l.min));
        this.ammoStock += n;
        out.text = '+' + n + ' 发子弹';
      } else if (l.kind === 'item') {
        const nm = l.pick[Math.floor(Math.random() * l.pick.length)];
        out.name = nm;
        if (this.hasSpace()) {
          this.items.push({ name: nm, kind: 'material', sea: false, t: Date.now() });
          out.text = '获得「' + nm + '」';
        } else {
          const comp = Math.round(150 * ECON.lootPoints);
          this.balance += comp;
          out.text = '背包已满，「' + nm + '」折算 ' + comp + ' 积分';
        }
      } else if (l.kind === 'fish') {
        const f = this._randomFish(l.grade || 0);
        if (f && this.addFish(f)) {
          this.recordCatch(f.name);
          out.name = f.name;
          out.text = '获得「' + f.name + '」 ' + f.points + ' 分';
        } else {
          const comp = Math.round(240 * ECON.lootPoints);
          this.balance += comp;
          out.text = '背包已满，渔获折算 ' + comp + ' 积分';
        }
      } else if (l.kind === 'rod') {
        const pool = (l.pick || []).filter((id) => window.RODS && window.RODS[id]);
        if (!pool.length) {
          const comp = Math.round(600 * ECON.lootPoints);
          this.balance += comp;
          out.text = '+' + comp + ' 积分';
        } else {
          const id = pool[Math.floor(Math.random() * pool.length)];
          const rod = window.RODS[id];
          out.name = rod.name;
          if (this.ownedRods.indexOf(id) < 0) {
            this.grantRod(id);
            out.text = '解锁鱼竿「' + rod.name + '」（枪械已重置）';
          } else {
            const n = Math.round((rod.price || 900) * 0.5 * ECON.lootPoints);
            this.balance += n;
            out.text = '重复鱼竿「' + rod.name + '」折算 ' + n + ' 积分';
          }
        }
      } else if (l.kind === 'gun') {
        const pool = (l.pick || []).filter((id) => window.GUNS && window.GUNS[id]);
        if (!pool.length) {
          const comp = Math.round(600 * ECON.lootPoints);
          this.balance += comp;
          out.text = '+' + comp + ' 积分';
        } else {
          const id = pool[Math.floor(Math.random() * pool.length)];
          const gun = window.GUNS[id];
          out.name = gun.name;
          if (this.ownedGuns.indexOf(id) < 0) {
            this.ownedGuns.push(id);
            out.text = '解锁枪械「' + gun.name + '」';
          } else {
            const n = Math.round((gun.price || 900) * 0.5 * ECON.lootPoints);
            this.balance += n;
            out.text = '重复枪械「' + gun.name + '」折算 ' + n + ' 积分';
          }
        }
      }
      return out;
    },

    // 开箱：先扣钱，再按权重逐件掉落。返回 { cost, results }
    openChest(id) {
      const c = CHESTS[id];
      if (!c) return null;
      if (this.balance < c.price) return { error: 'poor', need: c.price - this.balance };
      this.balance -= c.price;
      const results = [];
      for (let i = 0; i < c.rolls; i++) {
        const tier = this._rollTier(c.weights);
        const l = this._rollLoot(tier);
        if (l) results.push(this._applyLoot(l));
      }
      this.save();
      return { cost: c.price, results };
    },

    // 记录出战武器槽。升级鱼竿、买饵、换角色都不会调用它，
    // 只有玩家在背包里主动增减枪械时才会改。
    setLoadout(list) {
      const arr = (list || []).filter(Boolean).slice(0, 2);
      if (!arr.length) return;
      this.loadout = arr;
      this.save();
    },

    // 购买弹药包
    buyAmmo(amount, cost) {
      if (this.balance < cost) return false;
      this.balance -= cost;
      this.ammoStock += amount;
      this.save();
      return true;
    },

    // 购买某类型子弹：扣款、加 40 发、并切换当前子弹类型
    buyAmmoType(typeId) {
      const t = window.AMMO_TYPES && window.AMMO_TYPES[typeId];
      if (!t || this.balance < t.price) return false;
      this.balance -= t.price;
      this.ammoStock += 40;
      this.ammoType = t.id;
      this.save();
      return true;
    },

    setAmmoStock(n) {
      this.ammoStock = Math.max(0, Math.floor(n));
      this.save();
    },

    // 回合结束记录战绩
    recordRound(r) {
      this.stats.games += 1;
      this.stats.kills += r.kills || 0;
      this.stats.headshots += r.headshots || 0;
      this.stats.catches += r.catches || 0;
      this.stats.totalScore += r.score || 0;
      if ((r.score || 0) > this.stats.best) this.stats.best = r.score;
      this.save();
    }
  };

  Economy.load();
  window.Economy = Economy;
})();
