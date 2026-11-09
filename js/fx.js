/* 视觉特效：弹道、枪口火光、命中火花、弹壳、弹孔、血雾、水波 */
(function () {
  const THREE = window.THREE;

  const FX = {
    scene: null,
    items: [],
    holes: [],
    glowTex: null,
    opts: {},
    groundAt: function () { return 0.02; }
  };

  function makeGlowTexture() {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.25, 'rgba(255,220,150,0.85)');
    grad.addColorStop(1, 'rgba(255,180,80,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  }

  // 烟雾纹理：多个柔和圆斑叠加，避免单圆过于规则
  function makeSmokeTexture() {
    const s = 128;
    const c = document.createElement('canvas');
    c.width = c.height = s;
    const g = c.getContext('2d');
    for (let i = 0; i < 16; i++) {
      const x = 30 + Math.random() * 68;
      const y = 30 + Math.random() * 68;
      const r = 12 + Math.random() * 28;
      const a = 0.14 + Math.random() * 0.18;
      const grad = g.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, 'rgba(255,255,255,' + a + ')');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grad;
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
    }
    return new THREE.CanvasTexture(c);
  }

  // 弹孔贴图：中心黑洞 + 撞击白环 + 放射状裂纹 + 烧蚀晕
  // 生成 4 种变体轮流用，避免所有弹孔长得一模一样
  function makeHoleTextures() {
    const out = [];
    for (let v = 0; v < 4; v++) {
      const S = 128;
      const c = document.createElement('canvas');
      c.width = c.height = S;
      const g = c.getContext('2d');
      g.clearRect(0, 0, S, S);
      const cx = S / 2, cy = S / 2;
      // 烧蚀晕（外圈灰黑）
      const halo = g.createRadialGradient(cx, cy, 4, cx, cy, S * 0.46);
      halo.addColorStop(0, 'rgba(24,20,18,0.95)');
      halo.addColorStop(0.42, 'rgba(40,34,30,0.55)');
      halo.addColorStop(0.75, 'rgba(52,46,40,0.16)');
      halo.addColorStop(1, 'rgba(52,46,40,0)');
      g.fillStyle = halo;
      g.fillRect(0, 0, S, S);

      // 不规则破碎圈
      g.beginPath();
      const jag = 9 + v * 2;
      for (let i = 0; i <= jag; i++) {
        const a = (i / jag) * Math.PI * 2;
        const r = S * (0.13 + Math.random() * 0.055);
        const x = cx + Math.cos(a) * r;
        const y = cy + Math.sin(a) * r;
        if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
      }
      g.closePath();
      g.fillStyle = 'rgba(14,12,10,1)';
      g.fill();

      // 中心孔
      g.beginPath();
      g.arc(cx, cy, S * (0.062 + Math.random() * 0.012), 0, Math.PI * 2);
      g.fillStyle = 'rgba(6,5,5,1)';
      g.fill();

      // 放射裂纹
      const cracks = 5 + v;
      for (let i = 0; i < cracks; i++) {
        const a = Math.random() * Math.PI * 2;
        let r = S * 0.15;
        let x = cx + Math.cos(a) * r;
        let y = cy + Math.sin(a) * r;
        g.beginPath();
        g.moveTo(x, y);
        const steps = 3 + Math.floor(Math.random() * 3);
        for (let k = 0; k < steps; k++) {
          r += S * (0.045 + Math.random() * 0.06);
          const aa = a + (Math.random() - 0.5) * 0.55;
          x = cx + Math.cos(aa) * r;
          y = cy + Math.sin(aa) * r;
          g.lineTo(x, y);
        }
        g.strokeStyle = 'rgba(20,17,15,' + (0.5 + Math.random() * 0.35) + ')';
        g.lineWidth = 1.1 + Math.random() * 1.5;
        g.stroke();
      }
      // 撞击亮边（浅色碎屑，让孔有厚度）
      g.beginPath();
      g.arc(cx, cy, S * 0.145, 0, Math.PI * 2);
      g.strokeStyle = 'rgba(196,184,168,0.28)';
      g.lineWidth = 2;
      g.stroke();

      const tex = new THREE.CanvasTexture(c);
      tex.anisotropy = 4;
      out.push(tex);
    }
    return out;
  }

  // 水波贴图：几层柔和的同心环，比 RingGeometry 的硬边更像水
  function makeWaterRingTexture() {
    const S = 256;
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const g = c.getContext('2d');
    const cx = S / 2, cy = S / 2;
    for (let k = 0; k < 3; k++) {
      const r0 = S * (0.26 + k * 0.14);
      const w = S * (0.045 - k * 0.008);
      g.beginPath();
      g.arc(cx, cy, r0, 0, Math.PI * 2);
      g.strokeStyle = 'rgba(255,255,255,' + (0.5 - k * 0.12) + ')';
      g.lineWidth = w;
      g.stroke();
      // 内侧柔光
      g.beginPath();
      g.arc(cx, cy, r0 - w * 0.9, 0, Math.PI * 2);
      g.strokeStyle = 'rgba(255,255,255,' + (0.18 - k * 0.05) + ')';
      g.lineWidth = w * 1.6;
      g.stroke();
    }
    const tex = new THREE.CanvasTexture(c);
    return tex;
  }

  FX.init = function (scene, opts) {
    FX.scene = scene;
    FX.opts = opts || {};
    if (typeof FX.opts.groundAt === 'function') FX.groundAt = FX.opts.groundAt;
    if (!FX.glowTex) {
      FX.glowTex = makeGlowTexture();
      FX.smokeTex = makeSmokeTexture();
      FX.holeTex = makeHoleTextures();
      FX.waterTex = makeWaterRingTexture();
    }

    // ---- 枪口火光：光源与精灵都只建一次 ----
    // 原来每开一枪就 new 一个 PointLight 加进场景、80ms 后再删掉。
    // three.js 的着色器是按「场景里点光源数量」编译的，灯一进一出，
    // 全场每个材质都要重新编译一次 → 第一次开枪必卡一大下，连射也一直抖。
    // 现在改成常驻一盏 intensity=0 的灯，开火时搬位置、给亮度。
    if (!FX.flashLight) {
      FX.flashLight = new THREE.PointLight(0xffbe66, 0, 7, 2);
      FX.flashLight.position.set(0, -50, 0);
      FX.flashLight.castShadow = false;
      FX.scene.add(FX.flashLight);
      FX.flashT = 0;
      FX.flashMax = 0.08;
      FX.flashBase = 0;

      const spMat = new THREE.SpriteMaterial({
        map: FX.glowTex, color: 0xffcf7a, transparent: true,
        blending: THREE.AdditiveBlending, depthWrite: false
      });
      FX.flashSprite = new THREE.Sprite(spMat);
      FX.flashSprite.visible = false;
      FX.scene.add(FX.flashSprite);

      // 弹孔材质与网格提前建好：第一次开枪时不再临时编译
      holeMat(0xffffff);
      for (let i = 0; i < 8; i++) {
        const m = new THREE.Mesh(holeGeo, holeMat(0xffffff));
        m.visible = false;
        m.frustumCulled = false;
        FX.holePool = FX.holePool || [];
        FX.holePool.push(m);
        FX.scene.add(m);
      }
    }
  };

  // 首次开枪卡顿的真正来源：曳光弹 / 枪口烟 / 血雾 / 火花 / 弹壳 / 弹孔
  // 这些材质都是「打第一枪时才 new 出来的」，而 three 的着色器是按材质参数
  // 首次使用时编译的 —— 于是第一枪那一帧要停下来编译十几个 shader。
  //
  // 光调 renderer.compile() 没用：它只遍历场景里「可见」的对象，这些特效
  // 此刻根本还不存在。所以这里干脆把每一类特效都真造一颗、摆到镜头前面、
  // 渲染一帧，再立刻撤掉。做一次之后 program 就进了缓存，之后开枪零编译。
  FX.warmup = function (renderer, camera) {
    if (!renderer || !camera) return;
    camera.updateMatrixWorld(true);
    const base = new THREE.Vector3();
    camera.getWorldPosition(base);
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion).normalize();
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion).normalize();
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion).normalize();
    const at = base.clone().addScaledVector(fwd, 1.6);
    const mark = FX.items.length;
    const holeMark = FX.holes.length;

    try {
      FX.tracer(base, at, 0xffe6a8);
      FX.muzzleFlash(at, fwd, 1.1);
      FX.muzzleSmoke(at, fwd, 1.3);
      FX.bloodMist(at, fwd, 3);
      FX.sparks(at, 0xffd166, 6);
      FX.debris(at, fwd, 0xb5a894, 4);
      FX.ripple(at, 0xbfe9ff, 1);
      FX.bulletHole(at, fwd.clone().negate(), 'wood');
      FX.shell(at, right, up, fwd, {});
      FX.hitRing(at, 0xff6a5a);
      FX.killBurst(at);
    } catch (e) { /* 任何一类失败都不该拖垮启动 */ }

    try { renderer.compile(FX.scene, camera); } catch (e) { /* 老版本 three 没有 compile */ }
    // compile() 只准备 program，纹理上传 / VAO 还得真渲染一帧才完成。
    // 这一帧发生在加载阶段，玩家看不到。
    try { renderer.render(FX.scene, camera); } catch (e) { /* ignore */ }

    // 立刻撤掉。注意：对象可以扔，材质不要 dispose ——
    // material.dispose() 会把 program 的引用计数减到 0，three 顺手删掉 program，
    // 那样这轮预热就白做了。
    for (let i = FX.items.length - 1; i >= mark; i--) {
      const it = FX.items[i];
      if (it && it.obj && it.obj.parent) it.obj.parent.remove(it.obj);
    }
    FX.items.length = mark;
    for (let i = FX.holes.length - 1; i >= holeMark; i--) {
      const m = FX.holes[i];
      m.visible = false;
      m.position.set(0, -999, 0);
    }
    if (FX.flashSprite) FX.flashSprite.visible = false;
    if (FX.flashLight) FX.flashLight.intensity = 0;
    FX.flashT = 0;
  };

  FX.tracer = function (from, to, color) {
    const mat = new THREE.LineBasicMaterial({
      color: color || 0xffe6a8,
      transparent: true,
      opacity: 0.9
    });
    const geo = new THREE.BufferGeometry().setFromPoints([from.clone(), to.clone()]);
    const line = new THREE.Line(geo, mat);
    line.frustumCulled = false;
    FX.scene.add(line);
    FX.items.push({ kind: 'tracer', obj: line, life: 0, max: 0.09 });
  };

  FX.muzzleFlash = function (pos, dir, power) {
    const p = power || 1;
    if (!FX.flashSprite) return;
    FX.flashSprite.visible = true;
    FX.flashSprite.position.copy(pos);
    FX.flashSprite.material.opacity = 1;
    FX.flashSprite.scale.setScalar(1.1 * p);
    FX.flashT = 0.0001;
    FX.flashMax = 0.09;
    FX.flashBase = 1.1 * p;
    if (FX.flashLight) {
      FX.flashLight.position.copy(pos);
      FX.flashLight.distance = 6 * p;
      FX.flashLight.intensity = 2.2 * p;
    }
  };

  // 枪口烟雾：数团柔烟沿枪口方向喷出，缓慢上浮、膨胀、淡出
  FX.muzzleSmoke = function (pos, dir, power) {
    const p = power || 1;
    const n = p > 1.2 ? 5 : 3;
    for (let i = 0; i < n; i++) {
      const mat = new THREE.SpriteMaterial({
        map: FX.smokeTex,
        color: 0xdde3e6,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        rotation: Math.random() * Math.PI * 2
      });
      const s = new THREE.Sprite(mat);
      s.position.copy(pos).addScaledVector(dir, 0.06 + i * 0.05);
      const base = (0.2 + Math.random() * 0.16) * Math.max(0.85, p);
      s.scale.setScalar(base);
      FX.scene.add(s);

      const jitter = new THREE.Vector3(
        Math.random() - 0.5,
        Math.random() - 0.5,
        Math.random() - 0.5
      ).normalize();
      const vel = dir.clone().multiplyScalar(0.75 + Math.random() * 1.2 * p)
        .add(new THREE.Vector3(0, 0.22 + Math.random() * 0.26, 0))
        .addScaledVector(jitter, 0.28);

      FX.items.push({
        kind: 'smoke', obj: s, life: 0, max: 0.48 + Math.random() * 0.42,
        vel, base, grow: 1.5 + Math.random() * 1.1,
        spin: (Math.random() - 0.5) * 1.4,
        op: 0.36 * (0.7 + Math.random() * 0.5) * Math.min(1.4, p)
      });
    }
  };

  // ---------------- 弹壳 ----------------
  const SHELL_MAX = 26;
  const shellGeo = new THREE.CylinderGeometry(0.0075, 0.0085, 0.028, 8, 1);
  const shellMat = new THREE.MeshStandardMaterial({
    color: 0xd8a63f, metalness: 0.9, roughness: 0.32
  });
  const shellMatSteel = new THREE.MeshStandardMaterial({
    color: 0x9aa2a8, metalness: 0.85, roughness: 0.42
  });
  let shellCount = 0;

  // ejectPos: 抛壳口世界坐标；right/up/forward: 相机基向量
  FX.shell = function (ejectPos, right, up, forward, opts) {
    const o = opts || {};
    if (shellCount > SHELL_MAX) return;
    const mesh = new THREE.Mesh(shellGeo, o.steel ? shellMatSteel : shellMat);
    mesh.scale.setScalar(o.big ? 1.6 : 1);
    mesh.position.copy(ejectPos);
    mesh.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
    mesh.castShadow = false;
    FX.scene.add(mesh);
    shellCount++;

    // 初速：向枪的右侧抛出、稍向上、带一点前冲，再叠加随机
    const vel = new THREE.Vector3()
      .addScaledVector(right, 1.7 + Math.random() * 0.9)
      .addScaledVector(up, 1.5 + Math.random() * 0.8)
      .addScaledVector(forward, 0.35 + Math.random() * 0.5);
    vel.x += (Math.random() - 0.5) * 0.5;
    vel.z += (Math.random() - 0.5) * 0.5;

    FX.items.push({
      kind: 'shell', obj: mesh, life: 0, max: 7.5,
      vel, landed: false, bounces: 0,
      spin: new THREE.Vector3(
        (Math.random() - 0.5) * 22,
        (Math.random() - 0.5) * 22,
        (Math.random() - 0.5) * 22
      )
    });
  };

  // ---------------- 弹孔 ----------------
  const HOLE_MAX = 64;
  const HOLE_LIFE = 22;          // 停留 22 秒，最后 4 秒淡出
  let holeIdx = 0;
  const holeGeo = new THREE.PlaneGeometry(1, 1);
  const holeMats = {};

  function holeMat(color) {
    const key = color;
    if (holeMats[key]) return holeMats[key];
    const m = new THREE.MeshBasicMaterial({
      map: FX.holeTex[0],
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4
    });
    m.color.setHex(color == null ? 0xffffff : color);
    holeMats[key] = m;
    return m;
  }

  // point: 命中点；normal: 表面法线；kind: 'stone'|'wood'|'metal'|'ground'|'flesh'
  FX.bulletHole = function (point, normal, kind) {
    if (!FX.holeTex) return;
    let mesh;
    if (FX.holePool && FX.holePool.length) {
      // 复用 init 时预先建好的弹孔，第一次开枪不会临时编译材质
      mesh = FX.holePool.pop();
      mesh.renderOrder = 3;
      FX.holes.push(mesh);
    } else if (FX.holes.length < HOLE_MAX) {
      mesh = new THREE.Mesh(holeGeo, holeMat(0xffffff));
      mesh.frustumCulled = false;
      mesh.renderOrder = 3;
      FX.holes.push(mesh);
      FX.scene.add(mesh);
    } else {
      // 池满：复用最老的那个
      mesh = FX.holes[holeIdx % FX.holes.length];
      holeIdx++;
    }

    const n = (normal || new THREE.Vector3(0, 1, 0)).clone().normalize();
    const scale = kind === 'wood' ? 0.30 : kind === 'metal' ? 0.22 : 0.26;
    const s = scale * (0.85 + Math.random() * 0.4);
    mesh.visible = true;
    mesh.scale.set(s, s, s);
    mesh.position.copy(point).addScaledVector(n, 0.014);

    // 让贴图平面朝向法线，并随机自转，弹孔方向不会整齐划一
    const q = new THREE.Quaternion();
    q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
    mesh.quaternion.copy(q);
    mesh.rotateZ(Math.random() * Math.PI * 2);

    // 每次换一张贴图变体
    const mat = mesh.material;
    mat.map = FX.holeTex[Math.floor(Math.random() * FX.holeTex.length)];
    if (kind === 'wood') mat.color.setHex(0x4a3a26);
    else if (kind === 'metal') mat.color.setHex(0x7e888f);
    else if (kind === 'ground') mat.color.setHex(0x6d6350);
    else mat.color.setHex(0xbfb8ac);
    mat.opacity = 0.95;
    mat.needsUpdate = true;

    mesh.userData.born = performance.now() / 1000;
    mesh.userData.life = HOLE_LIFE;
  };

  // 弹孔随时间淡出（用真实时间，顿帧时不会一停就全消失）
  function updateHoles() {
    const now = performance.now() / 1000;
    for (let i = FX.holes.length - 1; i >= 0; i--) {
      const m = FX.holes[i];
      const age = now - (m.userData.born || now);
      const left = (m.userData.life || HOLE_LIFE) - age;
      if (left <= 0) {
        m.visible = false;
        m.position.set(0, -999, 0);
        continue;
      }
      if (left < 4) m.material.opacity = 0.95 * (left / 4);
    }
  }

  FX.clearHoles = function () {
    FX.holes.forEach((m) => {
      FX.scene.remove(m);
    });
    FX.holes.length = 0;
  };

  // ---------------- 血雾 / 碎屑 ----------------
  FX.bloodMist = function (pos, dir, amount) {
    const n = amount || 7;
    for (let i = 0; i < n; i++) {
      const mat = new THREE.SpriteMaterial({
        map: FX.smokeTex,
        color: 0x8e1c18,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        rotation: Math.random() * Math.PI * 2
      });
      const s = new THREE.Sprite(mat);
      s.position.copy(pos);
      const base = 0.12 + Math.random() * 0.14;
      s.scale.setScalar(base);
      FX.scene.add(s);
      const vel = dir.clone().multiplyScalar(1.2 + Math.random() * 2.2)
        .add(new THREE.Vector3(
          (Math.random() - 0.5) * 1.2,
          (Math.random() - 0.3) * 1.4,
          (Math.random() - 0.5) * 1.2
        ));
      FX.items.push({
        kind: 'blood', obj: s, life: 0, max: 0.35 + Math.random() * 0.4,
        vel, base, grow: 1.4 + Math.random() * 1.2,
        op: 0.5 + Math.random() * 0.35
      });
    }
  };

  FX.debris = function (pos, normal, color, count) {
    const n = count || 8;
    const geo = new THREE.BoxGeometry(0.03, 0.03, 0.03);
    const mat = new THREE.MeshStandardMaterial({ color: color || 0xb5a894, roughness: 0.9 });
    const grp = new THREE.Group();
    const vels = [];
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(geo, mat);
      m.position.copy(pos);
      m.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
      m.scale.setScalar(0.6 + Math.random() * 1.1);
      grp.add(m);
      vels.push(normal.clone().multiplyScalar(1.6 + Math.random() * 2.6)
        .add(new THREE.Vector3(
          (Math.random() - 0.5) * 2.4,
          Math.random() * 2.0 + 0.4,
          (Math.random() - 0.5) * 2.4
        )));
    }
    FX.scene.add(grp);
    FX.items.push({ kind: 'debris', obj: grp, life: 0, max: 0.9, vels });
  };

  FX.sparks = function (pos, color, count) {
    const n = count || 8;
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(n * 3);
    const vels = [];
    for (let i = 0; i < n; i++) {
      positions[i * 3] = pos.x;
      positions[i * 3 + 1] = pos.y;
      positions[i * 3 + 2] = pos.z;
      const v = new THREE.Vector3(
        (Math.random() - 0.5) * 4,
        Math.random() * 3.4,
        (Math.random() - 0.5) * 4
      );
      vels.push(v);
    }
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      color: color || 0xffc270,
      size: 0.16,
      transparent: true,
      opacity: 1,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    const points = new THREE.Points(geo, mat);
    FX.scene.add(points);
    FX.items.push({ kind: 'sparks', obj: points, life: 0, max: 0.55, vels });
  };

  // 水面涟漪：三层柔环叠加，扩散速度不同，比硬边圆环自然得多
  FX.ripple = function (pos, color, size) {
    if (!FX.waterTex) return;
    const base = size || 1;
    for (let i = 0; i < 3; i++) {
      const mat = new THREE.SpriteMaterial({
        map: FX.waterTex,
        color: color == null ? 0xbfe9ff : color,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        depthTest: true,
        blending: THREE.AdditiveBlending
      });
      const s = new THREE.Sprite(mat);
      s.position.set(pos.x, (pos.y || 0) + 0.012, pos.z);
      s.scale.setScalar(base * 0.35);
      FX.scene.add(s);
      FX.items.push({
        kind: 'wripple', obj: s, life: -i * 0.16, max: 1.5 + i * 0.12,
        base, growth: 2.1 + i * 0.5, op: 0.42 / (i + 1)
      });
    }
  };

  FX.hitRing = function (pos, color) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.25, 0.42, 18),
      new THREE.MeshBasicMaterial({
        color: color || 0xff6a5a,
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
        side: THREE.DoubleSide
      })
    );
    ring.position.copy(pos);
    ring.lookAt(pos.clone().add(new THREE.Vector3(0, 0, 1)));
    FX.scene.add(ring);
    FX.items.push({ kind: 'hitring', obj: ring, life: 0, max: 0.4 });
  };

  // 击倒爆发：白金色冲击环 + 火花，配合顿帧强化击杀反馈
  FX.killBurst = function (pos) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.32, 0.52, 28),
      new THREE.MeshBasicMaterial({
        color: 0xfff0b0,
        transparent: true,
        opacity: 1,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide
      })
    );
    ring.position.copy(pos);
    ring.lookAt(pos.clone().add(new THREE.Vector3(0, 0, 1)));
    FX.scene.add(ring);
    FX.items.push({ kind: 'killring', obj: ring, life: 0, max: 0.55 });
    FX.sparks(pos, 0xffd166, 26);

    const flash = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: FX.glowTex,
        color: 0xfff3c4,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      })
    );
    flash.position.copy(pos);
    flash.scale.setScalar(3.4);
    FX.scene.add(flash);
    FX.items.push({ kind: 'flash', obj: flash, life: 0, max: 0.22, dir: new THREE.Vector3(0, 0, 0), base: 3.4 });
  };

  FX.update = function (dt) {
    // 常驻枪口火光：只衰减亮度与缩放，不增删光源
    if (FX.flashT > 0 && FX.flashSprite) {
      FX.flashT += dt;
      const fp = Math.min(1, FX.flashT / (FX.flashMax || 0.09));
      FX.flashSprite.material.opacity = Math.max(0, 1 - fp);
      FX.flashSprite.scale.setScalar((FX.flashBase || 1) * (1 + fp * 1.1));
      if (FX.flashLight) FX.flashLight.intensity = Math.max(0, 2.2 * (1 - fp));
      if (fp >= 1) {
        FX.flashT = 0;
        FX.flashSprite.visible = false;
        if (FX.flashLight) FX.flashLight.intensity = 0;
      }
    }
    updateHoles();
    for (let i = FX.items.length - 1; i >= 0; i--) {
      const it = FX.items[i];
      it.life += dt;
      if (it.life < 0) continue;                // 涟漪有延迟启动
      const p = Math.min(1, it.life / it.max);

      if (it.kind === 'tracer') {
        it.obj.material.opacity = Math.max(0, 0.9 * (1 - p));
      } else if (it.kind === 'flash') {
        it.obj.material.opacity = Math.max(0, 1 - p);
        it.obj.scale.setScalar((it.base || 1.1) * (1 + p * 1.1));
        it.obj.position.addScaledVector(it.dir, 0.02);
      } else if (it.kind === 'killring') {
        it.obj.scale.setScalar(1 + p * 6);
        it.obj.material.opacity = Math.max(0, 1 - p);
      } else if (it.kind === 'light') {
        it.obj.intensity = Math.max(0, 2.2 * (1 - p));
      } else if (it.kind === 'sparks') {
        const attr = it.obj.geometry.getAttribute('position');
        for (let k = 0; k < it.vels.length; k++) {
          const v = it.vels[k];
          v.y -= 7 * dt;
          attr.array[k * 3] += v.x * dt;
          attr.array[k * 3 + 1] += v.y * dt;
          attr.array[k * 3 + 2] += v.z * dt;
        }
        attr.needsUpdate = true;
        it.obj.material.opacity = Math.max(0, 1 - p);
      } else if (it.kind === 'shell') {
        const v = it.vel;
        if (!it.landed) {
          v.y -= 11 * dt;
          it.obj.position.addScaledVector(v, dt);
          it.obj.rotation.x += it.spin.x * dt;
          it.obj.rotation.y += it.spin.y * dt;
          it.obj.rotation.z += it.spin.z * dt;
          const gy = FX.groundAt(it.obj.position.x, it.obj.position.z) + 0.01;
          if (it.obj.position.y <= gy && v.y < 0) {
            it.obj.position.y = gy;
            if (it.bounces < 2 && Math.abs(v.y) > 0.7) {
              v.y = -v.y * 0.34;
              v.x *= 0.55; v.z *= 0.55;
              it.spin.multiplyScalar(0.45);
              it.bounces++;
              if (FX.opts.onShellBounce) FX.opts.onShellBounce(it.obj.position, 0.35);
            } else {
              // 躺平：弹壳侧躺在地上
              it.landed = true;
              v.set(0, 0, 0);
              it.obj.rotation.x = Math.PI / 2;
              it.obj.rotation.z = Math.random() * Math.PI;
              if (FX.opts.onShellBounce) FX.opts.onShellBounce(it.obj.position, 1);
            }
          }
        }
        // 最后 1.2 秒缩小消失
        if (p > 0.84) it.obj.scale.setScalar(Math.max(0.001, (1 - (p - 0.84) / 0.16)) * (it.obj.userData.big ? 1.6 : 1));
      } else if (it.kind === 'blood') {
        it.obj.position.addScaledVector(it.vel, dt);
        it.vel.multiplyScalar(Math.max(0, 1 - 3.4 * dt));
        it.vel.y -= 5.5 * dt;
        it.obj.scale.setScalar(it.base + it.grow * p);
        const fadeIn = Math.min(1, p * 9);
        it.obj.material.opacity = Math.max(0, it.op * fadeIn * (1 - p) * (1 - p));
      } else if (it.kind === 'debris') {
        for (let k = 0; k < it.vels.length; k++) {
          const v = it.vels[k];
          v.y -= 12 * dt;
          const m = it.obj.children[k];
          m.position.addScaledVector(v, dt);
          m.rotation.x += dt * 7;
          m.rotation.z += dt * 5;
        }
        if (p > 0.7) {
          const s = Math.max(0.001, 1 - (p - 0.7) / 0.3);
          it.obj.children.forEach((m) => { m.scale.setScalar(s); });
        }
      } else if (it.kind === 'wripple') {
        // 扩散：先快后慢，边缘淡出
        const e = 1 - Math.pow(1 - p, 2.2);
        it.obj.scale.setScalar(it.base * (0.35 + e * it.growth));
        const fadeIn = Math.min(1, p * 6);
        it.obj.material.opacity = Math.max(0, it.op * fadeIn * Math.pow(1 - p, 1.7));
      } else if (it.kind === 'ripple') {
        it.obj.scale.setScalar(1 + p * 5);
        it.obj.material.opacity = Math.max(0, 0.8 * (1 - p));
      } else if (it.kind === 'hitring') {
        it.obj.scale.setScalar(1 + p * 2);
        it.obj.material.opacity = Math.max(0, 0.9 * (1 - p));
      } else if (it.kind === 'smoke') {
        // 惯性 + 阻力 + 上浮
        it.obj.position.addScaledVector(it.vel, dt);
        it.vel.multiplyScalar(Math.max(0, 1 - 2.1 * dt));
        it.vel.y += 0.3 * dt;
        it.obj.scale.setScalar(it.base + it.grow * p);
        it.obj.material.rotation += it.spin * dt;
        // 快速淡入再缓慢淡出
        const fadeIn = Math.min(1, p * 7);
        it.obj.material.opacity = Math.max(0, it.op * fadeIn * Math.pow(1 - p, 1.5));
      }

      if (it.life >= it.max) {
        FX.scene.remove(it.obj);
        if (it.kind === 'shell') shellCount = Math.max(0, shellCount - 1);
        if (it.kind === 'debris') {
          it.obj.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
          if (it.obj.children[0]) it.obj.children[0].material.dispose();
        } else {
          if (it.obj.geometry) it.obj.geometry.dispose();
          if (it.obj.material) it.obj.material.dispose();
        }
        FX.items.splice(i, 1);
      }
    }
  };

  FX.clear = function () {
    FX.items.forEach((it) => {
      FX.scene.remove(it.obj);
      if (it.obj.geometry) it.obj.geometry.dispose();
      if (it.obj.material && it.obj.material.dispose) it.obj.material.dispose();
    });
    FX.items.length = 0;
    shellCount = 0;
    FX.clearHoles();
  };

  window.FX = FX;
})();
