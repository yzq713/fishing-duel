"""重打包 GLB：去重 accessor 数据块 + 索引降位到 uint16。
不改动节点/网格/材质结构，只压缩二进制缓冲。"""
import struct, json, hashlib, sys, os

SRC = sys.argv[1]
DST = sys.argv[2]

d = open(SRC, 'rb').read()
magic, ver, total = struct.unpack('<III', d[:12])
off = 12
js = None
bin_off = None
bin_len = 0
while off < len(d):
    clen, ctype = struct.unpack('<II', d[off:off + 8])
    if ctype == 0x4E4F534A:
        js = json.loads(d[off + 8:off + 8 + clen])
    elif ctype == 0x004E4942:
        bin_off = off + 8
        bin_len = clen
    off += 8 + clen

acc = js['accessors']
bvs = js['bufferViews']
CT = {5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4}
NC = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}

# 1) 收集每个 accessor 的原始字节
raws = []
for i, a in enumerate(acc):
    assert 'sparse' not in a, 'sparse accessor not supported'
    bv = bvs[a['bufferView']]
    s = bin_off + bv.get('byteOffset', 0) + a.get('byteOffset', 0)
    n = a['count'] * CT[a['componentType']] * NC[a['type']]
    raws.append(bytearray(d[s:s + n]))

# 2) 索引降位：uint32 -> uint16（若最大索引 < 65536）
#    找出所有被用作 indices 的 accessor
index_acc = set()
for m in js['meshes']:
    for p in m['primitives']:
        if 'indices' in p:
            index_acc.add(p['indices'])

downcast = 0
for ai in index_acc:
    a = acc[ai]
    if a['componentType'] != 5125:
        continue
    cnt = a['count']
    arr = struct.unpack('<%dI' % cnt, bytes(raws[ai]))
    if max(arr) < 65536:
        raws[ai] = bytearray(struct.pack('<%dH' % cnt, *arr))
        a['componentType'] = 5123
        downcast += 1

# 3) 去重：相同字节 + 相同语义 -> 共享同一 bufferView
new_bin = bytearray()
new_bvs = []
pool = {}
old_to_new_bv = {}
for i, a in enumerate(acc):
    raw = bytes(raws[i])
    key = hashlib.md5(raw).hexdigest() + '|' + str(a['componentType']) + '|' + a['type'] + '|' + str(a.get('normalized', False)) + '|' + str(a['count'])
    if key in pool:
        old_to_new_bv[i] = pool[key]
        a['bufferView'] = pool[key]
        a.pop('byteOffset', None)
        continue
    while len(new_bin) % 4:
        new_bin.append(0)
    off_now = len(new_bin)
    new_bin += raw
    while len(new_bin) % 4:
        new_bin.append(0)
    bi = len(new_bvs)
    new_bvs.append({'buffer': 0, 'byteOffset': off_now, 'byteLength': len(raw), 'target': 34962})
    pool[key] = bi
    old_to_new_bv[i] = bi
    a['bufferView'] = bi
    a.pop('byteOffset', None)

# 4) 图片（原有 bufferView 指向的二进制）重新追加
img_new_bv = []
for im in js.get('images', []):
    obv = bvs[im['bufferView']]
    s = bin_off + obv.get('byteOffset', 0)
    raw = d[s:s + obv['byteLength']]
    while len(new_bin) % 4:
        new_bin.append(0)
    off_now = len(new_bin)
    new_bin += raw
    while len(new_bin) % 4:
        new_bin.append(0)
    bi = len(new_bvs)
    new_bvs.append({'buffer': 0, 'byteOffset': off_now, 'byteLength': len(raw)})
    im['bufferView'] = bi
    img_new_bv.append(bi)

js['bufferViews'] = new_bvs
js['buffers'] = [{'byteLength': len(new_bin)}]

# 5) 打包
js_bytes = json.dumps(js, separators=(',', ':')).encode('utf-8')
while len(js_bytes) % 4:
    js_bytes += b' '
while len(new_bin) % 4:
    new_bin.append(0)

out = bytearray()
out += struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js_bytes) + 8 + len(new_bin))
out += struct.pack('<II', len(js_bytes), 0x4E4F534A)
out += js_bytes
out += struct.pack('<II', len(new_bin), 0x004E4942)
out += new_bin
open(DST, 'wb').write(out)

print(f'{os.path.getsize(SRC)/1048576:.2f} MB -> {os.path.getsize(DST)/1048576:.2f} MB  (indices downcast: {downcast}, unique blocks: {len(new_bvs)})')
