# -*- coding: utf-8 -*-
"""荷叶改成小片成丛分布"""
import io

P = 'js/world.js'
s = io.open(P, encoding='utf-8').read()

START = '    // ---------- 睡莲（荷叶 + 花）----------'
END = '    })();\n'
i = s.index(START)
j = s.index(END, i) + len(END)

NEW = '''    // ---------- 睡莲（荷叶 + 花）----------
    // 参考图里水面最有辨识度的就是这层浮叶：小而扁的圆盘、边上开一道缺口、
    // 成丛分布、少数几朵粉花。它们贴着水面轻轻起伏，是"活水"的关键。
    const lilies = [];
    (function buildLilies() {
      const rnd = mulberry32(77341);
      // 带缺口的圆盘（缺口 = 荷叶裂口），转成水平面
      const padGeo = new THREE.CircleGeometry(1, 16, 0.36, TAU - 0.72);
      padGeo.rotateX(-Math.PI / 2);
      const padMats = [
        new THREE.MeshStandardMaterial({ color: 0x5ba349, roughness: 0.84, side: THREE.DoubleSide }),
        new THREE.MeshStandardMaterial({ color: 0x46893c, roughness: 0.86, side: THREE.DoubleSide }),
        new THREE.MeshStandardMaterial({ color: 0x74b855, roughness: 0.82, side: THREE.DoubleSide })
      ];
      // 荷叶在背光岸边会发黑，给一点自发光抬黑位（和各店铺一致的做法）
      padMats.forEach((m) => {
        m.emissive.copy(m.color).multiplyScalar(0.24);
        m.emissiveIntensity = 1;
      });

      const flowerPetalMat = new THREE.MeshStandardMaterial({
        color: 0xf9dfea, roughness: 0.6, emissive: 0x6a3a4c, emissiveIntensity: 0.35
      });
      const flowerCoreMat = new THREE.MeshStandardMaterial({
        color: 0xf5cb55, roughness: 0.5, emissive: 0x6b4c10, emissiveIntensity: 0.3
      });
      const petalGeo = new THREE.SphereGeometry(0.1, 7, 5);

      function addFlower(px, pz, scale) {
        const g = new THREE.Group();
        g.position.set(px, POND_TOP + 0.035, pz);
        g.scale.setScalar(scale);
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * TAU;
          const petal = new THREE.Mesh(petalGeo, flowerPetalMat);
          petal.scale.set(1, 0.5, 1.8);
          petal.position.set(Math.cos(a) * 0.12, 0.04, Math.sin(a) * 0.12);
          petal.rotation.y = -a;
          g.add(petal);
        }
        const core = new THREE.Mesh(new THREE.SphereGeometry(0.07, 7, 5), flowerCoreMat);
        core.position.y = 0.06;
        core.scale.y = 0.7;
        g.add(core);
        root.add(g);
        lilies.push({ mesh: g, y0: g.position.y, phase: rnd() * TAU, spin: 0 });
      }

      // 13 丛，每丛 2~4 片：成丛才有真实的浮叶感，均匀撒开就变成"绿色圆点阵列"
      const CLUMP = 13;
      let flowerCount = 0;
      for (let c = 0; c < CLUMP; c++) {
        const a0 = rnd() * TAU;
        const r0 = pondRadiusAt(a0) * (0.24 + Math.pow(rnd(), 0.55) * 0.66);
        const cx = Math.cos(a0) * r0, cz = Math.sin(a0) * r0;
        const n = 2 + Math.floor(rnd() * 3);
        for (let k = 0; k < n; k++) {
          const x = cx + (rnd() - 0.5) * 2.4;
          const z = cz + (rnd() - 0.5) * 2.4;
          const pa = Math.atan2(z, x);
          if (Math.hypot(x, z) > pondRadiusAt(pa) * 0.93) continue;
          let clash = false;
          for (let q = 0; q < lilies.length; q++) {
            const pm = lilies[q].mesh;
            if (Math.hypot(pm.position.x - x, pm.position.z - z) < 0.62) { clash = true; break; }
          }
          if (clash) continue;
          const sc = 0.26 + rnd() * 0.26;
          const pad = new THREE.Mesh(padGeo, padMats[(c + k) % padMats.length]);
          pad.scale.set(sc, 1, sc * (0.88 + rnd() * 0.24));
          pad.position.set(x, POND_TOP + 0.02, z);
          pad.rotation.y = rnd() * TAU;
          pad.receiveShadow = true;
          root.add(pad);
          lilies.push({ mesh: pad, y0: pad.position.y, phase: rnd() * TAU, spin: (rnd() - 0.5) * 0.05 });
          // 花只开在少数几片上，太多就假
          if (flowerCount < 6 && k === 0 && rnd() > 0.45) {
            addFlower(x + sc * 0.2, z - sc * 0.15, 0.55 + sc * 0.5);
            flowerCount++;
          }
        }
      }
    })();
'''

s = s[:i] + NEW + s[j:]
io.open(P, 'w', encoding='utf-8', newline='').write(s)
print('lilies rebuilt')
