# -*- coding: utf-8 -*-
"""加入睡莲（荷叶 + 花），参考 Fab「Polystuff Park」的水面构成"""
import io

P = 'js/world.js'
s = io.open(P, encoding='utf-8').read()

ANCHOR = """    water.renderOrder = 2;
    root.add(water);
"""
assert ANCHOR in s

ADD = """    water.renderOrder = 2;
    root.add(water);

    // ---------- 睡莲（荷叶 + 花）----------
    // 参考图里水面最有辨识度的就是这层浮叶：扁平的圆盘、边上开一道缺口、
    // 少数几朵粉花。它们贴着水面微微起伏，是"活水"的关键。
    const lilies = [];
    (function buildLilies() {
      const rnd = mulberry32(77341);
      // 带缺口的圆盘（缺口 = 荷叶裂口），转成水平面
      const padGeo = new THREE.CircleGeometry(1, 18, 0.34, TAU - 0.68);
      padGeo.rotateX(-Math.PI / 2);
      const padMats = [
        new THREE.MeshStandardMaterial({ color: 0x4a8f46, roughness: 0.86, side: THREE.DoubleSide }),
        new THREE.MeshStandardMaterial({ color: 0x3c7a3c, roughness: 0.88, side: THREE.DoubleSide }),
        new THREE.MeshStandardMaterial({ color: 0x63a34c, roughness: 0.84, side: THREE.DoubleSide })
      ];
      // 荷叶在背光的岸边看会发黑，给一点点自发光抬黑位（和各店铺一致的做法）
      padMats.forEach((m) => {
        m.emissive.copy(m.color).multiplyScalar(0.26);
        m.emissiveIntensity = 1;
      });

      const flowerPetalMat = new THREE.MeshStandardMaterial({
        color: 0xf6d8e6, roughness: 0.6, emissive: 0x6a3a4c, emissiveIntensity: 0.35
      });
      const flowerCoreMat = new THREE.MeshStandardMaterial({
        color: 0xf2c447, roughness: 0.5, emissive: 0x6b4c10, emissiveIntensity: 0.3
      });
      const petalGeo = new THREE.SphereGeometry(0.105, 8, 6);

      function addFlower(px, pz, py, scale) {
        const g = new THREE.Group();
        g.position.set(px, py + 0.02, pz);
        g.scale.setScalar(scale);
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * TAU;
          const petal = new THREE.Mesh(petalGeo, flowerPetalMat);
          petal.scale.set(1, 0.55, 1.9);
          petal.position.set(Math.cos(a) * 0.13, 0.045, Math.sin(a) * 0.13);
          petal.rotation.y = -a;
          g.add(petal);
        }
        const core = new THREE.Mesh(new THREE.SphereGeometry(0.075, 8, 6), flowerCoreMat);
        core.position.y = 0.07;
        core.scale.y = 0.7;
        g.add(core);
        root.add(g);
        lilies.push({ mesh: g, y0: g.position.y, phase: rnd() * TAU, spin: 0 });
      }

      const N = 26;
      for (let i = 0; i < N; i++) {
        // 用拒绝采样撒在湖里，靠岸边密一点、湖心稀一点更自然
        let x = 0, z = 0, ok = false;
        for (let t = 0; t < 24 && !ok; t++) {
          const a = rnd() * TAU;
          const rr = pondRadiusAt(a) * (0.14 + Math.pow(rnd(), 0.6) * 0.78);
          x = Math.cos(a) * rr;
          z = Math.sin(a) * rr;
          ok = true;
          for (let k = 0; k < lilies.length; k++) {
            const p = lilies[k].mesh;
            if (Math.hypot(p.position.x - x, p.position.z - z) < 1.35) { ok = false; break; }
          }
        }
        if (!ok) continue;
        const sc = 0.42 + rnd() * 0.52;
        const pad = new THREE.Mesh(padGeo, padMats[i % padMats.length]);
        pad.scale.set(sc, 1, sc * (0.9 + rnd() * 0.2));
        pad.position.set(x, POND_TOP + 0.022, z);
        pad.rotation.y = rnd() * TAU;
        pad.receiveShadow = true;
        root.add(pad);
        lilies.push({ mesh: pad, y0: pad.position.y, phase: rnd() * TAU, spin: (rnd() - 0.5) * 0.03 });
        if (i % 5 === 2) addFlower(x + sc * 0.15, z - sc * 0.1, POND_TOP, 0.9 + rnd() * 0.3);
      }
    })();
"""

s = s.replace(ANCHOR, ADD, 1)

# updateAmbient 里让荷叶轻轻起伏
OLD_AMB = """    function updateAmbient(t) {
      waterMat.uniforms.time.value = t;"""
NEW_AMB = """    function updateAmbient(t) {
      waterMat.uniforms.time.value = t;
      for (let i = 0; i < lilies.length; i++) {
        const l = lilies[i];
        l.mesh.position.y = l.y0 + Math.sin(t * 0.9 + l.phase) * 0.013;
        if (l.spin) l.mesh.rotation.y += l.spin * 0.012;
      }"""
assert OLD_AMB in s
s = s.replace(OLD_AMB, NEW_AMB, 1)

io.open(P, 'w', encoding='utf-8', newline='').write(s)
print('lilies added')
