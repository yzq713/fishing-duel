// GLB 瘦身：按材质名剔除杂物 → 焊接/去重 → meshopt 简化 → 写回
// node glb_opt.mjs in.glb out.glb [ratio] [dropRegex]
import { NodeIO } from '@gltf-transform/core';
import { prune, dedup, weld, simplify } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';

const SRC = process.argv[2];
const DST = process.argv[3];
const RATIO = parseFloat(process.argv[4] || '0.3');
const DROP = process.argv[5] ? new RegExp(process.argv[5], 'i') : null;

const io = new NodeIO();
const doc = await io.read(SRC);
const root = doc.getRoot();

if (DROP) {
  const keepMat = (m) => !DROP.test(m.getName() || '');
  let removed = 0;
  for (const mesh of root.listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const m = prim.getMaterial();
      const nm = (m && m.getName()) || '';
      if (m && !keepMat(m)) {
        // 把这一段的图元掏空，prune 会把空网格和孤立材质清掉
        prim.dispose();
        removed++;
        console.log('  剔除图元，材质 =', nm);
      }
    }
  }
  console.log('剔除图元数:', removed);
}

// TANGENT 是法线贴图用的切线，Three 会给缺失的几何用导数现算，
// 这里直接丢掉，能省下每顶点 16 字节（45k 顶点约 0.7MB）
for (const mesh of root.listMeshes()) {
  for (const prim of mesh.listPrimitives()) {
    if (prim.getAttribute('TANGENT')) prim.setAttribute('TANGENT', null);
  }
}

await doc.transform(dedup(), weld(), prune());

if (RATIO < 1) {
  await MeshoptSimplifier.ready;
  await doc.transform(simplify({ simplifier: MeshoptSimplifier, ratio: RATIO, error: 0.002 }));
}
await doc.transform(prune());

let v = 0;
for (const mesh of root.listMeshes()) for (const p of mesh.listPrimitives()) v += p.getAttribute('POSITION').getCount();
console.log('优化后顶点数:', v);
await io.write(DST, doc);
console.log('写出', DST);
