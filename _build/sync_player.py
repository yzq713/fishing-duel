# -*- coding: utf-8 -*-
"""把 js/player.js 同步进单文件版 index.html 的内联块。"""
import io, sys

idx = io.open('index.html', encoding='utf-8').read()
src = io.open('js/player.js', encoding='utf-8').read().rstrip('\n')

marker = '/* 第一人称玩家：移动、视角、武器与射击参数 */'
if marker not in idx:
    sys.exit('marker not found')
i = idx.index(marker)
s_start = idx.rindex('<script>', 0, i)
j = idx.index('\n</script>', i)
idx = idx[:s_start] + '<script>\n' + src + idx[j:]
io.open('index.html', 'w', encoding='utf-8').write(idx)
print('synced: %d chars' % len(src))
