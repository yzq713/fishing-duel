import io
p = 'index.html'
s = io.open(p, encoding='utf-8').read()

def rep(a, b, cnt=1):
    global s
    assert s.count(a) == cnt, (a[:60], s.count(a))
    s = s.replace(a, b)

# ---------- 1) 鱼市浮层替换 ----------
old = """<div id="baitOverlay" class="overlay hidden">
  <div class="panel">
    <div class="eyebrow">BAIT SHOP</div>
    <h2>鱼饵商店</h2>
    <p class="tagline">积分余额 <span class="bal" id="balanceNumBait">0</span> · 现有鱼饵 <span class="bal" id="baitNum">0</span> 份</p>
    <p class="tagline">鱼饵会在下一次抛竿时消耗，提升稀有鱼出现距离（可多钓 3m 以外的鱼）</p>
    <div class="bait-row" id="baitRow"></div>
    <p id="baitMsg"></p>
    <button class="ghost-btn" id="baitBackBtn">返回战斗</button>
  </div>
</div>"""
new = """<div id="baitOverlay" class="overlay hidden">
  <div class="panel market">
    <div class="eyebrow">FISH MARKET</div>
    <h2>鱼市</h2>
    <p class="tagline">积分余额 <span class="bal" id="balanceNumBait">0</span> · 背包鱼饵 <span class="bal" id="baitNum">0</span> 份 · 钩上 <span class="bal" id="baitHooked">空钩</span></p>
    <div class="mkt-cols">
      <div class="mkt-col">
        <div class="mkt-hd">买鱼饵 <em>一整包 10 份 · 饵越好，好鱼越容易咬</em></div>
        <div class="bait-row" id="baitRow"></div>
        <p class="mkt-note">鱼饵买下后放进背包（按 B 打开背包），点「装钩」才会用。空钩也能钓，只是钓不到好鱼。</p>
      </div>
      <div class="mkt-col">
        <div class="mkt-hd">卖鱼 <em id="sellFishSum">背包空着</em></div>
        <div class="mkt-list" id="sellFishList"></div>
        <button class="mkt-all" id="sellAllFish">全部卖出</button>
      </div>
    </div>
    <p id="baitMsg"></p>
    <button class="ghost-btn" id="baitBackBtn">返回战斗</button>
  </div>
</div>

<div id="pondOverlay" class="overlay hidden">
  <div class="panel market pond-panel">
    <div class="eyebrow">POND VIEW</div>
    <h2>观鱼台</h2>
    <p class="tagline">湖里 <span class="bal" id="pondCount">0</span> 条鱼 · 每秒产出 <span class="bal" id="pondRate">0</span> 积分</p>
    <div class="pond-grid" id="pondBody"></div>
    <p class="tagline" id="pondTip"></p>
    <button class="ghost-btn" id="pondBackBtn">返回战斗</button>
  </div>
</div>"""
rep(old, new)

# ---------- 2) 背包：左栏加鱼饵 ----------
old = """      <div class="inv-col">
        <div class="inv-hd">渔获 <em id="bpFishCount">0</em></div>
        <div class="inv-list" id="bpFish"></div>
      </div>"""
new = """      <div class="inv-col">
        <div class="inv-hd">渔获 <em id="bpFishCount">0</em></div>
        <div class="inv-list" id="bpFish"></div>
        <div class="inv-hd" style="margin-top:8px">鱼饵 <em>每竿 1 份</em></div>
        <div class="bait-list" id="bpBaits"></div>
      </div>"""
rep(old, new)

# ---------- 3) CSS：鱼市 / 鱼饵 / 观鱼台 ----------
anchor = """  #baitMsg { min-height: 18px; font-size: 12px; }
  #baitMsg.ok { color: #7fe3c4; }
  #baitMsg.bad { color: #ff7a6a; }
"""
assert s.count(anchor) == 1
css = """  #baitMsg { min-height: 18px; font-size: 12px; }
  #baitMsg.ok { color: #7fe3c4; }
  #baitMsg.bad { color: #ff7a6a; }

  /* ---------- 鱼市（买饵 · 卖鱼）---------- */
  .panel.market { width: min(900px, 95vw); padding: 30px 34px 24px; text-align: left; }
  .panel.market h2 { margin: 0 0 6px; }
  .mkt-cols { display: grid; grid-template-columns: 1.02fr .98fr; gap: 18px; margin-top: 14px; }
  .mkt-col { display: flex; flex-direction: column; min-height: 0; }
  .mkt-hd {
    display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap;
    font-size: 12px; letter-spacing: 2.4px; text-transform: uppercase;
    color: var(--ink-soft, #8fa9b4); padding-bottom: 6px; margin-bottom: 9px;
    border-bottom: 1px solid rgba(44, 42, 38, .26);
  }
  .mkt-hd em { font-style: normal; font-size: 11px; letter-spacing: .4px; color: #9a6020; }
  .mkt-note { font-size: 11px; line-height: 1.6; color: var(--ink-soft, #8fa9b4); margin: 8px 0 0; }
  .mkt-cols .bait-row { grid-template-columns: repeat(2, 1fr); margin: 0; }
  .mkt-cols .bait-card { padding: 10px 11px; text-align: left; }
  .bait-card .b-tier {
    font-style: normal; font-size: 10px; letter-spacing: .5px; color: #9a6020;
    margin-left: 6px; padding: 1px 5px; border-radius: 8px; background: rgba(154, 96, 32, .12);
  }
  .bait-card .b-stat { font-size: 10.5px; color: #3f7d63; margin-top: 3px; }
  .bait-card .b-own { font-size: 10.5px; color: var(--ink-soft, #8fa9b4); margin-top: 2px; }
  .bait-card.hooked { box-shadow: inset 0 0 0 1px rgba(154, 96, 32, .55); }

  .mkt-list { flex: 1; min-height: 190px; max-height: 300px; overflow-y: auto; display: flex; flex-direction: column; gap: 5px; }
  .mkt-list::-webkit-scrollbar { width: 6px; }
  .mkt-list::-webkit-scrollbar-thumb { background: rgba(90, 80, 60, .3); border-radius: 3px; }
  .mkt-row {
    display: flex; align-items: center; gap: 10px; padding: 7px 10px; border-radius: 7px;
    background: rgba(255, 253, 246, .72); border: 1px solid rgba(44, 42, 38, .26);
  }
  .mkt-row .m-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
  .mkt-row .m-name { font-size: 13px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .mkt-row .m-meta { font-size: 10.5px; color: var(--ink-soft, #8fa9b4); }
  .mkt-row .m-price { font-size: 12px; font-weight: 700; color: #9a6020; font-variant-numeric: tabular-nums; }
  .mkt-row .mkt-sell {
    padding: 4px 10px; font-size: 11px; font-weight: 700; cursor: pointer; border-radius: 6px;
    color: #fbf6e8; background: linear-gradient(180deg, #63a98a, #3f7d63); border: 1px solid rgba(44, 42, 38, .3);
  }
  .mkt-row .mkt-sell:hover { filter: brightness(1.1); }
  .mkt-all {
    margin-top: 9px; padding: 8px 0; width: 100%; cursor: pointer; font-weight: 700; letter-spacing: 1px;
    font-size: 12px; border-radius: 8px; color: #fbf6e8;
    background: linear-gradient(180deg, #b37f4d, #9a6a3c); border: 1px solid rgba(44, 42, 38, .3);
  }
  .mkt-all:hover { filter: brightness(1.08); }
  .mkt-all:disabled { opacity: .45; cursor: not-allowed; filter: none; }
  .mkt-list .bag-empty { color: var(--ink-soft, #8fa9b4); }

  /* ---------- 观鱼台 ---------- */
  .pond-panel { width: min(760px, 94vw); }
  .pond-grid {
    display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 8px;
    margin: 14px 0 10px; max-height: 360px; overflow-y: auto;
  }
  .pond-card {
    padding: 10px 12px; border-radius: 8px; text-align: left;
    background: rgba(255, 253, 246, .74); border: 1px solid rgba(44, 42, 38, .26);
    border-left: 3px solid rgba(63, 125, 99, .55);
  }
  .pond-card .pond-name { font-size: 14px; font-weight: 700; }
  .pond-card .pond-name em { font-style: normal; font-size: 11px; color: #9a6020; margin-left: 5px; }
  .pond-card .pond-grade { font-size: 10.5px; color: var(--ink-soft, #8fa9b4); margin-top: 2px; }
  .pond-card .pond-rate { font-size: 12px; font-weight: 700; color: #3f7d63; margin-top: 3px; }
  .pond-grid .bag-empty { grid-column: 1 / -1; }
"""
s = s.replace(anchor, css)

# ---------- 4) 背包：鱼饵行 + 卖出按钮样式（暗色背包里） ----------
anchor = """  .bag-empty { padding: 18px 10px; font-size: 11px; line-height: 1.7; color: #63757f; text-align: center; }
"""
assert s.count(anchor) == 1
css2 = anchor + """
  /* 鱼饵：装钩 / 卸下 */
  .bait-list { flex: 0 0 auto; display: flex; flex-direction: column; gap: 3px; }
  .bait-head {
    display: flex; align-items: center; justify-content: space-between; gap: 6px;
    padding: 5px 7px; margin-bottom: 3px; font-size: 10.5px; color: #8296a1;
    background: rgba(201, 162, 74, .08); border: 1px solid rgba(201, 162, 74, .24); border-radius: 2px;
  }
  .bait-head b { color: #e8c07a; }
  .bait-head .bait-off {
    flex: 0 0 auto; font-size: 10px; padding: 2px 7px; cursor: pointer; color: #d8c3a0;
    background: rgba(255, 255, 255, .06); border: 1px solid rgba(255, 255, 255, .16); border-radius: 2px;
  }
  .bait-chip {
    display: flex; align-items: center; gap: 7px; padding: 5px 7px;
    background: rgba(255, 255, 255, .045); border: 1px solid rgba(255, 255, 255, .05);
    border-left: 2px solid rgba(255, 255, 255, .14); border-radius: 2px;
  }
  .bait-chip.on { border-left-color: #e8c07a; background: rgba(201, 162, 74, .12); }
  .bait-chip.empty { opacity: .45; }
  .bait-chip .b-dot { width: 9px; height: 9px; border-radius: 50%; flex: 0 0 9px; box-shadow: 0 0 6px rgba(0, 0, 0, .5); }
  .bait-chip .b-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
  .bait-chip .b-name { font-size: 12px; font-weight: 600; color: #e6edf1; }
  .bait-chip .b-name em { font-style: normal; font-size: 10px; color: #e8c07a; margin-left: 4px; }
  .bait-chip .b-meta { font-size: 10px; color: #8296a1; }
  .bait-chip .bait-use {
    flex: 0 0 auto; font-size: 10px; padding: 3px 8px; cursor: pointer; font-weight: 700;
    color: #0d1114; background: linear-gradient(180deg, #e8c07a, #c9a24a); border: none; border-radius: 2px;
  }
  .bait-chip .bait-use:disabled { background: rgba(255, 255, 255, .09); color: #5e6b73; cursor: not-allowed; }
  .bait-chip .b-on { font-size: 10px; color: #74dcb8; letter-spacing: .5px; }
  .fish-chip .fc-sell {
    flex: 0 0 auto; font-size: 10px; padding: 3px 6px; cursor: pointer;
    background: rgba(201, 162, 74, .16); color: #f0d9a8;
    border: 1px solid rgba(201, 162, 74, .4); border-radius: 2px;
  }
  .fish-chip .fc-sell:hover { background: rgba(201, 162, 74, .34); color: #fff6e2; }
"""
s = s.replace(anchor, css2)

io.open(p, 'w', encoding='utf-8', newline='\n').write(s)
print('html patched')
