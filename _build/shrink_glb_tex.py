# -*- coding: utf-8 -*-
"""重编码 GLB 里的贴图（缩尺寸 + 降 JPEG 质量），重建 bin 块。

用法: python shrink_glb_tex.py in.glb out.glb [maxpx] [quality]
"""
import struct, json, sys, io
from PIL import Image

SRC = sys.argv[1]
DST = sys.argv[2]
MAXPX = int(sys.argv[3]) if len(sys.argv) > 3 else 768
QUAL = int(sys.argv[4]) if len(sys.argv) > 4 else 82

raw = open(SRC, 'rb').read()
off = 12
j = None
binary = None
while off < len(raw):
    clen, ctype = struct.unpack('<II', raw[off:off + 8])
    if ctype == 0x4E4F534A:
        j = json.loads(raw[off + 8:off + 8 + clen])
    elif ctype == 0x004E4942:
        binary = raw[off + 8:off + 8 + clen]
    off += 8 + clen

bvs = j['bufferViews']
img_of_bv = {}
for i, im in enumerate(j.get('images', [])):
    img_of_bv[im['bufferView']] = i

# 新的图片字节
new_img = {}
for i, im in enumerate(j.get('images', [])):
    bv = bvs[im['bufferView']]
    s = bv.get('byteOffset', 0)
    data = binary[s:s + bv['byteLength']]
    img = Image.open(io.BytesIO(data)).convert('RGB')
    w, h = img.size
    scale = min(1.0, MAXPX / max(w, h))
    if scale < 1.0:
        img = img.resize((max(1, int(w * scale)), max(1, int(h * scale))), Image.LANCZOS)
    buf = io.BytesIO()
    img.save(buf, format='JPEG', quality=QUAL, optimize=True, progressive=False)
    nb = buf.getvalue()
    new_img[i] = nb
    print(f'image {i}: {w}x{h} {len(data)}B -> {img.size[0]}x{img.size[1]} {len(nb)}B')

# 重建 bin：按 bufferView 顺序重排，图片用的替换掉
out = bytearray()
for bi, bv in enumerate(bvs):
    if bi in img_of_bv:
        data = new_img[img_of_bv[bi]]
    else:
        s = bv.get('byteOffset', 0)
        data = binary[s:s + bv['byteLength']]
    while len(out) % 4:
        out.append(0)
    bv['byteOffset'] = len(out)
    bv['byteLength'] = len(data)
    out += data
while len(out) % 4:
    out.append(0)

j['buffers'] = [{'byteLength': len(out)}]
# 去掉可能存在的占位 uri
for b in j['buffers']:
    b.pop('uri', None)

js = json.dumps(j, separators=(',', ':')).encode('utf-8')
while len(js) % 4:
    js += b' '

glb = bytearray()
glb += struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(out))
glb += struct.pack('<II', len(js), 0x4E4F534A) + js
glb += struct.pack('<II', len(out), 0x004E4942) + bytes(out)
open(DST, 'wb').write(glb)
print(f'{SRC} {len(raw)} -> {DST} {len(glb)}')
