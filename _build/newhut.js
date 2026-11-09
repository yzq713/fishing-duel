    // ---------- 唯一的渔屋：Fab「Cliff House」吊脚木屋，立在海边，能进门睡 ----------
    // 玩家这一轮提了三条：①房子太小、和人物比例不对 ②要能进去、床放进屋里 ③「可过夜」牌子删掉。
    // 上一版是按「屋檐总宽 6.4m」缩的，但那个尺寸包含了 3m 深的露台和一整段楼梯，
    // 真正的一层墙只有 2.9m 高、门洞 1.4m —— 一米七五的人站在旁边像间狗屋。
    // 这一版按人物反推：一层墙高 4.5m、门洞净高 2.04m，整栋放大 1.7 倍。
    //
    // 素材是封闭网格、门上只有一张贴图、没有室内，所以要做三件事：
    //   1. 挖：把正墙下半截（模型里 x≈-16.05 那个平面上、底边在门高以内的那 30 个三角面）
    //      从索引里剔掉，再把整片露台（局部 x < -3.66）也一并剔掉 —— 素材的露台 3m 深、
    //      栏杆绕着外沿一圈、还有一段能沉到沙子里的楼梯，既走不上去也不好改；
    //   2. 砌：正墙用板条墙重做（门洞 + 两扇窗），露台改成一米零五高的小木台，
    //      栏杆留出正面缺口，四级踏板下到沙滩；
    //   3. 装：屋里砌一间 6.9×6.6×2.75 的房间（地板 / 三面墙 / 吊顶），床、桌子、灯全搬进去。
    //
    // 朝向改成正东（rotY = π）：墙和坐标轴齐平，addCollider 的 AABB 才能严丝合缝围出四面墙。
    // 素材坐标是模型单位，下面所有局部坐标都以「屋身中心」为原点，单位米。
    const CliffAsset = glbAsset('CLIFF_ASSETS', 'assets/cliff/cliff_small.glb', 'cliffhut');

    function placeCliffHut() {
      const a = Math.atan2(-6, -30) + 0.06;
      const Rs = islandRadiusAt(a);
      // 屋身中心压在水线上：西半边吊脚插进浅水，东半边落在干沙上
      const hx = Math.cos(a) * (Rs + 0.6), hz = Math.sin(a) * (Rs + 0.6);

      const rotY = Math.PI;
      const cs = Math.cos(rotY), sn = Math.sin(rotY);   // (-1, 0)：局部 -X 朝岛心
      const toWorld = (lx, lz) => ({ x: hx + lx * cs + lz * sn, z: hz - lx * sn + lz * cs });

      const deckC = toWorld(-4.9, 0);
      const gy = Math.max(0.06, heightAt(deckC.x, deckC.z));   // 整栋的基准面

      const S = 0.132;               // 模型单位 -> 米（一层墙 34 单位 -> 4.5m）
      const DECK = 1.05;             // 露台面
      const FLR = 1.28;              // 室内地板
      const CEIL = 4.03;             // 室内吊顶
      const DOOR_W = 1.10, DOOR_H = 2.04;
      const BW = 3.353, BX = 3.478;  // 屋身在 z / x 方向的一半
      const DECK_X0 = -6.22, DECK_X1 = -3.42;
      const STEP_N = 4;

      const g = new THREE.Group();
      g.position.set(hx, gy, hz);
      g.rotation.y = rotY;
      root.add(g);

      const darkWood = new THREE.MeshStandardMaterial({ color: 0x5b4128, roughness: 0.9 });
      const trimWood = new THREE.MeshStandardMaterial({ color: 0x7a5a3a, roughness: 0.85 });
      const plankMat = new THREE.MeshStandardMaterial({ map: woodTex, roughness: 0.92 });

      clearScatterAround(hx, hz, 14.0);
      addNoGrassRect(hx, hz, 7.4, 7.2, 0.9);
      addNoGrassRect(deckC.x, deckC.z, 4.2, 7.2, 0.6);

      CliffAsset.whenReady((gltf) => {
        const m = gltf.scene;
        m.updateMatrixWorld(true);
        m.scale.setScalar(S);
        // 屋身中心对到组原点，露台面抬到 DECK（模型里露台面在 y=-5.71）
        m.position.set(-10.3 * S, DECK + 5.71 * S, -8.2 * S);
        m.updateMatrixWorld(true);
        m.traverse((o) => {
          if (!o.isMesh) return;
          o.castShadow = true;
          o.receiveShadow = true;
          const mat = o.material;
          if (!mat) return;
          // 素材导出来 metalness=1，本作没有环境贴图，纯金属面在直射光下几乎全黑
          mat.metalness = 0;
          if (mat.roughness !== undefined) mat.roughness = Math.max(mat.roughness, 0.78);
          mat.needsUpdate = true;
        });
        g.add(m);
        g.updateMatrixWorld(true);

        // ---- 1. 挖：剔掉正墙下半截 + 整片旧露台 ----
        // 模型是 indexed geometry，只重建 index 就够，顶点属性不用动。
        let hull = null;
        m.traverse((o) => { if (o.isMesh && !hull) hull = o; });
        if (hull && hull.geometry.index) {
          const geo = hull.geometry, pos = geo.attributes.position, idx = geo.index;
          const inv = new THREE.Matrix4().copy(g.matrixWorld).invert();
          const v = new THREE.Vector3();
          const keep = [];
          let cutWall = 0, cutPorch = 0;
          for (let i = 0; i < idx.count; i += 3) {
            let onPlane = 0, allPorch = true, ys = 0;
            for (let k = 0; k < 3; k++) {
              v.fromBufferAttribute(pos, idx.getX(i + k));
              v.applyMatrix4(hull.matrixWorld).applyMatrix4(inv);   // 转到组局部坐标
              if (Math.abs(v.x + BX) < 0.08) onPlane++;
              if (v.x > -3.66) allPorch = false;
              ys += v.y;
            }
            if (allPorch) { cutPorch++; continue; }
            // 正墙：三个点都贴在那个平面上、而且重心低于门楣上沿 -> 整片挖掉
            if (onPlane === 3 && ys / 3 < CEIL + 0.12) { cutWall++; continue; }
            for (let k = 0; k < 3; k++) keep.push(idx.getX(i + k));
          }
          geo.setIndex(keep);
          console.log('[cliffhut] 挖掉旧正墙', cutWall, '个面 / 旧露台', cutPorch, '个面');
        }

        // ---- 2. 砌正墙：板条墙 + 真门洞 + 两扇窗 ----
        const sidingTex = texFromCanvas(makeWoodTexture('#6f6a5e', 'rgba(30,28,24,0.9)', 91), [1, 1]);
        function sidingMat(w, h) {
          const t = sidingTex.clone();
          t.needsUpdate = true;
          t.repeat.set(Math.max(1, Math.round(w / 1.7)), Math.max(1, Math.round(h / 1.7)));
          return new THREE.MeshStandardMaterial({ map: t, color: 0xd9d4c7, roughness: 0.95 });
        }
        const wallX = -BX - 0.02;
        const wy0 = FLR - 0.32, wy1 = CEIL + 0.06;   // 墙体从地板下皮砌到吊顶之上一点
        const wh = wy1 - wy0, wallZ = BW + 0.06;
        function wallPanel(z0, z1) {
          const len = Math.abs(z1 - z0);
          const b = new THREE.Mesh(new THREE.BoxGeometry(0.16, wh, len), sidingMat(len, wh));
          b.position.set(wallX, (wy0 + wy1) / 2, (z0 + z1) / 2);
          b.castShadow = true; b.receiveShadow = true;
          g.add(b);
        }
        wallPanel(-wallZ, -DOOR_W / 2);
        wallPanel(DOOR_W / 2, wallZ);
        const lintel = new THREE.Mesh(
          new THREE.BoxGeometry(0.16, wy1 - (FLR + DOOR_H), DOOR_W), sidingMat(DOOR_W, wy1 - (FLR + DOOR_H))
        );
        lintel.position.set(wallX, (FLR + DOOR_H + wy1) / 2, 0);
        lintel.castShadow = true;
        g.add(lintel);

        // 窗：窗套 + 暗玻璃 + 十字窗棂（玻璃做暗色板——屋里另有灯，不需要透光）
        function frontWindow(zc) {
          const w = 0.78, h = 1.02, yc = FLR + 1.62;
          const frame = new THREE.Mesh(new THREE.BoxGeometry(0.09, h + 0.2, w + 0.2), trimWood);
          frame.position.set(wallX - 0.08, yc, zc);
          frame.castShadow = true;
          g.add(frame);
          const glass = new THREE.Mesh(
            new THREE.BoxGeometry(0.05, h, w),
            new THREE.MeshStandardMaterial({ color: 0x28303a, roughness: 0.25, metalness: 0.15 })
          );
          glass.position.set(wallX - 0.1, yc, zc);
          g.add(glass);
          const barV = new THREE.Mesh(new THREE.BoxGeometry(0.07, h, 0.055), trimWood);
          barV.position.set(wallX - 0.13, yc, zc);
          g.add(barV);
          const barH = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.055, w), trimWood);
          barH.position.set(wallX - 0.13, yc, zc);
          g.add(barH);
        }
        frontWindow(-2.1);
        frontWindow(2.1);

        // 门套 + 门槛 + 敞开的门扇（门朝屋里开着，一眼就看得出能进）
        const jambZ = DOOR_W / 2 + 0.055;
        [-1, 1].forEach((s2) => {
          const j = new THREE.Mesh(new THREE.BoxGeometry(0.2, DOOR_H + 0.16, 0.13), darkWood);
          j.position.set(wallX - 0.04, FLR + (DOOR_H + 0.16) / 2, s2 * jambZ);
          j.castShadow = true;
          g.add(j);
        });
        const head = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.14, DOOR_W + 0.26), darkWood);
        head.position.set(wallX - 0.04, FLR + DOOR_H + 0.08, 0);
        head.castShadow = true;
        g.add(head);
        const sill = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.09, DOOR_W + 0.2), darkWood);
        sill.position.set(wallX + 0.02, FLR - 0.03, 0);
        g.add(sill);

        const hinge = new THREE.Group();
        hinge.position.set(wallX - 0.05, FLR, -DOOR_W / 2);
        hinge.rotation.y = 1.16;      // 约 66°：门扇朝屋里敞开
        g.add(hinge);
        const leafMat = new THREE.MeshStandardMaterial({
          map: texFromCanvas(makeWoodTexture('#6a4c30', 'rgba(24,14,6,0.9)', 23), [1, 2]), roughness: 0.9
        });
        const leaf = new THREE.Mesh(new THREE.BoxGeometry(0.07, DOOR_H - 0.05, DOOR_W - 0.02), leafMat);
        leaf.position.set(0, (DOOR_H - 0.05) / 2, (DOOR_W - 0.02) / 2);
        leaf.castShadow = true;
        hinge.add(leaf);

        // ---- 3. 屋里：地板 / 三面墙 / 吊顶 ----
        const floorMat = new THREE.MeshStandardMaterial({
          map: texFromCanvas(makeWoodTexture('#9a7148', 'rgba(42,26,14,0.85)', 33), [3.4, 3.4]), roughness: 0.95
        });
        const inWallMat = new THREE.MeshStandardMaterial({
          map: texFromCanvas(makeWoodTexture('#8a7256', 'rgba(40,30,20,0.8)', 57), [2.6, 1.6]), roughness: 0.95
        });
        const ceilMat = new THREE.MeshStandardMaterial({ color: 0x6b563d, roughness: 1 });

        const rf = new THREE.Mesh(new THREE.BoxGeometry(6.86, 0.12, 6.62), floorMat);
        rf.position.set(0, FLR + 0.02 - 0.06, 0);
        rf.receiveShadow = true;
        g.add(rf);
        const rc = new THREE.Mesh(new THREE.BoxGeometry(6.9, 0.14, 6.7), ceilMat);
        rc.position.set(0, CEIL + 0.07, 0);
        g.add(rc);
        const roomH = CEIL - FLR;
        const bwall = new THREE.Mesh(new THREE.BoxGeometry(0.12, roomH, 6.62), inWallMat);
        bwall.position.set(BX - 0.13, FLR + roomH / 2, 0);
        bwall.receiveShadow = true;
        g.add(bwall);
        [-1, 1].forEach((s2) => {
          const sw = new THREE.Mesh(new THREE.BoxGeometry(6.7, roomH, 0.12), inWallMat);
          sw.position.set(0, FLR + roomH / 2, s2 * (BW - 0.1));
          sw.receiveShadow = true;
          g.add(sw);
        });
        // 吊顶三根横梁，屋里不那么平
        [-2.0, 0, 2.0].forEach((bz) => {
          const beam = new THREE.Mesh(new THREE.BoxGeometry(6.6, 0.14, 0.12), darkWood);
          beam.position.set(0, CEIL - 0.02, bz);
          g.add(beam);
        });

        // ---- 4. 家具：床（就在屋里）、地毯、桌子、货箱 ----
        const bedLX = 2.05, bedLZ = 1.62;      // 靠后墙的右角，床头抵墙
        const bedFrame = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.34, 1.3), plankMat);
        bedFrame.position.set(bedLX, FLR + 0.19, bedLZ);
        bedFrame.castShadow = true; bedFrame.receiveShadow = true;
        g.add(bedFrame);
        const mattress = new THREE.Mesh(
          new THREE.BoxGeometry(1.96, 0.2, 1.16),
          new THREE.MeshStandardMaterial({ color: 0xe6dfcb, roughness: 0.95 })
        );
        mattress.position.set(bedLX, FLR + 0.46, bedLZ);
        mattress.castShadow = true;
        g.add(mattress);
        const blanket = new THREE.Mesh(
          new THREE.BoxGeometry(1.2, 0.09, 1.18),
          new THREE.MeshStandardMaterial({ color: 0x9d4a44, roughness: 0.95 })
        );
        blanket.position.set(bedLX - 0.4, FLR + 0.58, bedLZ);
        g.add(blanket);
        const pillow = new THREE.Mesh(
          new THREE.BoxGeometry(0.44, 0.16, 0.82),
          new THREE.MeshStandardMaterial({ color: 0xf0ebdd, roughness: 0.95 })
        );
        pillow.position.set(bedLX + 0.7, FLR + 0.62, bedLZ);
        g.add(pillow);
        const headboard = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.66, 1.3), plankMat);
        headboard.position.set(bedLX + 1.04, FLR + 0.5, bedLZ);
        headboard.castShadow = true;
        g.add(headboard);

        // 地毯（门口踩脚的那块）
        const rug = new THREE.Mesh(
          new THREE.BoxGeometry(2.3, 0.03, 1.5),
          new THREE.MeshStandardMaterial({ color: 0x7a3f38, roughness: 1 })
        );
        rug.position.set(0.7, FLR + 0.035, 0.1);
        rug.receiveShadow = true;
        g.add(rug);

        // 桌子 + 桌上的油灯
        const tableX = -2.35, tableZ = 1.75;
        const top = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.07, 0.7), plankMat);
        top.position.set(tableX, FLR + 0.72, tableZ);
        top.castShadow = true;
        g.add(top);
        [[-0.34, -0.26], [0.34, -0.26], [-0.34, 0.26], [0.34, 0.26]].forEach(([dx, dz]) => {
          const leg = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.72, 0.07), darkWood);
          leg.position.set(tableX + dx, FLR + 0.36, tableZ + dz);
          g.add(leg);
        });
        const lampBase = new THREE.Mesh(
          new THREE.CylinderGeometry(0.075, 0.095, 0.1, 8),
          new THREE.MeshStandardMaterial({ color: 0x8a6a3a, roughness: 0.4, metalness: 0.5 })
        );
        lampBase.position.set(tableX, FLR + 0.8, tableZ);
        g.add(lampBase);
        const lampGlass = new THREE.Mesh(
          new THREE.CylinderGeometry(0.062, 0.062, 0.17, 8),
          new THREE.MeshStandardMaterial({ color: 0xffd9a0, emissive: 0xff9a40, emissiveIntensity: 1.5, roughness: 0.6 })
        );
        lampGlass.position.set(tableX, FLR + 0.93, tableZ);
        g.add(lampGlass);

        // 角落两只货箱
        [[2.55, -2.5, 0.62], [1.85, -2.62, 0.46]].forEach(([cx2, cz2, sc]) => {
          const crate = new THREE.Mesh(new THREE.BoxGeometry(sc, sc, sc),
            new THREE.MeshStandardMaterial({ map: woodTexDark, roughness: 0.95 }));
          crate.position.set(cx2, FLR + sc / 2, cz2);
          crate.rotation.y = cx2 * 0.7;
          crate.castShadow = true; crate.receiveShadow = true;
          g.add(crate);
        });

        // 室内灯：吊灯一盏，白天也亮，进门才看得清
        const inLight = new THREE.PointLight(0xffc07a, 1.8, 9.5, 2);
        inLight.position.set(0.1, CEIL - 0.6, 0);
        g.add(inLight);
        const cord = new THREE.Mesh(
          new THREE.CylinderGeometry(0.015, 0.015, 0.55, 6),
          new THREE.MeshStandardMaterial({ color: 0x201810, roughness: 1 })
        );
        cord.position.set(0.1, CEIL - 0.3, 0);
        g.add(cord);
        const bulb = new THREE.Mesh(
          new THREE.SphereGeometry(0.11, 10, 8),
          new THREE.MeshStandardMaterial({ color: 0xffe3b0, emissive: 0xff9f45, emissiveIntensity: 1.6, roughness: 0.6 })
        );
        bulb.position.set(0.1, CEIL - 0.62, 0);
        g.add(bulb);

        // ---- 5. 露台：木台 + 栏杆（正面留缺口）+ 四级踏板 ----
        const deckW = DECK_X1 - DECK_X0;                  // 2.8m
        const deckCX = (DECK_X0 + DECK_X1) / 2;
        const deck = new THREE.Mesh(new THREE.BoxGeometry(deckW, 0.16, 6.86), plankMat);
        deck.position.set(deckCX, DECK - 0.08, 0);
        deck.castShadow = true; deck.receiveShadow = true;
        g.add(deck);
        // 台面压边
        [-1, 1].forEach((s2) => {
          const trim = new THREE.Mesh(new THREE.BoxGeometry(deckW + 0.06, 0.09, 0.1), darkWood);
          trim.position.set(deckCX, DECK + 0.01, s2 * 3.43);
          g.add(trim);
        });

        // 落地立柱：撑住露台外沿（顺便让吊脚的感觉保留下来）
        [[DECK_X0 + 0.12, -3.3], [DECK_X0 + 0.12, 3.3]].forEach(([px, pz]) => {
          const post = new THREE.Mesh(new THREE.BoxGeometry(0.16, DECK + 0.3, 0.16), darkWood);
          post.position.set(px, (DECK + 0.3) / 2 - 0.3, pz);
          post.castShadow = true;
          g.add(post);
        });

        // 栏杆：外沿一条，两侧各一条，正面中间留 1.5m 给台阶
        function rail(x0, z0, x1, z1) {
          const dx = x1 - x0, dz = z1 - z0;
          const len = Math.hypot(dx, dz);
          const g2 = new THREE.Group();
          g2.position.set((x0 + x1) / 2, DECK, (z0 + z1) / 2);
          g2.rotation.y = Math.atan2(dx, dz) + Math.PI / 2;
          const top2 = new THREE.Mesh(new THREE.BoxGeometry(len, 0.09, 0.1), trimWood);
          top2.position.y = 0.94;
          top2.castShadow = true;
          g2.add(top2);
          const mid = new THREE.Mesh(new THREE.BoxGeometry(len, 0.07, 0.07), trimWood);
          mid.position.y = 0.52;
          g2.add(mid);
          const n = Math.max(2, Math.round(len / 1.15));
          for (let i = 0; i <= n; i++) {
            const post = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.98, 0.1), trimWood);
            post.position.set(-len / 2 + (len / n) * i, 0.49, 0);
            post.castShadow = true;
            g2.add(post);
          }
          g.add(g2);
        }
        rail(DECK_X0, -3.4, DECK_X0, -0.78);   // 外沿左段
        rail(DECK_X0, 0.78, DECK_X0, 3.4);     // 外沿右段
        rail(DECK_X0, -3.4, DECK_X1, -3.4);    // 左端
        rail(DECK_X0, 3.4, DECK_X1, 3.4);      // 右端

        // 四级踏板：从露台外沿往岛心方向下到沙地
        const stepTops = [0.83, 0.62, 0.41, 0.20];
        for (let i = 0; i < STEP_N; i++) {
          const tp = stepTops[i];
          const cx2 = DECK_X0 - 0.17 - i * 0.34;
          const tread = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.09, 1.5), plankMat);
          tread.position.set(cx2, tp - 0.045, 0);
          tread.castShadow = true; tread.receiveShadow = true;
          g.add(tread);
          [-1, 1].forEach((s2) => {
            const side = new THREE.Mesh(new THREE.BoxGeometry(0.36, tp, 0.07), darkWood);
            side.position.set(cx2, tp / 2, s2 * 0.75);
            side.castShadow = true;
            g.add(side);
          });
        }
        // 台阶两侧的扶手柱
        [-1, 1].forEach((s2) => {
          const newel = new THREE.Mesh(new THREE.BoxGeometry(0.13, 1.1, 0.13), darkWood);
          newel.position.set(DECK_X0 + 0.02, DECK + 0.55, s2 * 0.82);
          newel.castShadow = true;
          g.add(newel);
        });

        // 门口壁灯：一盏就够，夜里这一点暖光就是"屋里有人"的记号
        const lampLX = wallX - 0.16, lampLZ = -jambZ - 0.42;
        const bracket = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.07, 0.07), darkWood);
        bracket.position.set(wallX - 0.12, FLR + 2.18, lampLZ);
        g.add(bracket);
        const lantern = new THREE.Mesh(
          new THREE.CylinderGeometry(0.1, 0.085, 0.24, 8),
          new THREE.MeshStandardMaterial({ color: 0xffd9a0, emissive: 0xff8a3a, emissiveIntensity: 1.2, roughness: 0.7 })
        );
        lantern.position.set(lampLX, FLR + 2.02, lampLZ);
        g.add(lantern);
        const porchLight = new THREE.PointLight(0xffa860, 0, 10, 2);
        porchLight.position.set(lampLX, FLR + 2.0, lampLZ);
        g.add(porchLight);
        nightLights.push({ light: porchLight, base: 1.0 });

        // ---- 6. 碰撞：四面墙（门那格留空）+ 室内地板 + 露台 + 踏板 ----
        const wallH = 4.6;
        const segZ = (BW + DOOR_W / 2) / 2;
        [-1, 1].forEach((s2) => {
          const p = toWorld(-BX, s2 * segZ);
          addCollider(p.x, p.z, 0.34, BW - DOOR_W / 2, wallH, gy, 'solid');
        });
        const pb = toWorld(BX, 0);
        addCollider(pb.x, pb.z, 0.34, 6.72, wallH, gy, 'solid');
        [-1, 1].forEach((s2) => {
          const p = toWorld(0, s2 * BW);
          addCollider(p.x, p.z, 6.96, 0.34, wallH, gy, 'solid');
        });
        const pf = toWorld(0, 0);
        addCollider(pf.x, pf.z, 6.9, 6.62, FLR - DECK + 0.02, gy + DECK, 'crate');
        const pd = toWorld(deckCX, 0);
        addCollider(pd.x, pd.z, deckW, 6.86, DECK + 0.7, gy - 0.7, 'crate');
        for (let i = 0; i < STEP_N; i++) {
          const p = toWorld(DECK_X0 - 0.17 - i * 0.34, 0);
          addCollider(p.x, p.z, 0.36, 1.5, stepTops[i] + 0.9, gy - 0.9, 'crate');
        }

        // 床：床垫中心就是「按 F 睡」的判定点
        const bp = toWorld(bedLX, bedLZ);
        beds.push({ x: bp.x, z: bp.z });

        console.log('[cliffhut] 海边渔屋重建', hx.toFixed(1), hz.toFixed(1),
          'gy', gy.toFixed(2), 'S', S, '屋身', (BX * 2).toFixed(2), '×', (BW * 2).toFixed(2),
          '门高', DOOR_H, '床', bp.x.toFixed(1), bp.z.toFixed(1));
      });
    }

    placeCliffHut();
