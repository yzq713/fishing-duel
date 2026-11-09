import io
p = 'js/game.js'
s = io.open(p, encoding='utf-8').read()

def rep(a, b, cnt=1):
    global s
    assert s.count(a) == cnt, (a[:60], s.count(a))
    s = s.replace(a, b)

# ---------- 1) 抛竿消耗钩上的饵 ----------
rep("        useBait: () => (window.Economy ? window.Economy.useBait() : false),",
    "        // 抛竿时消耗钩上那份饵，并把这一档的参数（品质上限 / 好鱼权重）交给钓鱼系统\n"
    "        useBait: () => (window.Economy ? window.Economy.consumeBait() : null),")

# ---------- 2) 鱼市：买饵 + 卖鱼 ----------
rep("""      // 鱼饵商店：购买鱼饵包
      document.getElementById('baitRow').addEventListener('click', (e) => {
        const card = e.target.closest('.bait-card');
        if (!card) return;
        const n = parseInt(card.dataset.n, 10);
        const cost = parseInt(card.dataset.cost, 10);
        if (window.Economy.buyBait(n, cost)) {
          this.baitMsg('已购入 +' + n + ' 份鱼饵', true);
        } else {
          this.baitMsg('积分不足，还差 ' + (cost - window.Economy.balance), false);
        }
        this.renderBait();
      });""",
    """      // 鱼市 · 买鱼饵：一次一整包（10 份），买完进背包，要自己装钩
      document.getElementById('baitRow').addEventListener('click', (e) => {
        const card = e.target.closest('.bait-card');
        if (!card) return;
        const id = card.dataset.bait;
        const n = parseInt(card.dataset.n, 10) || 10;
        const cost = parseInt(card.dataset.cost, 10);
        const b = window.BAITS[id];
        if (!b) return;
        if (window.Economy.buyBait(id, n)) {
          this.baitMsg('买下 ' + n + ' 份' + b.name + '，已放进背包（按 B 打开，点「装钩」）', true);
          Sound.play('catch');
        } else {
          this.baitMsg('积分不足，还差 ' + (cost - window.Economy.balance), false);
        }
        this.renderMarket();
      });
      // 鱼市 · 卖鱼：单条收购
      document.getElementById('sellFishList').addEventListener('click', (e) => {
        const btn = e.target.closest('.mkt-sell');
        if (!btn) return;
        const r = window.Economy.sellFish(parseInt(btn.dataset.fish, 10));
        if (!r) return;
        this.baitMsg('卖出「' + r.fish.name + '」· +' + r.price + ' 积分', true);
        Sound.play('catch');
        this.renderMarket();
      });
      // 鱼市 · 卖鱼：一键清空
      document.getElementById('sellAllFish').addEventListener('click', () => {
        const r = window.Economy.sellAllFish();
        if (!r.n) { this.baitMsg('背包里没有可卖的鱼', false); return; }
        this.baitMsg('卖出 ' + r.n + ' 条鱼 · +' + r.price + ' 积分', true);
        Sound.play('catch');
        this.renderMarket();
      });""")

# ---------- 3) 背包：道具卖出 ----------
rep("""      document.getElementById('bpItems').addEventListener('click', (e) => {
        const btn = e.target.closest('.fc-drop');
        if (!btn) return;""",
    """      document.getElementById('bpItems').addEventListener('click', (e) => {
        // 珍珠 / 贝壳这类杂物可以直接在背包里卖给鱼市
        const sellBtn = e.target.closest('.fc-sell');
        if (sellBtn) {
          const r = window.Economy.sellItem(parseInt(sellBtn.dataset.item, 10));
          if (!r) return;
          this.notice('卖出「' + r.item.name + '」· +' + r.price + ' 积分（鱼市收购）', 'good');
          Sound.play('catch');
          this.renderBackpack();
          return;
        }
        const btn = e.target.closest('.fc-drop');
        if (!btn) return;""")

# ---------- 4) 背包：鱼饵装钩 / 卸下 ----------
rep("""      document.getElementById('mpBtn').addEventListener('click', () => {""",
    """      // 背包 · 鱼饵：点「装钩」把这一种挂上，点「卸下」回到空钩
      document.getElementById('bpBaits').addEventListener('click', (e) => {
        const eco = window.Economy;
        const on = e.target.closest('.bait-use');
        if (on) {
          const id = on.dataset.bait;
          if (!eco.loadBait(id)) {
            this.notice('这份鱼饵已经用光了', 'warn');
          } else {
            this.notice('钩上挂了' + window.BAITS[id].name + '（' + eco.baitCount(id) + ' 份）· 下一竿开始生效', 'good');
            Sound.play('swap');
          }
          this.renderBackpack();
          return;
        }
        const off = e.target.closest('.bait-off');
        if (off) {
          eco.unloadBait();
          this.notice('收起了鱼饵，现在是空钩 —— 还能钓，但钓不到好鱼', 'warn');
          this.renderBackpack();
        }
      });
      document.getElementById('mpBtn').addEventListener('click', () => {""")

# ---------- 5) renderBait → renderMarket ----------
old_start = "    // 鱼饵商店：三档鱼饵包\n    renderBait() {"
i = s.index(old_start)
j = s.index("    baitMsg(text, ok) {", i)
new_fn = """    // ---------------- 鱼市 ----------------
    // 左半边买鱼饵（四档，整包 10 份），右半边按收购价卖背包里的鱼。
    renderMarket() {
      const Eco = window.Economy;
      const balEl = document.getElementById('balanceNumBait');
      const numEl = document.getElementById('baitNum');
      const hookEl = document.getElementById('baitHooked');
      if (balEl) balEl.textContent = Eco.balance;
      if (numEl) numEl.textContent = Eco.totalBait ? Eco.totalBait() : 0;
      if (hookEl) {
        const b = Eco.baitSel ? window.BAITS[Eco.baitSel] : null;
        hookEl.textContent = b ? (b.name + ' ×' + Eco.baitCount(Eco.baitSel)) : '空钩';
      }

      const row = document.getElementById('baitRow');
      if (row) {
        row.innerHTML = (window.BAIT_ORDER || []).map((id) => {
          const b = window.BAITS[id];
          const owned = Eco.baitCount(id);
          const n = b.pack || 10;
          const cost = b.price * n;
          return '<div class="bait-card' + (Eco.baitSel === id ? ' hooked' : '') + '" data-bait="' + id +
            '" data-n="' + n + '" data-cost="' + cost + '">' +
            '<div class="b-name">' + b.name + '<i class="b-tier">' + b.tier + ' 档</i></div>' +
            '<div class="b-cost">' + cost + ' 积分 / ' + n + ' 份</div>' +
            '<div class="b-desc">' + b.desc + '</div>' +
            '<div class="b-stat">上限 ' + (window.FISH_GRADES && window.FISH_GRADES[b.cap] ? window.FISH_GRADES[b.cap].name : '—') +
            ' · 好鱼 ×' + b.luck.toFixed(1) + '</div>' +
            '<div class="b-own">背包 ' + owned + ' 份' + (Eco.baitSel === id ? ' · 已装钩' : '') + '</div>' +
            '</div>';
        }).join('');
      }

      const list = document.getElementById('sellFishList');
      const sumEl = document.getElementById('sellFishSum');
      const bag = Eco.fishBag || [];
      if (sumEl) {
        let total = 0;
        bag.forEach((f) => { total += Eco.fishPrice(f); });
        sumEl.textContent = bag.length ? ('背包 ' + bag.length + ' 条 · 全卖 +' + total) : '背包空着';
      }
      if (list) {
        list.innerHTML = bag.length ? bag.map((f, i) => {
          const gi = window.FISH_GRADES ? window.FISH_GRADES[f.tier] : null;
          const col = gi ? '#' + gi.color.toString(16).padStart(6, '0') : '#7a7268';
          const price = Eco.fishPrice(f);
          return '<div class="mkt-row">' +
            '<div class="m-body">' +
            '<span class="m-name" style="color:' + col + '">' + f.name + '</span>' +
            '<span class="m-meta">' + (gi ? gi.name : '普通') + ' · ' + f.points + ' 分 · ' + (f.dist || 0) + 'm</span>' +
            '</div>' +
            '<span class="m-price">+' + price + '</span>' +
            '<button class="mkt-sell" data-fish="' + i + '">卖出</button>' +
            '</div>';
        }).join('') : '<div class="bag-empty">背包里还没有鱼。钓到的鱼可以先放湖里养，也可以拿到鱼市换积分。</div>';
      }
      const allBtn = document.getElementById('sellAllFish');
      if (allBtn) allBtn.disabled = !bag.length;
    }

    // 老名字保留：商店/浮层里还有地方按 renderBait 调用
    renderBait() { this.renderMarket(); }

"""
s = s[:i] + new_fn + s[j:]

# ---------- 6) 背包：鱼饵计数 / 鱼饵列表 / 道具卖出按钮 ----------
rep("        const baitN = eco ? eco.bait : 0;",
    "        const baitN = eco && eco.totalBait ? eco.totalBait() : 0;")

rep("""          '<span class="kind-chip">鱼饵 <b>' + baitN + '</b></span>' +""",
    """          '<span class="kind-chip">鱼饵 <b>' + baitN + '</b>' +
            (eco && eco.baitSel && window.BAITS[eco.baitSel] ? '（已挂 ' + window.BAITS[eco.baitSel].name + '）' : '（空钩）') +
            '</span>' +""")

rep("""      // 道具 / 材料背包
      const itemsEl = document.getElementById('bpItems');""",
    """      // 鱼饵：四档都列出来，有货的显示份数 + 装钩，没货的置灰
      const baitEl = document.getElementById('bpBaits');
      if (baitEl) {
        const hooked = eco ? eco.baitSel : null;
        const hookedN = eco && hooked ? eco.baitCount(hooked) : 0;
        baitEl.innerHTML =
          (hooked && window.BAITS[hooked]
            ? '<div class="bait-head"><span>钩上：<b>' + window.BAITS[hooked].name + ' ×' + hookedN +
              '</b> · 每竿消耗一份</span><button class="bait-off">卸下</button></div>'
            : '<div class="bait-head"><span>钩上：<b>空钩</b> · 能钓，但钓不到好鱼</span></div>') +
          (window.BAIT_ORDER || []).map((id) => {
            const b = window.BAITS[id];
            const n = eco ? eco.baitCount(id) : 0;
            const capName = window.FISH_GRADES && window.FISH_GRADES[b.cap] ? window.FISH_GRADES[b.cap].name : '—';
            return '<div class="bait-chip' + (n ? '' : ' empty') + (hooked === id ? ' on' : '') + '">' +
              '<i class="b-dot" style="background:' + b.color + '"></i>' +
              '<div class="b-body">' +
              '<span class="b-name">' + b.name + ' <em>×' + n + '</em></span>' +
              '<span class="b-meta">上限 ' + capName + ' · 好鱼 ×' + b.luck.toFixed(1) + '</span>' +
              '</div>' +
              (hooked === id
                ? '<span class="b-on">已装钩</span>'
                : '<button class="bait-use" data-bait="' + id + '"' + (n ? '' : ' disabled') + '>装钩</button>') +
              '</div>';
          }).join('');
      }

      // 道具 / 材料背包
      const itemsEl = document.getElementById('bpItems');""")

rep("""            '<span class="fc-meta">' + (it.kind || '杂物') + (it.sea ? ' · 海边拾获' : '') + '</span>' +
            '</div>' +
            '<button class="fc-drop" data-item="' + i + '">丢出</button>' +""",
    """            '<span class="fc-meta">' + (it.kind || '杂物') + (it.sea ? ' · 海边拾获' : '') +
            ' · 收购价 ' + eco.itemPrice(it.name) + '</span>' +
            '</div>' +
            '<button class="fc-sell" data-item="' + i + '">卖 ' + eco.itemPrice(it.name) + '</button>' +
            '<button class="fc-drop" data-item="' + i + '">丢出</button>' +""")

rep("""          : '<div class="bag-empty">钓鱼时会捡到海藻、贝壳、旧瓶子等杂物，容量满了就丢一些吧</div>';""",
    """          : '<div class="bag-empty">钓鱼时会捡到海藻、贝壳、旧瓶子、珍珠等杂物，可以在这里直接卖给鱼市</div>';""")

# ---------- 7) HUD：手上拿竿时显示钩上的饵 ----------
rep("""      this.ui.gunName.textContent = p.gun.name;
      // 手上是鱼竿/拳头时，「弹夹」这个标签就不对了
      if (this.ui.ammoLabel) this.ui.ammoLabel.textContent = p.isRod() ? '鱼竿' : (p.isMelee() ? '空手' : '弹夹');
      this.ui.ammoNum.textContent = p.isRod() ? '蓄力抛竿' : (p.isMelee() ? '近战' : p.ammo + ' / ' + p.reserve);""",
    """      this.ui.gunName.textContent = p.gun.name;
      // 手上是鱼竿/拳头时，「弹夹」这个标签就不对了；拿竿时这一格改成「钩上挂的饵」
      const ecoHud = window.Economy;
      const baitId = ecoHud ? ecoHud.baitSel : null;
      const baitDef = baitId && window.BAITS ? window.BAITS[baitId] : null;
      if (this.ui.ammoLabel) {
        this.ui.ammoLabel.textContent = p.isRod() ? '鱼饵' : (p.isMelee() ? '空手' : '弹夹');
      }
      this.ui.ammoNum.textContent = p.isRod()
        ? (baitDef ? (baitDef.name + ' ×' + ecoHud.baitCount(baitId)) : '空钩')
        : (p.isMelee() ? '近战' : p.ammo + ' / ' + p.reserve);""")

# ---------- 8) 交互：鱼市 + 观鱼台 ----------
rep("""        { kind: 'bait', s: this.world.baitShop, r: 4.6, hint: '按 F 进入鱼饵商店' },""",
    """        { kind: 'bait', s: this.world.baitShop, r: 4.6, hint: '按 F 进鱼市（买饵 · 卖鱼）' },
        { kind: 'pond', s: this.world.pondDeck, r: 3.6, hint: '按 F 上观鱼台，看看湖里养了什么' },""")

rep("""        // 鱼饵商店（靠近时按 T）
        if (e.code === 'KeyT' && this.world.baitShop) {""",
    """        // 鱼市（靠近时按 T）
        if (e.code === 'KeyT' && this.world.baitShop) {""")

# ---------- 9) 浮层：鱼市 + 观鱼台 ----------
rep("""        } else if (kind === 'bait') {
          document.getElementById('baitBackBtn').textContent = '返回战斗';
          this.renderBait();
          this.ui.baitOverlay.classList.remove('hidden');
        } else if (kind === 'rod' || kind === 'chest' || kind === 'bag') {""",
    """        } else if (kind === 'bait') {
          document.getElementById('baitBackBtn').textContent = '返回战斗';
          this.renderMarket();
          this.ui.baitOverlay.classList.remove('hidden');
        } else if (kind === 'pond') {
          document.getElementById('pondBackBtn').textContent = '返回战斗';
          this.renderPond();
          this.ui.pondOverlay.classList.remove('hidden');
        } else if (kind === 'rod' || kind === 'chest' || kind === 'bag') {""")

rep("""      this.ui.baitOverlay.classList.add('hidden');
      this.ui.tradeOverlay.classList.add('hidden');""",
    """      this.ui.baitOverlay.classList.add('hidden');
      if (this.ui.pondOverlay) this.ui.pondOverlay.classList.add('hidden');
      this.ui.tradeOverlay.classList.add('hidden');""")

rep("""        baitOverlay: document.getElementById('baitOverlay'),""",
    """        baitOverlay: document.getElementById('baitOverlay'),
        pondOverlay: document.getElementById('pondOverlay'),""")

# 观鱼台返回按钮
rep("""      document.getElementById('baitBackBtn').addEventListener('click', () => {
        if (this.overlaySource === 'game') this.closeInGameOverlay();
      });""",
    """      document.getElementById('baitBackBtn').addEventListener('click', () => {
        if (this.overlaySource === 'game') this.closeInGameOverlay();
      });
      const pondBack = document.getElementById('pondBackBtn');
      if (pondBack) pondBack.addEventListener('click', () => {
        if (this.overlaySource === 'game') this.closeInGameOverlay();
      });""")

io.open(p, 'w', encoding='utf-8', newline='\n').write(s)
print('game patched')
