"""把 js/*.js 的改动同步回 index.html 的内联脚本块。

index.html 是单文件发布版：每个 js 文件在内联里都有一份 `<script>` 副本。
按「文件首行注释」定位块，整体替换，避免出现两边不一致（改文案时最容易漏）。
用法：python _build/sync_js.py
"""
import io, os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HTML = os.path.join(ROOT, 'index.html')

FILES = ['js/game.js', 'js/economy.js', 'js/world.js', 'js/network.js', 'js/fishing.js', 'js/player.js', 'js/fish.js']

html = io.open(HTML, encoding='utf-8').read()
changed = 0

for rel in FILES:
    path = os.path.join(ROOT, rel.replace('/', os.sep))
    if not os.path.exists(path):
        print('WARN 缺少 %s' % rel)
        continue
    src = io.open(path, encoding='utf-8').read()
    marker = src.splitlines()[0].strip()
    if not marker.startswith('/*'):
        print('SKIP %s（首行不是注释标记）' % rel)
        continue
    idx = html.find(marker)
    if idx < 0:
        print('FAIL 找不到 %s 的内联块（标记：%s）' % (rel, marker[:30]))
        continue
    # 往前找这个块自己的 <script>，往后找它的 </script>
    s = html.rfind('<script>', 0, idx)
    e = html.find('</script>', idx)
    if s < 0 or e < 0:
        print('FAIL %s 的 script 边界没找到' % rel)
        continue
    inner = html[s + len('<script>'):e]
    # 已经是同一份就跳过
    if inner.strip() == src.strip():
        print('OK   %s 已同步（无需改动）' % rel)
        continue
    html = html[:s + len('<script>')] + '\n' + src.rstrip() + '\n' + html[e:]
    changed += 1
    print('SYNC %s  %d -> %d 字符' % (rel, len(inner), len(src)))

if changed:
    io.open(HTML, 'w', encoding='utf-8', newline='\n').write(html)
    print('已写回 index.html（%.2f MB）' % (os.path.getsize(HTML) / 1048576))
else:
    print('无需写回')
