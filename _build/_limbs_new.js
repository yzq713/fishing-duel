      // ---- 背脊棘（恐龙：从颈后一路排到尾巴）----
      // 每根刺的根部都要按「那一处的背脊实际高度」落位，用固定 y 会让刺悬空。
      if (cfg.ridge) {
        const rg = cfg.ridge;
        const rMat = new THREE.MeshStandardMaterial({
          color: rg.color, roughness: 0.72, metalness: 0.04,
          emissive: cfg.emissive || 0x000000, emissiveIntensity: 0.22
        });
        const n = rg.n || 10;
        for (let i = 0; i < n; i++) {
          const t = i / (n - 1);
          const x = L * (0.34 - t * 0.80);
          const pt = Math.max(0, Math.min(1, x / L + 0.5));
          const backY = H * profAt(prof, pt)[0];
          const hh = H * (0.13 + 0.30 * Math.sin((0.12 + t * 0.86) * Math.PI));
          const spk = new THREE.Mesh(new THREE.ConeGeometry(H * 0.052, hh, 5), rMat);
          spk.position.set(x, backY + hh * 0.34, 0);
          spk.rotation.z = -0.34;
          spk.castShadow = true;
          g.add(spk);
        }
      }

      // ---- 后肢（恐龙：髋 → 大腿 → 膝 → 小腿 → 蹼足，整条链挂在一起）----
      if (cfg.hindLegs) {
        const hl = cfg.hindLegs;
        const lMat = new THREE.MeshStandardMaterial({ color: hl.color, roughness: 0.82, metalness: 0.03 });
        const clawMat = new THREE.MeshStandardMaterial({ color: hl.claw || 0x2a1a10, roughness: 0.46 });
        this.legs = [];
        const l1 = L * (hl.len || 0.15);
        const l2 = l1 * 0.86;
        for (let k = -1; k <= 1; k += 2) {
          const hip = new THREE.Group();
          hip.position.set(-L * 0.06, -H * 0.56, k * W * 0.52);
          hip.rotation.z = 0.55;               // 整条腿朝后下方伸
          hip.rotation.y = k * 0.10;
          g.add(hip);
          const thigh = new THREE.Mesh(new THREE.CylinderGeometry(H * 0.20, H * 0.14, l1, 7), lMat);
          thigh.position.y = -l1 * 0.5;
          thigh.castShadow = true;
          hip.add(thigh);
          const knee = new THREE.Group();
          knee.position.y = -l1;
          knee.rotation.z = -0.85;             // 膝盖回折，像水鸟收腿
          hip.add(knee);
          const shin = new THREE.Mesh(new THREE.CylinderGeometry(H * 0.12, H * 0.085, l2, 6), lMat);
          shin.position.y = -l2 * 0.5;
          shin.castShadow = true;
          knee.add(shin);
          const foot = new THREE.Mesh(makePaddleGeo(l2 * 0.76, l2 * 0.46, L * 0.008), clawMat);
          foot.rotation.x = -Math.PI / 2;
          foot.position.set(-l2 * 0.26, -l2 * 0.92, 0);
          knee.add(foot);
          this.legs.push({ g: hip, base: hip.rotation.z });
        }
      }

      // ---- 小前肢（恐龙：两条几乎没用的短手臂，但一眼认得出是谁）----
      if (cfg.foreArms) {
        const fa = cfg.foreArms;
        const aMat = new THREE.MeshStandardMaterial({ color: fa.color, roughness: 0.80 });
        const clawMat = new THREE.MeshStandardMaterial({ color: fa.claw || 0x2a1a10, roughness: 0.42 });
        this.arms = [];
        const a1 = L * (fa.len || 0.10);
        for (let k = -1; k <= 1; k += 2) {
          const arm = new THREE.Group();
          arm.position.set(L * 0.30, -H * 0.40, k * W * 0.66);
          arm.rotation.z = 1.15;               // 往前下方伸
          arm.rotation.y = k * 0.20;
          g.add(arm);
          const upper = new THREE.Mesh(new THREE.CylinderGeometry(H * 0.055, H * 0.042, a1, 6), aMat);
          upper.position.y = -a1 * 0.5;
          arm.add(upper);
          const elbow = new THREE.Group();
          elbow.position.y = -a1;
          elbow.rotation.z = -1.45;
          arm.add(elbow);
          const fore = new THREE.Mesh(new THREE.CylinderGeometry(H * 0.040, H * 0.030, a1 * 0.8, 6), aMat);
          fore.position.y = -a1 * 0.4;
          elbow.add(fore);
          const claw = new THREE.Mesh(new THREE.ConeGeometry(H * 0.022, a1 * 0.55, 4), clawMat);
          claw.position.y = -a1 * 0.92;
          claw.rotation.x = Math.PI;
          elbow.add(claw);
          this.arms.push(arm);
        }
      }
