      // ---- 背帆（沧龙：史前巨兽的招牌剪影）----
      // 帆面和帆骨必须共用同一条高度曲线，否则帆骨会一根根从帆背上戳出来。
      // 帆面顶缘做成「帆骨之间略微下凹」的扇形，帆骨正好卡在峰上。
      if (cfg.sail) {
        const sf = cfg.sail;
        const x0 = L * (sf.from != null ? sf.from : -0.34);
        const x1 = L * (sf.to != null ? sf.to : 0.26);
        const sw = x1 - x0;
        const nR = sf.n || 8;
        const hBase = (t) => sf.h * Math.pow(Math.sin(Math.PI * (0.10 + 0.86 * t)), 0.72);
        const hAt = (t) => hBase(t) * (0.86 + 0.14 * Math.abs(Math.cos(Math.PI * t * nR)));

        const NS = 26;
        const shp = new THREE.Shape();
        shp.moveTo(x0, 0);
        for (let i = 1; i <= NS; i++) {
          const t = i / NS;
          shp.lineTo(x0 + sw * t, hAt(t));
        }
        shp.lineTo(x0, 0);
        const sGeo = new THREE.ExtrudeGeometry(shp, { depth: L * 0.018, bevelEnabled: false, curveSegments: 4 });
        sGeo.translate(0, 0, -L * 0.009);
        const sMat = new THREE.MeshStandardMaterial({
          color: sf.color, roughness: 0.62, metalness: 0.05, side: THREE.DoubleSide,
          transparent: true, opacity: 0.93,
          emissive: cfg.emissive || 0x000000, emissiveIntensity: 0.45
        });
        const baseY = H * 0.52;              // 帆根埋进背里一点，接缝不会漏
        const sail = new THREE.Mesh(sGeo, sMat);
        sail.position.set(0, baseY, 0);
        sail.castShadow = true;
        g.add(sail);
        this.sail = sail;

        // 帆骨：细杆，卡在帆面顶缘的峰上，只比帆面低一点点，所以不会戳出来
        const rodMat = new THREE.MeshStandardMaterial({ color: sf.rod || sf.color, roughness: 0.74 });
        for (let i = 0; i < nR; i++) {
          const t = i / Math.max(1, nR - 1);
          const rh = hBase(t) * 0.94;
          const rod = new THREE.Mesh(new THREE.CylinderGeometry(L * 0.004, L * 0.008, rh, 4), rodMat);
          rod.position.set(x0 + sw * t, baseY + rh * 0.5, 0);
          rod.rotation.z = -0.06;
          g.add(rod);
        }
      }
