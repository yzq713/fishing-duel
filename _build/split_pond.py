# -*- coding: utf-8 -*-
"""把 Little Pond 的合并植被网格拆分成分散道具，导出为 pond_props.glb。

原模型的植被全部并进一个 mesh（486 个连通块，且大量是正反面重复壳）。
这里做：连通分量 -> 合并重复壳 -> 按包围盒邻近聚成“丛” -> 每个丛一个节点。
"""
import struct, json, sys, os
import numpy as np

SRC = sys.argv[1] if len(sys.argv) > 1 else 'assets/pond/little_pond_fish.glb'
DST = sys.argv[2] if len(sys.argv) > 2 else 'assets/pond/pond_props.glb'
VEG_MESH = 38

CT = {5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4}
NC = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}
DT = {5120: np.int8, 5121: np.uint8, 5122: np.int16, 5123: np.uint16, 5125: np.uint32, 5126: np.float32}

d = open(SRC, 'rb').read()
off = 12
j = None
bin_off = None
while off < len(d):
    clen, ctype = struct.unpack('<II', d[off:off + 8])
    if ctype == 0x4E4F534A:
        j = json.loads(d[off + 8:off + 8 + clen])
    elif ctype == 0x004E4942:
        bin_off = off + 8
    off += 8 + clen
acc = j['accessors']
bvs = j['bufferViews']


def read(ai):
    a = acc[ai]
    bv = bvs[a['bufferView']]
    s = bin_off + bv.get('byteOffset', 0) + a.get('byteOffset', 0)
    n = a['count'] * NC[a['type']]
    arr = np.frombuffer(d, dtype=DT[a['componentType']], count=n, offset=s).copy()
    return arr.reshape(a['count'], NC[a['type']]) if NC[a['type']] > 1 else arr


prim = j['meshes'][VEG_MESH]['primitives'][0]
pos = read(prim['attributes']['POSITION']).astype(np.float64)
nrm = read(prim['attributes']['NORMAL']).astype(np.float64)
uv = read(prim['attributes']['TEXCOORD_0']).astype(np.float64)
idx = read(prim['indices']).astype(np.int64).reshape(-1, 3)
nv = len(pos)
print('verts', nv, 'tris', len(idx))

# ---------- 1. 连通分量 ----------
par = np.arange(nv)


def find(x):
    while par[x] != x:
        par[x] = par[par[x]]
        x = par[x]
    return x


def union(a, b):
    ra, rb = find(a), find(b)
    if ra != rb:
        par[rb] = ra


for t in idx:
    union(t[0], t[1])
    union(t[1], t[2])
roots = np.array([find(i) for i in range(nv)])
comps = {}
for i in range(nv):
    comps.setdefault(roots[i], []).append(i)
print('components', len(comps))

# ---------- 2. 合并重复壳 ----------
comp_list = []
for k, vids in comps.items():
    pts = pos[vids]
    comp_list.append({
        'verts': np.array(vids),
        'min': pts.min(0), 'max': pts.max(0),
        'c': (pts.min(0) + pts.max(0)) / 2,
        's': pts.max(0) - pts.min(0),
    })
comp_list.sort(key=lambda c: -len(c['verts']))

merged = []
for c in comp_list:
    hit = None
    for m in merged:
        if np.abs(m['c'] - c['c']).max() < 0.12 and np.abs(m['s'] - c['s']).max() < 0.12:
            hit = m
            break
    if hit:
        hit['verts'] = np.concatenate([hit['verts'], c['verts']])
        hit['min'] = np.minimum(hit['min'], c['min'])
        hit['max'] = np.maximum(hit['max'], c['max'])
        hit['c'] = (hit['min'] + hit['max']) / 2
        hit['s'] = hit['max'] - hit['min']
    else:
        merged.append({'verts': c['verts'].copy(), 'min': c['min'].copy(),
                       'max': c['max'].copy(), 'c': c['c'].copy(), 's': c['s'].copy()})
print('after dedup shells', len(merged))

# ---------- 3. 邻近聚合 ----------
groups = [dict(m) for m in merged]
changed = True
while changed:
    changed = False
    for i in range(len(groups)):
        if groups[i] is None:
            continue
        for k in range(i + 1, len(groups)):
            if groups[k] is None:
                continue
            a, b = groups[i], groups[k]
            # 包围盒外扩 0.30 后是否相交
            if (a['min'][0] - 0.30 <= b['max'][0] and b['min'][0] - 0.30 <= a['max'][0] and
                    a['min'][1] - 0.45 <= b['max'][1] and b['min'][1] - 0.45 <= a['max'][1] and
                    a['min'][2] - 0.30 <= b['max'][2] and b['min'][2] - 0.30 <= a['max'][2]):
                a['verts'] = np.concatenate([a['verts'], b['verts']])
                a['min'] = np.minimum(a['min'], b['min'])
                a['max'] = np.maximum(a['max'], b['max'])
                a['c'] = (a['min'] + a['max']) / 2
                a['s'] = a['max'] - a['min']
                groups[k] = None
                changed = True
    groups = [g for g in groups if g is not None]
print('props', len(groups))

groups.sort(key=lambda g: -len(g['verts']))
print(f"{'#':>3} {'verts':>6} {'cx':>7}{'cy':>7}{'cz':>7}  {'sx':>6}{'sy':>6}{'sz':>6}   r     ymax")
for i, g in enumerate(groups):
    c, s = g['c'], g['s']
    r = np.hypot(c[0], c[2])
    print(f"{i:>3} {len(g['verts']):>6} {c[0]:>7.2f}{c[1]:>7.2f}{c[2]:>7.2f}  {s[0]:>6.2f}{s[1]:>6.2f}{s[2]:>6.2f}  {r:>5.2f} {g['max'][1]:>6.2f}")

np.save('/tmp/pond_groups.npy', np.array([1]))
import pickle
pickle.dump([{'verts': g['verts'], 'min': g['min'], 'max': g['max'], 'c': g['c'], 's': g['s']} for g in groups],
            open('/tmp/pond_groups.pkl', 'wb'))
print('saved /tmp/pond_groups.pkl')
