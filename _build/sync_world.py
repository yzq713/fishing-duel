"""把 js/world.js 同步进 index.html 的内联脚本块，
并在枪械资产块后插入/刷新 window.MARKET_ASSETS（鱼市摊位 glb 的 base64）。"""
import base64, io, re, sys, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HTML = os.path.join(ROOT, 'index.html')
WORLD = os.path.join(ROOT, 'js', 'world.js')
GLB = os.path.join(ROOT, 'assets', 'fishmarket', 'market_opt.glb')

html = io.open(HTML, encoding='utf-8').read()
world = io.open(WORLD, encoding='utf-8').read()

# --- 1) 替换 world 脚本块 ---
START = '<script>\n/* 海岛竞技场：地形、掩体、水塘、碰撞与射线查询 */'
i = html.find(START)
if i < 0:
    print('FAIL: 找不到 world 脚本块起始标记')
    sys.exit(1)
j = html.find('</script>', i)
if j < 0:
    print('FAIL: 找不到 world 脚本块结束')
    sys.exit(1)
old_block = html[i:j]
new_block = START + world[world.find('/* 海岛竞技场'):]
# world.js 从注释开始，去掉注释前的可能空白
k = world.find('/* 海岛竞技场')
if k < 0:
    print('FAIL: world.js 里没有预期注释头')
    sys.exit(1)
new_block = '<script>\n' + world[k:]
html = html[:i] + new_block + html[j:]
print('world 块已同步：%d -> %d 字符' % (len(old_block), len(new_block)))

# --- 2) 插入/更新 MARKET_ASSETS ---
if not os.path.exists(GLB):
    print('WARN: 缺少 %s，跳过内联' % GLB)
else:
    b64 = base64.b64encode(open(GLB, 'rb').read()).decode('ascii')
    block = (
        '<script>\n'
        '/* 鱼市摊位模型（Fab · Stylize Fish Market / LowPolyBoy · CC-BY 4.0）base64 内联。\n'
        '   源文件 assets/fishmarket/market_opt.glb（原包已去重 + 索引降位，7.1MB -> 2.2MB）。\n'
        '   换模型后重新生成这一块即可。*/\n'
        'window.MARKET_ASSETS = \'%s\';\n'
        '</script>' % b64
    )
    # 先删掉旧的
    html = re.sub(r'<script>\n/\* 鱼市摊位模型.*?</script>', '', html, flags=re.S)
    anchor = html.find('window.WEAPON_ASSETS = {')
    if anchor < 0:
        print('FAIL: 找不到 WEAPON_ASSETS 锚点')
        sys.exit(1)
    end = html.find('</script>', anchor) + len('</script>')
    html = html[:end] + '\n' + block + html[end:]
    print('MARKET_ASSETS 已内联：%.2f MB base64' % (len(b64) / 1048576))

# --- 3) 逐个插入/更新素材 base64（湖水 / 灯塔 / 海边渔屋）---
# 每项：内联变量名、源 glb、注释里的来历、插件挂在哪一段之后
EXTRA = [
    ('POND_ASSETS', 'assets/pond/pond_small.glb',
     '湖水素材（Fab · Little Pond & fish / Mot Panda\'s Store · 免费）base64 内联。\n'
     '   源文件 assets/pond/pond_small.glb（1.26MB -> 0.63MB：几何块去重 + 贴图重编码）。',
     'MARKET_ASSETS', '湖水素材'),
    ('LH_ASSETS', 'assets/lh/lh_small.glb',
     '灯塔素材（Fab · Lighthouse / Troublesome · 免费）base64 内联。\n'
     '   源文件 assets/lh/lh_small.glb（104MB -> 2.0MB：剔除云/鸟/自带海面、\n'
     '   meshopt 简化到 45k 顶点、去掉切线、贴图 300px JPEG）。',
     'POND_ASSETS', '灯塔素材'),
    ('CLIFF_ASSETS', 'assets/cliff/cliff_small.glb',
     '海边渔屋素材（Fab · Cliff House / Max3d · 免费）base64 内联。\n'
     '   源文件 assets/cliff/cliff_small.glb（9.8MB -> ~0.7MB：贴图降到 1024 JPEG）。',
     'LH_ASSETS', '海边渔屋素材'),
]

for KEY, REL, NOTE, AFTER, TAG in EXTRA:
    GP = os.path.join(ROOT, REL.replace('/', os.sep))
    if not os.path.exists(GP):
        print('WARN: 缺少 %s，跳过 %s 内联' % (GP, KEY))
        continue
    b64 = base64.b64encode(open(GP, 'rb').read()).decode('ascii')
    blk = (
        '<script>\n'
        '/* ' + NOTE + '*/\n'
        'window.' + KEY + " = '" + b64 + "';\n"
        '</script>'
    )
    html = re.sub(r'<script>\n/\* ' + TAG + r'.*?</script>', '', html, flags=re.S)
    anchor = html.find('window.' + AFTER + ' =')
    if anchor < 0:
        print('FAIL: 找不到 %s 锚点' % AFTER)
        sys.exit(1)
    end = html.find('</script>', anchor) + len('</script>')
    html = html[:end] + '\n' + blk + html[end:]
    print('%s 已内联：%.2f MB base64' % (KEY, len(b64) / 1048576))

io.open(HTML, 'w', encoding='utf-8', newline='').write(html)
print('index.html -> %.2f MB' % (os.path.getsize(HTML) / 1048576))
