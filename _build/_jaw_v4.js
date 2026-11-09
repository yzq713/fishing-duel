      // ---- 下颌 + 牙列 ----
      // 上颚不再外挂：吻部由身体放样自己收出来（PROF 在 0.80→1.0 之间线性收细），
      // 下颌只是贴在吻下缘的一条，绕吻根铰点开合。这样「嘴缝」就是体表的一条边，
      // 不会出现一块焊在脸上、接缝漏光的方块。
      if (cfg.jaw) {
        const jw = cfg.jaw;
        const underAt = (t) => -H * profAt(prof, Math.max(0, Math.min(1, t)))[0];
        const wideAt = (t) => W * profAt(prof, Math.max(0, Math.min(1, t)))[1];
        const t0 = jw.root != null ? jw.root : 0.78;
        const t1 = Math.min(1.02, t0 + (jw.len || 0.24));
        const rootX = (t0 - 0.5) * L;
        const jawLen = (t1 - t0) * L;
        const rootY = underAt(t0);
        const tipY = underAt(Math.min(1, t1));
        const slope = Math.atan2(tipY - rootY, jawLen);   // 吻下缘是一条斜线，下颌跟着斜
        const d0 = -rootY * (jw.big ? 0.66 : 0.52);
        const d1 = d0 * 0.52;
        const w0 = wideAt(t0) * 2 * (jw.wide || 0.86);

        const lowMat = new THREE.MeshStandardMaterial({
          color: new THREE.Color(cfg.belly).lerp(new THREE.Color(cfg.back), 0.34),
          roughness: 0.58, metalness: 0.04
        });
        const toothMat = new THREE.MeshStandardMaterial({ color: 0xf6f1e0, roughness: 0.30 });
        const gumMat = new THREE.MeshStandardMaterial({ color: 0x2b1114, roughness: 0.9 });

        const lowPivot = new THREE.Group();
        lowPivot.position.set(rootX, rootY, 0);
        lowPivot.rotation.z = slope - (jw.open || 0.10);
        g.add(lowPivot);
        this.jaw = lowPivot;
        this.jawBase = lowPivot.rotation.z;

        const low = new THREE.Mesh(makeTaperBox(jawLen, d0, d1, w0, w0 * 0.44), lowMat);
        low.position.set(jawLen * 0.5, -d0 * 0.5, 0);
        low.castShadow = true;
        lowPivot.add(low);

        // 口腔：下颌顶面一条暗线，张嘴时是黑的
        const gum = new THREE.Mesh(
          new THREE.BoxGeometry(jawLen * 0.96, d0 * 0.10, w0 * 0.84), gumMat
        );
        gum.position.set(jawLen * 0.5, d0 * 0.02, 0);
        lowPivot.add(gum);

        // 牙列：上排倒挂在吻下缘，下排长在下颌顶，越靠前越小
        const nT = jw.teeth || 12;
        const tH = H * (jw.tooth || 0.20);
        const tR = H * (jw.toothR || 0.030);
        for (let i = 0; i < nT; i++) {
          const f = 0.06 + (i / Math.max(1, nT - 1)) * 0.84;
          const t = t0 + (t1 - t0) * f;
          const k = 0.55 + 0.45 * Math.sin(Math.min(1, f * 1.35) * Math.PI * 0.82);
          const halfWi = wideAt(t) * 0.66;
          const dAt = d0 + (d1 - d0) * f;
          for (let sg = -1; sg <= 1; sg += 2) {
            const upT = new THREE.Mesh(new THREE.ConeGeometry(tR * k, tH * k, 5), toothMat);
            upT.position.set((t - 0.5) * L, underAt(t) - tH * k * 0.34, sg * halfWi);
            upT.rotation.x = Math.PI;
            upT.rotation.z = -0.05;
            g.add(upT);
            const loT = new THREE.Mesh(new THREE.ConeGeometry(tR * k * 0.92, tH * k * 0.84, 5), toothMat);
            loT.position.set(jawLen * f, -(d0 - dAt) * 0.5 + tH * k * 0.34, sg * halfWi * 0.94);
            loT.rotation.z = 0.04;
            lowPivot.add(loT);
          }
        }
      }
