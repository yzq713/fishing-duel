# -*- coding: utf-8 -*-
"""精简枪械：只留 6 把有独立模型的枪 + 初始只给手枪 + 删掉无模型/重复模型的枪。"""
import io, re, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
P = os.path.join(ROOT, 'js', 'player.js')
s = io.open(P, encoding='utf-8').read()

# ---------------- 1. 枪械表 ----------------
start = s.index('  // 可选武器配置')
end = s.index('  window.GUNS = GUNS;')
new_guns = '''  // 可选武器配置（price 0 = 开局配发，不用买）
  // 只保留「模型不重样」的枪：手枪 / 霰弹枪 / 突击步枪 / 狙击步枪用 glb 模型，
  // 加特林与鱼叉电磁炮是程序化建模（六管和鱼叉用一把步枪模型做不出来）。
  // 原来那 6 把——左轮、冲锋枪、双管霰弹、精确射手、轻机枪、反器材——都是
  // 复用手枪/步枪/霰弹/狙击的模型，只改长度和染色，摆在商店里一眼就是同一把枪，
  // 已经全部删掉。
  const GUNS = {
    pistol: {
      id: 'pistol', name: '制式手枪', price: 0, mag: 12, fireCd: 0.2,
      body: 22, head: 44, spread: 0.009, reload: 1.05, aimFov: 58, color: 0xd8e2ea,
      desc: '随身配枪，打水面上的鸟够用', stats: [30, 58, 55, 88]
    },
    shotgun: {
      id: 'shotgun', name: '泵动霰弹枪', price: 700, mag: 6, fireCd: 0.75,
      body: 15, head: 26, spread: 0.03, reload: 1.6, aimFov: 62, color: 0xffd166,
      pellets: 9, pelletSpread: 0.055,
      desc: '一次喷出 9 颗弹丸，鸟群一枪一片', stats: [92, 30, 20, 35]
    },
    rifle: {
      id: 'rifle', name: '突击步枪', price: 1300, mag: 12, fireCd: 0.15,
      body: 26, head: 50, spread: 0.006, reload: 1.35, aimFov: 52, color: 0xff8a3d,
      desc: '均衡之选，中距离点鱼最稳', stats: [55, 60, 40, 70]
    },
    sniper: {
      id: 'sniper', name: '狙击步枪', price: 2600, mag: 5, fireCd: 1.05,
      body: 80, head: 150, spread: 0.0012, reload: 1.8, aimFov: 30, color: 0xb78cff,
      zooms: [2, 4, 6, 8], scope: true,
      desc: '远距离狙击，倍镜可调 2/4/6/8', stats: [100, 14, 16, 95]
    },
    minigun: {
      id: 'minigun', name: '六管加特林', price: 4200, mag: 120, fireCd: 0.055,
      body: 14, head: 26, spread: 0.021, reload: 3.2, aimFov: 60, color: 0xff9a6a,
      desc: '120 发弹链，转起来就停不下来', stats: [46, 100, 100, 22]
    },
    railgun: {
      id: 'railgun', name: '鱼叉电磁炮', price: 6500, mag: 3, fireCd: 1.2,
      body: 150, head: 260, spread: 0.0004, reload: 2.0, aimFov: 26, color: 0x8affff,
      zooms: [2, 4, 6, 8], scope: true, pierce: true,
      desc: '把整根鱼叉加速到音速，穿透一切', stats: [140, 16, 8, 96]
    }
  };
'''
s = s[:start] + new_guns + s[end:]

# ---------------- 2. glb 模型映射 ----------------
start = s.index('  // 12 把枪 → 4 个 glb 模型的映射')
end = s.index('  window.GUN_MODELS = GUN_MODELS;')
new_map = '''  // 6 把枪 → 4 个 glb 模型的映射（一枪一模型，不再复用）。
  // len 是接入后的整枪长度（本地坐标），stockZ 是枪托末端位置，
  // hand 是右手握把点。加特林和鱼叉电磁炮走程序化模型，不在这张表里。
  const GUN_MODELS = {
    pistol:   { src: 'pistol',  len: 0.34, stockZ: 0.18, hand: [0.045, -0.062, 0.100], tilt: 0.20 },
    shotgun:  { src: 'shotgun', len: 0.62, stockZ: 0.42, hand: [0.050, -0.100, 0.290], tilt: 0.30 },
    rifle:    { src: 'rifle',   len: 0.62, stockZ: 0.46, hand: [0.050, -0.105, 0.300], tilt: 0.30 },
    sniper:   { src: 'sniper',  len: 0.62, stockZ: 0.30, hand: [0.050, -0.102, 0.190], tilt: 0.28 }
  };
'''
s = s[:start] + new_map + s[end:]

# ---------------- 3. builders / muzzles ----------------
bstart = s.index('      const builders = {')
bend = s.index('      // 拳头模型（近战槽位显示）')
new_builders = '''      const builders = {
        pistol: () => this.modelPistol(),
        shotgun: () => this.modelShotgun(),
        rifle: () => this.modelRifle(),
        sniper: () => this.modelSniper(),
        minigun: () => this.modelMinigun(),
        railgun: () => this.modelRailgun()
      };
      Object.keys(builders).forEach((id) => {
        const g = builders[id]();
        g.visible = false;
        weapon.add(g);
        this.weaponModels[id] = g;
      });
      this.weaponMuzzles = {
        pistol: new THREE.Vector3(0, 0.02, -0.25),
        shotgun: new THREE.Vector3(0, 0.03, -0.7),
        rifle: new THREE.Vector3(0, 0.035, -0.72),
        sniper: new THREE.Vector3(0, 0.04, -1.0),
        minigun: new THREE.Vector3(0, 0.03, -0.86),
        railgun: new THREE.Vector3(0, 0.03, -1.02)
      };

'''
s = s[:bstart] + new_builders + s[bend:]

# ---------------- 4. 删掉被砍掉枪的建模方法 ----------------
def drop_method(src, name):
    m = re.search(r'\n    ' + name + r'\(\) \{', src)
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
    # 连同后面的空行一起去掉
    while k < len(src) and src[k] in '\r\n':
        k += 1
    return src[:i] + src[k:]

for name in ('modelSmg', 'modelLmg', 'modelRevolver', 'modelDb', 'modelDmr', 'modelAmr'):
    s = drop_method(s, name)

# ---------------- 5. 初始槽位 = 手枪 ----------------
reps = [
    ("      this.slots = ['rifle', null, 'rod', 'fist'];",
     "      // 开局就一根竹竿 + 一把手枪（用户口径），其余枪要自己买\n      this.slots = ['pistol', null, 'rod', 'fist'];"),
    ("      this.ammoByGun = { rifle: GUNS.rifle.mag };\n      this.gun = GUNS.rifle;",
     "      this.ammoByGun = { pistol: GUNS.pistol.mag };\n      this.gun = GUNS.pistol;"),
    ("      this.slots[0] = ids[0] || 'rifle';",
     "      this.slots[0] = ids[0] || 'pistol';"),
    ("        this.gun = GUNS[this.slots[this.slot]] || GUNS.rifle;",
     "        this.gun = GUNS[this.slots[this.slot]] || GUNS.pistol;"),
    ("      this.gun = GUNS[this.slots[this.slot]] || GUNS.rifle;",
     "      this.gun = GUNS[this.slots[this.slot]] || GUNS.pistol;"),
]
for a, b in reps:
    if a in s:
        s = s.replace(a, b)
    else:
        print('MISS:', a[:50])

# ---------------- 6. 后坐力表 ----------------
m = re.search(r'\n(\s+)pistol: 0\.55, revolver: 1\.25,[^\n]*\n[^\n]*\n', s)
if m:
    s = s[:m.start()] + '\n' + m.group(1) + "pistol: 0.55, shotgun: 1.5,\n" + m.group(1) + "rifle: 0.85, sniper: 1.75, minigun: 0.42, railgun: 1.6\n" + s[m.end():]
else:
    print('MISS recoil map')

io.open(P, 'w', encoding='utf-8').write(s)
print('OK player.js', len(s))
