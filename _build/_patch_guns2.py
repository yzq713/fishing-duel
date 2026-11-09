# -*- coding: utf-8 -*-
"""再砍两把：加特林/鱼叉电磁炮的程序化模型只是几个大方块，一并去掉。
枪械最终只剩 4 把（手枪 / 霰弹 / 步枪 / 狙击），每把都有真实模型、互不重复。"""
import io, os, re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def drop_method(src, name):
    m = re.search(r'\n(\s+)' + name + r'\(\) \{', src)
    assert m, name
    i = m.start() + 1
    j = src.index('{', m.end() - 1)
    depth = 0
    k = j
    while k < len(src):
        if src[k] == '{':
            depth += 1
        elif src[k] == '}':
            depth -= 1
            if depth == 0:
                k += 1
                break
        k += 1
    while k < len(src) and src[k] in '\r\n':
        k += 1
    return src[:i] + src[k:]

# ---------------- player.js ----------------
P = os.path.join(ROOT, 'js', 'player.js')
s = io.open(P, encoding='utf-8').read()

# 1) 删掉加特林与电磁炮
m = re.search(r'\n    minigun: \{.*?\n    \},\n    railgun: \{.*?\n    \}\n', s, re.S)
assert m, 'gun entries'
s = s[:m.start()] + '\n' + s[m.end():]

# 2) glb 映射：手枪也交回程序化模型（那把 glb 手枪的握把位置和手对不上，
#    手枪只有 0.34m 长，1.36 倍的手掌直接盖住了半把枪）
m = re.search(r'    pistol:   \{ src: \'pistol\'.*?\n', s)
assert m
s = s[:m.start()] + s[m.end():]

# 3) builders / muzzles
s = s.replace("""        sniper: () => this.modelSniper(),
        minigun: () => this.modelMinigun(),
        railgun: () => this.modelRailgun()""",
              """        sniper: () => this.modelSniper()""")
s = s.replace("""        sniper: new THREE.Vector3(0, 0.04, -1.0),
        minigun: new THREE.Vector3(0, 0.03, -0.86),
        railgun: new THREE.Vector3(0, 0.03, -1.02)""",
              """        sniper: new THREE.Vector3(0, 0.04, -1.0)""")

# 4) 后坐力表
s = s.replace("""        rifle: 0.85, sniper: 1.75, minigun: 0.42, railgun: 1.6""",
              """        rifle: 0.85, sniper: 1.75""")

s = drop_method(s, 'modelMinigun')
s = drop_method(s, 'modelRailgun')

# 5) 转管枪管动画（加特林专用）不再需要
m = re.search(r'\n[^\n]*minigunHub[^\n]*\n', s)
if m:
    s = s[:m.start()] + '\n' + s[m.end():]

io.open(P, 'w', encoding='utf-8').write(s)
print('player.js ok')

# ---------------- game.js ----------------
P = os.path.join(ROOT, 'js', 'game.js')
s = io.open(P, encoding='utf-8').read()
reps = [
("""      const POWER = { sniper: 1.7, railgun: 2.0, shotgun: 1.5, rifle: 1.1, minigun: 0.8, pistol: 0.8 };""",
 """      const POWER = { sniper: 1.7, shotgun: 1.5, rifle: 1.1, pistol: 0.8 };"""),
("""        window.FX.shell(eject, right, up, fwd, { big: bigShell, steel: gunId === 'minigun' });""",
 """        window.FX.shell(eject, right, up, fwd, { big: bigShell });"""),
("""        shotgun: '#ffd166', minigun: '#ff9a6a', railgun: '#8affff', fist: '#d9a679',""",
 """        shotgun: '#ffd166', fist: '#d9a679',"""),
]
for a, b in reps:
    assert s.count(a) == 1, a[:40]
    s = s.replace(a, b)
io.open(P, 'w', encoding='utf-8').write(s)
print('game.js ok')

# ---------------- economy.js ----------------
P = os.path.join(ROOT, 'js', 'economy.js')
s = io.open(P, encoding='utf-8').read()
reps = [
("""    { tier: 'epic',   w: 20, kind: 'gun',    pick: ['shotgun', 'rifle'], name: '枪械兑换券' },""",
 """    { tier: 'epic',   w: 20, kind: 'gun',    pick: ['shotgun', 'rifle'], name: '枪械兑换券' },"""),
("""    { tier: 'legend', w: 22, kind: 'gun',    pick: ['sniper', 'minigun', 'railgun'],  name: '顶级枪械券' }""",
 """    { tier: 'legend', w: 22, kind: 'gun',    pick: ['sniper', 'rifle'],  name: '顶级枪械券' }"""),
]
for a, b in reps:
    assert s.count(a) == 1, a[:40]
    s = s.replace(a, b)
io.open(P, 'w', encoding='utf-8').write(s)
print('economy.js ok')
