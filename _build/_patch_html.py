# -*- coding: utf-8 -*-
"""首页/HUD 文案：删 1v1、删对手、改成钓鱼口径。"""
import io, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
P = os.path.join(ROOT, 'index.html')
s = io.open(P, encoding='utf-8').read()

R = [
("<title>鱼猎对决 · 1v1 海岛枪战</title>",
 "<title>鱼猎对决 · 海岛垂钓</title>"),

('    <div class="eyebrow">1V1 ISLAND DUEL</div>',
 '    <div class="eyebrow">ISLAND FISHING</div>'),

("""    <p class="tagline">无限时积分赛 —— 默认和平钓鱼，按 F 申请对战；击倒 +100 分，钓鱼按鱼种得分。</p>""",
 """    <p class="tagline">无限时垂钓 —— 长按左键蓄力抛竿，按鱼种结算积分；手枪随手带着，打飞鸟、打水里的鱼都算副业。</p>"""),

("""        <span class="m-title">单人游戏</span>
        <span class="m-sub">人机 · 钓鱼积分 + 申请对战</span>""",
 """        <span class="m-title">单人垂钓</span>
        <span class="m-sub">钓鱼 · 打鸟 · 打鱼</span>"""),

("""        <span class="m-title">多人对战</span>
        <span class="m-sub">在线 1v1，开发中</span>""",
 """        <span class="m-title">联机垂钓</span>
        <span class="m-sub">在线同钓，开发中</span>"""),

("""    <p id="mpTip" class="hidden">多人对战正在开发中，先和 AI 过两招吧。</p>""",
 """    <p id="mpTip" class="hidden">联机垂钓还在做，先自己甩一竿吧。</p>"""),

("""    <p class="foot">得分实时 1:1 存入积分，可解锁新枪与新鱼竿。Esc 暂停可结束回合。钓鱼时对手无法伤害你。海岛外围水域已开放：下水自动游泳，海里也能钓鱼（海鱼分数更高）。<br>背包里可以把渔获「放入湖中」养起来，湖里的鱼每秒产出积分：<b>鱼的品质越高，每秒给的分越多</b>（普通 0.6 → 神域 58）；湖不会自己刷鱼，<b>用枪打死的鱼就没了</b>。</p>""",
 """    <p class="foot">钓到的鱼按鱼种结算积分，实时入账，可解锁新鱼竿与枪械。Esc 暂停可结束这一局。海岛外围水域已开放：下水自动游泳，海里也能钓鱼（海鱼分数更高）。<br>背包里可以把渔获「放入湖中」养起来，湖里的鱼每秒产出积分：<b>鱼的品质越高，每秒给的分越多</b>（普通 0.6 → 神域 58）；湖不会自己刷鱼，<b>用枪打死的鱼就没了</b>。<br>注意：<b>每换高一档鱼竿就是一个新钓季，已解锁的枪要重新买</b>（随身手枪除外）。</p>"""),

("""  <div id="killBanner">击倒对手</div>
  <div id="enemyTag" class="hidden"><div class="diamond"></div><div class="dist">40m</div></div>
""",
 """  <div id="killBanner">命中！</div>
"""),

("""      <span id="gunName">突击步枪</span>
      <span id="modeTag">和平钓鱼</span>""",
 """      <span id="gunName">制式手枪</span>
      <span id="modeTag">竹鱼竿 · 第 1 季</span>"""),

("""      <span class="hp-icon">❤</span>""",
 """      <span class="hp-icon">体</span>"""),
]

for a, b in R:
    assert s.count(a) == 1, ('MISS', a[:50], s.count(a))
    s = s.replace(a, b)

io.open(P, 'w', encoding='utf-8', newline='\n').write(s)
print('OK index.html')
