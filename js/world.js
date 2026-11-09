/* 海岛竞技场：地形、掩体、水塘、碰撞与射线查询 */
(function () {
  const THREE = window.THREE;
  const TAU = Math.PI * 2;

  const World = {};

  World.create = function (scene) {
    const colliders = [];
    const noGrassZones = [];
    const noGrassRects = [];
    const doors = [];
    const beds = [];
    const seats = [];
    const tables = [];
    const nightLights = [];
    // 异步加载的建筑（渔屋这类 glb）在加载完成前还不能往 colliders 里塞盒子，
    // 但商店选址是同步跑的 —— 不先占个位，店就会盖到房子身上。
    const reservedFootprints = [];
    function inNoGrassZone(x, z) {
      for (let i = 0; i < noGrassZones.length; i++) {
        const zn = noGrassZones[i];
        if (Math.hypot(x - zn.x, z - zn.z) < zn.r) return true;
      }
      // 房屋按矩形精确排除，避免旋转房屋角落仍长草
      for (let i = 0; i < noGrassRects.length; i++) {
        const r = noGrassRects[i];
        if (x > r.minX && x < r.maxX && z > r.minZ && z < r.maxZ) return true;
      }
      return false;
    }
    function addNoGrassRect(x, z, w, d, m) {
      const pad = m == null ? 1.1 : m;
      noGrassRects.push({
        minX: x - w / 2 - pad, maxX: x + w / 2 + pad,
        minZ: z - d / 2 - pad, maxZ: z + d / 2 + pad
      });
    }
    // 湖半径：7.5 时只是一汪小水塘，撑不起"水乡"的体量。放大到 10.4 后
    // 最宽处约 15.8m、最窄 5.0m，中央能真正跑开一条船的形状。
    // 注意：所有建筑/石头/树/草丛都靠 pondRadiusAt 避让，放大后会自动让位。
    const pond = { x: 0, z: 0, r: 10.4 };
    // 湖面高度（略低于岸边石沿，开放水面，可直接看清水下）
    const POND_TOP = 0.03;
    const boundaryR = 40;
    const root = new THREE.Group();
    scene.add(root);

    // 不规则水塘：半径随角度起伏
    function pondRadiusAt(a) {
      return pond.r * (1 +
        0.26 * Math.sin(a * 2 + 0.7) +
        0.17 * Math.sin(a * 3 + 2.1) +
        0.09 * Math.cos(a * 5 + 1.3));
    }

    // 形状采样（shape 的 y 对应世界 -z，故取负保持与碰撞一致）
    function pondPoints(scale) {
      const pts = [];
      const N = 72;
      for (let i = 0; i < N; i++) {
        const a = (i / N) * TAU;
        const rr = pondRadiusAt(a) * scale;
        pts.push(new THREE.Vector2(Math.cos(a) * rr, -Math.sin(a) * rr));
      }
      return pts;
    }

    // 不规则岛岸：七个不同频率的正弦叠加。
    // 原来只有 3 个低频项，最长的那一项绕一圈才起伏 3 次，海岸线看起来
    // 就是一个"捏扁的圆"。加上 8/11/17/26 次谐波后，岬角、湾口、碎石滩都有了。
    const COAST = [
      [3, 1.0, 0.085, 'sin', 'a * 3.0 + 1.0'],
      [5, 2.5, 0.055, 'sin', 'a * 5.0 + 2.5'],
      [2, 0.3, 0.035, 'cos', 'a * 2.0 + 0.3'],
      [8, 0.7, 0.030, 'sin', 'a * 8.0 + 0.7'],
      [11, 3.9, 0.021, 'cos', 'a * 11.0 + 3.9'],
      [17, 5.1, 0.014, 'sin', 'a * 17.0 + 5.1'],
      [26, 1.9, 0.009, 'sin', 'a * 26.0 + 1.9']
    ];
    function islandRadiusAt(a) {
      let k = 1;
      for (let i = 0; i < COAST.length; i++) {
        const c = COAST[i];
        k += c[2] * (c[3] === 'sin' ? Math.sin(a * c[0] + c[1]) : Math.cos(a * c[0] + c[1]));
      }
      return 39 * k;
    }

    function islandPoints(offset) {
      const pts = [];
      const N = 96;
      for (let i = 0; i < N; i++) {
        const a = (i / N) * TAU;
        const rr = islandRadiusAt(a) + (offset || 0);
        pts.push(new THREE.Vector2(Math.cos(a) * rr, -Math.sin(a) * rr));
      }
      return pts;
    }

    // ---------- 小山坡地形：高度场 ----------
    const hills = [
      { x: 18, z: -6, r: 7, h: 2.2 },
      { x: -16, z: 10, r: 6, h: 1.8 },
      { x: -4, z: -20, r: 8, h: 2.6 },
      { x: 12, z: 20, r: 5.5, h: 1.6 }
    ];

    // 平滑隆起：余弦剖面，边缘坡度趋近于 0，过渡更自然平缓
    function hillProfile(d, r, h) {
      if (d >= r) return 0;
      const t = d / r;
      return h * (1 + Math.cos(Math.PI * t)) * 0.5;
    }
    function heightAt(x, z) {
      let y = 0;
      for (const hl of hills) {
        const d = Math.hypot(x - hl.x, z - hl.z);
        y += hillProfile(d, hl.r, hl.h);
      }
      return y;
    }
    // 山坡判定：物件落在坡面上即视为“卡在山丘”，不再生成
    function onHill(x, z, pad) {
      let y = 0;
      for (const hl of hills) {
        const d = Math.max(0, Math.hypot(x - hl.x, z - hl.z) - (pad || 0));
        y += hillProfile(d, hl.r, hl.h);
      }
      return y > 0.16;
    }

    // ---------- 天空 ----------
    // 三段渐变 + 程序化云层 + 太阳光晕，比纯色渐变更有空气感
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(240, 64, 32),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        uniforms: {
          time: { value: 0 },
          topColor: { value: new THREE.Color(0x3f7fae) },
          midColor: { value: new THREE.Color(0x9cc0d6) },
          botColor: { value: new THREE.Color(0xdfe7e0) },
          sunColor: { value: new THREE.Color(0xfff4e0) },
          sunDir: { value: new THREE.Vector3(24, 34, 18).normalize() },
          bloodAmt: { value: 0 },
          dayAmt: { value: 0 }
        },
        vertexShader:
          'varying vec3 vPos; void main(){ vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader: [
          'varying vec3 vPos;',
          'uniform float time;',
          'uniform vec3 topColor; uniform vec3 midColor; uniform vec3 botColor;',
          'uniform vec3 sunColor; uniform vec3 sunDir;',
          'uniform float bloodAmt;',
          'uniform float dayAmt;',
          'float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }',
          'float noise(vec2 p){',
          '  vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);',
          '  float a = hash(i), b = hash(i+vec2(1.0,0.0)), c = hash(i+vec2(0.0,1.0)), d = hash(i+vec2(1.0,1.0));',
          '  return mix(mix(a,b,f.x), mix(c,d,f.x), f.y);',
          '}',
          'float fbm(vec2 p){ float v=0.0, a=0.5; for(int i=0;i<5;i++){ v+=a*noise(p); p=p*2.07+13.7; a*=0.5; } return v; }',
          'void main(){',
          '  vec3 d = normalize(vPos);',
          '  float up = clamp(d.y, 0.0, 1.0);',
          '  float down = clamp(-d.y, 0.0, 1.0);',
          '  // 天顶到地平线：指数曲线让天顶颜色更饱和、地平线更亮更暖',
          '  vec3 c = mix(midColor, topColor, pow(up, 0.42));',
          '  c = mix(c, botColor, pow(1.0 - up, 7.0) * 0.92);',
          '  c = mix(c, botColor * 0.72, pow(down, 0.55) * 0.78);',
          // 血夜：地平线一圈暗红辉光，像远处在烧
          '  c += vec3(0.72, 0.075, 0.055) * pow(1.0 - abs(d.y), 9.0) * bloodAmt * 1.35;',
          '  vec3 sd = normalize(sunDir);',
          '  float s = max(dot(d, sd), 0.0);',
          '  // 太阳周围的大范围暖色散射',
          '  c += sunColor * pow(s, 5.0) * 0.085;',
          '  c += sunColor * pow(s, 150.0) * 0.10;',
          '  // 云层：两层不同尺度的 fbm，叠加后更接近真实云团的絮状结构',
          '  vec2 uv = d.xz / max(0.075, d.y + 0.20) * 0.58;',
          '  float c1 = fbm(uv * 1.05 + vec2(time * 0.0055, 0.0));',
          '  float c2 = fbm(uv * 2.65 + vec2(3.7, 1.2) - vec2(time * 0.0038, 0.0));',
          '  float cl = c1 * 0.74 + c2 * 0.36;',
          '  float mask = smoothstep(0.47, 0.73, cl) * smoothstep(0.0, 0.20, d.y);',
          '  // 云团受阳光照亮：迎光面偏暖白，背光面偏灰蓝，产生体积感',
          '  float lit = clamp(0.52 + 0.48 * s, 0.0, 1.0);',
          '  vec3 cloudCol = mix(vec3(0.60, 0.65, 0.72), vec3(1.0, 0.985, 0.95), lit);',
          '  cloudCol = mix(cloudCol, vec3(0.46, 0.065, 0.075) * (0.50 + lit * 0.85), bloodAmt);',
          '  c = mix(c, cloudCol, mask * 0.86);',
          // 日魇：蝠群把太阳遮住，云层压成脏灰、天光整体掉一档（保留一点点黄白让"太阳还在"）
          '  vec3 ash = mix(cloudCol, vec3(0.22, 0.215, 0.20), 0.72);',
          '  cloudCol = mix(cloudCol, ash, dayAmt);',
          '  c = mix(c, cloudCol, mask * 0.86 * (1.0 - dayAmt * 0.55));',
          '  c *= (1.0 - 0.10 * dayAmt);',
          '  c += vec3(0.30, 0.26, 0.17) * pow(1.0 - abs(d.y), 6.0) * dayAmt * 0.55;',
          '  // 太阳圆盘',
          '  c += sunColor * pow(s, 4200.0) * 1.35;',
          '  gl_FragColor = vec4(c, 1.0);',
          '}'
        ].join('\n')
      })
    );
    root.add(sky);

    // 星空：夜里才显现的点状星群
    const stars = (function buildStars() {
      const pos = [];
      for (let i = 0; i < 420; i++) {
        const u = Math.random() * TAU;
        const v = 0.06 + Math.random() * 0.94;
        const r = 198;
        pos.push(Math.cos(u) * Math.cos(v) * r, Math.sin(v) * r, Math.sin(u) * Math.cos(v) * r);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      const mat = new THREE.PointsMaterial({
        color: 0xdfe9ff, size: 2.1, sizeAttenuation: false,
        transparent: true, opacity: 0, depthWrite: false, fog: false
      });
      const pts = new THREE.Points(geo, mat);
      pts.frustumCulled = false;
      root.add(pts);
      return pts;
    })();

    // 血月：血夜时挂在天上的那一轮红月。
    // 一张 canvas（红盘 + 月面暗斑 + 外圈血色光晕）贴在 Sprite 上，
    // 平时 opacity=0；血夜随 bloodMix 淡入，不用改天空着色器。
    const bloodMoon = (function buildBloodMoon() {
      const c = document.createElement('canvas');
      c.width = c.height = 256;
      const ctx = c.getContext('2d');
      const halo = ctx.createRadialGradient(128, 128, 38, 128, 128, 128);
      halo.addColorStop(0, 'rgba(255, 88, 66, 0.50)');
      halo.addColorStop(0.42, 'rgba(210, 28, 28, 0.22)');
      halo.addColorStop(1, 'rgba(110, 0, 0, 0)');
      ctx.fillStyle = halo;
      ctx.fillRect(0, 0, 256, 256);
      ctx.beginPath();
      ctx.arc(128, 128, 74, 0, Math.PI * 2);
      const body = ctx.createRadialGradient(106, 106, 8, 128, 128, 82);
      body.addColorStop(0, '#ff8a64');
      body.addColorStop(0.5, '#d8201f');
      body.addColorStop(1, '#6e040e');
      ctx.fillStyle = body;
      ctx.fill();
      // 月面暗斑：几团更深的血色，避免看起来像一张纯红圆片
      ctx.globalAlpha = 0.32;
      ctx.fillStyle = '#44020a';
      [[104, 110, 17], [148, 136, 21], [122, 158, 12], [152, 102, 10], [98, 146, 9]].forEach((m) => {
        ctx.beginPath();
        ctx.arc(m[0], m[1], m[2], 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.globalAlpha = 1;
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({
        map: new THREE.CanvasTexture(c), transparent: true, opacity: 0, depthWrite: false, fog: false
      }));
      sp.scale.set(66, 66, 1);
      sp.position.set(-126, 92, -148);
      sp.visible = false;
      root.add(sp);
      return sp;
    })();

    // ---------- 光照 ----------
    // 光照分层思路：太阳是唯一主光（负责明暗对比与投影），半球光只补天光颜色，
    // 环境光压到极低。此前太阳在 17:12 只有 0.24 强度，全靠环境光撑亮画面，
    // 于是全场景没有明暗反差、看不见投影、整体发灰——这是画质发闷的第一主因。
    const hemi = new THREE.HemisphereLight(0xd0e2f2, 0x7d8a5e, 0.62);
    scene.add(hemi);

    const ambient = new THREE.AmbientLight(0xffffff, 0.05);
    scene.add(ambient);

    // 太阳方向（单位向量）与阴影覆盖范围：阴影相机跟随玩家，越紧越清晰
    const sunDirV = new THREE.Vector3(0.62, 0.58, 0.52).normalize();
    const SHADOW_HALF = 34;
    let shadowFocusX = 0, shadowFocusZ = 0;

    const sun = new THREE.DirectionalLight(0xfff2da, 2.7);
    sun.castShadow = true;
    sun.shadow.mapSize.set(4096, 4096);
    sun.shadow.camera.left = -SHADOW_HALF;
    sun.shadow.camera.right = SHADOW_HALF;
    sun.shadow.camera.top = SHADOW_HALF;
    sun.shadow.camera.bottom = -SHADOW_HALF;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 190;
    sun.shadow.camera.updateProjectionMatrix();
    sun.shadow.bias = -0.00035;                  // 缓解 shadow acne（条纹状伪影）
    sun.shadow.normalBias = 0.028;               // 缓解 peter panning（阴影脱离物体）
    sun.shadow.radius = 2.2;                     // PCF 柔化半径，边缘不再硬切
    scene.add(sun);
    scene.add(sun.target);

    // 把光源与阴影相机摆到「玩家 + 太阳方向」的位置；中心量化到 0.5m 格点，
    // 避免玩家移动时阴影贴图逐帧抖动（shadow shimmer）
    function placeSun() {
      const qx = Math.round(shadowFocusX * 2) / 2;
      const qz = Math.round(shadowFocusZ * 2) / 2;
      sun.position.set(qx + sunDirV.x * 78, sunDirV.y * 78, qz + sunDirV.z * 78);
      sun.target.position.set(qx, 0, qz);
      sun.target.updateMatrixWorld();
    }
    // 每帧调用：玩家走出 2m 以上才重排，兼顾清晰度与稳定性
    function focusShadow(x, z) {
      if (Math.abs(x - shadowFocusX) < 2 && Math.abs(z - shadowFocusZ) < 2) return;
      shadowFocusX = x;
      shadowFocusZ = z;
      placeSun();
    }
    placeSun();

    // 月光：夜间提供偏冷的低强度方向光，保证还能看清路和敌人
    const moon = new THREE.DirectionalLight(0xa8c0ff, 0);
    moon.position.set(-26, 32, -16);
    scene.add(moon);
    scene.add(moon.target);


    // ---------- 海 ----------
    // 逐像素波纹法线 + 菲涅尔 + 太阳镜面高光，远处手动混入雾色
    const oceanMat = new THREE.ShaderMaterial({
      uniforms: {
        time: { value: 0 },
        sunDir: { value: new THREE.Vector3(24, 34, 18).normalize() },
        sunColor: { value: new THREE.Color(0xfff0d4) },
        deepColor: { value: new THREE.Color(0x123a4a) },
        shallowColor: { value: new THREE.Color(0x2f7f88) },
        skyColor: { value: new THREE.Color(0x9dc2d4) },
        fogColor: { value: new THREE.Color(0xd8e4dc) },
        foamColor: { value: new THREE.Color(0xf4fbfa) },
        // 灯塔光束：塔位 + 两道对穿的光轴方向 + 夜间强度
        beamPos: { value: new THREE.Vector2(0, 0) },
        beamA: { value: new THREE.Vector2(0, 1) },
        beamB: { value: new THREE.Vector2(0, -1) },
        beamOn: { value: 0 },
        beamColor: { value: new THREE.Color(0xffd9a0) }
      },
      vertexShader:
        'varying vec3 vWorld; void main(){ vWorld = (modelMatrix * vec4(position,1.0)).xyz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: [
        'uniform float time; uniform vec3 sunDir; uniform vec3 sunColor;',
        'uniform vec3 deepColor; uniform vec3 shallowColor; uniform vec3 skyColor;',
        'uniform vec3 fogColor; uniform vec3 foamColor;',
        'uniform vec2 beamPos; uniform vec2 beamA; uniform vec2 beamB;',
        'uniform float beamOn; uniform vec3 beamColor;',
        // 灯塔打在海上的一团光：以塔为圆心、沿光轴方向切出一个随距离变宽的亮斑
        'float beamPool(vec2 p, vec2 dir){',
        '  vec2 d = p - beamPos;',
        '  float dist = length(d);',
        '  if (dist < 8.0) return 0.0;',
        // acos 每像素一次太贵，用 cos^k 近似同一道「越远越宽」的光锥剖面
        '  float ct = max(0.0, dot(d / dist, dir));',
        '  float hw = 0.055 + 1.05 / dist;',
        '  float core = pow(ct, 3.2 / (hw * hw));',
        '  float reach = smoothstep(8.0, 20.0, dist) * (1.0 - smoothstep(60.0, 88.0, dist));',
        '  return core * reach;',
        '}',
        'varying vec3 vWorld;',
        'float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }',
        'float noise(vec2 p){',
        '  vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);',
        '  float a = hash(i), b = hash(i+vec2(1.0,0.0)), c = hash(i+vec2(0.0,1.0)), d = hash(i+vec2(1.0,1.0));',
        '  return mix(mix(a,b,f.x), mix(c,d,f.x), f.y);',
        '}',
        'float fbm(vec2 p){ float v=0.0, a=0.5; for(int i=0;i<4;i++){ v+=a*noise(p); p=p*2.11+5.3; a*=0.5; } return v; }',
        // 与 JS 端 islandRadiusAt 完全一致，用于计算离岸距离
        // 与 JS 端 islandRadiusAt 完全一致（七项谐波），否则浅水带和沙滩会错位
        'float islandR(float a){',
        '  return 39.0 * (1.0 + 0.085*sin(a*3.0+1.0) + 0.055*sin(a*5.0+2.5) + 0.035*cos(a*2.0+0.3)',
        '    + 0.030*sin(a*8.0+0.7) + 0.021*cos(a*11.0+3.9) + 0.014*sin(a*17.0+5.1) + 0.009*sin(a*26.0+1.9));',
        '}',
        'float waveH(vec2 p, float t){',
        '  float h = 0.0;',
        '  h += sin(p.x*0.33 + t*0.85) * 0.55;',
        '  h += sin(p.y*0.27 - t*0.72) * 0.45;',
        '  h += sin((p.x+p.y)*0.21 + t*0.52) * 0.32;',
        '  h += sin((p.x-p.y*1.7)*0.72 + t*1.42) * 0.12;',
        '  return h;',
        '}',
        'void main(){',
        '  vec2 p = vWorld.xz;',
        '  float e = 0.42;',
        '  float h0 = waveH(p, time);',
        '  float hx = waveH(p + vec2(e, 0.0), time);',
        '  float hz = waveH(p + vec2(0.0, e), time);',
        '  vec2 g = vec2(hx - h0, hz - h0) / e;',
        // 细碎涟漪：fbm 的梯度叠在大波上，近处才有颗粒感
        '  float d = 0.06;',
        '  float n0 = fbm(p * 0.9 + time * 0.06);',
        '  float nx = fbm((p + vec2(d,0.0)) * 0.9 + time * 0.06);',
        '  float nz = fbm((p + vec2(0.0,d)) * 0.9 + time * 0.06);',
        '  g += vec2(nx - n0, nz - n0) / d * 0.22;',
        '  vec3 n = normalize(vec3(-g.x * 1.55, 1.0, -g.y * 1.55));',
        '  vec3 view = normalize(cameraPosition - vWorld);',
        // 离岸距离 → 近岸浅水色 + 沙滩反光
        '  float ang = atan(vWorld.z, vWorld.x);',
        '  float r = length(vWorld.xz);',
        '  float shoreD = r - islandR(ang);',
        '  float shallowMix = clamp(1.0 - shoreD / 16.0, 0.0, 1.0);',
        '  vec3 base = mix(deepColor, shallowColor, clamp(h0 * 0.5 + 0.5, 0.0, 1.0));',
        '  base = mix(base, shallowColor * 1.15, shallowMix * 0.75);',
        '  float fres = 0.025 + 0.975 * pow(1.0 - clamp(dot(view, n), 0.0, 1.0), 5.0);',
        '  vec3 col = mix(base, skyColor, clamp(fres, 0.0, 1.0) * 0.92);',
        // 太阳镜面：锐利高光 + 宽幅闪烁（glitter），是海面最出彩的部分
        '  vec3 hv = normalize(view + normalize(sunDir));',
        '  float nh = max(dot(n, hv), 0.0);',
        '  float spec = pow(nh, 480.0) * 3.4;',
        '  float glitter = pow(nh, 26.0) * 0.16;',
        '  col += sunColor * (spec + glitter);',
        // 浪花：贴岸白边 + 一道随噪声起伏的碎浪带
        '  float band = smoothstep(0.0, 1.4, shoreD) * (1.0 - smoothstep(1.4, 5.2, shoreD));',
        '  float fn = fbm(vWorld.xz * 1.25 + vec2(time * 0.12, -time * 0.09));',
        '  float foam = band * smoothstep(0.30, 0.62, fn + (1.0 - clamp(shoreD / 5.2, 0.0, 1.0)) * 0.26);',
        '  foam += smoothstep(0.0, 0.55, shoreD) * (1.0 - smoothstep(0.55, 1.35, shoreD)) * 0.8;',
        '  col = mix(col, foamColor, clamp(foam, 0.0, 1.0) * 0.92);',
        // 灯塔扫过水面的光斑：贴着浪的闪烁走，越远越弱
        'if (beamOn > 0.001) {',
        '  float pool = beamPool(vWorld.xz, beamA) + beamPool(vWorld.xz, beamB);',
        '  col += beamColor * pool * beamOn * (0.38 + glitter * 3.4 + spec * 0.25);',
        '}',
        // 远处融入雾色，做出空气透视
        '  float dist = length(cameraPosition - vWorld);',
        '  float fogF = 1.0 - exp(-pow(dist * 0.0042, 2.2));',
        '  col = mix(col, fogColor, clamp(fogF, 0.0, 1.0));',
        '  gl_FragColor = vec4(col, 1.0);',
        '}'
      ].join('\n')
    });
    const WATER_Y = -0.25;
    // polygonOffset：整片海几乎与视线平行时深度精度最差，贴着水面游泳
    // 会出现一条条闪动的干涉纹。把它往后推一点，稳定压在其他几何之下。
    oceanMat.polygonOffset = true;
    oceanMat.polygonOffsetFactor = -1;
    oceanMat.polygonOffsetUnits = -1;
    const ocean = new THREE.Mesh(new THREE.CircleGeometry(400, 64), oceanMat);
    ocean.rotation.x = -Math.PI / 2;
    ocean.position.y = WATER_Y;
    ocean.renderOrder = -1;
    root.add(ocean);

    // ---------- 远山 ----------
    // 原实现是一圈规整的圆锥，剪影过于几何、颜色又被雾刷成纸片。
    // 改为「山体簇」：每簇由 2~4 个被噪声扰动过的山峰叠在一起，
    // 顶点色从山脚（偏亮、偏蓝）渐变到山顶（偏深），配合雾形成层次。
    (function addDistantMountains() {
      const group = new THREE.Group();
      const rnd = mulberry32(20260931);

      function peakGeo(r, h, segs, seed) {
        const geo = new THREE.ConeGeometry(r, h, segs, 4, false);
        const pos = geo.attributes.position;
        const nz = makeValueNoise(seed, 8);
        const colors = [];
        // 远山几乎只剩"空气"：山脚更亮更蓝、山顶稍深，整体压得很淡
        const cBase = new THREE.Color(0xbccbc8);
        const cTop = new THREE.Color(0x93a6ae);
        const c = new THREE.Color();
        for (let i = 0; i < pos.count; i++) {
          const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
          const t = (y + h / 2) / h;                       // 0 山脚 → 1 山顶
          // 只在水平方向扰动，越靠山脚扰动越大，剪影才会自然起伏
          const ang = Math.atan2(z, x);
          const n = nz((ang + Math.PI) / (Math.PI * 2) * 8, t * 5 + seed % 7);
          // 扰动幅度下调，且随高度快速衰减：山脚有起伏、山顶保持圆润，
          // 否则整座山像一排尖刺
          const k = 1 + (n - 0.5) * 0.34 * (1.15 - t) * (1.15 - t);
          pos.setX(i, x * k);
          pos.setZ(i, z * k);
          pos.setY(i, y + (n - 0.5) * h * 0.10);
          c.copy(cBase).lerp(cTop, Math.pow(t, 0.7));
          colors.push(c.r, c.g, c.b);
        }
        geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        geo.computeVertexNormals();
        return geo;
      }

      const bands = [
        { rMin: 96, rMax: 114, count: 8, hMin: 17, hMax: 26, rMinP: 13, rMaxP: 21, col: 0x93a7b0 },
        { rMin: 126, rMax: 148, count: 7, hMin: 24, hMax: 36, rMinP: 17, rMaxP: 26, col: 0xa9b9c0 },
        { rMin: 164, rMax: 192, count: 6, hMin: 30, hMax: 46, rMinP: 20, rMaxP: 30, col: 0xc0cdd2 }
      ];

      bands.forEach((band, bi) => {
        for (let i = 0; i < band.count; i++) {
          const a = (i / band.count) * TAU + bi * 0.37 + rnd() * 0.28;
          const r = band.rMin + rnd() * (band.rMax - band.rMin);
          const massif = new THREE.Group();
          const peaks = 2 + Math.floor(rnd() * 3);
          const mat = new THREE.MeshStandardMaterial({
            vertexColors: true, roughness: 1, flatShading: true, fog: true
          });
          for (let k = 0; k < peaks; k++) {
            const pr = band.rMinP + rnd() * (band.rMaxP - band.rMinP);
            const ph = (band.hMin + rnd() * (band.hMax - band.hMin)) * (k === 0 ? 1 : 0.55 + rnd() * 0.4);
            const m = new THREE.Mesh(peakGeo(pr, ph, 10 + Math.floor(rnd() * 4), 1000 + bi * 97 + i * 13 + k), mat);
            m.position.set((rnd() - 0.5) * pr * 1.5, ph / 2 - 6, (rnd() - 0.5) * pr * 1.5);
            m.rotation.y = rnd() * TAU;
            massif.add(m);
          }
          // 整体色调按圈层往蓝灰里推，越远越淡
          mat.color.setHex(band.col);
          // 背光面留一点自发光，否则整座山会变成一团黑剪影
          mat.emissive = new THREE.Color(band.col);
          mat.emissiveIntensity = 0.3;
          massif.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
          group.add(massif);
        }
      });
      root.add(group);
    })();


    // ---------- 程序化地表纹理 ----------
    // 原实现是一张 1024² 的「单层噪点」，近看糊成一片、远看有明显重复格子。
    // 这里改成：可平铺的多倍频噪声生成高度场 → 由高度场派生颜色 + 法线，
    // 再额外给一张高频细节图，在着色器里二次相乘，近景才有颗粒感。

    function mulberry32(a) {
      return function () {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    }

    // 值噪声：坐标对 period 取模，保证贴图四边可无缝拼接
    function makeValueNoise(seed, period) {
      const rnd = mulberry32(seed);
      const g = new Float32Array(period * period);
      for (let i = 0; i < g.length; i++) g[i] = rnd();
      return function (x, y) {
        const xi = Math.floor(x), yi = Math.floor(y);
        const xf = x - xi, yf = y - yi;
        const u = xf * xf * (3 - 2 * xf);
        const v = yf * yf * (3 - 2 * yf);
        const x0 = ((xi % period) + period) % period;
        const y0 = ((yi % period) + period) % period;
        const x1 = (x0 + 1) % period, y1 = (y0 + 1) % period;
        const a = g[y0 * period + x0], b = g[y0 * period + x1];
        const c = g[y1 * period + x0], d = g[y1 * period + x1];
        return (a + (b - a) * u) * (1 - v) + (c + (d - c) * u) * v;
      };
    }

    // 由高度场生成切线空间法线图（Sobel 差分，环绕采样保证无缝）
    function heightToNormal(H, S, strength) {
      const cv = document.createElement('canvas');
      cv.width = cv.height = S;
      const ctx = cv.getContext('2d');
      const img = ctx.createImageData(S, S);
      const d = img.data;
      const at = (x, y) => H[(((y % S) + S) % S) * S + (((x % S) + S) % S)];
      for (let y = 0; y < S; y++) {
        for (let x = 0; x < S; x++) {
          const dx = (at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1)) -
                     (at(x - 1, y - 1) + 2 * at(x - 1, y) + at(x - 1, y + 1));
          const dy = (at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1)) -
                     (at(x - 1, y - 1) + 2 * at(x, y - 1) + at(x + 1, y - 1));
          let nx = -dx * strength, ny = -dy * strength, nz = 1;
          const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
          const i = (y * S + x) * 4;
          d[i] = (nx / len * 0.5 + 0.5) * 255;
          d[i + 1] = (ny / len * 0.5 + 0.5) * 255;
          d[i + 2] = (nz / len * 0.5 + 0.5) * 255;
          d[i + 3] = 255;
        }
      }
      ctx.putImageData(img, 0, 0);
      const tex = new THREE.CanvasTexture(cv);
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.anisotropy = 16;
      return tex;
    }

    // 通用地表：ramp 为 3 段颜色（暗部 / 中间调 / 亮部）
    function makeGroundTexSet(o) {
      const S = o.size || 1024;
      const octs = [[0.50, 3], [0.26, 6], [0.15, 12], [0.09, 24]];
      const noises = octs.map((oc, i) => makeValueNoise(o.seed + i * 131, oc[1]));
      const H = new Float32Array(S * S);
      for (let y = 0; y < S; y++) {
        const v = y / S;
        for (let x = 0; x < S; x++) {
          const u = x / S;
          let h = 0;
          for (let k = 0; k < octs.length; k++) h += octs[k][0] * noises[k](u * octs[k][1], v * octs[k][1]);
          H[y * S + x] = h;
        }
      }

      // 颜色：按高度做三段插值，再叠高频颗粒与零散碎石
      const cv = document.createElement('canvas');
      cv.width = cv.height = S;
      const ctx = cv.getContext('2d');
      const img = ctx.createImageData(S, S);
      const d = img.data;
      const c0 = o.ramp[0], c1 = o.ramp[1], c2 = o.ramp[2];
      const grain = makeValueNoise(o.seed + 777, 128);
      for (let y = 0; y < S; y++) {
        for (let x = 0; x < S; x++) {
          const idx = y * S + x;
          let t = (H[idx] - 0.28) / 0.46;
          t = t < 0 ? 0 : t > 1 ? 1 : t;
          let r, g, b;
          if (t < 0.5) {
            const k = t * 2;
            r = c0[0] + (c1[0] - c0[0]) * k;
            g = c0[1] + (c1[1] - c0[1]) * k;
            b = c0[2] + (c1[2] - c0[2]) * k;
          } else {
            const k = (t - 0.5) * 2;
            r = c1[0] + (c2[0] - c1[0]) * k;
            g = c1[1] + (c2[1] - c1[1]) * k;
            b = c1[2] + (c2[2] - c1[2]) * k;
          }
          // 高频颗粒：±9%，让材质在近景不「塑料」
          const gr = (grain(x / S * 128, y / S * 128) - 0.5) * 0.18;
          const i4 = idx * 4;
          d[i4] = Math.max(0, Math.min(255, (r + gr) * 255));
          d[i4 + 1] = Math.max(0, Math.min(255, (g + gr) * 255));
          d[i4 + 2] = Math.max(0, Math.min(255, (b + gr) * 255));
          d[i4 + 3] = 255;
        }
      }
      ctx.putImageData(img, 0, 0);

      // 零散碎石 / 苔斑：小圆点，避免整体过于均质
      const rnd = mulberry32(o.seed + 4242);
      for (let i = 0; i < (o.pebbles || 520); i++) {
        const x = rnd() * S, y = rnd() * S, r = 1.2 + rnd() * 3.4;
        const a = 0.10 + rnd() * 0.26;
        ctx.fillStyle = rnd() < 0.55
          ? 'rgba(226,226,214,' + a + ')'
          : 'rgba(48,54,36,' + a + ')';
        ctx.beginPath();
        ctx.ellipse(x, y, r, r * (0.6 + rnd() * 0.7), rnd() * 3.14, 0, TAU);
        ctx.fill();
      }
      // 少量草叶划痕，强化“草地”而非“水泥地”的观感
      if (o.blades !== false) {
        ctx.lineCap = 'round';
        for (let i = 0; i < 900; i++) {
          const x = rnd() * S, y = rnd() * S;
          const len = 4 + rnd() * 12;
          const ang = rnd() * Math.PI * 2;
          ctx.strokeStyle = 'rgba(' + (120 + rnd() * 70 | 0) + ',' + (150 + rnd() * 60 | 0) + ',' + (70 + rnd() * 40 | 0) + ',' + (0.06 + rnd() * 0.13) + ')';
          ctx.lineWidth = 0.6 + rnd() * 0.9;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len);
          ctx.stroke();
        }
      }

      const map = new THREE.CanvasTexture(cv);
      map.wrapS = map.wrapT = THREE.RepeatWrapping;
      map.anisotropy = 16;
      map.colorSpace = THREE.SRGBColorSpace;

      // 高频细节层：只保留细颗粒与短划痕，着色器里以更高频次相乘
      const DS = 512;
      const dcv = document.createElement('canvas');
      dcv.width = dcv.height = DS;
      const dctx = dcv.getContext('2d');
      dctx.fillStyle = '#808080';
      dctx.fillRect(0, 0, DS, DS);
      const dn = makeValueNoise(o.seed + 9001, 64);
      const dimg = dctx.getImageData(0, 0, DS, DS);
      const dd = dimg.data;
      for (let y = 0; y < DS; y++) {
        for (let x = 0; x < DS; x++) {
          const n = dn(x / DS * 64, y / DS * 64);
          const n2 = dn(x / DS * 32 + 11, y / DS * 32 + 5);
          const vul = 128 + (n - 0.5) * 96 + (n2 - 0.5) * 46;
          const i4 = (y * DS + x) * 4;
          dd[i4] = dd[i4 + 1] = dd[i4 + 2] = Math.max(0, Math.min(255, vul));
          dd[i4 + 3] = 255;
        }
      }
      dctx.putImageData(dimg, 0, 0);
      const detail = new THREE.CanvasTexture(dcv);
      detail.wrapS = detail.wrapT = THREE.RepeatWrapping;
      detail.anisotropy = 16;

      return { map, normal: heightToNormal(H, S, o.normalStrength || 3.2), detail };
    }

    // 在标准材质上挂「细节相乘」：用同一套 UV 再采一次高频图，暗部自然加深、
    // 亮部提亮，等于给地表加了一层不依赖贴图分辨率的微观起伏。
    function applyDetail(mat, detailTex, scale, contrast) {
      const uScale = { value: scale === undefined ? 7 : scale };
      const uContrast = { value: contrast === undefined ? 0.55 : contrast };
      mat.userData.detailUniforms = { uDetail: null, uDetailScale: uScale, uDetailContrast: uContrast };
      mat.onBeforeCompile = (shader) => {
        shader.uniforms.uDetail = { value: detailTex };
        shader.uniforms.uDetailScale = uScale;
        shader.uniforms.uDetailContrast = uContrast;
        shader.fragmentShader = shader.fragmentShader
          .replace('#include <map_pars_fragment>', '#include <map_pars_fragment>\nuniform sampler2D uDetail;\nuniform float uDetailScale;\nuniform float uDetailContrast;')
          .replace('#include <map_fragment>', [
            '#include <map_fragment>',
            '#ifdef USE_MAP',
            '  vec3 dtl = texture2D(uDetail, vMapUv * uDetailScale).rgb;',
            '  float dl = (dtl.r - 0.5) * 2.0;',
            '  diffuseColor.rgb *= (1.0 + dl * uDetailContrast);',
            '#endif'
          ].join('\n'));
      };
      mat.customProgramCacheKey = () => 'detail' + uScale.value;
      return mat;
    }

    const texGround = makeGroundTexSet({
      seed: 11,
      ramp: [[0.298, 0.365, 0.188], [0.435, 0.514, 0.259], [0.561, 0.612, 0.337]],
      normalStrength: 2.6
    });
    // 注意：ShapeGeometry / ExtrudeGeometry 的 uv 直接取自顶点世界坐标（单位=米），
    // 所以 repeat 就是「每米平铺几次」。0.12 ≈ 每 8.3m 一张图，配合细节层才自然。
    texGround.map.repeat.set(0.12, 0.12);
    texGround.normal.repeat.set(0.12, 0.12);

    // 山丘已改用与地面同一套草皮（见 buildHillGeo / hillMat），这里不再单独生成一份，
    // 省下 3 张 canvas 贴图，也保证交界处纹理完全连续。

    const texBeach = makeGroundTexSet({
      seed: 93,
      ramp: [[0.745, 0.690, 0.545], [0.843, 0.788, 0.647], [0.914, 0.871, 0.745]],
      normalStrength: 2.2,
      pebbles: 900,
      blades: false
    });
    texBeach.map.repeat.set(0.15, 0.15);
    texBeach.normal.repeat.set(0.15, 0.15);


    // ---------- 建筑 / 木器的程序化材质 ----------
    // 纯色材质在这种低多边形场景里最显“塑料”。这里用 canvas 画几张 512² 贴图：
    // 木板、抹灰墙、瓦片，配合法线就没有廉价感了。

    function texFromCanvas(cv, rep) {
      const t = new THREE.CanvasTexture(cv);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.anisotropy = 8;
      t.colorSpace = THREE.SRGBColorSpace;
      if (rep) t.repeat.set(rep[0], rep[1]);
      return t;
    }

    // 木板：横向板缝 + 木纹 + 节疤
    function makeWoodTexture(base, seam, seed) {
      const S = 512;
      const cv = document.createElement('canvas');
      cv.width = cv.height = S;
      const ctx = cv.getContext('2d');
      const rnd = mulberry32(seed || 17);
      ctx.fillStyle = base;
      ctx.fillRect(0, 0, S, S);
      const rows = 5;
      const rh = S / rows;
      for (let r = 0; r < rows; r++) {
        const y0 = r * rh;
        // 每块板的明度略有差异
        const d = 0.9 + rnd() * 0.2;
        ctx.fillStyle = 'rgba(255,255,255,' + ((d - 0.9) * 0.6) + ')';
        ctx.fillRect(0, y0, S, rh);
        // 木纹
        for (let i = 0; i < 34; i++) {
          ctx.strokeStyle = 'rgba(0,0,0,' + (0.03 + rnd() * 0.07) + ')';
          ctx.lineWidth = 0.8 + rnd() * 1.6;
          const yy = y0 + 4 + rnd() * (rh - 8);
          ctx.beginPath();
          ctx.moveTo(0, yy);
          for (let x = 0; x <= S; x += 32) {
            ctx.lineTo(x, yy + Math.sin((x / S) * 6.28 * (1 + rnd()) + i) * 2.4);
          }
          ctx.stroke();
        }
        // 节疤
        if (rnd() < 0.55) {
          const kx = rnd() * S, ky = y0 + rh * 0.5, kr = 4 + rnd() * 6;
          const gr = ctx.createRadialGradient(kx, ky, 0, kx, ky, kr * 2.4);
          gr.addColorStop(0, 'rgba(70,42,22,0.75)');
          gr.addColorStop(1, 'rgba(70,42,22,0)');
          ctx.fillStyle = gr;
          ctx.beginPath();
          ctx.ellipse(kx, ky, kr * 2.4, kr * 1.5, 0, 0, TAU);
          ctx.fill();
        }
        // 板缝
        ctx.fillStyle = seam;
        ctx.fillRect(0, y0 + rh - 3, S, 3);
      }
      return cv;
    }

    // 抹灰白墙：细颗粒 + 水渍 + 墙脚返潮
    function makePlasterTexture(base, seed) {
      const S = 512;
      const cv = document.createElement('canvas');
      cv.width = cv.height = S;
      const ctx = cv.getContext('2d');
      const rnd = mulberry32(seed || 31);
      ctx.fillStyle = base;
      ctx.fillRect(0, 0, S, S);
      const img = ctx.getImageData(0, 0, S, S);
      const d = img.data;
      for (let i = 0; i < S * S; i++) {
        const n = (rnd() - 0.5) * 16;
        d[i * 4] = Math.max(0, Math.min(255, d[i * 4] + n));
        d[i * 4 + 1] = Math.max(0, Math.min(255, d[i * 4 + 1] + n));
        d[i * 4 + 2] = Math.max(0, Math.min(255, d[i * 4 + 2] + n * 0.9));
      }
      ctx.putImageData(img, 0, 0);
      // 水渍
      for (let i = 0; i < 26; i++) {
        const x = rnd() * S, y = rnd() * S, r = 16 + rnd() * 60;
        const gr = ctx.createRadialGradient(x, y, 0, x, y, r);
        gr.addColorStop(0, 'rgba(150,148,132,' + (0.05 + rnd() * 0.08) + ')');
        gr.addColorStop(1, 'rgba(150,148,132,0)');
        ctx.fillStyle = gr;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, TAU);
        ctx.fill();
      }
      return cv;
    }

    // 瓦顶：一排排错位的瓦垄
    function makeTileTexture(base, dark, light) {
      const S = 512;
      const cv = document.createElement('canvas');
      cv.width = cv.height = S;
      const ctx = cv.getContext('2d');
      ctx.fillStyle = base;
      ctx.fillRect(0, 0, S, S);
      const rows = 8, cols = 8;
      const rh = S / rows, cw = S / cols;
      for (let r = 0; r < rows; r++) {
        const off = (r % 2) * cw * 0.5;
        for (let c = -1; c <= cols; c++) {
          const x = c * cw + off, y = r * rh;
          // 瓦片凸起的顶部高光
          const gr = ctx.createLinearGradient(0, y, 0, y + rh);
          gr.addColorStop(0, light);
          gr.addColorStop(0.45, base);
          gr.addColorStop(1, dark);
          ctx.fillStyle = gr;
          ctx.beginPath();
          ctx.moveTo(x + 1, y + rh);
          ctx.lineTo(x + 1, y + rh * 0.35);
          ctx.quadraticCurveTo(x + cw / 2, y - rh * 0.15, x + cw - 1, y + rh * 0.35);
          ctx.lineTo(x + cw - 1, y + rh);
          ctx.closePath();
          ctx.fill();
        }
        ctx.strokeStyle = 'rgba(18,20,22,0.55)';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(0, r * rh + rh - 1);
        ctx.lineTo(S, r * rh + rh - 1);
        ctx.stroke();
      }
      return cv;
    }

    const woodTex = texFromCanvas(makeWoodTexture('#a97c4e', 'rgba(48,30,16,0.85)', 17), [1, 1]);
    const woodTexDark = texFromCanvas(makeWoodTexture('#7d5b39', 'rgba(30,18,10,0.9)', 61), [1, 1]);
    const plasterTex = texFromCanvas(makePlasterTexture('#efece2', 31), [1, 1]);
    const plasterTex2 = texFromCanvas(makePlasterTexture('#e2ddcf', 87), [1, 1]);
    const tileTex = texFromCanvas(makeTileTexture('#4c5459', '#2c3236', '#6d777d'), [1, 1]);
    // 屋顶单独一份：Box 的 UV 是 0..1，一张 8 列瓦铺满 4m 长的屋面板，瓦垄有 0.5m 宽。
    // clone 一份把 repeat 提到 2.2，瓦垄才回到 0.2m 左右的真实尺度。
    const tileTexRoof = tileTex.clone();
    tileTexRoof.repeat.set(2.2, 2.2);
    tileTexRoof.needsUpdate = true;

    // 青石：台基、勒脚、窗台、石桩共用
    const texStone = makeGroundTexSet({
      seed: 131,
      ramp: [[0.560, 0.556, 0.524], [0.668, 0.662, 0.628], [0.772, 0.766, 0.732]],
      normalStrength: 2.2,
      pebbles: 1500,
      blades: false
    });
    texStone.map.repeat.set(1.6, 1.6);
    texStone.normal.repeat.set(1.6, 1.6);

    // ---------- 岛体（不规则岸线；水塘处同样开洞，露出湖底）----------
    const islandShape = new THREE.Shape(islandPoints(6));
    islandShape.holes.push(new THREE.Path(pondPoints(1.02)));
    const islandGeo = new THREE.ExtrudeGeometry(islandShape, { depth: 4.5, bevelEnabled: false });
    const island = new THREE.Mesh(
      islandGeo,
      new THREE.MeshStandardMaterial({ color: 0x6d6555, roughness: 1 })
    );
    island.rotation.x = -Math.PI / 2;
    island.position.y = -4.5;
    island.receiveShadow = true;
    root.add(island);

    // 沙滩：挤出成型的实体沙岸（顶面 + 侧壁），顶面高出草地可行走
    const BEACH_TOP = 0.12;
    const beachShape = new THREE.Shape(islandPoints(4.5));
    beachShape.holes.push(new THREE.Path(islandPoints(0)));
    const beachMat = new THREE.MeshStandardMaterial({
      color: 0xffffff, roughness: 0.92,
      map: texBeach.map, normalMap: texBeach.normal
    });
    beachMat.normalScale.set(0.65, 0.65);
    applyDetail(beachMat, texBeach.detail, 260, 0.30);
    const beach = new THREE.Mesh(
      new THREE.ExtrudeGeometry(beachShape, { depth: 0.6, bevelEnabled: false }),
      beachMat
    );
    beach.rotation.x = -Math.PI / 2;
    beach.position.y = BEACH_TOP - 0.6;
    beach.receiveShadow = true;
    // 沙滩是圈在岛外的大环，太阳一斜就在海面上投出一条笔直的黑带，
    // 看起来像水面上贴了一张纸，所以不让它投影。
    beach.castShadow = false;
    root.add(beach);

    // ---------- 地面（在水塘处开洞，露出湖底与湖水）----------
    const groundShape = new THREE.Shape(islandPoints(0.2));
    groundShape.holes.push(new THREE.Path(pondPoints(1.02)));
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0xffffff, roughness: 0.96,
      map: texGround.map, normalMap: texGround.normal
    });
    groundMat.normalScale.set(0.85, 0.85);
    applyDetail(groundMat, texGround.detail, 300, 0.55);
    const ground = new THREE.Mesh(new THREE.ShapeGeometry(groundShape), groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = 0.025;
    ground.receiveShadow = true;
    root.add(ground);

    // ---------- 山坡网格（与 heightAt 余弦剖面完全一致）----------
    // 顶点色做"底深顶浅"的草色渐变，取代原来的穹顶+盖帽两层拼接
    // 顶点色只做「明暗倾向」的乘算，不能再用接近本色的深绿，
    // 否则会和 map 二次相乘把山坡压成黑块
    // 顶点色只做「明暗倾向」的乘算。
    // 关键改动：山丘不再用自己那套草皮（seed 不同、平铺比例 0.16、径向 UV），
    // 那会让地面与山丘之间出现一圈明显的色带 + 纹理断层。现在山丘和地面共用
    // 同一张草皮、同一套世界平面 UV、同一个细节层倍率，交界处纹理是连续的。
    const cHillBase = new THREE.Color().setRGB(1, 1, 1);
    const cHillTop = new THREE.Color().setRGB(1.10, 1.07, 0.90);
    function buildHillGeo(cx, cz, r, h) {
      const rings = 22, segs = 56;
      const LIFT = 0.06;          // 抬离地面，避免与地面共面产生 z-fighting
      const totalRings = rings + 2;   // 主体环 + 两圈扎进地里的裙边
      const positions = [], uvs = [], colors = [], indices = [];
      positions.push(cx, h + LIFT, cz);
      uvs.push(cx, -cz);
      colors.push(cHillTop.r, cHillTop.g, cHillTop.b);
      for (let i = 1; i <= totalRings; i++) {
        let d, y;
        if (i <= rings) {
          const t = i / rings;
          d = t * r;
          y = hillProfile(d, r, h) + LIFT;
        } else if (i === rings + 1) {
          d = r * 1.015; y = -0.08 + LIFT;      // 裙边：一步扎到地面以下
        } else {
          d = r * 1.09; y = -0.42 + LIFT;
        }
        const cf = Math.max(0, Math.min(1, y / Math.max(0.001, h)));
        const cr = cHillBase.r + (cHillTop.r - cHillBase.r) * cf;
        const cg = cHillBase.g + (cHillTop.g - cHillBase.g) * cf;
        const cb = cHillBase.b + (cHillTop.b - cHillBase.b) * cf;
        for (let j = 0; j < segs; j++) {
          const a = (j / segs) * TAU;
          const px = cx + Math.cos(a) * d;
          const pz = cz + Math.sin(a) * d;
          positions.push(px, y, pz);
          // 与地面同一套世界平面 UV（ShapeGeometry 的 uv 也是米单位、y 轴翻转）
          uvs.push(px, -pz);
          colors.push(cr, cg, cb);
        }
      }
      for (let j = 0; j < segs; j++) {
        indices.push(0, 1 + (j + 1) % segs, 1 + j);
      }
      for (let i = 1; i < totalRings; i++) {
        for (let j = 0; j < segs; j++) {
          const a = (i - 1) * segs + 1 + j;
          const b = (i - 1) * segs + 1 + (j + 1) % segs;
          const c = i * segs + 1 + j;
          const dd = i * segs + 1 + (j + 1) % segs;
          indices.push(a, b, c, b, dd, c);
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
      geo.setIndex(indices);
      geo.computeVertexNormals();
      return geo;
    }

    const hillMat = new THREE.MeshStandardMaterial({
      color: 0xffffff, roughness: 0.96,
      map: texGround.map, normalMap: texGround.normal, vertexColors: true
    });
    hillMat.normalScale.set(0.85, 0.85);
    applyDetail(hillMat, texGround.detail, 300, 0.55);

    for (const hl of hills) {
      const dome = new THREE.Mesh(
        buildHillGeo(hl.x, hl.z, hl.r, hl.h),
        hillMat
      );
      dome.receiveShadow = true;
      dome.castShadow = true;
      root.add(dome);
    }

    // ---------- 水塘（不规则开放水面，带动态波纹与水下鱼群）----------
    const rimShape = new THREE.Shape(pondPoints(1.055));
    rimShape.holes.push(new THREE.Path(pondPoints(1.0)));
    // 湖岸沿用湿沙色（略深于沙滩），和草地、水面都能自然过渡
    const pondRimMat = new THREE.MeshStandardMaterial({
      color: 0xd3c6a8, roughness: 0.95, map: texBeach.map
    });
    pondRimMat.normalScale.set(0.4, 0.4);
    const pondRim = new THREE.Mesh(new THREE.ShapeGeometry(rimShape), pondRimMat);
    pondRim.rotation.x = -Math.PI / 2;
    pondRim.position.y = 0.035;
    pondRim.receiveShadow = true;
    root.add(pondRim);

    // 湖水：透明水面 + 波浪 + 塘鱼游动激起的水面涟漪 + 岸边可见的水下鱼群
    // 涟漪由 6 组 uniform 表示（x, z, 扩散进度, 强度），每条鱼定时在自己的位置激起一圈
    const RIP_N = 10;
    const rippleUni = {};
    let ripDecl = '';
    let ripCode = '';
    for (let i = 0; i < RIP_N; i++) {
      rippleUni['rip' + i] = { value: new THREE.Vector4(0, 0, 2, 0) };
      ripDecl += 'uniform vec4 rip' + i + ';\n';
      // 涟漪高度场：一个扩散中的波包，包内是连续的正弦环。
      // 原来的做法是"单个高斯亮环 + 直接加亮颜色"，所以看起来像发光的塑料圈。
      // 现在让它真正成为高度场的一部分，由后面的梯度计算转成法线，
      // 波纹就会随视角和阳光产生明暗、反光，而不是一圈固定的白线。
      ripCode +=
        '  {\n' +
        '    float d' + i + ' = length(p - rip' + i + '.xy);\n' +
        '    float rad' + i + ' = rip' + i + '.z * 3.1;\n' +
        '    float wid' + i + ' = 0.26 + rip' + i + '.z * 0.85;\n' +
        '    float env' + i + ' = exp(-pow((d' + i + ' - rad' + i + ') / wid' + i + ', 2.0));\n' +
        '    float amp' + i + ' = (1.0 - rip' + i + '.z) * (1.0 - rip' + i + '.z) * rip' + i + '.w;\n' +
        '    hR += sin((d' + i + ' - rad' + i + ') * 26.0) * env' + i + ' * amp' + i + ';\n' +
        '  }\n';
    }
    // ---------- 湖水素材：Fab「Little Pond & fish」（Mot Panda's Store · 免费）----------
    // 素材是一整块圆形池塘小景：半透明青水 + 一圈大叶子/白花/红蘑菇 + 3 条带骨骼动画的鱼。
    // 整块摆进来会和本作不规则的湖岸打架，所以这里只"取件"：
    //   1) 植被整片网格 —— 按径向**平移**贴到 pondRadiusAt 的不规则岸线上（不是缩放，
    //      叶子的形状与大小都保留，只有整丛被推近/推远）；
    //   2) 白色手绘水纹条 —— 拿原模型的几条当模板，散点铺在水面；
    //   3) 3 条鱼 —— 保留原骨骼层级和烘焙动画，整体压扁后放进浅水。
    const PondAsset = (function () {
      const INLINE = window.POND_ASSETS || null;
      const SRC_URL = 'assets/pond/pond_small.glb';
      let src = null;
      let state = 0;
      const queue = [];
      let loader = null;

      function b64buf(b64) {
        const bin = atob(b64);
        const u8 = new Uint8Array(bin.length);
        for (let n = 0; n < bin.length; n++) u8[n] = bin.charCodeAt(n);
        return u8.buffer;
      }
      function ready(g) {
        src = g;
        state = 2;
        const jobs = queue.splice(0, queue.length);
        jobs.forEach((fn) => { try { fn(g); } catch (e) { console.warn('[pond]', e); } });
      }
      function fail(err) { console.warn('[pond] 素材加载失败', err); state = 0; }
      return {
        whenReady(cb) {
          if (state === 2) { cb(src); return; }
          queue.push(cb);
          if (state === 1) return;
          state = 1;
          if (!loader) loader = new THREE.GLTFLoader();
          if (INLINE) loader.parse(b64buf(INLINE), '', ready, fail);
          else loader.load(SRC_URL, ready, undefined, fail);
        }
      };
    })();

    // ---------- 通用 glb 素材加载器 ----------
    // 和上面 PondAsset 同一套逻辑：优先吃掉内联的 base64（双击直开也能用），
    // 没有内联数据时才去 assets/ 里读外部文件。
    const glbAsset = (function () {
      const cache = {};
      function b64buf(b64) {
        const bin = atob(b64);
        const u8 = new Uint8Array(bin.length);
        for (let n = 0; n < bin.length; n++) u8[n] = bin.charCodeAt(n);
        return u8.buffer;
      }
      return function (inlineKey, url, tag) {
        if (cache[inlineKey]) return cache[inlineKey];
        const INLINE = window[inlineKey] || null;
        const queued = [];
        let src = null, state = 0, loader = null;
        const api = {
          whenReady(cb) {
            if (state === 2) { cb(src); return; }
            queued.push(cb);
            if (state === 1) return;
            state = 1;
            if (!loader) loader = new THREE.GLTFLoader();
            const ok = (g) => {
              src = g; state = 2;
              queued.splice(0).forEach((fn) => { try { fn(g); } catch (e) { console.warn('[' + tag + ']', e); } });
            };
            const bad = (e) => { console.warn('[' + tag + '] 素材加载失败', e); state = 0; };
            if (INLINE) loader.parse(b64buf(INLINE), '', ok, bad);
            else loader.load(url, ok, undefined, bad);
          }
        };
        cache[inlineKey] = api;
        return api;
      };
    })();

    const pondDeco = new THREE.Group();
    pondDeco.name = 'pondDeco';
    root.add(pondDeco);

    // 素材里的水面半径 / 岸沿高度（等模型加载完再实测覆盖这两个默认值）
    let POND_R0 = 9.66;
    let POND_LIP_Y = 0.45;
    let pondMixer = null;
    let pondClock = 0;

    // 径向平移：把素材的圆岸线掰成本作的不规则形状。
    // 每个顶点沿自身半径方向挪 (pondRadiusAt(a) - R0)，整体是平移而非缩放，
    // 所以叶子不会变形，只有整丛被推到更近/更远的位置。
    function remapPondGeo(geo, matrix, dy, r0, push, yK) {
      const g2 = geo.clone();
      g2.applyMatrix4(matrix);
      const base = r0 || POND_R0;
      const extra = push || 0;
      const pos = g2.attributes.position;
      const v = new THREE.Vector3();
      for (let n = 0; n < pos.count; n++) {
        v.fromBufferAttribute(pos, n);
        const r = Math.hypot(v.x, v.z);
        if (r > 1e-4) {
          const a = Math.atan2(v.z, v.x);
          const f = (r + pondRadiusAt(a) - base + extra) / r;
          v.x *= f;
          v.z *= f;
        }
        // 竖向拉伸：等比缩小后叶子会显得又矮又平（像一堆贴地的卷心菜），
        // 只把高度往上拉一档，岸边才有"长起来"的层次
        const yy = v.y + dy;
        pos.setXYZ(n, v.x, yK ? 0.05 + (yy - 0.05) * yK : yy, v.z);
      }
      pos.needsUpdate = true;
      g2.computeBoundingSphere();
      return g2;
    }

    // 砍掉两部分：沉到地下的（素材底部有一圈垂到 -4 的草裙，会插进湖床里），
    // 以及被径向位移拉成细长条的三角面（跨角度的三角形两端被推的距离差太多，
    // 会在地面上拉出一根几米长的绿色细线）。
    function cleanGeo(geo, yMin, maxEdge) {
      const idx = geo.index;
      if (!idx) return geo;
      const pos = geo.attributes.position;
      const keep = [];
      const ax = new THREE.Vector3(), bx = new THREE.Vector3(), cx = new THREE.Vector3();
      const e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), cr = new THREE.Vector3();
      for (let n = 0; n < idx.count; n += 3) {
        const a = idx.getX(n), b = idx.getX(n + 1), c = idx.getX(n + 2);
        if (Math.max(pos.getY(a), pos.getY(b), pos.getY(c)) <= yMin) continue;
        ax.fromBufferAttribute(pos, a);
        bx.fromBufferAttribute(pos, b);
        cx.fromBufferAttribute(pos, c);
        const e = Math.max(ax.distanceTo(bx), bx.distanceTo(cx), cx.distanceTo(ax));
        if (e > maxEdge) continue;
        // 这里要专门清掉被径向位移拉坏的三角：
        //   · 细长条 —— 面积 / 最长边（也就是三角的"高"）矮于 5cm，贴在地上像根绿线；
        //   · 大面片 —— 单个三角超过 0.5㎡，说明两端被推的距离差太多，拉成了平板。
        // 正常叶子三角在这个尺度下都小于 0.1㎡。
        e1.subVectors(bx, ax);
        e2.subVectors(cx, ax);
        const area2 = cr.crossVectors(e1, e2).length();
        if (area2 < e * 0.05) continue;
        if (area2 > 1.0) continue;
        // 还有第三种：素材底下那圈水平的"草沿"平台（原模型里正好贴着水面）。
        // 它的三角面积正常、也不细长，前两道都拦不住；径向位移把这一圈整片搬到
        // 草地/沙地上，就成了一条贴地的绿带。只能按朝向判 —— 三角几乎平躺、
        // 法线朝上，且最低点还在裁切面附近（真叶子都是立着的侧片，法线接近水平）。
        cr.normalize();
        const lowest = Math.min(ax.y, bx.y, cx.y);
        if (Math.abs(cr.y) > 0.8 && lowest < yMin + 0.55) continue;
        keep.push(a, b, c);
      }
      geo.setIndex(keep);
      return geo;
    }

    function installPondDeco(gltf) {
      const sc = gltf.scene;
      sc.updateMatrixWorld(true);

      // --- 实测素材的水面半径，作为径向贴合的基准 ---
      let wm = null;
      sc.traverse((o) => { if (!wm && o.isMesh && /pPlane1_water/.test(o.name)) wm = o; });
      if (wm) {
        const ap = wm.geometry.attributes.position;
        const v = new THREE.Vector3();
        let rmax = 0;
        for (let n = 0; n < ap.count; n++) {
          v.fromBufferAttribute(ap, n).applyMatrix4(wm.matrixWorld);
          rmax = Math.max(rmax, Math.hypot(v.x, v.z));
        }
        if (rmax > 1) POND_R0 = rmax;
      }

      // --- 1. 岸边的植被：已删除 ---
      // 玩家要求「湖旁边一圈的植被删掉」。原来这里用 Fab 素材里的 grass03 合并网格，
      // 径向贴合后铺了两圈（还带 cut / 法线过滤那套清理）。整段移走，湖岸只留
      // 「草地 → 沙圈 → 水面」三层；素材里的水纹条和鱼照旧保留。

      // --- 2. 白色手绘水纹条：拿原模型的短条当模板，散点铺满水面 ---
      const tmpl = [];
      sc.traverse((o) => {
        if (!o.isMesh || !o.material) return;
        const mn = o.material.name || '';
        if (mn !== 'wave' && mn !== 'Default_Material') return;
        const geo = o.geometry.clone();
        geo.applyMatrix4(o.matrixWorld);
        geo.computeBoundingBox();
        const bb = geo.boundingBox;
        const sz = bb.getSize(new THREE.Vector3());
        const len = Math.max(sz.x, sz.z);
        if (len < 0.3 || len > 2.6) return;      // 丢掉退化成点的小碎块
        const c = bb.getCenter(new THREE.Vector3());
        geo.translate(-c.x, -c.y, -c.z);
        tmpl.push({ geo: geo, len: len });
      });
      if (tmpl.length) {
        const rnd = mulberry32(20261108);
        const verts = [];
        const m4 = new THREE.Matrix4();
        const q = new THREE.Quaternion();
        const up = new THREE.Vector3(0, 1, 0);
        const p3 = new THREE.Vector3();
        const s3 = new THREE.Vector3();
        const vv = new THREE.Vector3();
        const N = 96;
        for (let n = 0; n < N; n++) {
          const t = tmpl[Math.floor(rnd() * tmpl.length)];
          const a = rnd() * TAU;
          const rr = pondRadiusAt(a) * (0.08 + rnd() * 0.82);
          const ss = 0.34 + rnd() * 0.62;
          q.setFromAxisAngle(up, rnd() * TAU);
          p3.set(Math.cos(a) * rr, POND_TOP + 0.012, Math.sin(a) * rr);
          m4.compose(p3, q, s3.set(ss, 1, ss));
          const ap = t.geo.attributes.position;
          const ia = t.geo.index;
          const cnt = ia ? ia.count : ap.count;
          for (let j = 0; j < cnt; j++) {
            const vi = ia ? ia.getX(j) : j;
            vv.fromBufferAttribute(ap, vi).applyMatrix4(m4);
            verts.push(vv.x, vv.y, vv.z);
          }
        }
        const dg = new THREE.BufferGeometry();
        dg.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
        const nr = new Float32Array(verts.length);
        for (let n = 1; n < nr.length; n += 3) nr[n] = 1;
        dg.setAttribute('normal', new THREE.BufferAttribute(nr, 3));
        const dm = new THREE.MeshStandardMaterial({
          color: 0xf6fdff, roughness: 0.62, metalness: 0,
          emissive: 0xa8dbe6, emissiveIntensity: 0.22,
          transparent: true, opacity: 0.82, depthWrite: false
        });
        const dashes = new THREE.Mesh(dg, dm);
        dashes.renderOrder = 3;
        pondDeco.add(dashes);
      }

      // --- 3. 三条鱼：保留原骨骼层级，只把静态件全藏掉 ---
      let fishN = 0;
      sc.traverse((o) => {
        if (!o.isMesh) return;
        const mn = (o.material && o.material.name) || '';
        const isFish = mn.indexOf('rig_01_n_pond_fish') === 0;
        o.visible = isFish;
        if (isFish) fishN++;
      });
      if (fishN) {
        // 素材里鱼游在 1.6~2.9m 深，本作湖只有 2m，整体缩小再上抬。
        // 注意只能用等比缩放：骨骼网格套非等比缩放会把蒙皮算爆，拉出几十厘米宽的薄片。
        const wrap = new THREE.Group();
        wrap.scale.setScalar(0.62);
        wrap.position.set(pond.x, POND_TOP + 0.44, pond.z);
        wrap.add(sc);
        pondDeco.add(wrap);
        if (gltf.animations && gltf.animations.length) {
          pondMixer = new THREE.AnimationMixer(sc);
          const act = pondMixer.clipAction(gltf.animations[0]);
          act.play();
          act.time = 1.7;
        }
      }
      console.log('[pond] R0=' + POND_R0.toFixed(2) + ' lip=' + POND_LIP_Y.toFixed(2) +
        ' fish=' + fishN + ' dashTmpl=' + tmpl.length);
    }

    // 湖水：素材那种半透明平涂水面。不再画大块白沫色斑 —— 手绘的白色水痕
    // 改由素材里的白色水纹几何来表现，水面本身只留"近岸浅、湖心深 + 天光 + 阳光高光"。
    const waterMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      uniforms: Object.assign({
        time: { value: 0 },
        sunDir: { value: new THREE.Vector3(24, 34, 18).normalize() },
        sunColor: { value: new THREE.Color(0xfff0d4) },
        waterColor: { value: new THREE.Color(0x4a96a6) },   // 湖心深色
        waterColor2: { value: new THREE.Color(0x9ed2d0) },  // 近岸浅色
        skyColor: { value: new THREE.Color(0xe2f3f5) },     // 天光
        foamColor: { value: new THREE.Color(0xf4fbfd) },    // 白
        pondR: { value: pond.r }
      }, rippleUni),
      vertexShader:
        'varying vec3 vWorld; void main(){ vWorld = (modelMatrix * vec4(position,1.0)).xyz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: [
        'uniform float time; uniform vec3 sunDir; uniform vec3 sunColor;',
        'uniform vec3 waterColor; uniform vec3 waterColor2; uniform vec3 skyColor; uniform vec3 foamColor;',
        'uniform float pondR;',
        ripDecl,
        'varying vec3 vWorld;',
        'float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }',
        'float noise(vec2 p){',
        '  vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);',
        '  float a = hash(i), b = hash(i+vec2(1.0,0.0)), c = hash(i+vec2(0.0,1.0)), d = hash(i+vec2(1.0,1.0));',
        '  return mix(mix(a,b,f.x), mix(c,d,f.x), f.y);',
        '}',
        // 只叠两层的低频噪声：要的是"整块"的形，八度一多就碎成颗粒
        'float fbm2(vec2 p){ float v=0.0, a=0.5; for(int i=0;i<2;i++){ v+=a*noise(p); p=p*2.11+3.7; a*=0.5; } return v * 1.32; }',
        'float pondRAt(float a){ return pondR * (1.0 + 0.26*sin(a*2.0+0.7) + 0.17*sin(a*3.0+2.1) + 0.09*cos(a*5.0+1.3)); }',
        'float wave(vec2 p){',
        '  return sin(p.x*2.0 + time*1.6)*0.5 + sin(p.y*2.6 - time*1.2)*0.4',
        '       + sin((p.x+p.y)*1.3 + time*2.1)*0.25;',
        '}',
        'float rippleH(vec2 p){',
        '  float hR = 0.0;',
        ripCode,
        '  return hR;',
        '}',
        'void main(){',
        '  vec2 p = vWorld.xz;',
        '  float h0 = wave(p) + rippleH(p) * 0.055;',
        '  float hx = wave(p + vec2(0.13, 0.0)) + rippleH(p + vec2(0.035, 0.0)) * 0.055;',
        '  float hz = wave(p + vec2(0.0, 0.13)) + rippleH(p + vec2(0.0, 0.035)) * 0.055;',
        '  vec3 n = normalize(vec3(-(hx-h0)*1.15, 1.0, -(hz-h0)*1.15));',
        '  vec3 view = normalize(cameraPosition - vWorld);',
        '  float ang = atan(p.y, p.x);',
        '  float shoreD = pondRAt(ang) - length(p);',
        '  float deepF = smoothstep(0.0, 6.5, shoreD);',
        '  vec3 col = mix(waterColor2, waterColor, deepF);',
        // 平涂一层极淡的手绘斑，纯色会显得死板
        '  float blot = fbm2(p * 0.30 + vec2(time * 0.012, time * 0.008));',
        '  col = mix(col, waterColor2, smoothstep(0.46, 0.62, blot) * 0.20);',
        '  float fres = pow(1.0 - clamp(dot(view, n), 0.0, 1.0), 3.0);',
        '  col = mix(col, skyColor, fres * 0.40);',
        '  vec3 hv = normalize(view + normalize(sunDir));',
        '  col += sunColor * pow(max(dot(n, hv), 0.0), 120.0) * 0.45;',
        '  col = mix(col, foamColor, clamp(rippleH(p) * 2.4, 0.0, 1.0) * 0.30);',
        // 湖床在树影里很深，水太透会把整片压成深蓝，所以 alpha 压到 0.66~0.82：
        // 仍然透得出湖底与鱼，但水色本身占主导，接近素材那种浅青。
        '  float alpha = mix(0.66, 0.82, deepF);',
        '  gl_FragColor = vec4(col, alpha);',
        '}'
      ].join('\n')
    });
    const water = new THREE.Mesh(new THREE.ShapeGeometry(new THREE.Shape(pondPoints(1.0))), waterMat);
    water.rotation.x = -Math.PI / 2;
    water.position.y = POND_TOP;
    water.renderOrder = 2;
    root.add(water);
    PondAsset.whenReady(installPondDeco);

    // ---------- 岸边芦苇：已删除（并入「湖岸植被全删」那条需求）----------

    // ---------- 睡莲（荷叶 + 花）----------
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

    // 湖底：从岸边斜插到水下的碗状泥底，让鱼真正处在水面之下
    (function buildPondBasin() {
      const N = 72;
      const RIM_Y = 0.008, BOTTOM_Y = -2.0, BOTTOM_SCALE = 0.34;
      const pos = [];
      const idx = [];
      const col = [];
      const cTop = new THREE.Color(0x9a9370);
      const cBottom = new THREE.Color(0x4c7d74);
      for (let i = 0; i < N; i++) {
        const a = (i / N) * TAU;
        const ca = Math.cos(a), sa = Math.sin(a);
        const rOut = pondRadiusAt(a) * 1.06;
        // 岸沿
        pos.push(ca * rOut, RIM_Y, sa * rOut);
        col.push(cTop.r, cTop.g, cTop.b);
        // 湖底
        pos.push(ca * pondRadiusAt(a) * BOTTOM_SCALE, BOTTOM_Y, sa * pondRadiusAt(a) * BOTTOM_SCALE);
        col.push(cBottom.r, cBottom.g, cBottom.b);
      }
      for (let i = 0; i < N; i++) {
        const j = (i + 1) % N;
        const a0 = i * 2, b0 = i * 2 + 1, a1 = j * 2, b1 = j * 2 + 1;
        idx.push(a0, b0, a1, b0, b1, a1);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      g.setIndex(idx);
      g.computeVertexNormals();
      const basin = new THREE.Mesh(g, new THREE.MeshStandardMaterial({
        vertexColors: true, roughness: 1, side: THREE.DoubleSide
      }));
      basin.receiveShadow = true;
      root.add(basin);

      const bed = new THREE.Mesh(
        new THREE.ShapeGeometry(new THREE.Shape(pondPoints(BOTTOM_SCALE))),
        new THREE.MeshStandardMaterial({ color: 0x5c8a80, roughness: 1 })
      );
      bed.rotation.x = -Math.PI / 2;
      bed.position.y = BOTTOM_Y;
      bed.receiveShadow = true;
      root.add(bed);
    })();

    // ---------- 碰撞工具 ----------
    function addCollider(x, z, w, d, h, y0, tag) {
      colliders.push({
        minX: x - w / 2, maxX: x + w / 2,
        minZ: z - d / 2, maxZ: z + d / 2,
        minY: y0 || 0, maxY: (y0 || 0) + h,
        tag: tag || 'solid'
      });
    }

    // ---------- 木箱 ----------
    const crateMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.82, map: woodTex });
    const crateEdgeMat = new THREE.LineBasicMaterial({ color: 0x3b2d20, transparent: true, opacity: 0.55 });

    function addCrate(x, z, size) {
      const s = size || 2;
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(s, s, s), crateMat);
      mesh.position.set(x, s / 2, z);
      // 不再随机转 Y：斜放的箱体和轴对齐碰撞盒对不上，玩家会看到自己半个身子
      // 陷进箱角，跳上去也会被"看不见的边"顶下来。摆正后视觉与碰撞完全一致。
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      root.add(mesh);

      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry), crateEdgeMat);
      edges.position.copy(mesh.position);
      root.add(edges);

      // 木箱可以站上去（配合旁边的石头当台阶）
      addCollider(x, z, s, s, s, 0, 'crate');
    }

    // 玩家要求「地图上的箱子删掉」：原来这里在岛上撒了 16 个可站上去的木箱。
    // 整张表清空，addCrate 保留给商店摊位内部（那里还有几只作为陈设）。

    // 可清理的石头/巨碑：clearScatterAround 会把落在半径内的整块移走
    const rockMeshes = [];   // 供 clearScatterAround 连石头一起清掉
    // ---------- 竖立巨石（menhir）----------
    // 参考图里那种立在草地上的远古石碑：截面不规则的石柱、顶部风化不平、
    // 侧面有纵向裂纹与横向刻痕、根部长满苔。原来的 8 根水泥管状石桩全部换掉。
    function makeMenhirGeo(h, rBot, rTop, seed) {
      const rnd = mulberry32(seed);
      const SEG = 9, RING = 10;
      const ph = [];
      for (let j = 0; j < SEG; j++) ph.push(0.84 + rnd() * 0.34);
      const geo = new THREE.CylinderGeometry(rTop, rBot, h, SEG, RING, false);
      const pos = geo.attributes.position;
      const colors = [];
      const cRockLo = new THREE.Color(0x84817a);
      const cRockHi = new THREE.Color(0xa9a69d);
      const cMoss = new THREE.Color(0x6d7a4e);
      const cDirt = new THREE.Color(0x8a7a5c);
      const c = new THREE.Color();
      const v = new THREE.Vector3();
      for (let i = 0; i < pos.count; i++) {
        v.set(pos.getX(i), pos.getY(i), pos.getZ(i));
        const tY = (v.y + h / 2) / h;                       // 0 底 → 1 顶
        const ang = Math.atan2(v.z, v.x);
        const ai = ((ang + Math.PI) / (Math.PI * 2)) * SEG;
        const j0 = Math.floor(ai) % SEG, j1 = (j0 + 1) % SEG;
        const k = ph[j0] + (ph[j1] - ph[j0]) * (ai - Math.floor(ai));
        const taper = 1 - tY * (1 - rTop / rBot) * 0.85;
        const bulge = 1 + Math.sin(tY * Math.PI * 2.4 + seed) * 0.045;
        let rr = k * taper * bulge;
        // 顶部做成风化缺口：每个角向随机削掉一点，杜绝"平顶圆柱"
        if (tY > 0.9) rr *= 0.90 + ((j0 * 37 + seed) % 7) * 0.018;
        v.x *= rr;
        v.z *= rr * 0.64;                                   // 截面压扁成板状
        if (tY < 0.02) v.y -= 0.22;                         // 根部插进土里
        pos.setXYZ(i, v.x, v.y, v.z);
        // 顶点色：根部长苔、腰身青灰、顶部被太阳晒白
        c.copy(cRockLo).lerp(cRockHi, Math.min(1, tY * 1.6));
        if (tY < 0.2) c.lerp(cMoss, ((0.2 - tY) / 0.2) * 0.8);
        if (tY < 0.055) c.lerp(cDirt, 0.55);
        // 统一提亮 2 倍：材质上还叠着一张石材 map（中灰），顶点色不提亮的话
        // 两层相乘会把整块碑压成纯黑。
        c.r = Math.min(1, c.r * 2.0);
        c.g = Math.min(1, c.g * 2.0);
        c.b = Math.min(1, c.b * 2.0);
        // 纵向裂纹直接烘进顶点色：按角度哈希出一条暗带，越往上越淡。
        // 之前用薄片几何贴在石面上，可碑体是上细下粗的锥形，
        // 薄片会浮在面外，看起来像插了根铁棍。
        const ang01 = (ang + Math.PI) / (Math.PI * 2);
        const s1 = Math.sin(ang01 * 37.0 + seed * 0.7) * 0.5 + 0.5;
        const s2 = Math.sin(ang01 * 89.0 + 2.3) * 0.5 + 0.5;
        let crack = s1 > 0.93 ? 0.62 : (s2 > 0.955 ? 0.34 : 0);
        if (crack > 0) {
          crack *= 0.35 + 0.65 * (1 - tY);
          c.multiplyScalar(1 - crack * 0.72);
        }
        colors.push(c.r, c.g, c.b);
      }
      geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
      geo.computeVertexNormals();
      return geo;
    }

    // 巨石材质：石材 map 保留（不然整块是一个光板水泥柱），顶点色已按 2 倍提亮
    const menhirMat = new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 0.94, metalness: 0.0,
      map: texStone.map, normalMap: texStone.normal
    });
    menhirMat.normalScale.set(1.1, 1.1);
    const menhirLithoMat = new THREE.MeshStandardMaterial({
      color: 0x8d8a82, roughness: 1, flatShading: true
    });

    [[-11, 18], [11, -18], [11, 18], [-11, -18], [24, -26], [-24, 26], [-30, -8], [30, 8]].forEach(([x, z], pi) => {
      if (onHill(x, z, 1.3)) return;
      const rnd = mulberry32(900 + pi * 31);
      const h = 2.5 + rnd() * 1.5;
      const rBot = 0.54 + rnd() * 0.24;
      const rTop = rBot * (0.60 + rnd() * 0.18);
      const gy = heightAt(x, z);
      const mesh = new THREE.Mesh(makeMenhirGeo(h, rBot, rTop, 17 + pi * 13), menhirMat);
      mesh.position.set(x, gy + h / 2 - 0.20, z);
      mesh.rotation.set(0, rnd() * TAU, (rnd() - 0.5) * 0.045);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      root.add(mesh);
      rockMeshes.push({ mesh, x, z });   // 登记进可清理列表：海边盖房子时要能把它挪走

      // 裂纹已烘进顶点色（见 makeMenhirGeo），这里不再贴薄片几何。

      // 脚下碎石：几块扁平的落石，让巨碑"长在地上"而不是插进去
      for (let i = 0; i < 4; i++) {
        const a = rnd() * TAU;
        const rr = rBot * (1.1 + rnd() * 0.55);
        const sx = 0.20 + rnd() * 0.26;
        const stone = new THREE.Mesh(new THREE.IcosahedronGeometry(sx, 0), menhirLithoMat);
        stone.position.set(x + Math.cos(a) * rr, gy + sx * 0.28, z + Math.sin(a) * rr);
        stone.scale.set(1.25, 0.55, 1.0);
        stone.rotation.set(rnd(), rnd() * TAU, rnd() * 0.3);
        stone.castShadow = true;
        stone.receiveShadow = true;
        root.add(stone);
      }

      addCollider(x, z, rBot * 1.75, rBot * 1.75, h * 0.95, 0, 'pillar');
    });

    // ---------- 岩石：细分二十面体 + 顶点噪声，顶面偏苔绿、侧面偏石灰 ----------
    function makeRockGeo(r, seed) {
      const geo = new THREE.IcosahedronGeometry(r, 1);
      const pos = geo.attributes.position;
      const nz = makeValueNoise(seed, 12);
      const colors = [];
      const cRock = new THREE.Color(0x8b8d84);
      const cMoss = new THREE.Color(0x63743f);
      const c = new THREE.Color();
      const v = new THREE.Vector3();
      for (let i = 0; i < pos.count; i++) {
        v.set(pos.getX(i), pos.getY(i), pos.getZ(i));
        const n = nz((v.x / r + 1) * 5.5 + seed % 11, (v.z / r + 1) * 5.5 + (v.y / r + 1) * 3.2);
        v.multiplyScalar(0.78 + n * 0.46);
        pos.setXYZ(i, v.x, v.y * 0.82, v.z);
        const up = Math.max(0, v.y / r);
        c.copy(cRock).lerp(cMoss, Math.pow(up, 1.6) * 0.55);
        colors.push(c.r, c.g, c.b);
      }
      geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
      geo.computeVertexNormals();
      return geo;
    }
    const rockMat = new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 1, flatShading: true
    });
    // 散布物登记表：石头和树都要查这张表，避免彼此插在一起
    const scatter = [];
    function scatterFree(x, z, r, softness) {
      const k = softness || 1;
      for (let i = 0; i < scatter.length; i++) {
        const o = scatter[i];
        if (Math.hypot(x - o.x, z - o.z) < (r + o.r) * k) return false;
      }
      return true;
    }
    // 陆地判定：留出沙滩，别让石头树长到水里
    function onLand(x, z, pad) {
      const a = Math.atan2(z, x);
      if (Math.hypot(x, z) > islandRadiusAt(a) - (pad || 0)) return false;
      const pa = Math.atan2(z - pond.z, x - pond.x);
      if (Math.hypot(x - pond.x, z - pond.z) < pondRadiusAt(pa) + (pad || 0) + 1.2) return false;
      return true;
    }

    [[8, 15, 1.4], [-8, -15, 1.2], [26, 10, 1.5], [-26, -10, 1.6], [20, -24, 1.1], [-20, 24, 1.3],
     [30, 13, 1.5], [-30, -13, 1.4], [12, 28, 1.2], [-12, -28, 1.5]].forEach(([x, z, r], i) => {
      if (onHill(x, z, r * 0.7)) return;
      if (!onLand(x, z, r * 1.6)) return;
      if (!scatterFree(x, z, r * 1.4, 0.9)) return;
      const mesh = new THREE.Mesh(makeRockGeo(r, 300 + i * 17), rockMat);
      mesh.position.set(x, r * 0.45, z);
      mesh.rotation.set(0, Math.random() * TAU, 0);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      root.add(mesh);
      addCollider(x, z, r * 1.5, r * 1.5, r * 1.1, 0, 'rock');
      rockMeshes.push({ mesh, x, z });
      scatter.push({ x, z, r: r * 1.15 });
    });


    // ---------- 松树 ----------
    const pineTrunkMat = new THREE.MeshStandardMaterial({ color: 0x6b5236, roughness: 1, flatShading: true });
    const pineLeafMats = [
      new THREE.MeshStandardMaterial({ color: 0x2f5230, roughness: 0.95, flatShading: true }),
      new THREE.MeshStandardMaterial({ color: 0x3b6636, roughness: 0.95, flatShading: true }),
      new THREE.MeshStandardMaterial({ color: 0x4a7a3d, roughness: 0.95, flatShading: true }),
      new THREE.MeshStandardMaterial({ color: 0x27452a, roughness: 0.95, flatShading: true })
    ];
    const palms = [];

    // 带噪声扰动的圆锥：底面圆周各点半径随机伸缩，剪影不再是完美三角
    function coneNoisy(r, h, segs, seed, amp) {
      const geo = new THREE.ConeGeometry(r, h, segs, 2, false);
      const pos = geo.attributes.position;
      const rnd = mulberry32(seed);
      const jit = [];
      for (let i = 0; i <= segs; i++) jit.push(1 + (rnd() - 0.5) * (amp || 0.3));
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
        const t = (y + h / 2) / h;
        if (t < 0.98) {
          const a = Math.atan2(z, x);
          const k = jit[Math.round(((a + Math.PI) / (Math.PI * 2)) * segs) % (segs + 1)];
          const s2 = 1 + (k - 1) * (1.05 - t);
          pos.setX(i, x * s2);
          pos.setZ(i, z * s2);
          pos.setY(i, y - (1 - t) * h * 0.06 * (k - 1));
        }
      }
      geo.computeVertexNormals();
      return geo;
    }

    function addWillow(x, z, h, seed) {
      const rnd = mulberry32(seed || (x * 977 + z * 131 + 7));
      const g = new THREE.Group();
      const trunkH = h * 0.30;
      const trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(h * 0.032, h * 0.072, trunkH, 7),
        pineTrunkMat
      );
      trunk.position.y = trunkH / 2;
      trunk.castShadow = true;
      trunk.receiveShadow = true;
      g.add(trunk);

      // 层叠圆锥：半径逐层收缩、每层随机旋转，叠加出蓬松的树冠轮廓
      const tiers = 5 + Math.floor(rnd() * 3);
      let y = trunkH * 0.70;
      let rad = h * 0.30;
      const leafH = ((h - y) / tiers) * 1.62;
      for (let t = 0; t < tiers; t++) {
        const th = leafH * (1.0 - t * 0.055);
        const geo = coneNoisy(rad, th, 8 + Math.floor(rnd() * 3), (seed || 1) + t * 37, 0.34);
        const m = new THREE.Mesh(geo, pineLeafMats[Math.floor(rnd() * pineLeafMats.length)]);
        m.position.y = y + th * 0.40;
        m.rotation.y = rnd() * TAU;
        m.castShadow = true;
        m.receiveShadow = true;
        g.add(m);
        y += th * 0.52;
        rad *= 0.755;
      }
      // 冠顶：一个小锥收尖
      const tip = new THREE.Mesh(coneNoisy(h * 0.055, h * 0.16, 6, (seed || 1) + 99, 0.25), pineLeafMats[1]);
      tip.position.y = y + h * 0.06;
      tip.castShadow = true;
      g.add(tip);

      const sc = 0.92 + rnd() * 0.22;
      g.scale.setScalar(sc);
      g.position.set(x, heightAt(x, z), z);
      g.rotation.y = rnd() * TAU;
      g.rotation.z = (rnd() - 0.5) * 0.035;
      root.add(g);
      palms.push({ group: g, phase: rnd() * TAU });
      addCollider(x, z, h * 0.22, h * 0.22, h * 0.55 * sc, heightAt(x, z), 'tree');
    }

    // 沿岛岸分布：靠内圈，避开房屋与湖面
    [
      [-26, 16, 7.4], [-26, -19, 6.6], [26, -16, 7.8], [24, 19, 6.9],
      [-15, 27, 7.1], [16, -27, 7.6], [31, 5, 7.0], [-31, -6, 7.3],
      [5, 31, 6.7], [-4, -31, 7.2],
      [-33, 10, 6.2], [33, -10, 6.4], [12, -33, 6.5], [-12, 33, 6.8],
      [20, 26, 6.6], [-20, -26, 6.9], [28, 14, 6.3], [-28, -14, 6.1],
      [-36, -2, 6.0], [36, 2, 6.2], [9, -24, 5.9], [-9, 24, 6.0]
    ].forEach((t, i) => {
      const x = t[0], z = t[1], h = t[2];
      const canopy = h * 0.30;
      if (onHill(x, z, 1.2)) return;
      // 之前完全不查石头和其他树：树干能长进石缝里，两棵树的树冠互相穿成一片
      if (!onLand(x, z, canopy * 0.5 + 0.6)) return;
      if (!scatterFree(x, z, canopy * 0.62, 1)) return;
      // 树冠也要离房子远一点（房子在树之后生成，这里先把位置占住）
      addWillow(x, z, h, 501 + i * 71);
      scatter.push({ x, z, r: canopy * 0.62 });
    });


    // ---------- 草丛 ----------
    // 原先用 MeshBasicMaterial（不受光）+ 渐变描细线，画面上就是一根根发亮的绿铁丝。
    // 改为：贴图里画真正的叶片（渐变 + 尖端收细），材质用 alphaTest 裁边并参与光照，
    // 三面交叉的片状几何 + 成簇布置 + 顶点风摆，才有草地的体积感。
    function makeGrassTexture() {
      const S = 256;
      const cv = document.createElement('canvas');
      cv.width = cv.height = S;
      const ctx = cv.getContext('2d');
      ctx.clearRect(0, 0, S, S);
      const rnd = mulberry32(7788);
      const blade = (bx, by, len, w, ang, c0, c1) => {
        ctx.save();
        ctx.translate(bx, by);
        ctx.rotate(ang);
        const g = ctx.createLinearGradient(0, 0, 0, -len);
        g.addColorStop(0, c0);
        g.addColorStop(0.55, c0);
        g.addColorStop(1, c1);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(-w, 0);
        ctx.quadraticCurveTo(-w * 0.85, -len * 0.55, 0, -len);
        ctx.quadraticCurveTo(w * 0.85, -len * 0.55, w, 0);
        ctx.closePath();
        ctx.fill();
        // 中脉高光，远看才有层次
        ctx.strokeStyle = 'rgba(226,246,168,0.30)';
        ctx.lineWidth = Math.max(0.6, w * 0.22);
        ctx.beginPath();
        ctx.moveTo(0, -2);
        ctx.quadraticCurveTo(w * 0.1, -len * 0.55, 0, -len * 0.95);
        ctx.stroke();
        ctx.restore();
      };
      // 一簇 9 根叶片，长短、朝向、深浅都随机
      for (let i = 0; i < 13; i++) {
        const bx = 56 + rnd() * (S - 112);
        const len = S * (0.34 + rnd() * 0.52);
        const w = 2.6 + rnd() * 3.2;
        const ang = (rnd() - 0.5) * 0.95;
        const dark = 0.82 + rnd() * 0.18;
        const c0 = 'rgb(' + (104 * dark | 0) + ',' + (138 * dark | 0) + ',' + (58 * dark | 0) + ')';
        const c1 = 'rgb(' + (176 + rnd() * 46 | 0) + ',' + (206 + rnd() * 40 | 0) + ',' + (104 + rnd() * 38 | 0) + ')';
        blade(bx, S - 2, len, w, ang, c0, c1);
      }
      const tex = new THREE.CanvasTexture(cv);
      tex.anisotropy = 8;
      tex.colorSpace = THREE.SRGBColorSpace;
      return tex;
    }

    // 风摆：注入顶点位移，叶片越高摆得越多
    const windUniform = { value: 0 };
    function makeGrassMaterial(tex) {
      const mat = new THREE.MeshStandardMaterial({
        map: tex,
        alphaTest: 0.42,
        side: THREE.DoubleSide,
        roughness: 0.92,
        metalness: 0
      });
      mat.onBeforeCompile = (shader) => {
        shader.uniforms.uTime = windUniform;
        shader.vertexShader = 'uniform float uTime;\n' + shader.vertexShader.replace(
          '#include <begin_vertex>',
          [
            '#include <begin_vertex>',
            '#ifdef USE_INSTANCING',
            '  vec3 iwp = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);',
            '#else',
            '  vec3 iwp = vec3(0.0);',
            '#endif',
            '  float hgt = max(transformed.y, 0.0);',
            '  float sway = sin(uTime * 1.6 + iwp.x * 0.55 + iwp.z * 0.41) * 0.62',
            '             + sin(uTime * 2.7 + iwp.z * 0.95) * 0.30;',
            '  transformed.x += sway * hgt * hgt * 0.55;',
            '  transformed.z += sway * hgt * hgt * 0.32;'
          ].join('\n')
        );
      };
      mat.customProgramCacheKey = () => 'grasswind';
      return mat;
    }

    function addGrassPatches() {
      const grassMat = makeGrassMaterial(makeGrassTexture());

      // 三面交叉（0/60/120°），从任何角度看都有体积
      const gw = 0.42, gh = 0.40;
      const gpos = [], guvs = [], gidx = [];
      for (let p = 0; p < 3; p++) {
        const a = (p / 3) * Math.PI;
        const cx = Math.cos(a) * gw / 2, cz = Math.sin(a) * gw / 2;
        const base = p * 4;
        gpos.push(-cx, 0, -cz, cx, 0, cz, cx, gh, cz, -cx, gh, -cz);
        guvs.push(0, 0, 1, 0, 1, 1, 0, 1);
        gidx.push(base, base + 1, base + 2, base, base + 2, base + 3);
      }
      const grassGeo = new THREE.BufferGeometry();
      grassGeo.setAttribute('position', new THREE.Float32BufferAttribute(gpos, 3));
      grassGeo.setAttribute('uv', new THREE.Float32BufferAttribute(guvs, 2));
      grassGeo.setIndex(gidx);
      // 关键：草片是竖直的四边面，若用 computeVertexNormals 会让一半叶片背光变黑。
      // 植被通用做法是统一给朝上的法线，让草和地面同向受光，颜色才不会脏掉。
      const gnorm = [];
      for (let i = 0; i < gpos.length / 3; i++) gnorm.push(0, 1, 0);
      grassGeo.setAttribute('normal', new THREE.Float32BufferAttribute(gnorm, 3));

      const count = 6500;
      const inst = new THREE.InstancedMesh(grassGeo, grassMat, count);
      inst.instanceMatrix.setUsage(THREE.StaticDrawUsage);
      const dummy = new THREE.Object3D();
      const color = new THREE.Color();
      const rnd = mulberry32(31337);
      let placed = 0, tries = 0;

      // 成簇布置：先撒簇心，再在簇心周围撒 6~9 丛，草才不会像棋盘一样均匀
      const clumps = 560;
      while (placed < count && tries < count * 4) {
        tries++;
        const ci = Math.floor(rnd() * clumps);
        const ca = (ci / clumps) * TAU + rnd() * 0.6;
        const cr = Math.sqrt(rnd()) * 35.5;
        const cxp = Math.cos(ca) * cr, czp = Math.sin(ca) * cr;
        const spread = 0.35 + rnd() * 1.25;
        const x = cxp + (rnd() - 0.5) * spread * 2;
        const z = czp + (rnd() - 0.5) * spread * 2;

        const dp = Math.hypot(x - pond.x, z - pond.z);
        if (dp < pondRadiusAt(Math.atan2(z - pond.z, x - pond.x)) + 1.0) continue;
        const db = Math.hypot(x, z);
        if (db > islandRadiusAt(Math.atan2(z, x)) - 1.4) continue;
        if (inNoGrassZone(x, z)) continue;

        const y = heightAt(x, z);
        dummy.position.set(x, y + 0.01, z);
        dummy.rotation.set(0, rnd() * TAU, 0);
        const sc = 0.66 + rnd() * 0.68;
        dummy.scale.set(sc, sc * (0.7 + rnd() * 0.62), sc);
        dummy.updateMatrix();
        inst.setMatrixAt(placed, dummy.matrix);
        // 实例色只做轻微色相偏移，整体接近白，避免把草压成深绿
        const g = 0.86 + rnd() * 0.26;
        color.setRGB(0.86 * g, 1.0 * g, 0.72 * g);
        inst.setColorAt(placed, color);
        placed++;
      }
      inst.count = placed;
      inst.instanceMatrix.needsUpdate = true;
      if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
      inst.frustumCulled = false;
      root.add(inst);
    }


    // ---------- 地面点缀：小石子（原来的深绿三角锥像散落的碎片） ----------
    function addGroundSprinkles() {
      const count = 180;
      const geo = new THREE.IcosahedronGeometry(0.17, 0);
      const mat = new THREE.MeshStandardMaterial({ color: 0x9a9a8c, roughness: 1, flatShading: true });
      const inst = new THREE.InstancedMesh(geo, mat, count);
      inst.instanceMatrix.setUsage(THREE.StaticDrawUsage);
      const dummy = new THREE.Object3D();
      const color = new THREE.Color();
      let placed = 0, tries = 0;
      while (placed < count && tries < count * 12) {
        tries++;
        const a = Math.random() * TAU;
        const rr = Math.sqrt(Math.random()) * 35;
        const x = Math.cos(a) * rr, z = Math.sin(a) * rr;
        const dp = Math.hypot(x - pond.x, z - pond.z);
        if (dp < pondRadiusAt(Math.atan2(z - pond.z, x - pond.x)) + 1.4) continue;
        if (rr > islandRadiusAt(a) - 2) continue;
        if (inNoGrassZone(x, z)) continue;
        const y = heightAt(x, z);
        dummy.position.set(x, y + 0.05, z);
        dummy.rotation.set(Math.random() * TAU, Math.random() * TAU, Math.random() * TAU);
        const sc = 0.5 + Math.random() * 1.1;
        dummy.scale.set(sc, sc * 0.55, sc);
        dummy.updateMatrix();
        inst.setMatrixAt(placed, dummy.matrix);
        const sh = 0.72 + Math.random() * 0.3;
        color.setRGB(0.62 * sh, 0.60 * sh, 0.54 * sh);
        inst.setColorAt(placed, color);
        placed++;
      }
      inst.count = placed;
      inst.instanceMatrix.needsUpdate = true;
      if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
      root.add(inst);
    }

    // ---------- 白墙黛瓦建筑群 ----------
    const houseWallMat = new THREE.MeshStandardMaterial({ color: 0xf2f0ea, roughness: 0.92, map: plasterTex });
    const houseWallSideMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.94, map: plasterTex2 });
    const houseRoofMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.78, metalness: 0.08, map: tileTexRoof });
    const houseWoodMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, map: woodTexDark });
    // 窗户：低粗糙度 + 高环境反射，看起来才像玻璃而不是黑板
    // 原来 0x1b2430 + metalness 0.55 在没有环境贴图时就是一块纯黑方块，
    // 远看像把窗户钉死了。改成浅蓝灰，靠太阳高光做出玻璃感。
    const houseWinMat = new THREE.MeshStandardMaterial({ color: 0x6b8394, roughness: 0.16, metalness: 0.35 });
    houseWinMat.envMapIntensity = 1.5;
    houseWinMat.userData.keepEnv = true;
    const gableMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92, map: plasterTex, side: THREE.DoubleSide });

    // 前后山墙封板：把屋顶与墙顶之间的三角空隙补实（屋内看不到天）
    function addGableCaps(g, W, D, H, rw, theta, zInset, mat) {
      const tanT = Math.tan(theta);
      const yEdge = H + 0.7 - (W / 2 - rw / 2) * tanT;
      const apexY = H + 0.7 + (rw / 2) * tanT - 0.03;
      const shape = new THREE.Shape();
      shape.moveTo(-W / 2, H - 0.02);
      shape.lineTo(W / 2, H - 0.02);
      shape.lineTo(W / 2 - 0.03, yEdge);
      shape.lineTo(0, apexY);
      shape.lineTo(-W / 2 + 0.03, yEdge);
      shape.closePath();
      const geo = new THREE.ShapeGeometry(shape);
      const inset = zInset == null ? 0.16 : zInset;
      [1, -1].forEach((s) => {
        const cap = new THREE.Mesh(geo, mat || gableMat);
        cap.position.set(0, 0, s * (D / 2 - inset));
        cap.castShadow = true;
        cap.receiveShadow = true;
        g.add(cap);
      });
    }

    // 石材：台基 / 勒脚 / 窗台 / 台阶
    const houseStoneMat = new THREE.MeshStandardMaterial({
      color: 0xffffff, roughness: 0.96, map: texStone.map, normalMap: texStone.normal
    });
    houseStoneMat.normalScale.set(0.55, 0.55);
    const houseStoneDarkMat = new THREE.MeshStandardMaterial({
      color: 0x9c9a90, roughness: 0.98, map: texStone.map, normalMap: texStone.normal
    });
    // 木构件（门框、窗框、腰线、檐口）：比墙板更深的木色，远看能勾出结构线
    const houseTrimMat = new THREE.MeshStandardMaterial({
      color: 0x6a4a30, roughness: 0.9, map: woodTexDark
    });
    // 檐口封边用瓦檐的深灰，之前用木色会像给屋顶描了一圈红边
    const houseEaveMat = new THREE.MeshStandardMaterial({ color: 0x33373b, roughness: 0.88 });

    // 单扇窗：窗洞 + 木框 + 井字棂 + 玻璃 + 石窗台
    // facing: 1 = 朝 +Z, -1 = 朝 -Z, 2 = 朝 +X, -2 = 朝 -X
    // 窗框几何：外框矩形挖掉内框，一个 mesh 就是整圈框（原来是 4 根条 = 4 次绘制）
    const frameGeos = {};
    function getFrameGeo(w, h) {
      const key = w.toFixed(2) + '_' + h.toFixed(2);
      if (frameGeos[key]) return frameGeos[key];
      const sh = new THREE.Shape();
      sh.moveTo(-w / 2 - 0.1, -h / 2 - 0.1);
      sh.lineTo(w / 2 + 0.1, -h / 2 - 0.1);
      sh.lineTo(w / 2 + 0.1, h / 2 + 0.1);
      sh.lineTo(-w / 2 - 0.1, h / 2 + 0.1);
      sh.closePath();
      const holePath = new THREE.Path();
      holePath.moveTo(-w / 2, -h / 2);
      holePath.lineTo(-w / 2, h / 2);
      holePath.lineTo(w / 2, h / 2);
      holePath.lineTo(w / 2, -h / 2);
      holePath.closePath();
      sh.holes.push(holePath);
      const geo = new THREE.ExtrudeGeometry(sh, { depth: 0.1, bevelEnabled: false, curveSegments: 1 });
      geo.translate(0, 0, -0.05);
      frameGeos[key] = geo;
      return geo;
    }

    function addWindow(g, cx, cy, cz, w, h, facing) {
      const win = new THREE.Group();
      const hole = new THREE.Mesh(new THREE.BoxGeometry(w - 0.015, h - 0.015, 0.06), houseWinMat);
      win.add(hole);
      // 整圈外框
      const frame = new THREE.Mesh(getFrameGeo(w, h), houseTrimMat);
      win.add(frame);
      // 十字窗棂
      const vMull = new THREE.Mesh(new THREE.BoxGeometry(0.04, h - 0.02, 0.06), houseTrimMat);
      vMull.position.z = 0.03;
      win.add(vMull);
      const hMull = new THREE.Mesh(new THREE.BoxGeometry(w - 0.02, 0.04, 0.06), houseTrimMat);
      hMull.position.set(0, h * 0.06, 0.03);
      win.add(hMull);
      // 石窗台：向外挑出，给墙面一道水平阴影
      const sill = new THREE.Mesh(new THREE.BoxGeometry(w + 0.36, 0.1, 0.28), houseStoneMat);
      sill.position.set(0, -h / 2 - 0.13, 0.08);
      win.add(sill);
      win.position.set(cx, cy, cz);
      if (facing === -1) win.rotation.y = Math.PI;
      else if (facing === 2) win.rotation.y = Math.PI / 2;
      else if (facing === -2) win.rotation.y = -Math.PI / 2;
      win.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      g.add(win);
    }

    // 四套外观：白墙黛瓦 / 夯土红瓦 / 青砖灰瓦 / 木骨白墙。
    // 原来 12 栋房子共用同一份材质，只能靠尺寸随机，远看就是"一排复制品"。
    const HOUSE_STYLES = [
      { wall: 0xf4f1e8, roof: 0x505a64, trim: 0x6a4a30, win: 0x6b8394 },
      { wall: 0xdcb684, roof: 0x8f4a34, trim: 0x5b3a22, win: 0x6a7e86 },
      { wall: 0xc6cec7, roof: 0x36474e, trim: 0x3d4a44, win: 0x5f7684 },
      { wall: 0xefe3cd, roof: 0x6d5138, trim: 0x4a3524, win: 0x728a96 }
    ];
    const houseStyleCache = {};
    function styleMats(i) {
      if (houseStyleCache[i]) return houseStyleCache[i];
      const st = HOUSE_STYLES[i % HOUSE_STYLES.length];
      const wall = houseWallMat.clone();
      wall.color.setHex(st.wall);
      const roof = houseRoofMat.clone();
      roof.color.setHex(st.roof);
      const trim = houseTrimMat.clone();
      trim.color.setHex(st.trim);
      const gable = gableMat.clone();
      gable.color.setHex(st.wall);
      const lin = houseWallMat.clone();
      lin.color.setHex(st.wall).multiplyScalar(0.82);
      const out = { wall, roof, trim, gable, lin, st };
      houseStyleCache[i] = out;
      return out;
    }

    function addHouse(x, z, rotY, W, D, H, styleIdx) {
      const vIdx = (styleIdx == null ? 0 : styleIdx) % HOUSE_STYLES.length;
      const VM = styleMats(vIdx);
      const wallMat = VM.wall, roofMat = VM.roof, trimMat = VM.trim, gableM = VM.gable;
      const g = new THREE.Group();

      // 站到坡上的房子不能硬贴一个水平面：低侧会悬空、高侧会埋进土里，
      // 这就是「山丘和房子卡在一起」。这里量出占地范围内的最低/最高点，
      // 把台基做成「高侧露出 0.4m、低侧正好填到地面」的梯形石台。
      let hmin = Infinity, hmax = -Infinity;
      const hw = Math.max(W, D) * 0.55 + 0.78;
      for (let i = -2; i <= 2; i++) {
        for (let j = -2; j <= 2; j++) {
          const hh = heightAt(x + i * hw * 0.5, z + j * hw * 0.5);
          if (hh < hmin) hmin = hh;
          if (hh > hmax) hmax = hh;
        }
      }
      const B = 0.4 + (hmax - hmin);   // 台基高（含填坡部分）
      g.position.set(x, hmin - 0.09, z);
      g.rotation.y = rotY;

      const PL = 0.74;   // 墙脚石勒脚高

      // ---- 台基：四周外扩一圈，房子像"砌"在地上而不是"摆"在地上 ----
      const base = new THREE.Mesh(new THREE.BoxGeometry(W + 0.66, B + 0.2, D + 0.66), houseStoneDarkMat);
      base.position.y = B / 2 - 0.1;
      base.castShadow = true; base.receiveShadow = true;
      g.add(base);
      // 台基压顶（略宽一档的收边石）
      const baseCap = new THREE.Mesh(new THREE.BoxGeometry(W + 0.8, 0.08, D + 0.8), houseStoneMat);
      // 顶面抬到 B + 0.005：原来压顶石顶面和台基顶面都是 B，两层同高共面，
      // 在台基外沿会看到一条来回抖动的亮线（z-fighting）。
      baseCap.position.y = B - 0.035;
      baseCap.castShadow = true; baseCap.receiveShadow = true;
      g.add(baseCap);

      const yW = B;   // 墙体起点

      // ---- 墙体 ----
      const wall = new THREE.Mesh(new THREE.BoxGeometry(W, H, D), wallMat);
      wall.position.y = yW + H / 2;
      wall.castShadow = true; wall.receiveShadow = true;
      g.add(wall);

      // ---- 墙脚石勒脚：一圈深色石带，压住白墙与地面的接缝 ----
      const plinth = new THREE.Mesh(new THREE.BoxGeometry(W + 0.08, PL, D + 0.08), houseStoneDarkMat);
      plinth.position.y = yW + PL / 2;
      plinth.castShadow = true; plinth.receiveShadow = true;
      g.add(plinth);

      // ---- 檐下腰线：白墙上部一圈深色木枋，把屋顶和墙分开 ----
      const belt = new THREE.Mesh(new THREE.BoxGeometry(W + 0.07, 0.15, D + 0.07), trimMat);
      belt.position.y = yW + H - 0.11;
      belt.castShadow = true;
      g.add(belt);

      // ---- 双坡屋顶（出檐 + 檐口封边）----
      const rw = W * 0.58;
      const theta = 0.4;
      const slabLen = rw / Math.cos(theta);
      const yEave = yW + H + 0.02;
      [-1, 1].forEach((sgn) => {
        const slab = new THREE.Mesh(new THREE.BoxGeometry(slabLen + 0.34, 0.26, D * 1.04), roofMat);
        slab.position.set(sgn * rw * 0.5, yEave + 0.68, 0);
        slab.rotation.z = -sgn * theta;
        slab.castShadow = true; slab.receiveShadow = true;
        g.add(slab);
        // 檐口封边：最外沿那一线厚木，让人看出屋檐是有厚度的
        const eave = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.24, D * 1.1), houseEaveMat);
        eave.position.set(
          sgn * (rw * 0.5 + (slabLen * 0.5 + 0.17) * Math.cos(theta)),
          yEave + 0.68 - (slabLen * 0.5 + 0.17) * Math.sin(theta) + 0.03,
          0
        );
        eave.castShadow = true;
        g.add(eave);
      });

      // ---- 屋脊 + 两端起翘 ----
      const ridge = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.34, D * 1.06), roofMat);
      ridge.position.set(0, yEave + 1.5, 0);
      ridge.castShadow = true;
      g.add(ridge);
      [-1, 1].forEach((sgn) => {
        const tip = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.46, 0.4), roofMat);
        tip.position.set(0, yEave + 1.62, sgn * (D * 0.53 + 0.06));
        tip.rotation.x = sgn * 0.3;
        tip.castShadow = true;
        g.add(tip);
      });

      // ---- 马头墙（徽派封火墙）：三叠阶梯山墙，是这类水乡建筑最有辨识度的剪影 ----
      const apexY = yEave + 1.62;
      const wantMaTou = (vIdx === 0 || vIdx === 2);
      const tiers = [
        [rw * 0.34, apexY + 0.44],
        [rw * 0.66, yEave + 1.21],
        [W / 2 + 0.22, yEave + 0.36]
      ];
      if (wantMaTou) [-1, 1].forEach((sz) => {
        tiers.forEach((tier) => {
          const halfW = tier[0];
          const topY = tier[1];
          const wallH = topY - (yEave - 0.34);
          const seg = new THREE.Mesh(new THREE.BoxGeometry(halfW * 2, wallH, 0.28), wallMat);
          seg.position.set(0, yEave - 0.34 + wallH / 2, sz * (D / 2 + 0.12));
          seg.castShadow = true; seg.receiveShadow = true;
          g.add(seg);
          // 叠顶黛瓦压顶：比墙略宽，形成一条小屋檐
          const cap = new THREE.Mesh(new THREE.BoxGeometry(halfW * 2 + 0.18, 0.11, 0.46), roofMat);
          cap.position.set(0, topY + 0.055, sz * (D / 2 + 0.12));
          cap.castShadow = true;
          g.add(cap);
        });
      });

      // ---- 门窗 ----
      const dz = D / 2;
      const doorW = 1.7, doorH = 2.5;
      [-1, 1].forEach((sgn) => {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.16, doorH, 0.24), trimMat);
        post.position.set(sgn * (doorW / 2 + 0.09), yW + doorH / 2, dz + 0.04);
        post.castShadow = true;
        g.add(post);
      });
      const lintel = new THREE.Mesh(new THREE.BoxGeometry(doorW + 0.52, 0.2, 0.28), trimMat);
      lintel.position.set(0, yW + doorH + 0.1, dz + 0.04);
      lintel.castShadow = true;
      g.add(lintel);
      [-1, 1].forEach((sgn) => {
        const leaf = new THREE.Mesh(new THREE.BoxGeometry(doorW / 2 - 0.04, doorH - 0.08, 0.1), houseWoodMat);
        leaf.position.set(sgn * doorW / 4, yW + doorH / 2, dz - 0.02);
        leaf.castShadow = true;
        g.add(leaf);
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.018, 6, 12), trimMat);
        ring.position.set(sgn * 0.2, yW + doorH * 0.52, dz + 0.05);
        g.add(ring);
      });
      // 门前石阶：贴着台基的一级 + 再往外一级，一路落到地面
      const stepW = doorW + 0.8;
      const s1h = Math.max(0.16, B - 0.14);
      const s1 = new THREE.Mesh(new THREE.BoxGeometry(stepW, s1h, 0.58), houseStoneMat);
      s1.position.set(0, s1h / 2 - 0.1, dz + 0.35 + 0.29);
      s1.castShadow = true; s1.receiveShadow = true;
      g.add(s1);
      const s2h = Math.max(0.14, s1h * 0.5);
      const s2 = new THREE.Mesh(new THREE.BoxGeometry(stepW, s2h, 0.52), houseStoneMat);
      s2.position.set(0, s2h / 2 - 0.1, dz + 0.35 + 0.58 + 0.26);
      s2.castShadow = true; s2.receiveShadow = true;
      g.add(s2);

      // 正/背面各两扇窗，两侧各一扇
      [-1, 1].forEach((sgn) => {
        const zz = sgn * (dz + 0.05);
        [-1, 1].forEach((sx) => {
          addWindow(g, sx * W * 0.27, yW + H * 0.6, zz, 1.5, 1.5, sgn);
          if (H > 5.0) addWindow(g, sx * W * 0.27, yW + H * 0.86, zz, 0.95, 0.9, sgn);
        });
        addWindow(g, sgn * (W / 2 + 0.065), yW + H * 0.6, 0, 1.3, 1.4, sgn * 2);
      });

      // ---- 风格附加构件：不靠贴图，靠体块区分 ----
      const brickMat = new THREE.MeshStandardMaterial({ color: 0x8d5a45, roughness: 0.95 });
      const ironMat = new THREE.MeshStandardMaterial({ color: 0x3b4247, roughness: 0.6, metalness: 0.4 });
      if (vIdx === 1) {
        // 夯土房：屋顶砖砌烟囱 + 门口木廊
        const chim = new THREE.Mesh(new THREE.BoxGeometry(0.62, 1.5, 0.62), brickMat);
        chim.position.set(W * 0.28, apexY + 0.15, D * 0.18);
        chim.castShadow = true;
        g.add(chim);
        const chimTop = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.14, 0.76), houseStoneMat);
        chimTop.position.set(W * 0.28, apexY + 0.92, D * 0.18);
        g.add(chimTop);
        [-1, 1].forEach((sgn) => {
          const post = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.10, 2.7, 6), trimMat);
          post.position.set(sgn * (doorW / 2 + 0.55), yW + 1.35, dz + 0.95);
          post.castShadow = true;
          g.add(post);
        });
        const canopy = new THREE.Mesh(new THREE.BoxGeometry(doorW + 1.6, 0.1, 1.35), roofMat);
        canopy.position.set(0, yW + 2.78, dz + 0.72);
        canopy.rotation.x = 0.14;
        canopy.castShadow = true;
        g.add(canopy);
        // 廊下的长凳
        const bench = new THREE.Mesh(new THREE.BoxGeometry(doorW + 0.6, 0.1, 0.36), houseWoodMat);
        bench.position.set(0, yW + 0.48, dz + 0.85);
        g.add(bench);
      } else if (vIdx === 2) {
        // 青砖楼：二层挑出一圈木阳台 + 铁栏杆
        const balY = yW + H * 0.52;
        const slab = new THREE.Mesh(new THREE.BoxGeometry(W + 0.5, 0.12, 1.0), houseWoodMat);
        slab.position.set(0, balY, dz + 0.42);
        slab.castShadow = true;
        g.add(slab);
        const rail = new THREE.Mesh(new THREE.BoxGeometry(W + 0.5, 0.07, 0.07), ironMat);
        rail.position.set(0, balY + 0.86, dz + 0.88);
        g.add(rail);
        for (let i = 0; i <= 8; i++) {
          const bar = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.86, 0.045), ironMat);
          bar.position.set(-(W + 0.4) / 2 + (i / 8) * (W + 0.4), balY + 0.44, dz + 0.88);
          g.add(bar);
        }
        // 二层小窗换成落地窗
        addWindow(g, 0, balY + 0.95, dz + 0.07, 1.9, 1.3, 1);
      } else if (vIdx === 3) {
        // 木骨白墙：外墙嵌深色木横梁与斜撑
        [-1, 1].forEach((sgn) => {
          const zz = sgn * (dz + 0.03);
          [0.42, 0.72].forEach((k) => {
            const beam = new THREE.Mesh(new THREE.BoxGeometry(W + 0.1, 0.13, 0.1), trimMat);
            beam.position.set(0, yW + H * k, zz);
            g.add(beam);
          });
          for (let i = 0; i < 4; i++) {
            const vpost = new THREE.Mesh(new THREE.BoxGeometry(0.12, H * 0.96, 0.09), trimMat);
            vpost.position.set(-W / 2 + 0.35 + i * (W - 0.7) / 3, yW + H * 0.48, zz);
            g.add(vpost);
          }
        });
        // 侧面的外挂石阶（只做视觉，碰撞交给台基）
        for (let i = 0; i < 4; i++) {
          const st = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.22, 0.5), houseStoneMat);
          st.position.set(W / 2 + 0.5, yW - 0.75 + i * 0.22, -D * 0.25 + i * 0.42);
          st.castShadow = true;
          st.receiveShadow = true;
          g.add(st);
        }
      }

      root.add(g);
      const ca = Math.abs(Math.cos(rotY));
      const sa = Math.abs(Math.sin(rotY));
      const bx = (W * ca + D * sa) * 0.9 + 0.6;
      const bz = (W * sa + D * ca) * 0.9 + 0.6;
      addCollider(x, z, bx, bz, yW + H + 1.4, heightAt(x, z));
      noGrassZones.push({ x, z, r: Math.max(W, D) * 0.75 + 0.9 });
      addNoGrassRect(x, z, bx, bz, 1.4);
    }

    // ---------- 可进入的渔屋（带内部陈设）----------
    const floorMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.88, map: woodTexDark });
    const rugMat = new THREE.MeshStandardMaterial({ color: 0x7a4348, roughness: 0.98 });
    const mattressMat = new THREE.MeshStandardMaterial({ color: 0xd8d2c2, roughness: 0.95 });
    const blanketMat = new THREE.MeshStandardMaterial({ color: 0x9d4a44, roughness: 0.9 });
    const pillowMat = new THREE.MeshStandardMaterial({ color: 0xe8e4d4, roughness: 0.95 });
    const potMat = new THREE.MeshStandardMaterial({ color: 0x6b7d74, roughness: 0.7 });
    const potMat2 = new THREE.MeshStandardMaterial({ color: 0x8a5a3c, roughness: 0.75 });
    const lampMat = new THREE.MeshStandardMaterial({
      color: 0xffd9a0, emissive: 0xff9a40, emissiveIntensity: 1.6, roughness: 0.5
    });
    let interiorLights = 0;

    // 空心墙体 + 家具陈设；门朝向岛心并吸附到 90°，墙体碰撞为精确轴对齐盒
    function addOpenHouse(x, z, W, D, H, styleIdx) {
      // 可进入的渔屋原来全用公共材质，六栋长得一模一样。
      // 这里按村落同款风格表取色，并让「马头墙 / 烟囱」两种轮廓交替出现。
      const vIdx = (styleIdx == null ? 0 : styleIdx) % HOUSE_STYLES.length;
      const VMH = styleMats(vIdx);
      const wallMat = VMH.wall, roofMat = VMH.roof, trimMat = VMH.trim, sideMat = VMH.lin;
      // 和村落房一样：先量占地高差，用最高点当室内地板标高，
      // 下面用石砌台基垫平——否则坡地上的渔屋会一半陷进土里。
      // 采样范围要盖住「台基外沿 + 0.7m」，否则台基角上仍可能被坡面顶穿（穿模）。
      let hmn = Infinity, hmx = -Infinity;
      const hw0 = Math.max(W, D) * 0.55 + 0.78;
      for (let i = -2; i <= 2; i++) {
        for (let j = -2; j <= 2; j++) {
          const hh = heightAt(x + i * hw0 * 0.5, z + j * hw0 * 0.5);
          if (hh < hmn) hmn = hh;
          if (hh > hmx) hmx = hh;
        }
      }
      const dh = Math.max(0, hmx - hmn);
      const y0 = hmx + 0.04;
      const g = new THREE.Group();
      g.position.set(x, y0, z);
      const rotY = Math.round(Math.atan2(-x, -z) / (Math.PI / 2)) * (Math.PI / 2);
      g.rotation.y = rotY;

      const t = 0.18;
      const cs = Math.cos(rotY), sn = Math.sin(rotY);
      const odd = Math.abs(Math.round(rotY / (Math.PI / 2))) % 2 === 1;
      // 局部盒（中心 cx,cz + 尺寸 w,d,h）→ 世界轴对齐碰撞盒
      function solid(cx, cz, w, d, h, yb) {
        const wx = x + cx * cs + cz * sn;
        const wz = z - cx * sn + cz * cs;
        const ww = odd ? d : w;
        const wd = odd ? w : d;
        const c = {
          minX: wx - ww / 2, maxX: wx + ww / 2,
          minZ: wz - wd / 2, maxZ: wz + wd / 2,
          minY: y0 + (yb || 0), maxY: y0 + (yb || 0) + h
        };
        colliders.push(c);
        return c;
      }
      function box(w, h, d, mat, lx, ly, lz) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
        m.position.set(lx, ly, lz);
        m.castShadow = true;
        m.receiveShadow = true;
        g.add(m);
        return m;
      }

      // ---- 石砌台基：把坡地垫平，外面看是一圈高台，门口自然多一级石阶 ----
      const podH = dh + 0.42;
      const podium = new THREE.Mesh(new THREE.BoxGeometry(W + 0.92, podH, D + 0.92), houseStoneDarkMat);
      // 台基顶面下沉到 0.02：原来顶面正好在 0.10，和上面的压顶石、木地板
      // 三个面同高共面，室内整片地板一直在闪（z-fighting）。
      podium.position.y = 0.02 - podH / 2;
      podium.castShadow = true;
      podium.receiveShadow = true;
      g.add(podium);
      // 压顶石改成「只在外沿的一圈边框」，中间镂空让位给木地板：
      // 整块压顶石会把室内地板整个盖住，两层同高的面必然互相闪烁。
      {
        const capW = 0.57;                                  // 边框宽度（外沿 - 木地板外沿）
        const oW = W + 1.04, oD = D + 1.04;                 // 外沿尺寸
        const iW = W - 0.1, iD = D - 0.1;                   // 内沿 = 木地板外沿
        const cH = 0.1, cY = 0.10 - cH / 2 + 0.005;         // 顶面 0.105
        const mkCap = (w, d, x, z) => {
          const m = new THREE.Mesh(new THREE.BoxGeometry(w, cH, d), houseStoneMat);
          m.position.set(x, cY, z);
          m.receiveShadow = true;
          m.castShadow = true;
          g.add(m);
        };
        mkCap(oW, capW, 0, -(oD / 2 - capW / 2));           // 后
        mkCap(oW, capW, 0, (oD / 2 - capW / 2));            // 前
        mkCap(capW, iD, -(oW / 2 - capW / 2), 0);           // 左
        mkCap(capW, iD, (oW / 2 - capW / 2), 0);            // 右
      }
      // 台基顶面可以站（同时是门前平台），否则玩家从石阶迈进门时会掉进
      // 台基与木地板之间那道看不见的缝里——这就是「房子进不去」的主因。
      solid(0, 0, W + 0.92, D + 0.92, podH, 0.1 - podH);

      // ---- 门口石阶：按门外地面高差自动分成 1~4 级，每级不超过 0.34m ----
      // 原来只有一块没有碰撞的装饰石块，台基一高，玩家怎么都上不去。
      {
        const fx = x + (D / 2 + 1.05) * sn;
        const fz = z + (D / 2 + 1.05) * cs;
        const tY = heightAt(fx, fz);
        const rise = Math.max(0, (y0 + 0.1) - tY);
        const nStep = Math.max(1, Math.min(4, Math.ceil(rise / 0.34)));
        const per = rise / nStep;
        const stepW0 = 2.8;   // 与下面的 doorW(1.5) 对齐，宽出一圈
        const bottomLocal = -(rise + 0.4);
        for (let i = 0; i < nStep; i++) {
          const topLocal = 0.1 - i * per;
          const zc = D / 2 + 0.30 + i * 0.46;
          const hh = topLocal - bottomLocal;
          const m = new THREE.Mesh(new THREE.BoxGeometry(stepW0 - i * 0.06, hh, 0.48), houseStoneMat);
          m.position.set(0, (topLocal + bottomLocal) / 2, zc);
          m.castShadow = true;
          m.receiveShadow = true;
          g.add(m);
          solid(0, zc, stepW0 - i * 0.06, 0.46, hh, bottomLocal);
        }
      }

      // 木地板（可站立）
      box(W - 0.1, 0.1, D - 0.1, floorMat, 0, 0.05, 0);
      solid(0, 0, W - 0.1, D - 0.1, 0.1);

      // 四墙（前墙留 1.5m 门洞）
      const doorW = 1.5, doorH = 2.3;
      const segW = (W - doorW) / 2;
      box(W, H, t, wallMat, 0, H / 2, -D / 2 + t / 2);
      solid(0, -D / 2 + t / 2, W, t, H);
      [-1, 1].forEach((s) => addWindow(g, s * W * 0.26, H * 0.6, -D / 2 - 0.02, 1.4, 1.4, -1));
      [-1, 1].forEach((s) => {
        box(t, H, D, wallMat, s * (W / 2 - t / 2), H / 2, 0);
        solid(s * (W / 2 - t / 2), 0, t, D, H);
        // 侧墙开窗（带木框、窗棂、石窗台）
        addWindow(g, s * (W / 2 + 0.02), H * 0.62, -D * 0.12, 1.4, 1.15, s * 2);
      });
      [-1, 1].forEach((s) => {
        const cx = s * (doorW / 2 + segW / 2);
        box(segW, H, t, wallMat, cx, H / 2, D / 2 - t / 2);
        solid(cx, D / 2 - t / 2, segW, t, H);
        addWindow(g, cx, H * 0.6, D / 2 + 0.02, Math.min(1.35, segW * 0.62), 1.45, 1);
      });
      // 门楣墙体（门洞上方）
      box(doorW + 0.2, H - doorH, t, wallMat, 0, (doorH + H) / 2, D / 2 - t / 2);
      solid(0, D / 2 - t / 2, doorW + 0.2, t, H - doorH, doorH);
      // 门框 + 小雨棚
      // 门柱往里收 5mm：原来内侧面和墙段端面在同一个 x 平面上，整根门框会闪
      [-1, 1].forEach((s) => box(0.12, doorH, 0.27, houseWoodMat, s * (doorW / 2 + 0.055), doorH / 2, D / 2 - 0.005));
      box(doorW + 0.5, 0.14, 0.32, houseWoodMat, 0, doorH + 0.06, D / 2);
      const awn = box(doorW + 0.9, 0.07, 0.95, roofMat, 0, doorH + 0.34, D / 2 + 0.48);
      awn.rotation.x = 0.18;

      // 可开关的门：绕左侧门轴旋转，关着时挡住门洞
      const doorPivot = new THREE.Group();
      doorPivot.position.set(-doorW / 2, 0, D / 2 - 0.03);
      g.add(doorPivot);
      const doorPanel = new THREE.Mesh(new THREE.BoxGeometry(doorW - 0.04, doorH - 0.08, 0.09), houseWoodMat);
      doorPanel.position.set(doorW / 2, doorH / 2, 0);
      doorPanel.castShadow = true;
      doorPanel.receiveShadow = true;
      doorPivot.add(doorPanel);
      // 门板上的横向加固木条用深色木料；用墙面色的话在白墙上会像贴了三条胶带
      [-0.42, 0, 0.42].forEach((py) => {
        const plank = new THREE.Mesh(new THREE.BoxGeometry(doorW - 0.16, 0.06, 0.11), trimMat);
        plank.position.set(doorW / 2, doorH / 2 + py, 0);
        doorPivot.add(plank);
      });
      const knob = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 6), roofMat);
      knob.position.set(doorW - 0.2, doorH * 0.52, 0.07);
      doorPivot.add(knob);
      const doorCollider = solid(0, D / 2 - t / 2, doorW - 0.04, t, doorH);
      doors.push({
        x: x + (D / 2) * sn, z: z + (D / 2) * cs, y: y0,
        pivot: doorPivot, rot: 0, target: 0, open: false,
        collider: doorCollider, name: '渔屋'
      });

      // 屋顶（与村落同款双坡 + 屋脊；阶梯山墙只放后侧，避免挡门）
      const rw = W * 0.58;
      const theta = 0.4;
      const slabLen = rw / Math.cos(theta);
      [-1, 1].forEach((s) => {
        const slab = new THREE.Mesh(new THREE.BoxGeometry(slabLen, 0.28, D * 1.05), roofMat);
        slab.position.set(s * rw * 0.5, H + 0.7, 0);
        slab.rotation.z = -s * theta;
        slab.castShadow = true;
        slab.receiveShadow = true;
        g.add(slab);
      });
      const ridge = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.4, D * 1.06), roofMat);
      ridge.position.set(0, H + 1.52, 0);
      ridge.castShadow = true;
      g.add(ridge);
      // 檐下腰线：一圈深色木枋，把屋顶和整片白墙分开
      box(W + 0.07, 0.16, D + 0.07, trimMat, 0, H - 0.12, 0);

      if (vIdx === 0 || vIdx === 2) {
        // 马头墙：前后两端的三叠阶梯山墙，让大白墙也有徽派剪影
        const apexY0 = H + 0.72 + (rw / 2) * Math.tan(theta);
        const tiers0 = [
          [rw * 0.34, apexY0 + 0.5],
          [rw * 0.66, H + 1.48],
          [W / 2 + 0.2, H + 0.34]
        ];
        [-1, 1].forEach((sz) => {
          tiers0.forEach((tier) => {
            const halfW = tier[0];
            const topY = tier[1];
            const wallH = topY - (H - 0.3);
            const seg = new THREE.Mesh(new THREE.BoxGeometry(halfW * 2, wallH, 0.28), wallMat);
            seg.position.set(0, H - 0.3 + wallH / 2, sz * (D / 2 + 0.02));
            seg.castShadow = true;
            seg.receiveShadow = true;
            g.add(seg);
            const cap = new THREE.Mesh(new THREE.BoxGeometry(halfW * 2 + 0.18, 0.11, 0.44), roofMat);
            cap.position.set(0, topY + 0.055, sz * (D / 2 + 0.02));
            cap.castShadow = true;
            g.add(cap);
          });
        });

      } else {
        // 1 / 3 号风格：不做阶梯山墙，改成一个砖砌烟囱 + 檐口挑石
        var chim = new THREE.Mesh(new THREE.BoxGeometry(0.46, 1.5, 0.46), houseStoneMat);
        chim.position.set(W * 0.26, H + 1.35, -D * 0.22);
        chim.castShadow = true; chim.receiveShadow = true;
        g.add(chim);
        var chimCap = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.12, 0.62), roofMat);
        chimCap.position.set(W * 0.26, H + 2.16, -D * 0.22);
        g.add(chimCap);
      }
      addGableCaps(g, W, D, H, rw, theta, 0.02);
      [[W * 1.04, H * 0.58], [W * 0.7, H * 0.78], [W * 0.4, H * 0.98]].forEach((st) => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(st[0], st[1], 0.42), sideMat);
        m.position.set(0, st[1] / 2, -D / 2);
        m.castShadow = true;
        m.receiveShadow = true;
        g.add(m);
        const cap = new THREE.Mesh(new THREE.BoxGeometry(st[0] + 0.16, 0.16, 0.56), roofMat);
        cap.position.set(0, st[1] + 0.08, -D / 2);
        g.add(cap);
      });

      // ---------- 内部陈设 ----------
      // 地毯
      const rug = new THREE.Mesh(new THREE.CircleGeometry(1.05, 20), rugMat);
      rug.rotation.x = -Math.PI / 2;
      rug.position.set(0, 0.11, 0.35);
      rug.receiveShadow = true;
      g.add(rug);
      // 木桌 + 四腿 + 双凳
      box(1.5, 0.09, 0.95, houseWoodMat, -W * 0.22, 0.78, -D * 0.16);
      [[-0.62, -0.36], [0.62, -0.36], [-0.62, 0.36], [0.62, 0.36]].forEach((o) => {
        box(0.09, 0.74, 0.09, houseWoodMat, -W * 0.22 + o[0], 0.37, -D * 0.16 + o[1]);
      });
      solid(-W * 0.22, -D * 0.16, 1.5, 0.95, 0.82);
      // 桌子的世界坐标与顶面（用于把物品摆到桌面上）
      const tableCX = -W * 0.22, tableCZ = -D * 0.16;
      const tableX = x + tableCX * cs + tableCZ * sn;
      const tableZ = z - tableCX * sn + tableCZ * cs;
      tables.push({
        x: tableX, z: tableZ, y: y0 + 0.825,
        hw: (odd ? 0.95 : 1.5) / 2, hd: (odd ? 1.5 : 0.95) / 2
      });
      // 两条凳子：可坐（按 F 坐下/起身）
      [[0, 0.9], [0.95, -0.25]].forEach((o) => {
        box(0.38, 0.42, 0.38, houseWoodMat, -W * 0.22 + o[0], 0.21, -D * 0.16 + o[1]);
        solid(-W * 0.22 + o[0], -D * 0.16 + o[1], 0.38, 0.38, 0.42);
        const sx = x + (-W * 0.22 + o[0]) * cs + (-D * 0.16 + o[1]) * sn;
        const sz = z - (-W * 0.22 + o[0]) * sn + (-D * 0.16 + o[1]) * cs;
        seats.push({
          x: sx, z: sz, y: y0 + 0.42,
          yaw: Math.atan2(-(tableX - sx), -(tableZ - sz))
        });
      });
      // 木床：靠右后墙角摆放，和立柜分开，避免互相卡住
      const bedCX = W / 2 - 1.25, bedCZ = -D / 2 + 0.78;
      box(2.05, 0.35, 1.05, houseWoodMat, bedCX, 0.28, bedCZ);
      box(1.95, 0.16, 0.95, mattressMat, bedCX, 0.54, bedCZ);
      box(1.2, 0.1, 0.97, blanketMat, bedCX + 0.36, 0.66, bedCZ);
      box(0.5, 0.12, 0.6, pillowMat, bedCX - 0.68, 0.68, bedCZ);
      solid(bedCX, bedCZ, 2.05, 1.05, 0.6);
      // 床的世界坐标（用于睡觉交互）
      beds.push({
        x: x + bedCX * cs + bedCZ * sn,
        z: z - bedCX * sn + bedCZ * cs
      });
      // 立柜（移到左后角贴墙摆放，与床、桌子都分开）
      box(0.95, 1.9, 0.5, houseWoodMat, -W / 2 + 0.78, 0.95, -D / 2 + 0.62);
      solid(-W / 2 + 0.78, -D / 2 + 0.62, 0.95, 0.5, 1.9);
      // 壁挂搁板 + 陶罐
      box(1.2, 0.06, 0.3, houseWoodMat, -W / 2 + 0.4, 1.5, D * 0.1);
      box(0.22, 0.3, 0.22, potMat, -W / 2 + 0.4, 1.68, D * 0.02);
      box(0.18, 0.22, 0.18, potMat2, -W / 2 + 0.4, 1.64, D * 0.24);
      // 吊灯：吊杆 + 灯罩 + 点光源
      box(0.05, 0.45, 0.05, houseWoodMat, 0, H - 0.32, 0);
      box(0.26, 0.32, 0.26, lampMat, 0, H - 0.68, 0);
      // 室内点光源只给前三栋（灯多了夜景会糊，每盏点光源都要进着色器）
      const litHere = interiorLights < 3;
      if (litHere) {
        const lx = x + 0 * cs + 0 * sn;
        const lz = z - 0 * sn + 0 * cs;
        const pl = new THREE.PointLight(0xff9a50, 0.95, 10, 2);
        pl.position.set(lx, y0 + H - 0.72, lz);
        root.add(pl);
        nightLights.push({ light: pl, base: 0.95 });
        interiorLights++;
      }

      root.add(g);
      noGrassZones.push({ x, z, r: Math.max(W, D) * 0.75 + 0.9 });
      addNoGrassRect(x, z, odd ? D : W, odd ? W : D, 1.2);
      // 这一栋的落位信息：外面要据此挂灯笼 / 木牌
      return { x, z, y0, rotY, D, lit: litHere };
    }

    // 村落沿岛岸分布：从岸线向内寻找不与既有物件重叠的位置，正面朝向岛心
    function houseSpotClear(x, z, hr, ignoreSoft, force) {
      const rr = Math.hypot(x, z);
      const a = Math.atan2(z, x);
      if (rr > islandRadiusAt(a) - hr - 1.6) return false;
      if (rr < pondRadiusAt(a) + hr + 2.0) return false;
      // 房屋是平底的盒子，落在坡面上必然一侧埋进土里、一侧悬空——就是用户看到的
      // 「山丘和房子卡在一块」。这里沿占地范围做 5×5 采样，高差超过 0.3m 直接换位置。
      const hw = hr * 0.7;
      let hmin = Infinity, hmax = -Infinity;
      for (let i = -2; i <= 2; i++) {
        for (let j = -2; j <= 2; j++) {
          const hh = heightAt(x + i * hw * 0.5, z + j * hw * 0.5);
          if (hh < hmin) hmin = hh;
          if (hh > hmax) hmax = hh;
        }
      }
      // 缓坡是可以建的：台基会按高差自动加高，把低侧填平（见 addHouse）。
      // 只有陡坡（台基填不平）和已经站到坡腰的位置才换点。
      window.__clr = window.__clr || [];
      window.__clr.push({ x: +x.toFixed(1), z: +z.toFixed(1), d: +(hmax - hmin).toFixed(2), hi: +hmax.toFixed(2) });
      if (hmax - hmin > 0.8) return false;
      if (hmax > 1.15) return false;
      // 异步建筑（渔屋）占的地盘：它的碰撞盒要等 glb 加载完才有，
      // 这里先用圆占位，免得商店直接盖在房子上。
      for (let i = 0; i < reservedFootprints.length; i++) {
        const f = reservedFootprints[i];
        if (Math.hypot(x - f.x, z - f.z) < f.r + hr + 0.8) return false;
      }
      // force：商店专用保底。岸边树太密时，允许挤开别的建筑——
      // 宁可两栋店挨得近一点，也不能因为找不到空地就整栋消失。
      if (force) return true;
      for (let i = 0; i < colliders.length; i++) {
        const c = colliders[i];
        const nx = Math.max(c.minX, Math.min(x, c.maxX));
        const nz = Math.max(c.minZ, Math.min(z, c.maxZ));
        const gd = Math.hypot(x - nx, z - nz);
        // 树和石头可以挨着房子（沿岸本来就种满了树），
        // 但建筑之间必须留出完整的院子，否则会互相咬在一起。
        const soft = (c.tag === 'tree' || c.tag === 'rock');
        // 注意 gd 是「房心到树/石碰撞盒」的距离，房子自己的半径是 hr，
        // 所以软物体也要 hr + 树冠余量，否则墙会整片插进树冠里。
        // ignoreSoft：岸边树太密时给商店留的后路——宁可砍掉几棵树，
        // 也不能因为"附近有树"就整栋商店消失。
        if (soft) {
          if (ignoreSoft) continue;
          if (gd < hr + 2.2) return false;
        } else if (gd < hr + 0.9) return false;
      }
      return true;
    }

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
      // 商店选址在下面同步跑，先占位：屋身 + 2.8m 露台一起算 6.4m 半径
      const footC = toWorld(-1.9, 0);
      reservedFootprints.push({ x: footC.x, z: footC.z, r: 6.4 });

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
            let onPlane = 0, xs = 0, ys = 0, zz = 0;
            for (let k = 0; k < 3; k++) {
              v.fromBufferAttribute(pos, idx.getX(i + k));
              v.applyMatrix4(hull.matrixWorld).applyMatrix4(inv);   // 转到组局部坐标
              if (Math.abs(v.x + BX) < 0.08) onPlane++;
              xs += v.x; ys += v.y; zz += v.z;
            }
            // 旧露台：重心整个落在墙前 0.5m 以外就算露台的一部分。
            // 这里必须用重心、不能用「三个点都在外面」—— 素材的露台顶棚是一根长条盒子，
            // 它朝屋子的那一面正好贴在墙平面上，按顶点判会整根留下来（第一版就留了一根横梁）。
            // 门槛设在 -4.0 而不是墙平面，是为了保住屋檐（屋顶前檐在局部 -3.60）。
            if (xs / 3 < -4.0) { cutPorch++; continue; }
            // 旧露台还沿着屋子的两侧绕了一圈：重心跑到屋身宽度之外的、又低于屋顶的，
            // 一律按露台的一部分剔掉（屋顶前檐/侧檐重心高，不会被误伤）。
            if (Math.abs(zz / 3) > 3.5 && ys / 3 < 4.4) { cutPorch++; continue; }
            // 正墙：三个点都贴在那个平面上、而且重心低于门楣上沿 -> 整片挖掉
            if (onPlane === 3 && ys / 3 < CEIL + 0.12) { cutWall++; continue; }
            // 素材的窗框/玻璃比墙平面往里缩一点，按平面判会漏下来，在屋里变成几片浮空的碎片。
            // 这里再加一层「贴着墙内侧的薄板」，把重心落在这层里的东西一起清掉。
            if (xs / 3 > -3.95 && xs / 3 < -2.95 && ys / 3 < CEIL + 0.2 && Math.abs(zz / 3) < 3.4) {
              cutWall++; continue;
            }
            // 还有更离谱的：模型里残留的一块门/窗残片飘在屋子正中间（射线打到的位置
            // 离正墙 1.5m）。索性按"室内空间"整个掏空——墙都在边界上，不会被误伤。
            if (xs / 3 > -3.42 && xs / 3 < 3.35 && Math.abs(zz / 3) < 3.29 &&
                ys / 3 > 1.35 && ys / 3 < CEIL + 0.05) {
              cutWall++; continue;
            }
            for (let k = 0; k < 3; k++) keep.push(idx.getX(i + k));
          }
          geo.setIndex(keep);
          console.log('[cliffhut] 挖掉旧正墙', cutWall, '个面 / 旧露台', cutPorch, '个面');
        }

        // ---- 2. 砌正墙：板条墙 + 真门洞 + 两扇窗 ----
        const sidingTex = texFromCanvas(makeWoodTexture('#9d9682', 'rgba(52,48,40,0.75)', 91), [1, 1]);
        function sidingMat(w, h) {
          const t = sidingTex.clone();
          t.needsUpdate = true;
          t.repeat.set(Math.max(1, Math.round(w / 1.7)), Math.max(1, Math.round(h / 1.7)));
          return new THREE.MeshStandardMaterial({ map: t, color: 0xffffff, roughness: 0.95 });
        }
        // 室内墙面材质：正墙的盒子要分两面（朝外 = 外墙板，朝里 = 室内板）
        const inWallMat = new THREE.MeshStandardMaterial({
          map: texFromCanvas(makeWoodTexture('#8a7256', 'rgba(40,30,20,0.8)', 57), [2.6, 1.6]), roughness: 0.95
        });
        const wallX = -BX - 0.02;
        const wy0 = FLR - 0.32, wy1 = CEIL + 0.06;   // 墙体从地板下皮砌到吊顶之上一点
        const wh = wy1 - wy0, wallZ = BW + 0.06;
        function wallPanel(z0, z1) {
          const len = Math.abs(z1 - z0);
          const sm = sidingMat(len, wh);
          // +X 朝屋里、-X 朝屋外，两侧用不同材质
          const b = new THREE.Mesh(new THREE.BoxGeometry(0.16, wh, len), [inWallMat, sm, sm, sm, sm, sm]);
          b.position.set(wallX, (wy0 + wy1) / 2, (z0 + z1) / 2);
          b.castShadow = true; b.receiveShadow = true;
          g.add(b);
        }
        wallPanel(-wallZ, -DOOR_W / 2);
        wallPanel(DOOR_W / 2, wallZ);
        const lintSM = sidingMat(DOOR_W, wy1 - (FLR + DOOR_H));
        const lintel = new THREE.Mesh(
          new THREE.BoxGeometry(0.16, wy1 - (FLR + DOOR_H), DOOR_W),
          [inWallMat, lintSM, lintSM, lintSM, lintSM, lintSM]
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
            new THREE.MeshStandardMaterial({ color: 0x1d252c, roughness: 0.55, metalness: 0.05 })
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

    // 村落：全岛只留上面那一栋能过夜的渔屋，其余 6 栋实心外景房全部删掉。
    // 之前是 6 间渔屋 + 6 栋外景房，先删到「1 间渔屋 + 6 栋外景房」，
    // 但玩家仍然觉得渔屋太多——外景房和渔屋长得几乎一样，看着还是一排房。
    // 现在这 6 栋也去掉，岛上就只剩出生点旁那一栋挂着灯笼的小屋。

    // ---------- 给唯一的渔屋挂灯笼 / 木牌 ----------
    // 门边一盏灯、门楣一块「可过夜」，天黑了一眼就能认出这是能睡觉的那一间。
    function decorateHome(home) {
      if (!home) return;
      const cs = Math.cos(home.rotY), sn = Math.sin(home.rotY);
      const frontZ = home.D / 2;

      // 屋内补一盏灯（interiorLights 只给前三栋，这栋可能没排上，夜里会是黑的）
      if (!home.lit) {
        const pl = new THREE.PointLight(0xffa860, 0.95, 10, 2);
        pl.position.set(home.x, home.y0 + 3.6, home.z);
        root.add(pl);
        nightLights.push({ light: pl, base: 0.95 });
      }

      const doorG = new THREE.Group();
      doorG.position.set(home.x, home.y0, home.z);
      doorG.rotation.y = home.rotY;
      root.add(doorG);

      // 灯笼吊在门廊遮阳篷的外沿上（直接挂在墙上会和篷布咬在一起）
      const lx = 0.95, lz = frontZ + 0.78;
      const chain = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.20, 0.03), houseWoodMat);
      chain.position.set(lx, 2.52, lz);
      doorG.add(chain);
      const lanternMat = new THREE.MeshStandardMaterial({
        color: 0xffd9a0, emissive: 0xff8a3a, emissiveIntensity: 0.9, roughness: 0.7
      });
      const lg = new THREE.Mesh(new THREE.CylinderGeometry(0.115, 0.115, 0.28, 10), lanternMat);
      lg.position.set(lx, 2.33, lz);
      doorG.add(lg);
      [-1, 1].forEach((s) => {
        const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.045, 10), houseStoneMat);
        cap.position.set(lx, 2.33 + s * 0.152, lz);
        doorG.add(cap);
      });
      const lampLight = new THREE.PointLight(0xffb066, 1.2, 9, 2);
      lampLight.position.set(
        home.x + lx * cs + lz * sn,
        home.y0 + 2.33,
        home.z - lx * sn + lz * cs
      );
      root.add(lampLight);
      nightLights.push({ light: lampLight, base: 1.2 });

      // 「可过夜」木牌：门楣上方，正对着门外
      const cv = document.createElement('canvas');
      cv.width = 256; cv.height = 84;
      const c2 = cv.getContext('2d');
      c2.fillStyle = '#33220f'; c2.fillRect(0, 0, 256, 84);
      c2.strokeStyle = '#c9a24a'; c2.lineWidth = 6;
      c2.strokeRect(6, 6, 244, 72);
      c2.fillStyle = '#f4dca8';
      c2.textAlign = 'center';
      c2.textBaseline = 'middle';
      // 字号按实际文字宽度收一档：写死 44px 时「夜」的右边会顶到金边
      const label = '可 过 夜';
      let fsz = 44;
      c2.font = 'bold ' + fsz + 'px sans-serif';
      const tw = c2.measureText(label).width;
      if (tw > 216) {
        fsz = Math.max(26, Math.floor(fsz * 216 / tw));
        c2.font = 'bold ' + fsz + 'px sans-serif';
      }
      c2.fillText(label, 128, 46);
      const signTex = new THREE.CanvasTexture(cv);
      signTex.colorSpace = THREE.SRGBColorSpace;
      signTex.anisotropy = 4;
      const sign = new THREE.Mesh(
        new THREE.PlaneGeometry(1.02, 0.335),
        new THREE.MeshStandardMaterial({ map: signTex, roughness: 0.8, emissive: 0x2a1a08, emissiveIntensity: 1 })
      );
      sign.position.set(0, 3.22, frontZ + 0.055);
      doorG.add(sign);
      const signBack = new THREE.Mesh(new THREE.BoxGeometry(1.10, 0.40, 0.05), houseWoodMat);
      signBack.position.set(0, 3.22, frontZ + 0.018);
      signBack.castShadow = true;
      doorG.add(signBack);
    }

    // 在某个位置清出空地：把范围内的树和它们的碰撞盒一起删掉。
    // 商店的选址允许忽略树（否则岸边的树太密，整栋店都放不下），
    // 但"忽略"之后必须真的把树清走，不然树会直接从柜台里穿出来。
    function clearScatterAround(x, z, radius) {
      for (let i = palms.length - 1; i >= 0; i--) {
        const p = palms[i];
        if (Math.hypot(p.group.position.x - x, p.group.position.z - z) < radius) {
          root.remove(p.group);
          palms.splice(i, 1);
        }
      }
      // 石头是直接挂在 root 上的独立 mesh，只删碰撞盒的话，
      // 那块大石头还会杵在柜台前面（看起来就是"石头穿模进商店"）。
      for (let i = rockMeshes.length - 1; i >= 0; i--) {
        const rm = rockMeshes[i];
        if (Math.hypot(rm.x - x, rm.z - z) < radius) {
          root.remove(rm.mesh);
          rockMeshes.splice(i, 1);
        }
      }
      for (let i = colliders.length - 1; i >= 0; i--) {
        const c = colliders[i];
        if (c.tag !== 'tree' && c.tag !== 'rock' && c.tag !== 'pillar') continue;
        const cx = (c.minX + c.maxX) * 0.5;
        const cz = (c.minZ + c.maxZ) * 0.5;
        if (Math.hypot(cx - x, cz - z) < radius) colliders.splice(i, 1);
      }
    }

    // ---------- 鱼市摊位素材（Fab · Stylize Fish Market / LowPolyBoy · CC-BY 4.0）----------
    // 以前五间店都是程序化木屋。换成这套低多边形鱼市：模型里 4 个带条纹遮阳棚的
    // 摊位 + 一堆木箱/鱼盘/货筐，按空间就近分好组，各自裁出来缩放后摆到原商店位置。
    // 单文件版把 glb 以 base64 内联（window.MARKET_ASSETS），开发时读 assets/fishmarket/。
    const MarketAsset = (function () {
      const INLINE = window.MARKET_ASSETS || null;
      const SRC_URL = 'assets/fishmarket/market_opt.glb';
      // 部件分组：只取"遮阳棚投影范围内 + 柜台前后的货"，远处的木箱堆不要，
      // 否则整组被撑大，缩放后棚反而缩小、还挡住柜台。
      const GROUPS = {
        // 红白条纹大棚：棚 + 柜台上下的鱼盘果盘
        red: ['Cube015_65', 'Cube004_27', 'Cube006_28', 'Cube024_36', 'Cube025_37',
          'Cube026_38', 'Cube009_29', 'Cube013_8', 'Circle_7',
          'Cube030_42', 'Cube032_43', 'Cube033_44', 'Cube034_45', 'Cube035_46', 'Cube036_47',
          'Cube017_34', 'Cube010_31', 'Cube041_52', 'Cube042_53', 'Cube043_54',
          'Cube050_15', 'Cube051_16', 'Cube054_4'],
        // 绿白条纹大棚
        green: ['Cube016_66', 'Cube018_35', 'Cube037_48', 'Cube038_49', 'Cube011_32',
          'Cylinder002_33', 'Cube052_17', 'Cube053_18', 'Cube039_50', 'Cube040_51', 'Cube008_26'],
        // 蓝白遮阳伞摊
        blue: ['Cube012_63', 'Cube047_60', 'Cube048_61', 'Cube049_62',
          'Circle001_30', 'Circle002_58', 'Circle003_59', 'Cube001_22',
          'Cube022_13', 'Cube023_14'],
        // 蓝白小棚（宝箱店那种小巧的）
        small: ['Cube014_64', 'Cube002_23', 'Cube005_24', 'Cube027_39', 'Cube028_40',
          'Cube029_41', 'Cube007_25', 'Cube044_55', 'Cube045_56', 'Cube046_57',
          'Cylinder_5', 'Cube041_52', 'Cube042_53', 'Cube043_54', 'Cube056_20'],
        palm: ['Cylinder012_0', 'Cylinder003_1', 'Cylinder004_2']
      };

      let src = null;
      let state = 0;                 // 0 未开始 / 1 加载中 / 2 就绪
      const queue = [];
      let loader = null;

      function b64buf(b64) {
        const bin = atob(b64);
        const n = bin.length;
        const u8 = new Uint8Array(n);
        for (let i = 0; i < n; i++) u8[i] = bin.charCodeAt(i);
        return u8.buffer;
      }

      // 背光面会整个糊黑，给材质挂上贴图驱动的弱自发光抬一档黑位
      function boostMats(root) {
        const seen = new Map();
        root.traverse((o) => {
          if (!o.isMesh || !o.material) return;
          const ms = Array.isArray(o.material) ? o.material : [o.material];
          const out = ms.map((m) => {
            if (seen.has(m.uuid)) return seen.get(m.uuid);
            const c = m.clone();
            if (c.map) {
              c.emissiveMap = c.map;
              c.emissive = new THREE.Color(0xffffff);
              c.emissiveIntensity = 0.16;
            }
            c.roughness = Math.min(1, (c.roughness ?? 0.8) * 1.05);
            c.metalness = Math.min(0.35, c.metalness ?? 0);
            seen.set(m.uuid, c);
            return c;
          });
          o.material = Array.isArray(o.material) ? out : out[0];
        });
      }

      // ---------- 剔掉模型自带的"悬空挂旗" ----------
      // 市场素材在棚子外侧伸出一根横杆，末端吊一块画着鱼的木牌；杆的根部只是
      // 虚插在棚檐里，杆和牌整个悬在空中。玩家反馈"商店前面有浮空物体"就是它。
      // 我们已经有自己的招牌（细木棍 + 小木牌），这些挂件纯属多余，所以按连通
      // 块整块剔掉：先在三角形之间做并查集把网格拆成互不相连的块，再删掉那种
      //   · 不接地（块底 y > 0.45）
      //   · 整块都落在棚顶投影之外（在某个轴上离棚布 0.35 以上）
      // 的块。棚布、框架、柱子、柜台要么接地，要么跨在棚布正上方，不会被误伤。
      function trimHanging() {
        if (!src) return;
        let host = null;
        src.traverse((o) => { if (!host && o.name === 'GLTF_SceneRootNode') host = o; });
        const names = new Set();
        Object.keys(GROUPS).forEach((k) => {
          if (k === 'palm') return;
          GROUPS[k].forEach((n) => names.add(n));
        });
        const done = new Set();
        const scan = (mesh) => {
          if (!mesh.isMesh || !mesh.geometry) return;
          const g = mesh.geometry;
          if (done.has(g.uuid)) return;
          done.add(g.uuid);
          const pos = g.attributes.position;
          if (!pos) return;
          const idx = g.index;
          const nTri = Math.round((idx ? idx.count : pos.count) / 3);
          if (nTri < 300) return;
          const I = (t, k) => (idx ? idx.getX(t * 3 + k) : t * 3 + k);
          // 顶点按位置量化后合并：导出的网格里同一个点常常被拆成好几个顶点
          const map = new Map();
          const vid = new Int32Array(pos.count);
          for (let i = 0; i < pos.count; i++) {
            const k = Math.round(pos.getX(i) * 200) + '|' + Math.round(pos.getY(i) * 200) + '|' + Math.round(pos.getZ(i) * 200);
            let v = map.get(k);
            if (v === undefined) { v = map.size; map.set(k, v); }
            vid[i] = v;
          }
          const par = new Int32Array(map.size);
          for (let i = 0; i < par.length; i++) par[i] = i;
          const find = (a) => { while (par[a] !== a) { par[a] = par[par[a]]; a = par[a]; } return a; };
          const uni = (a, b) => { a = find(a); b = find(b); if (a !== b) par[a] = b; };
          for (let t = 0; t < nTri; t++) {
            uni(vid[I(t, 0)], vid[I(t, 1)]);
            uni(vid[I(t, 1)], vid[I(t, 2)]);
          }
          const boxes = new Map();
          for (let t = 0; t < nTri; t++) {
            const r = find(vid[I(t, 0)]);
            let e = boxes.get(r);
            if (!e) { e = { n: 0, minX: 1e9, maxX: -1e9, minY: 1e9, maxY: -1e9, minZ: 1e9, maxZ: -1e9 }; boxes.set(r, e); }
            e.n++;
            for (let k = 0; k < 3; k++) {
              const vi = I(t, k);
              const x = pos.getX(vi), y = pos.getY(vi), z = pos.getZ(vi);
              if (x < e.minX) e.minX = x; if (x > e.maxX) e.maxX = x;
              if (y < e.minY) e.minY = y; if (y > e.maxY) e.maxY = y;
              if (z < e.minZ) e.minZ = z; if (z > e.maxZ) e.maxZ = z;
            }
          }
          // 主体 = "最高的那批块里三角形最多的"，也就是棚顶布
          let topY = -1e9;
          boxes.forEach((e) => { if (e.maxY > topY) topY = e.maxY; });
          let main = null;
          boxes.forEach((e) => { if (e.maxY > topY - 0.2 && (!main || e.n > main.n)) main = e; });
          if (!main || main.n < nTri * 0.05) return;
          const drop = new Set();
          boxes.forEach((e, key) => {
            if (e === main || e.n < 60 || e.minY < 0.45) return;
            // 挂杆只沿棚子的长边（局部 x）伸出去，所以只在 x 上判"伸到棚外"。
            // z 方向不能判：顶棚布只是弧面中间那一条，比整顶棚窄得多。
            const outX = e.minX > main.maxX + 0.35 || e.maxX < main.minX - 0.35;
            if (outX) drop.add(key);
          });
          if (!drop.size) return;
          const keep = [];
          let cut = 0;
          for (let t = 0; t < nTri; t++) {
            if (drop.has(find(vid[I(t, 0)]))) { cut++; continue; }
            keep.push(I(t, 0), I(t, 1), I(t, 2));
          }
          if (!cut || keep.length / 3 < nTri * 0.6) return;   // 删太多说明判错了，放弃
          g.setIndex(keep);
          g.index.needsUpdate = true;
          g.computeBoundingSphere();
          g.computeBoundingBox();
        };
        names.forEach((n) => {
          const node = host ? host.children.find((c) => c.name === n) : null;
          if (node) node.traverse(scan);
        });
      }

      function ready(gltf) {
        src = gltf.scene;
        src.updateMatrixWorld(true);
        boostMats(src);
        trimHanging();
        state = 2;
        const jobs = queue.splice(0, queue.length);
        jobs.forEach((fn) => { try { fn(); } catch (e) { console.warn('[market]', e); } });
      }

      function fail(err) {
        console.warn('[market] 素材加载失败', err);
        state = 0;
      }

      function whenReady(cb) {
        if (state === 2) { cb(); return; }
        queue.push(cb);
        if (state === 1) return;
        state = 1;
        if (!loader) loader = new THREE.GLTFLoader();
        if (INLINE) loader.parse(b64buf(INLINE), '', ready, fail);
        else loader.load(SRC_URL, ready, undefined, fail);
      }

      // 从源场景里挑出若干顶层节点，克隆成一个新 group
      function cut(names) {
        const set = names instanceof Set ? names : new Set(names);
        const g = new THREE.Group();
        let host = null;
        src.traverse((o) => { if (!host && o.name === 'GLTF_SceneRootNode') host = o; });
        (host || src).children.forEach((ch) => {
          if (set.has(ch.name)) g.add(ch.clone(true));
        });
        return g;
      }

      // 把某个部件组摆进 parent：按宽度缩放、底面贴 0、水平居中
      function place(kind, parent, opts) {
        const o = opts || {};
        whenReady(() => {
          const part = cut(GROUPS[kind] || GROUPS.red);
          // 先量原始尺寸
          const b0 = new THREE.Box3().setFromObject(part);
          const s0 = b0.getSize(new THREE.Vector3());
          // 宽和深同时约束：哪个先顶到上限就按哪个缩，避免整组铺开挤占通道
          let sc = Infinity;
          if (o.width) sc = Math.min(sc, o.width / Math.max(0.001, s0.x));
          if (o.depth) sc = Math.min(sc, o.depth / Math.max(0.001, s0.z));
          if (!isFinite(sc)) sc = 1;
          if (o.maxHeight && s0.y * sc > o.maxHeight) sc = o.maxHeight / s0.y;
          part.scale.setScalar(sc);
          part.updateMatrixWorld(true);
          const b1 = new THREE.Box3().setFromObject(part);
          const c1 = b1.getCenter(new THREE.Vector3());
          part.position.set(-c1.x, -b1.min.y + (o.lift || 0), -c1.z);
          if (o.rotY) part.rotation.y = o.rotY;
          part.updateMatrixWorld(true);
          part.traverse((m) => {
            if (!m.isMesh) return;
            m.castShadow = true;
            m.receiveShadow = true;
          });
          // 主棚（组里第一个节点）的顶面高度：招牌要坐在这上面，
          // 不能用整组高度——棚顶上还顶着鱼和螃蟹，会高出一大截。
          // 注意要在挂到 parent 之前量，否则混进 parent 的地形高度。
          let roofY = b1.max.y - b1.min.y;
          const mainName = (GROUPS[kind] || GROUPS.red)[0];
          let mainObj = null;
          part.traverse((m) => { if (!mainObj && m.name === mainName) mainObj = m; });
          if (mainObj) {
            // part.position.y 已经把底面挪到 0，所以顶面世界 y 就是离地高度
            const mb = new THREE.Box3().setFromObject(mainObj);
            roofY = mb.max.y;
          }
          parent.add(part);
          if (o.onReady) o.onReady(part, { height: roofY, size: s0.clone().multiplyScalar(sc) });
        });
      }

      return { place, whenReady, isReady: () => state === 2 };
    })();

    // ---------- 商店小招牌：细木棍 + 挂在棍顶的小木牌 ----------
    // 玩家反馈「商店的牌子变小，在旁边立一根细木棍，牌子就放在棍子上」。
    // 原来是 3.3~3.6m 的大横牌架在棚顶正上方，比摊位本身还抢眼；
    // 现在统一缩到 1.02×0.36，由一根 φ0.11 的木杆挑在铺子前侧的角落，
    // 杆顶露出一截，牌子正对顾客来的方向（局部 +Z）。
    function makePostSign(g, opt, lx, lz) {
      const cv = document.createElement('canvas');
      cv.width = 320; cv.height = 112;
      const c = cv.getContext('2d');
      c.fillStyle = opt.bg || '#3c2a1c';
      c.fillRect(0, 0, 320, 112);
      c.strokeStyle = opt.accent || '#c9a227';
      c.lineWidth = 6;
      c.strokeRect(5, 5, 310, 102);
      c.fillStyle = opt.fg || '#f6e2b0';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.font = 'bold 40px "Microsoft YaHei", sans-serif';
      c.fillText(opt.text, 160, opt.sub ? 44 : 56);
      if (opt.sub) {
        c.fillStyle = opt.accent || '#c9a227';
        c.font = 'bold 17px "Microsoft YaHei", sans-serif';
        c.fillText(opt.sub, 160, 83);
      }
      const tex = new THREE.CanvasTexture(cv);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 4;

      const grp = new THREE.Group();
      grp.position.set(lx, 0, lz);
      g.add(grp);

      // 杆：细木棍，上端出头
      const rod = new THREE.Mesh(
        new THREE.CylinderGeometry(0.045, 0.055, 1.95, 7),
        new THREE.MeshStandardMaterial({ color: 0x6b4f34, roughness: 0.92 })
      );
      rod.position.y = 0.975;
      rod.castShadow = true;
      grp.add(rod);

      // 牌子：正面是字，其余五面是同色木板（不做镜像的背面字）
      const wood = new THREE.MeshStandardMaterial({ color: 0x4a3524, roughness: 0.9 });
      const face = new THREE.MeshStandardMaterial({
        map: tex, roughness: 0.7, emissive: 0x1a1410, emissiveIntensity: 0.5
      });
      const board = new THREE.Mesh(
        new THREE.BoxGeometry(1.02, 0.355, 0.045),
        [wood, wood, wood, wood, face, wood]
      );
      board.position.set(0, 1.62, 0.035);
      board.castShadow = true;
      grp.add(board);
      // 两块小托板，把牌子"架"在杆上
      [-0.3, 0.3].forEach((ox) => {
        const br = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.09), wood);
        br.position.set(ox, 1.62, 0.0);
        grp.add(br);
      });
      return grp;
    }

    // ---------- 鱼饵商店（沿岛岸的专用小铺：柜台 + 饵料罐 + 招牌）----------
    let baitShop = null;
    (function buildBaitShop() {
      let spot = null;
      for (let pass = 0; pass < 3 && !spot; pass++) {
        for (let k = 0; k < 36 && !spot; k++) {
          const a = -0.6 + k * 0.19;
          for (let rr = islandRadiusAt(a) - 8.0; rr > 20; rr -= 1.1) {
            const x = Math.cos(a) * rr;
            const z = Math.sin(a) * rr;
            if (houseSpotClear(x, z, 6.2, pass >= 1, pass === 2)) { spot = { x, z, a }; break; }
          }
        }
      }
      if (!spot) return;
      const x = spot.x, z = spot.z, W = 6.6, D = 5.4, H = 4.4;
      const y0 = heightAt(x, z);
      const g = new THREE.Group();
      g.position.set(x, y0, z);
      const rotY = Math.atan2(-x, -z);
      g.rotation.y = rotY;
      const cs = Math.cos(rotY), sn = Math.sin(rotY);
      const odd = Math.abs(Math.round(rotY / (Math.PI / 2))) % 2 === 1;
      function solid(cx, cz, w, d, h, yb) {
        const wx = x + cx * cs + cz * sn;
        const wz = z - cx * sn + cz * cs;
        const ww = odd ? d : w, wd = odd ? w : d;
        colliders.push({
          minX: wx - ww / 2, maxX: wx + ww / 2,
          minZ: wz - wd / 2, maxZ: wz + wd / 2,
          minY: y0 + (yb || 0), maxY: y0 + (yb || 0) + h
        });
      }
      function box(w, h, d, mat, lx, ly, lz, ry) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
        m.position.set(lx, ly, lz);
        if (ry) m.rotation.y = ry;
        m.castShadow = true; m.receiveShadow = true;
        g.add(m);
        return m;
      }
      // 模型是敞开的摊位，用碰撞盒把柜台到后场围住，玩家只能站在柜台外侧
      solid(0, -D * 0.10, W * 0.84, D * 0.64, H);
      // 柜台上的饵料罐（彩色陶罐）：给"卖鱼饵"一个近看的标识
      const jarCols = [0x2f6f5e, 0xb5642f, 0x8a3a4a, 0x3f5f8a];
      jarCols.forEach((c, i) => {
        const jar = new THREE.Mesh(
          new THREE.CylinderGeometry(0.16, 0.19, 0.42, 10),
          new THREE.MeshStandardMaterial({ color: c, roughness: 0.55 })
        );
        jar.position.set(-1.45 + i * 0.95, 1.21, D / 2 - 1.62);
        jar.castShadow = true;
        g.add(jar);
      });
      // 招牌：铺子前侧一根细木杆，小木牌挂在杆上
      makePostSign(g, { text: '鱼 市', sub: 'FISH MARKET', bg: '#3c2a1c', fg: '#f6e2b0', accent: '#c9a227' },
        -(W / 2 - 0.25), D / 2 + 0.95);

      // ---------- 换上鱼市摊位模型（红白条纹棚那组）----------
      // 棚 + 木柜台 + 鱼盘 + 货筐，宽深同时约束，底面自动贴地。
      MarketAsset.place('red', g, {
        width: W * 0.96, depth: D * 1.05, maxHeight: H + 1.2
      });
      // 暖光照明
      const pl = new THREE.PointLight(0xffb070, 0.9, 12, 2);
      pl.position.set(x, y0 + H - 1.2, z);
      root.add(pl);
      root.add(g);
      noGrassZones.push({ x, z, r: Math.max(W, D) * 0.8 + 0.9 });
      addNoGrassRect(x, z, odd ? D : W, odd ? W : D, 1.4);
      clearScatterAround(x, z, 8.0);
      baitShop = { x, z, r: 3.4 };
    })();

    // ---------- 武器商店（枪械 + 弹药）----------
    // 和鱼饵商店面对面：石砌基座 + 深色铁架 + 沙袋掩体，一看就是"能买到枪"的地方。
    let gunShop = null;
    (function buildGunShop() {
      let spot = null;
      for (let pass = 0; pass < 3 && !spot; pass++) {
        for (let k = 0; k < 56 && !spot; k++) {
          const a = 0.35 + k * 0.13;
          for (let rr = islandRadiusAt(a) - 7.0; rr > 19; rr -= 1.0) {
            const x = Math.cos(a) * rr;
            const z = Math.sin(a) * rr;
            if (!houseSpotClear(x, z, 6.4, pass >= 1, pass === 2)) continue;
            if (baitShop && Math.hypot(x - baitShop.x, z - baitShop.z) < 11) continue;
            spot = { x, z }; break;
          }
        }
      }
      if (!spot) return;
      const x = spot.x, z = spot.z, W = 7.0, D = 5.6, H = 4.6;
      const y0 = heightAt(x, z);
      const g = new THREE.Group();
      g.position.set(x, y0, z);
      const rotY = Math.round(Math.atan2(-x, -z) / (Math.PI / 2)) * (Math.PI / 2);
      g.rotation.y = rotY;
      const cs = Math.cos(rotY), sn = Math.sin(rotY);
      const odd = Math.abs(Math.round(rotY / (Math.PI / 2))) % 2 === 1;

      const gunStone = new THREE.MeshStandardMaterial({
        color: 0xa8a29a, roughness: 0.95, map: texStone.map, normalMap: texStone.normal
      });
      const gunMetal = new THREE.MeshStandardMaterial({ color: 0x6c7a84, roughness: 0.5, metalness: 0.55 });
      const gunWood = new THREE.MeshStandardMaterial({ color: 0x8a6c48, roughness: 0.82 });
      const gunRoof = new THREE.MeshStandardMaterial({ color: 0x5c6a72, roughness: 0.68, metalness: 0.22 });
      const canvasMat = new THREE.MeshStandardMaterial({ color: 0xa9b0a2, roughness: 1 });
      const sandMat = new THREE.MeshStandardMaterial({ color: 0xa08f6a, roughness: 1 });

      function solid(cx, cz, w, d, h, yb) {
        const wx = x + cx * cs + cz * sn;
        const wz = z - cx * sn + cz * cs;
        const ww = odd ? d : w, wd = odd ? w : d;
        colliders.push({
          minX: wx - ww / 2, maxX: wx + ww / 2,
          minZ: wz - wd / 2, maxZ: wz + wd / 2,
          minY: y0 + (yb || 0), maxY: y0 + (yb || 0) + h
        });
      }
      function box(w, h, d, mat, lx, ly, lz, rx) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
        m.position.set(lx, ly, lz);
        if (rx) m.rotation.x = rx;
        m.castShadow = true; m.receiveShadow = true;
        g.add(m);
        return m;
      }

      // 敞开摊位，用碰撞盒围住柜台与后场
      solid(0, -D * 0.10, W * 0.86, D * 0.64, H);
      // 门口沙袋掩体（两个三角堆）
      [-1, 1].forEach((sx) => {
        for (let r = 0; r < 3; r++) {
          for (let c = 0; c < 3 - r; c++) {
            const bag = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.34, 4, 8), sandMat);
            bag.rotation.z = Math.PI / 2;
            bag.position.set(sx * 2.55 + (c - (2 - r) / 2) * 0.4, 0.72 + r * 0.24, D / 2 + 0.35);
            bag.castShadow = true; bag.receiveShadow = true;
            g.add(bag);
          }
        }
        solid(sx * 2.55, D / 2 + 0.35, 1.2, 0.9, 0.85, 0.5);
      });
      // 招牌：铁牌挂在前侧的木杆上
      makePostSign(g, { text: '武 器 商 店', sub: 'GUNS · AMMO', bg: '#2a3033', fg: '#ffcf7a', accent: '#c9a24a' },
        -(W / 2 - 0.25), D / 2 + 0.95);

      // ---------- 换上鱼市摊位模型（绿白条纹棚：三组里最宽的一组）----------
      MarketAsset.place('green', g, {
        width: W * 0.98, depth: D * 1.05, maxHeight: H + 1.2
      });
      // 屋檐下的暖光
      const pl = new THREE.PointLight(0xffd2a0, 1.0, 13, 2);
      pl.position.set(x + sn * 1.2, y0 + H - 0.4, z + cs * 1.2);
      root.add(pl);

      root.add(g);
      noGrassZones.push({ x, z, r: Math.max(W, D) * 0.8 + 1.0 });
      addNoGrassRect(x, z, odd ? D : W, odd ? W : D, 1.6);
      clearScatterAround(x, z, 8.6);
      gunShop = { x, z, r: 3.6 };
    })();

    // ---------- 三种临街小铺：鱼竿店 / 宝箱店 / 背包店 ----------
    // 原来岛上只有鱼饵店和武器店，鱼竿、宝箱、背包全挤在武器店的菜单里，
    // 玩家走到招牌底下会发现"武器商店里怎么还卖鱼竿"。这里拆成三间独立的铺子：
    // 同一套木棚骨架，换招牌、配色和陈列，远看招牌、近看货架就能分清。
    let rodShop = null, chestShop = null, bagShop = null;
    (function buildTradeStalls() {
      if (!gunShop) return;                  // 村子没建起来就不折腾
      const placed = [gunShop];
      if (baitShop) placed.push(baitShop);

      function makeSignMat(text, sub, bg, fg, accent) {
        const cv = document.createElement('canvas');
        cv.width = 360; cv.height = 104;
        const c = cv.getContext('2d');
        c.fillStyle = bg; c.fillRect(0, 0, 360, 104);
        c.strokeStyle = accent; c.lineWidth = 6; c.strokeRect(4, 4, 352, 96);
        c.fillStyle = fg;
        c.font = 'bold 42px "Microsoft YaHei", sans-serif';
        c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText(text, 180, sub ? 44 : 54);
        if (sub) {
          c.fillStyle = accent;
          c.font = 'bold 17px "Microsoft YaHei", sans-serif';
          c.fillText(sub, 180, 80);
        }
        const tex = new THREE.CanvasTexture(cv);
        tex.colorSpace = THREE.SRGBColorSpace;
        return new THREE.MeshStandardMaterial({
          map: tex, roughness: 0.66, metalness: 0.16,
          emissive: 0x1a1410, emissiveIntensity: 0.75
        });
      }

      // 一只小木箱：箱体 + 半圆盖 + 两道铁箍 + 铜锁扣
      function addChest(g, mats, px, py, pz, s, ry) {
        const grp = new THREE.Group();
        const body = new THREE.Mesh(new THREE.BoxGeometry(0.66 * s, 0.40 * s, 0.48 * s), mats.wood);
        body.position.y = 0.20 * s;
        grp.add(body);
        const lidGeo = new THREE.CylinderGeometry(0.33 * s, 0.33 * s, 0.48 * s, 12, 1, false, 0, Math.PI);
        const lid = new THREE.Mesh(lidGeo, mats.wood2);
        lid.rotation.x = Math.PI / 2;
        lid.rotation.z = Math.PI / 2;
        lid.position.y = 0.40 * s;
        grp.add(lid);
        [-0.20, 0.20].forEach((ox) => {
          const band = new THREE.Mesh(new THREE.BoxGeometry(0.05 * s, 0.44 * s, 0.51 * s), mats.iron);
          band.position.set(ox * s, 0.21 * s, 0);
          grp.add(band);
        });
        const lock = new THREE.Mesh(new THREE.BoxGeometry(0.09 * s, 0.11 * s, 0.05 * s), mats.brass);
        lock.position.set(0, 0.30 * s, 0.25 * s);
        grp.add(lock);
        grp.children.forEach((m) => { m.castShadow = true; m.receiveShadow = true; });
        grp.position.set(px, py, pz);
        grp.rotation.y = ry || 0;
        g.add(grp);
        return grp;
      }

      // 一只背包：包体 + 翻盖 + 两条肩带
      function addPack(g, mats, px, py, pz, s, ry) {
        const grp = new THREE.Group();
        const body = new THREE.Mesh(new THREE.BoxGeometry(0.46 * s, 0.54 * s, 0.24 * s), mats.cloth);
        body.position.y = 0.27 * s;
        grp.add(body);
        const flap = new THREE.Mesh(new THREE.BoxGeometry(0.48 * s, 0.20 * s, 0.26 * s), mats.cloth2);
        flap.position.set(0, 0.46 * s, 0.005 * s);
        grp.add(flap);
        [-0.13, 0.13].forEach((ox) => {
          const strap = new THREE.Mesh(new THREE.BoxGeometry(0.05 * s, 0.50 * s, 0.02 * s), mats.strap);
          strap.position.set(ox * s, 0.26 * s, -0.13 * s);
          grp.add(strap);
        });
        const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.07 * s, 0.05 * s, 0.04 * s), mats.brass);
        buckle.position.set(0, 0.38 * s, 0.13 * s);
        grp.add(buckle);
        grp.children.forEach((m) => { m.castShadow = true; m.receiveShadow = true; });
        grp.position.set(px, py, pz);
        grp.rotation.y = ry || 0;
        g.add(grp);
        return grp;
      }

      // 一根立在架子上的鱼竿：竿身 + 卷线器 + 导环
      function addRod(g, mats, px, py, pz, lean, ry, len) {
        const grp = new THREE.Group();
        const L = len || 1.9;
        const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.022, L, 6), mats.rod);
        shaft.position.y = L / 2;
        grp.add(shaft);
        const seat = new THREE.Mesh(new THREE.CylinderGeometry(0.030, 0.030, 0.12, 8), mats.grip);
        seat.position.y = L * 0.20;
        grp.add(seat);
        const reel = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.05, 10), mats.metal);
        reel.rotation.z = Math.PI / 2;
        reel.position.set(0.06, L * 0.24, 0);
        grp.add(reel);
        for (let i = 0; i < 3; i++) {
          const ring = new THREE.Mesh(new THREE.TorusGeometry(0.020, 0.005, 5, 8), mats.metal);
          ring.position.set(0, L * (0.45 + i * 0.2), 0);
          grp.add(ring);
        }
        grp.children.forEach((m) => { m.castShadow = true; });
        grp.position.set(px, py, pz);
        grp.rotation.z = lean || 0;
        grp.rotation.y = ry || 0;
        g.add(grp);
        return grp;
      }

      function makeStall(cfg) {
        const W = 6.4, D = 5.0, H = 4.2;
        let spot = null;
        for (let pass = 0; pass < 3 && !spot; pass++) {
          for (let k = 0; k < 64 && !spot; k++) {
            const a = cfg.a0 + k * 0.098;
            for (let rr = islandRadiusAt(a) - 7.4; rr > 19; rr -= 1.0) {
              const x = Math.cos(a) * rr;
              const z = Math.sin(a) * rr;
              if (!houseSpotClear(x, z, 5.5, pass >= 1, pass === 2)) continue;
              let clash = false;
              for (let i = 0; i < placed.length; i++) {
                if (Math.hypot(x - placed[i].x, z - placed[i].z) < 13.0) { clash = true; break; }
              }
              if (clash) continue;
              spot = { x, z };
              break;
            }
          }
        }
        if (!spot) return null;

        const x = spot.x, z = spot.z;
        const y0 = heightAt(x, z);
        const g = new THREE.Group();
        g.position.set(x, y0, z);
        const rotY = Math.atan2(-x, -z);
        g.rotation.y = rotY;
        const cs = Math.cos(rotY), sn = Math.sin(rotY);
        const odd = Math.abs(Math.round(rotY / (Math.PI / 2))) % 2 === 1;

        const wallMat = houseWallMat.clone();
        wallMat.color.setHex(cfg.wall);
        const roofMat = houseRoofMat.clone();
        roofMat.color.setHex(cfg.roof);
        const woodMat = houseWoodMat.clone();
        woodMat.color.setHex(cfg.wood);

        const mats = {
          wood: woodMat,
          wood2: woodMat.clone(),
          iron: new THREE.MeshStandardMaterial({ color: 0x7a858d, roughness: 0.5, metalness: 0.6 }),
          brass: new THREE.MeshStandardMaterial({ color: 0xe2bb62, roughness: 0.34, metalness: 0.8 }),
          cloth: new THREE.MeshStandardMaterial({ color: cfg.cloth, roughness: 0.95 }),
          cloth2: new THREE.MeshStandardMaterial({ color: cfg.cloth2, roughness: 0.9 }),
          strap: new THREE.MeshStandardMaterial({ color: 0x3a2f26, roughness: 0.85 }),
          rod: new THREE.MeshStandardMaterial({ color: 0x2f3a3f, roughness: 0.42, metalness: 0.3 }),
          grip: new THREE.MeshStandardMaterial({ color: 0x6b4a33, roughness: 0.82 }),
          metal: new THREE.MeshStandardMaterial({ color: 0xa8b4bc, roughness: 0.3, metalness: 0.85 })
        };
        mats.wood2.color.offsetHSL(0, 0, -0.04);
        // 摊位正面朝外、整体处于背光位，只有半球光能照到货物正面，
        // 木箱 / 背包在屏幕上几乎全黑。给这几档材质加一丁点自发光，
        // 只用来"抬黑位"，不是要它们发光。
        [['wood', 0.30], ['wood2', 0.27], ['cloth', 0.32], ['cloth2', 0.27],
         ['iron', 0.18], ['brass', 0.20], ['strap', 0.16]].forEach((p) => {
          const mm = mats[p[0]];
          if (!mm || !mm.emissive) return;
          mm.emissive.copy(mm.color).multiplyScalar(p[1]);
          mm.emissiveIntensity = 1;
        });

        function solid(cx, cz, w, d, h, yb) {
          const wx = x + cx * cs + cz * sn;
          const wz = z - cx * sn + cz * cs;
          const ww = odd ? d : w, wd = odd ? w : d;
          colliders.push({
            minX: wx - ww / 2, maxX: wx + ww / 2,
            minZ: wz - wd / 2, maxZ: wz + wd / 2,
            minY: y0 + (yb || 0), maxY: y0 + (yb || 0) + h
          });
        }
        function box(w, h, d, mat, lx, ly, lz) {
          const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
          m.position.set(lx, ly, lz);
          m.castShadow = true; m.receiveShadow = true;
          g.add(m);
          return m;
        }

        // 柜台前沿留一条矮台，摆各店的陈列品（鱼竿 / 宝箱 / 背包）
        box(3.4, 0.09, 0.62, mats.wood2, 0, 1.02, D / 2 - 1.45);

        cfg.props(g, mats, W, D, H, box, addChest, addPack, addRod, makeSignMat);

        // 招牌：小木牌挂在铺子前侧的细杆上
        makePostSign(g, {
          text: cfg.sign, sub: cfg.signSub,
          bg: cfg.signBg, fg: cfg.signFg, accent: cfg.signAccent
        }, -(W / 2 - 0.25), D / 2 + 0.95);

        // ---------- 换上鱼市摊位模型：蓝伞棚 / 蓝白小棚 两种 ----------
        // 蓝伞棚那组天生比红白/绿白大棚窄一圈（棚本身 3.4m），放宽一点让它有存在感
        const wide = cfg.kind === 'blue';
        MarketAsset.place(cfg.kind || 'blue', g, {
          width: W * (wide ? 1.42 : 1.02),
          depth: D * (wide ? 1.95 : 1.45),
          maxHeight: H + 1.5,
          });
        solid(0, -D * 0.10, W * 0.82, D * 0.62, H);

        // 暖光（只给一盏，多盏会让村里夜景糊成一片）。
        // 原来挂在后墙上、离柜台 2.4m，而摊位正面朝外又是背光的，
        // 柜台上的货在屏幕上只剩一团黑剪影。挪到店里中段、压低到货架高度，
        // 再提亮一档，前排的货才有正面光。
        const pl = new THREE.PointLight(cfg.light, 2.4, 13, 2);
        // 关键：灯要吊在摊位**前沿**、而且不能太高。货是朝着店外摆的，
        // 灯挂在店里时照到的全是货的背面；挂太高则光全是往下的，
        // 货物的正面（玩家真正看到的面）依旧一点光都吃不到。
        pl.position.set(x + sn * (D / 2 + 0.55), y0 + 2.25, z + cs * (D / 2 + 0.55));
        root.add(pl);

        root.add(g);
        noGrassZones.push({ x, z, r: Math.max(W, D) * 0.8 + 0.9 });
        addNoGrassRect(x, z, odd ? D : W, odd ? W : D, 1.4);
        clearScatterAround(x, z, 8.6);
        return { x, z, r: 3.4 };
      }

      // 鱼竿店：墨绿遮阳篷 + 门口一排鱼竿 + 柜台上的卷线器
      rodShop = makeStall({
        a0: 1.15,
        kind: 'blue',
        wall: 0xd8cfae, roof: 0x3c4a3f, wood: 0x6a4f36,
        cloth: 0x3f5a46, cloth2: 0x2e4334,
        awn1: 0x2f5a42, awn2: 0xe4dcbe,
        sign: '鱼 竿 商 店', signSub: 'RODS · REELS',
        signBg: '#20302a', signFg: '#d8f0d0', signAccent: '#79c08a',
        light: 0xa8e0b0,
        props: function (g, mats, W, D, H, box, addChest, addPack, addRod) {
          // 柜台前立一排鱼竿
          for (let i = 0; i < 6; i++) {
            addRod(g, mats, -1.75 + i * 0.62, 1.06, D / 2 - 1.5, 0.10 - i * 0.028, 0.2 * (i % 2 ? 1 : -1), 1.5 + (i % 3) * 0.32);
          }
          // 后墙挂三根长竿
          for (let i = 0; i < 3; i++) {
            addRod(g, mats, -1.3 + i * 1.3, 1.66, -D / 2 + 0.62, 0.06, 0, 1.8);
          }
          // 柜台上的卷线器与线轴
          for (let i = 0; i < 4; i++) {
            const reel = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.06, 12), mats.metal);
            reel.rotation.z = Math.PI / 2;
            reel.position.set(-0.9 + i * 0.62, 1.16, D / 2 - 1.75);
            reel.castShadow = true;
            g.add(reel);
          }
          // 角落的线轴木箱
          box(0.7, 0.5, 0.55, mats.wood, W / 2 - 0.7, 0.3, D / 2 - 0.75);
        }
      });
      if (rodShop) placed.push(rodShop);

      // 宝箱店：暖橙遮阳篷 + 门口堆叠的大小宝箱
      chestShop = makeStall({
        a0: 2.35,
        kind: 'red',
        wall: 0xc9a97e, roof: 0x6b3524, wood: 0xb37d46,
        cloth: 0xc07a34, cloth2: 0x8a5323,
        awn1: 0xa8501f, awn2: 0xf0dcae,
        sign: '宝 箱 商 店', signSub: 'CHESTS · LOOT',
        signBg: '#2c1c10', signFg: '#ffe0a8', signAccent: '#ffb454',
        light: 0xffc078,
        props: function (g, mats, W, D, H, box, addChest, addPack, addRod) {
          // 门口一排出摊的大箱子。原来这些摆在柜台"里面"，被 1m 高的柜台
          // 整个挡掉，从店外只能看见三只指甲盖大小的小箱。挪到柜台外面来。
          addChest(g, mats, -1.86, 0.10, D / 2 - 0.62, 1.30, 0.10);
          addChest(g, mats, -0.62, 0.10, D / 2 - 0.54, 1.10, -0.16);
          addChest(g, mats, 0.62, 0.10, D / 2 - 0.66, 1.22, 0.22);
          addChest(g, mats, 1.86, 0.10, D / 2 - 0.52, 1.00, -0.08);
          // 顶上加两只小的，堆出"货多"的感觉
          addChest(g, mats, -1.82, 1.05, D / 2 - 0.60, 0.62, 0.34);
          addChest(g, mats, 0.60, 0.99, D / 2 - 0.62, 0.58, -0.28);
          // 柜台上三只小箱（展示品，尺寸也放大了一档）
          addChest(g, mats, -1.15, 1.09, D / 2 - 1.62, 0.60, 0.12);
          addChest(g, mats, 0.0, 1.09, D / 2 - 1.62, 0.70, -0.18);
          addChest(g, mats, 1.15, 1.09, D / 2 - 1.62, 0.54, 0.26);
          // 后墙货架没有了（换成鱼市摊位），这两只挪到摊位两侧地上
          addChest(g, mats, -2.42, 0.10, D / 2 - 1.95, 0.70, 0.1);
          addChest(g, mats, 2.42, 0.10, D / 2 - 1.95, 0.64, -0.14);
        }
      });
      if (chestShop) placed.push(chestShop);

      // 背包店：靛蓝遮阳篷 + 满墙挂包
      bagShop = makeStall({
        a0: 3.55,
        kind: 'green',
        wall: 0xbfc6c2, roof: 0x354a55, wood: 0x6b5238,
        cloth: 0x5d6c96, cloth2: 0x44507a,
        awn1: 0x2f4470, awn2: 0xdfe6ee,
        sign: '背 包 商 店', signSub: 'PACKS · CAPACITY',
        signBg: '#1c2434', signFg: '#cfe2ff', signAccent: '#7fa8ff',
        light: 0xa8c0ff,
        props: function (g, mats, W, D, H, box, addChest, addPack, addRod, signMat) {
          // 柜台排开五只包，尺寸放大一档（原来 0.85 倍，柜沿就吃掉小半截）
          for (let i = 0; i < 5; i++) {
            addPack(g, mats, -1.62 + i * 0.81, 1.08, D / 2 - 1.66, 1.15, -0.25 + i * 0.12);
          }
          // 后墙没了，剩下的包摆到柜台两端的矮箱上
          addPack(g, mats, -2.35, 0.62, D / 2 - 1.72, 1.15, 0.05);
          addPack(g, mats, 2.35, 0.62, D / 2 - 1.72, 1.05, -0.1);
          box(0.9, 0.52, 0.62, mats.wood, -2.35, 0.26, D / 2 - 1.72);
          box(0.9, 0.52, 0.62, mats.wood, 2.35, 0.26, D / 2 - 1.72);
          // 门口地上一只敞口的大驮包，放在柜台外侧，出门就看得见
          addPack(g, mats, W / 2 - 1.05, 0.08, D / 2 - 0.78, 1.75, 0.55);
          // 柜台左边的木牌：容量对照（正面朝店外，原来的薄板是侧着立的，等于看不见）
          box(0.80, 1.02, 0.09, mats.wood2, -W / 2 + 1.08, 0.90, D / 2 - 0.66);
          const capSign = new THREE.Mesh(
            new THREE.PlaneGeometry(0.70, 0.40),
            signMat('背包容量', '20 · 30 · 45 · 60 · 80', '#243044', '#dce8ff', '#7fa8ff')
          );
          capSign.position.set(-W / 2 + 1.08, 1.04, D / 2 - 0.605);
          g.add(capSign);
        }
      });
    })();


    // ---------- 观鱼台（湖边木台：站上去按 F 看湖里养了什么）----------
    // 玩家口径：「湖旁边建一个交互可查看湖里的鱼」。做成一座伸向湖面的木平台，
    // 正面朝湖、三面围栏，台上挂一盏风灯，晚上也找得到。
    let pondDeck = null;
    (function buildPondDeck() {
      const W = 5.2, D = 3.4;
      let best = null;
      // 沿湖岸择址：地面要平、不能泡在水里、不能压在别人的碰撞盒上
      for (let pass = 0; pass < 2 && !best; pass++) {
        const gap = pass === 0 ? 2.5 : 1.6;
        for (let k = 0; k < 56 && !best; k++) {
          const a = -0.5 + k * (TAU / 56);
          const rr = pondRadiusAt(a) + 2.3;
          const x = Math.cos(a) * rr, z = Math.sin(a) * rr;
          let hmin = Infinity, hmax = -Infinity;
          for (let i = -2; i <= 2; i++) {
            for (let j = -2; j <= 2; j++) {
              const hh = heightAt(x + i * W * 0.22, z + j * D * 0.22);
              if (hh < hmin) hmin = hh;
              if (hh > hmax) hmax = hh;
            }
          }
          if (hmax - hmin > 0.40) continue;
          // 岸边的地面高度本来就在 0 上下（水面 0.03），不能要求"高于水面"，
          // 只要不是掉进坑里、也别挑到山坡上就行。
          if (hmax > 1.05 || hmax < -0.25) continue;
          let blocked = false;
          for (let i = 0; i < colliders.length; i++) {
            const c = colliders[i];
            const nx = Math.max(c.minX, Math.min(x, c.maxX));
            const nz = Math.max(c.minZ, Math.min(z, c.maxZ));
            if (Math.hypot(x - nx, z - nz) < gap) { blocked = true; break; }
          }
          if (blocked) continue;
          best = { x, z, a, y: hmax };
        }
      }
      if (!best) return;   // 找不到干净的空地就不建，别硬塞一个穿模的台子

      const x = best.x, z = best.z, y0 = best.y;
      const g = new THREE.Group();
      g.position.set(x, y0, z);
      // 和其他建筑同一套朝向：局部 +Z 指向湖心，围栏开口就在 +Z 这一侧
      const rotY = Math.atan2(-x, -z);
      g.rotation.y = rotY;
      root.add(g);

      const wood = new THREE.MeshStandardMaterial({ color: 0x8a6742, roughness: 0.88 });
      const woodDark = new THREE.MeshStandardMaterial({ color: 0x6b4f34, roughness: 0.9 });
      const rail = new THREE.MeshStandardMaterial({ color: 0x7d5c3a, roughness: 0.86 });

      // 台面：一块薄板 + 若干条拼缝，压在地面上（只比地面高 5cm，走上来不会"陷进去"）
      const deck = new THREE.Mesh(new THREE.BoxGeometry(W, 0.10, D), wood);
      deck.position.y = 0.0;
      deck.castShadow = true; deck.receiveShadow = true;
      g.add(deck);
      for (let i = 1; i < 7; i++) {
        const line = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.012, D * 0.98), woodDark);
        line.position.set(-W / 2 + (W / 7) * i, 0.056, 0);
        g.add(line);
      }
      // 四根短桩：从台下伸进土里，看着像真的架起来的
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.10, 0.62, 7), woodDark);
        post.position.set(sx * (W / 2 - 0.16), -0.26, sz * (D / 2 - 0.16));
        post.castShadow = true;
        g.add(post);
      });
      // 围栏：左右两侧 + 后侧，靠湖的前侧留开口
      function fenceRail(px, pz, len, horizontal) {
        const geo = horizontal
          ? new THREE.BoxGeometry(len, 0.075, 0.075)
          : new THREE.BoxGeometry(0.075, 0.075, len);
        [0.92, 0.55].forEach((h) => {
          const bar = new THREE.Mesh(geo, rail);
          bar.position.set(px, h, pz);
          bar.castShadow = true;
          g.add(bar);
        });
        const n = Math.max(2, Math.round(len / 1.05));
        for (let i = 0; i <= n; i++) {
          const t = -0.5 + i / n;
          const post = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.0, 0.08), rail);
          post.position.set(
            horizontal ? px + t * len : px,
            0.5,
            horizontal ? pz : pz + t * len
          );
          g.add(post);
        }
      }
      fenceRail(-W / 2 + 0.06, 0, D - 0.1, false);
      fenceRail(W / 2 - 0.06, 0, D - 0.1, false);
      // 后侧围栏中间留一道 1.5m 的入口：不然三面全封，玩家只能游泳上来
      const gapHalf = 0.75;
      const segLen = W / 2 - gapHalf;
      const fenceBars = [
        [-(gapHalf + segLen / 2), -D / 2 + 0.06, segLen, 0.16],
        [gapHalf + segLen / 2, -D / 2 + 0.06, segLen, 0.16]
      ];
      fenceBars.forEach(([lx, lz, lw]) => fenceRail(lx, lz, lw, true));
      // 围栏挡人：别让玩家直接从台上穿过栏杆走进湖里（入口那段不挡）
      [[-W / 2 + 0.06, 0, 0.16, D], [W / 2 - 0.06, 0, 0.16, D]]
        .concat(fenceBars.map(([lx, lz, lw]) => [lx, lz, lw, 0.16]))
        .forEach(([lx, lz, lw, ld]) => {
          const cs = Math.cos(rotY), sn = Math.sin(rotY);
          const wx = x + lx * cs + lz * sn;
          const wz = z - lx * sn + lz * cs;
          const odd = Math.abs(Math.round(rotY / (Math.PI / 2))) % 2 === 1;
          const ww = odd ? ld : lw, wd = odd ? lw : ld;
          colliders.push({
            minX: wx - ww / 2, maxX: wx + ww / 2,
            minZ: wz - wd / 2, maxZ: wz + wd / 2,
            minY: y0, maxY: y0 + 1.05, tag: 'rail'
          });
        });

      // 招牌 + 风灯
      makePostSign(g, { text: '观 鱼 台', sub: 'POND DECK', bg: '#20423a', fg: '#eaf7e8', accent: '#8ec9a8' },
        -(W / 2 - 0.55), -D / 2 + 0.22);
      // 牌子默认朝 +Z（湖那侧），转半圈让字对着从岸上走过来的玩家
      const signGrp = g.children[g.children.length - 1];
      if (signGrp) signGrp.rotation.y = Math.PI;
      const lampPost = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 1.55, 6), woodDark);
      lampPost.position.set(W / 2 - 0.55, 0.74, -D / 2 + 0.3);
      g.add(lampPost);
      const lamp = new THREE.Mesh(
        new THREE.SphereGeometry(0.13, 10, 8),
        new THREE.MeshStandardMaterial({ color: 0xfff0c8, emissive: 0xffb45c, emissiveIntensity: 1.6, roughness: 0.4 })
      );
      lamp.position.set(W / 2 - 0.55, 1.58, -D / 2 + 0.3);
      g.add(lamp);
      const lampLight = new THREE.PointLight(0xffc078, 0.85, 8, 2);
      lampLight.position.set(W / 2 - 0.55, 1.62, -D / 2 + 0.3);
      g.add(lampLight);
      nightLights.push({ light: lampLight, base: 0.85, lamp });

      noGrassZones.push({ x, z, r: 3.4 });
      addNoGrassRect(x, z, W, D, 0.6);
      clearScatterAround(x, z, 3.6);
      pondDeck = { x, z, r: 3.2, y: y0 };
    })();


    // ---------- 野花 ----------
    // 草地上一片一片的小花。用实例化 + 交叉面片，代价极低但画面立刻"活"了。
    // 花色烘进贴图（每色一张），避免实例色把茎叶也染色。
    function makeFlowerTexture(petal, petalEdge, center) {
      const S = 128;
      const cv = document.createElement('canvas');
      cv.width = cv.height = S;
      const ctx = cv.getContext('2d');
      ctx.clearRect(0, 0, S, S);
      // 茎
      ctx.strokeStyle = '#4a6b34';
      ctx.lineWidth = 4.2;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(S * 0.5, S * 0.99);
      ctx.quadraticCurveTo(S * 0.46, S * 0.72, S * 0.5, S * 0.5);
      ctx.stroke();
      // 叶
      ctx.fillStyle = '#547a3a';
      [-1, 1].forEach((s) => {
        ctx.beginPath();
        ctx.ellipse(S * (0.5 + s * 0.135), S * 0.74, S * 0.115, S * 0.045, s * 0.62, 0, TAU);
        ctx.fill();
      });
      // 花瓣：5 片，带一点深浅边
      const cx = S * 0.5, cy = S * 0.30;
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * TAU - Math.PI / 2;
        const px = cx + Math.cos(a) * S * 0.125;
        const py = cy + Math.sin(a) * S * 0.125;
        ctx.fillStyle = petalEdge;
        ctx.beginPath();
        ctx.ellipse(px, py, S * 0.105, S * 0.075, a, 0, TAU);
        ctx.fill();
        ctx.fillStyle = petal;
        ctx.beginPath();
        ctx.ellipse(px, py, S * 0.088, S * 0.060, a, 0, TAU);
        ctx.fill();
      }
      // 花心
      ctx.fillStyle = center;
      ctx.beginPath();
      ctx.arc(cx, cy, S * 0.058, 0, TAU);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.beginPath();
      ctx.arc(cx - S * 0.012, cy - S * 0.012, S * 0.030, 0, TAU);
      ctx.fill();

      const tex = new THREE.CanvasTexture(cv);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 8;
      return tex;
    }

    function addFlowers() {
      const kinds = [
        { petal: '#fdfbf2', edge: '#d8d2bd', center: '#f6b93b', n: 190 },  // 白雏菊
        { petal: '#ffd75e', edge: '#d9a521', center: '#8a5a1e', n: 150 },  // 蒲公英
        { petal: '#e59ac0', edge: '#b96b93', center: '#f6e07a', n: 120 },  // 粉
        { petal: '#9fb6e8', edge: '#6f86bd', center: '#f2ecc0', n: 95 }    // 蓝紫
      ];
      // 交叉两片，任意角度都有厚度
      const fw = 0.30, fh = 0.44;
      const fpos = [], fuv = [], fidx = [], fnrm = [];
      for (let p = 0; p < 2; p++) {
        const a = (p / 2) * Math.PI;
        const cx = Math.cos(a) * fw / 2, cz = Math.sin(a) * fw / 2;
        const base = p * 4;
        fpos.push(-cx, 0, -cz, cx, 0, cz, cx, fh, cz, -cx, fh, -cz);
        fuv.push(0, 0, 1, 0, 1, 1, 0, 1);
        fidx.push(base, base + 1, base + 2, base, base + 2, base + 3);
        fnrm.push(0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(fpos, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(fuv, 2));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(fnrm, 3));
      geo.setIndex(fidx);

      const dummy = new THREE.Object3D();
      const rnd = mulberry32(90211);
      // 先撒 90 个花圃中心，花才会成片而不是均匀铺满
      const tufts = [];
      for (let i = 0; i < 90; i++) {
        tufts.push({
          a: rnd() * TAU,
          r: 3 + Math.sqrt(rnd()) * 33,
          spread: 0.7 + rnd() * 2.2
        });
      }

      kinds.forEach((k) => {
        const mat = makeGrassMaterial(makeFlowerTexture(k.petal, k.edge, k.center));
        const inst = new THREE.InstancedMesh(geo, mat, k.n);
        inst.instanceMatrix.setUsage(THREE.StaticDrawUsage);
        let placed = 0, tries = 0;
        while (placed < k.n && tries < k.n * 24) {
          tries++;
          const tf = tufts[Math.floor(rnd() * tufts.length)];
          const x = Math.cos(tf.a) * tf.r + (rnd() - 0.5) * tf.spread * 2;
          const z = Math.sin(tf.a) * tf.r + (rnd() - 0.5) * tf.spread * 2;
          const dp = Math.hypot(x - pond.x, z - pond.z);
          if (dp < pondRadiusAt(Math.atan2(z - pond.z, x - pond.x)) + 1.2) continue;
          const db = Math.hypot(x, z);
          if (db > islandRadiusAt(Math.atan2(z, x)) - 2.4) continue;
          if (inNoGrassZone(x, z)) continue;
          dummy.position.set(x, heightAt(x, z) + 0.01, z);
          dummy.rotation.set(0, rnd() * TAU, 0);
          const sc = 0.8 + rnd() * 0.75;
          dummy.scale.set(sc, sc * (0.85 + rnd() * 0.4), sc);
          dummy.updateMatrix();
          inst.setMatrixAt(placed, dummy.matrix);
          placed++;
        }
        inst.count = placed;
        inst.instanceMatrix.needsUpdate = true;
        inst.frustumCulled = false;
        root.add(inst);
      });
    }

    // 房屋/商店全部就位后再散布草丛与地面点缀，确保不会长进屋里
    addGrassPatches();
    addGroundSprinkles();
    addFlowers();


    // 环湖的 8 根灯笼柱按用户要求删掉了（夜里那圈橘红色点位太抢戏，
    // 也把湖岸线挡得零零碎碎）。夜景照明由商店灯与渔屋灯笼负责。


    // ---------- 海鸟（重做版：真翼型、有厚度、三段扇动）----------
    // 旧版的问题：翅膀是两张纯平面 ShapeGeometry，侧面看就是一张纸；
    // 身体是球拉伸，没有胸腹起伏；扇翅只有"整片上下摆"一种动作。
    // 现在：翼面用带倒角的挤出体（前缘厚、后缘薄），分内翼/外翼两段，
    // 外翼比内翼慢半拍——这就是真实鸟类扇翅时翼尖"甩"出去的感觉。
    const birds = [];
    const gullWhite = new THREE.MeshStandardMaterial({ color: 0xf6f8f5, roughness: 0.78, side: THREE.DoubleSide });
    const gullGrey = new THREE.MeshStandardMaterial({ color: 0xc0ccd4, roughness: 0.78, side: THREE.DoubleSide });
    const gullBlack = new THREE.MeshStandardMaterial({ color: 0x23292f, roughness: 0.72, side: THREE.DoubleSide });
    const gullBeak = new THREE.MeshStandardMaterial({ color: 0xf0bc2c, roughness: 0.45 });
    const gullLeg = new THREE.MeshStandardMaterial({ color: 0xe08a76, roughness: 0.66 });
    const gullEye = new THREE.MeshStandardMaterial({ color: 0x0d1114, roughness: 0.3 });

    // 翼面：Shape 在 XY 平面（x=展向，y=弦向），挤出厚度后转到水平面
    function makeWingGeo(span, rootC, tipC, sweep, thick, mirror) {
      // 原来翼尖是以一个点收尾的（tipC * 0.10 ≈ 0.007），
      // 整片外翼就变成一条又长又薄的飘带。这里让翼尖保留真实弦长。
      const r0 = rootC * 0.5;
      const s2 = new THREE.Shape();
      s2.moveTo(0, r0);
      s2.quadraticCurveTo(span * 0.45, r0 * 0.72, span, -sweep);
      s2.lineTo(span * 0.98, -sweep - tipC);
      s2.quadraticCurveTo(span * 0.55, -rootC * 0.62, 0, -r0);
      s2.closePath();
      const g = new THREE.ExtrudeGeometry(s2, {
        depth: thick, bevelEnabled: true, bevelSize: thick * 0.5,
        bevelThickness: thick * 0.45, bevelSegments: 2, curveSegments: 7, steps: 1
      });
      // 挤出沿 +Z，旋转 90° 让厚度落在 Y 轴（翼面水平、有上下两面）
      g.rotateX(-Math.PI / 2);
      if (mirror) g.scale(-1, 1, 1);
      g.computeVertexNormals();
      return g;
    }
    // 翼尖初级飞羽：海鸥最有辨识度的分叉指状羽
    function makeFeatherGeo(len, w, mirror) {
      const s2 = new THREE.Shape();
      s2.moveTo(0, 0);
      s2.quadraticCurveTo(len * 0.55, w * 0.55, len, w * 0.12);
      s2.quadraticCurveTo(len * 0.55, -w * 0.18, 0, 0);
      s2.closePath();
      const g = new THREE.ShapeGeometry(s2, 6);
      g.rotateX(-Math.PI / 2);
      if (mirror) g.scale(-1, 1, 1);
      return g;
    }
    // 身体：旋转体，做出胸（前下方鼓）、腹、收细的尾柄
    function makeGullBodyGeo() {
      const prof = [
        [0.010, -0.62], [0.048, -0.54], [0.098, -0.42], [0.140, -0.26],
        [0.166, -0.06], [0.168, 0.08], [0.150, 0.20], [0.116, 0.30],
        [0.104, 0.37]
      ];
      const pts = prof.map((p) => new THREE.Vector2(p[0], p[1]));
      const g = new THREE.LatheGeometry(pts, 16);
      g.rotateX(Math.PI / 2);      // 长度轴转到 Z（前后）
      g.scale(0.92, 0.88, 1);      // 略扁的胸廓
      return g;
    }
    function makeGullTailGeo() {
      const s2 = new THREE.Shape();
      s2.moveTo(0, 0);
      s2.quadraticCurveTo(-0.22, 0.16, -0.42, 0.10);
      s2.quadraticCurveTo(-0.46, 0, -0.42, -0.10);
      s2.quadraticCurveTo(-0.22, -0.16, 0, 0);
      s2.closePath();
      const g = new THREE.ExtrudeGeometry(s2, { depth: 0.012, bevelEnabled: false, curveSegments: 6 });
      g.rotateX(-Math.PI / 2);
      return g;
    }

    const GG = {
      body: makeGullBodyGeo(),
      head: new THREE.SphereGeometry(0.132, 14, 12),
      beak: new THREE.ConeGeometry(0.046, 0.23, 8),
      eye: new THREE.SphereGeometry(0.023, 7, 6),
      tail: makeGullTailGeo(),
      // 内翼：弦长收窄、展向加长；外翼：更窄更薄，后掠明显。
      // 海鸥的翼是细长的，弦长大约只有体长的 1/4——原来 0.46 的弦
      // 配上短展向，看起来就是两块圆板子。
      wingInR: makeWingGeo(0.70, 0.32, 0.15, 0.09, 0.024, false),
      wingInL: makeWingGeo(0.70, 0.32, 0.15, 0.09, 0.024, true),
      wingOutR: makeWingGeo(0.58, 0.18, 0.075, 0.20, 0.013, false),
      wingOutL: makeWingGeo(0.58, 0.18, 0.075, 0.20, 0.013, true),
      f1R: makeFeatherGeo(0.30, 0.055, false), f1L: makeFeatherGeo(0.30, 0.055, true),
      f2R: makeFeatherGeo(0.26, 0.048, false), f2L: makeFeatherGeo(0.26, 0.048, true),
      f3R: makeFeatherGeo(0.21, 0.042, false), f3L: makeFeatherGeo(0.21, 0.042, true),
      leg: new THREE.CylinderGeometry(0.014, 0.014, 0.15, 5),
      foot: new THREE.BoxGeometry(0.075, 0.014, 0.10)
    };

    for (let i = 0; i < 8; i++) {
      const b = new THREE.Group();
      const sc = 1.15 + (i % 3) * 0.10;   // 个体大小差异

      // 身体 + 背部灰羽
      const bodyMesh = new THREE.Mesh(GG.body, gullWhite);
      bodyMesh.scale.set(0.82, 0.80, 1.04);   // 收细一点，别像个白球
      bodyMesh.castShadow = true;
      b.add(bodyMesh);
      const mantle = new THREE.Mesh(GG.body, gullGrey);
      mantle.scale.set(0.84, 0.96, 0.88);
      mantle.position.set(0, 0.045, -0.05);
      b.add(mantle);

      // 颈 + 头（海鸥有短颈，头明显比躯干小）
      const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.135, 0.16, 10), gullWhite);
      neck.position.set(0, 0.075, 0.30);
      neck.rotation.x = -0.42;
      b.add(neck);
      const head = new THREE.Mesh(GG.head, gullWhite);
      head.position.set(0, 0.132, 0.40);
      head.scale.set(0.92, 0.86, 0.98);
      head.castShadow = true;
      b.add(head);

      // 黄喙：上喙 + 下喙，中间一道暗缝
      const beak = new THREE.Mesh(GG.beak, gullBeak);
      beak.rotation.x = Math.PI / 2 + 0.10;
      beak.position.set(0, 0.128, 0.545);
      b.add(beak);
      const beakGap = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.008, 0.17), gullBlack);
      beakGap.position.set(0, 0.118, 0.52);
      b.add(beakGap);

      // 眼：黑眼 + 一圈浅色眼睑
      [-1, 1].forEach((sx) => {
        const lid = new THREE.Mesh(new THREE.SphereGeometry(0.032, 8, 7), gullWhite);
        lid.position.set(sx * 0.083, 0.168, 0.425);
        lid.scale.set(0.6, 0.75, 0.8);
        b.add(lid);
        const eye = new THREE.Mesh(GG.eye, gullEye);
        eye.position.set(sx * 0.094, 0.170, 0.437);
        b.add(eye);
      });

      // 尾羽：Shape 是在 XY 平面里沿 -X 画的，挤出后必须再绕 Y 转 90°，
      // 否则尾羽不是往后长，而是横着从屁股侧面支棱出去（像一根白色勾子）。
      const tail = new THREE.Mesh(GG.tail, gullWhite);
      tail.scale.setScalar(0.56);
      tail.position.set(0, -0.01, -0.58);
      tail.rotation.y = -Math.PI / 2;
      b.add(tail);

      // 收起的双脚：贴在腹下、向后收
      [-1, 1].forEach((sx) => {
        const leg = new THREE.Mesh(GG.leg, gullLeg);
        leg.position.set(sx * 0.055, -0.145, -0.10);
        leg.rotation.x = -1.28;
        b.add(leg);
        const foot = new THREE.Mesh(GG.foot, gullLeg);
        foot.position.set(sx * 0.055, -0.175, -0.20);
        foot.rotation.x = -1.05;
        b.add(foot);
      });

      // 双翼：内翼 Group（肩关节）→ 外翼 Group（肘关节）→ 翼指
      function buildWing(side) {
        const isR = side > 0;
        const root = new THREE.Group();
        root.position.set(side * 0.11, 0.055, 0.02);
        root.rotation.y = side * 0.10;   // 后掠：翼根略微向后带一点

        const inner = new THREE.Mesh(isR ? GG.wingInR : GG.wingInL, gullGrey);
        inner.castShadow = true;
        root.add(inner);

        const outer = new THREE.Group();
        outer.position.set(side * 0.70, 0.002, -0.075);   // 肘关节接在内翼后缘上
        const outMesh = new THREE.Mesh(isR ? GG.wingOutR : GG.wingOutL, gullGrey);
        outMesh.castShadow = true;
        outer.add(outMesh);
        // 翼尖黑色羽指（三根，向后错开）
        [[isR ? GG.f1R : GG.f1L, 0.50, 0.055, 0],
         [isR ? GG.f2R : GG.f2L, 0.44, 0.10, -0.045],
         [isR ? GG.f3R : GG.f3L, 0.36, 0.145, -0.085]].forEach((cfg) => {
          const f = new THREE.Mesh(cfg[0], gullBlack);
          f.position.set(side * cfg[1], 0, cfg[3]);
          f.rotation.y = side * cfg[2];
          outer.add(f);
        });
        root.add(outer);
        root.userData.outer = outer;
        return root;
      }
      const wr = buildWing(1);
      const wl = buildWing(-1);
      b.add(wr);
      b.add(wl);
      b.scale.setScalar(sc);
      root.add(b);

      birds.push({
        group: b, wl, wr,
        r: 13 + i * 4.5,
        h: 6 + (i % 3) * 2.4,
        speed: (0.1 + (i % 3) * 0.045) * (i % 2 ? 1 : -1),
        phase: i * 1.7,
        flapPhase: i * 2.1,
        flapClock: 0.6 + i * 0.37,
        gullCryT: 2 + i * 1.9,
        glide: i % 2 === 0,
        roll: 0,
        alive: true, respawnT: 0
      });
    }

    // ---------- 塘鱼（水中游动，可钓也可开枪打）----------
    // 湖里默认是空的、也不会自己刷鱼：玩家把钓到的鱼放进去，水里才会真的出现鱼。
    // 湖里的鱼按分值每秒产出积分（见 Economy.pondRateOf），所以它既是"养殖"也是
    // "投资"——被枪打死的鱼不会自己回来，得重新钓一条放进来。
    const fishes = [];

    // ---------- 投放鱼苗：把钓到的鱼放进湖里养 ----------
    const raised = [];
    function addPondFish(name, points, id, tier) {
      const model = new window.FishModel(name);
      const fg = model.group;
      // 体长超过 1.6m 的（远古巨兽）在池塘里按比例收一点，不然一条苍龙
      // 在 10m 的湖里就等于把整个水面盖住。
      const lenScale = model.len > 1.6 ? Math.max(0.70, 2.4 / model.len) : 1;
      fg.scale.multiplyScalar(1.35 * lenScale);
      root.add(fg);
      // 池塘水面在 POND_TOP（=0.03），湖底在 -2.0：鱼要是按海面水位(-0.35)游，
      // 等于沉在水面下 40cm，隔着 0.66~0.82 的水体几乎看不见——玩家会以为"湖里没鱼"。
      // 所以把鱼抬到"背鳍刚破水面"的位置：身子在水下，背和尾鳍露一点，从岸上很醒目。
      const f = {
        model, group: fg, name,
        // 巨兽吃水浅得多：3m 的个子只露背鳍的话，头、背帆、背棘全在水下，
        // 从岸上看就是一截漂着的木头。抬到「半个身子出水」，剪影才立得住。
        swimY: POND_TOP - (model.len > 1.6 ? 0.015 : 0.20) - Math.random() * 0.05,
        points: Math.max(1, points || 20),
        // 品质等级 0..9（普通…神域），养鱼的每秒产出由它决定
        tier: typeof tier === 'number' ? Math.max(0, Math.round(tier))
          : (window.fishGradeOf ? window.fishGradeOf(name) || 0 : 0),
        id: id || null,
        alive: true, deadT: 0,
        ang: Math.random() * Math.PI * 2,
        // 大鱼绕小圈：3m 的鱼要是也跑到 r=5.8，头和尾会直接穿过湖岸
        r: (model.len > 1.6 ? 0.9 + Math.random() * 1.9 : 1.6 + Math.random() * 4.2),
        speed: (0.55 + Math.random() * 0.45) * (Math.random() < 0.5 ? 1 : -1),
        wobble: Math.random() * 10,
        rippleT: Math.random() * 1.5
      };
      fishes.push(f);
      raised.push(f);
      return f;
    }

    // 活着的塘鱼条数与每秒产出（世界这边只负责"谁还活着"，数值规则在 Economy 里）
    let _pondRateCache = { n: 0, rate: 0, at: -1 };
    function pondStat() {
      let n = 0, rate = 0;
      for (let i = 0; i < fishes.length; i++) {
        const f = fishes[i];
        if (!f.alive) continue;
        n++;
        rate += (window.Economy ? window.Economy.pondRateFor(f) : 0.2);
      }
      _pondRateCache = { n, rate };
      return _pondRateCache;
    }


    // ---------- 海边小船（可登船驾驶、船上钓鱼、甲板可放鱼）----------
    let boatProp = null;
    const boat = (function buildBoat() {
      const L = 5.6;          // 船长（原来 3.5 太小，一个人坐进去都转不开身）
      const W = 1.05;         // 半宽（船宽 2.1m）
      const D = 0.62;         // 舷高（从水线算）
      const grp = new THREE.Group();

      const hullWood = new THREE.MeshStandardMaterial({
        color: 0x8a6a44, roughness: 0.86, metalness: 0.02,
        side: THREE.DoubleSide
      });
      const hullPaint = new THREE.MeshStandardMaterial({
        color: 0xe0d9c6, roughness: 0.72, metalness: 0.04,
        side: THREE.DoubleSide
      });
      const bootMat = new THREE.MeshStandardMaterial({
        color: 0x27424a, roughness: 0.7, metalness: 0.05, side: THREE.DoubleSide
      });
      const plankMat = new THREE.MeshStandardMaterial({ color: 0xa8875c, roughness: 0.9 });
      const trimMat = new THREE.MeshStandardMaterial({ color: 0x4a3a26, roughness: 0.82 });
      const ropeMat = new THREE.MeshStandardMaterial({ color: 0xbfa982, roughness: 1 });

      // 船长方向的宽度与舷高剖面：船头尖、船中宽、船尾略收
      function halfW(t) {           // t: 0 = 船尾, 1 = 船头
        const bow = Math.pow(Math.max(0, (t - 0.58) / 0.42), 1.9);
        const stern = 1 - Math.pow(Math.max(0, (0.18 - t) / 0.18), 2.2) * 0.28;
        return W * (1 - bow * 0.94) * stern;
      }
      function railY(t) {           // 舷边上沿高度
        return D + Math.pow(Math.max(0, (t - 0.55) / 0.45), 2) * 0.30;
      }
      function keelY(t) {           // 龙骨高度（负值 = 水面以下）
        // 原来龙骨在 +0.02，整条船浮在水面上方 20cm，浪一打就穿进船体里。
        // 现在龙骨压到水下 0.30m，形成真正的吃水，船身切进水面而不是贴着水面漂。
        return -0.30 - Math.pow(Math.max(0, (t - 0.55) / 0.45), 2) * 0.14;
      }

      // 船壳：左右两片从龙骨到舷边的曲面
      const NS = 24;
      const pos = [];
      const idx = [];
      const uv = [];
      for (let i = 0; i <= NS; i++) {
        const t = i / NS;
        const z = (0.5 - t) * L;         // 船头在 -z
        const hw = halfW(t);
        const ry = railY(t);
        const ky = keelY(t);
        // 龙骨中点
        pos.push(0, ky, z);
        uv.push(t * 3, 0);
        // 左舷
        pos.push(-hw, ry, z);
        uv.push(t * 3, 1);
        // 右舷
        pos.push(hw, ry, z);
        uv.push(t * 3, 1);
      }
      for (let i = 0; i < NS; i++) {
        const a = i * 3, b = (i + 1) * 3;
        // 左舷面（龙骨 -> 左舷）
        idx.push(a, b, a + 1, b, b + 1, a + 1);
        // 右舷面
        idx.push(a + 2, a, b + 2, a, b, b + 2);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      geo.setIndex(idx);
      geo.computeVertexNormals();
      const hull = new THREE.Mesh(geo, hullWood);
      hull.castShadow = true;
      hull.receiveShadow = true;
      grp.add(hull);

      // 水线以上刷白漆：再套一层略外扩的薄壳，只覆盖上缘（用同剖面内缩）
      const paintPos = [];
      const paintIdx = [];
      for (let i = 0; i <= NS; i++) {
        const t = i / NS;
        const z = (0.5 - t) * L;
        const hw = halfW(t) * 1.012;
        const ry = railY(t);
        const lowY = keelY(t) + (ry - keelY(t)) * 0.28;   // 白漆从水线略下开始
        paintPos.push(-hw, lowY, z, -hw, ry, z, hw, lowY, z, hw, ry, z);
      }
      for (let i = 0; i < NS; i++) {
        const a = i * 4, b = (i + 1) * 4;
        paintIdx.push(a, b, a + 1, b, b + 1, a + 1);
        paintIdx.push(a + 2, a, b + 2, a, b, b + 2);
      }
      const pgeo = new THREE.BufferGeometry();
      pgeo.setAttribute('position', new THREE.Float32BufferAttribute(paintPos, 3));
      pgeo.setIndex(paintIdx);
      pgeo.computeVertexNormals();
      const paint = new THREE.Mesh(pgeo, hullPaint);
      paint.castShadow = true;
      grp.add(paint);

      // 水线腰线：船壳上刷一道深色带，水面处才有"吃水"的分界，
      // 否则整条船就是一大片白，看起来像纸折的
      [-1, 1].forEach((sd) => {
        const bPos = [], bIdx = [];
        for (let i = 0; i <= NS; i++) {
          const t = i / NS;
          const z = (0.5 - t) * L;
          const hw = halfW(t) * 1.018;
          bPos.push(sd * hw, -0.02, z, sd * hw, 0.09, z);
        }
        for (let i = 0; i < NS; i++) {
          const a = i * 2, b = (i + 1) * 2;
          if (sd > 0) bIdx.push(a, b, a + 1, b, b + 1, a + 1);
          else bIdx.push(a, a + 1, b, b, a + 1, b + 1);
        }
        const bg = new THREE.BufferGeometry();
        bg.setAttribute('position', new THREE.Float32BufferAttribute(bPos, 3));
        bg.setIndex(bIdx);
        bg.computeVertexNormals();
        const bm = new THREE.Mesh(bg, bootMat);
        grp.add(bm);
      });

      // 舷边压条（沿上沿走一圈，给船一条清晰的轮廓线）
      // 两端各内缩 3%：船头/船尾半宽接近 0，曲线端点会挤成一点并甩出船体
      [-1, 1].forEach((sd) => {
        const pts = [];
        for (let i = 1; i < NS; i++) {
          const t = i / NS;
          pts.push(new THREE.Vector3(sd * halfW(t) * 1.02, railY(t) + 0.03, (0.5 - t) * L));
        }
        const curve = new THREE.CatmullRomCurve3(pts);
        const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 28, 0.032, 6, false), trimMat);
        tube.castShadow = true;
        grp.add(tube);
      });

      // 船尾板
      const sternShape = new THREE.Shape();
      const sw = halfW(0);
      sternShape.moveTo(-sw, keelY(0));
      sternShape.lineTo(sw, keelY(0));
      sternShape.lineTo(sw, railY(0));
      sternShape.lineTo(-sw, railY(0));
      sternShape.closePath();
      const stern = new THREE.Mesh(new THREE.ShapeGeometry(sternShape), hullPaint);
      stern.position.set(0, 0, L * 0.5);
      stern.castShadow = true;
      grp.add(stern);

      // 船底内板（甲板/舱底）
      const floor = new THREE.Mesh(new THREE.BoxGeometry(1.52, 0.06, L * 0.60), plankMat);
      floor.position.set(0, 0.20, 0.05);
      floor.receiveShadow = true;
      grp.add(floor);
      // 舱底板条（三条，做出木条缝）
      for (let i = 0; i < 6; i++) {
        const b = new THREE.Mesh(new THREE.BoxGeometry(1.44, 0.014, 0.10), trimMat);
        b.position.set(0, 0.232, -1.10 + i * 0.44);
        grp.add(b);
      }

      // 座板 ×2（横跨船舱）
      [-1.20, 0.42].forEach((z, i) => {
        const w = halfW(0.5 - z / L) * 1.85;
        const seat = new THREE.Mesh(new THREE.BoxGeometry(w, 0.055, 0.24), plankMat);
        seat.position.set(0, i === 0 ? 0.44 : 0.42, z);
        seat.castShadow = true;
        seat.receiveShadow = true;
        grp.add(seat);
      });

      // 船头：一段短甲板 + 系缆桩 + 盘起来的缆绳
      const bowDeck = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.06, 0.78), plankMat);
      bowDeck.position.set(0, 0.50, -L * 0.345);
      bowDeck.receiveShadow = true;
      grp.add(bowDeck);
      const bollard = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.058, 0.13, 8), trimMat);
      bollard.position.set(0, 0.59, -L * 0.44);
      grp.add(bollard);
      const coil = new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.022, 6, 14), ropeMat);
      coil.rotation.x = Math.PI / 2;
      coil.position.set(0.0, 0.545, -L * 0.44 + 0.34);
      grp.add(coil);

      // 桨 ×2：横搭在舷边的桨架上，桨叶探到船外（原来竖着插在船里像两根木棍）
      [-1, 1].forEach((sd) => {
        const oar = new THREE.Group();
        const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 2.7, 8), plankMat);
        shaft.rotation.z = Math.PI / 2;   // 桨杆沿 X 横躺，两端探出船舷
        oar.add(shaft);
        const blade = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.022, 0.17), plankMat);
        blade.position.set(1.22, 0, 0);
        oar.add(blade);
        oar.position.set(sd * 0.80, 0.68, 0.55);
        oar.rotation.set(0.05 * sd, 0.16 * sd, -0.10 * sd);
        grp.add(oar);
      });

      // 船尾小马达（可选装饰，让船看起来是能开的）
      const motor = new THREE.Group();
      const mBody = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.30, 0.28), trimMat);
      motor.add(mBody);
      const mShaft = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.038, 0.62, 8), trimMat);
      mShaft.position.set(0, -0.40, 0);
      motor.add(mShaft);
      const prop = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.07, 0.30), plankMat);
      prop.position.set(0, -0.70, 0);
      motor.add(prop);
      motor.position.set(0, 0.58, L * 0.5 - 0.04);
      grp.add(motor);
      boatProp = prop;

      root.add(grp);

      // 初始停靠点：岛南侧岸边外的浅水。
      // 注意沙滩环带向外延伸 4.5m，船必须停在环带之外才是真正漂在水上。
      const a0 = 1.35;
      // 这里还在 buildBoat 的 IIFE 内部，boat 这个 const 尚未完成初始化，
      // 直接引用 boat.halfLen 会踩 TDZ 抛 ReferenceError（整局都起不来）。
      // 用本地的 L 换算半船长即可。
      const r0 = islandRadiusAt(a0) + 4.8 + (L * 0.5) * 1.05 + 0.6;
      const b = {
        group: grp,
        x: Math.cos(a0) * r0,
        z: Math.sin(a0) * r0,
        yaw: a0 + Math.PI / 2,
        speed: 0,
        dir: 0,                 // 当前速度方向（可倒车）
        deckY: 0.235,
        bob: 0,
        fish: [],               // 甲板上活着的鱼
        occupied: false,
        propSpin: 0,
        wakeT: 0,
        halfLen: L * 0.5,
        halfWid: W
      };
      grp.position.set(b.x, WATER_Y, b.z);
      grp.rotation.y = b.yaw;
      return b;
    })();

    // ---------- 灯塔：Fab「Lighthouse」素材，改成海上的礁石灯塔 ----------
    // 玩家要求「原先的灯塔删了，在海上放一个这个」。老塔是纯程序化堆的
    // （石砌基座 + 白橙圆环 + 红穹顶 + 守着的小屋），整段删掉换素材。
    // 素材本身就是「礁石 + 塔 + 守塔人小屋」一整座小岛，所以不搬进岛里，
    // 直接丢在离岸的海面上，礁石沉一半进水里，塔身露出来当天际线。
    const LighthouseAsset = glbAsset('LH_ASSETS', 'assets/lh/lh_small.glb', 'lighthouse');
    let lighthouse = null;
    let lhBeam = null;        // 夜里扫过海面的光束（灯室里的锥体 + 水面光斑 + 一盏聚光）
    let lhReef = null;        // 礁石外圈的白沫

    // 海礁：素材自带的那块 Rock 是亮灰平板，直接漂在蓝海面上像一块浮岛。
    // 这里另做一套湿石头——水线附近压成带藻绿的深色，只有露出水面的顶面收一点光。
    function makeSeaRockGeo(r, seed) {
      const geo = new THREE.IcosahedronGeometry(r, 1);
      const pos = geo.attributes.position;
      const nz = makeValueNoise(seed, 12);
      const colors = [];
      const cWet = new THREE.Color(0x232b2d);
      const cDry = new THREE.Color(0x454d4b);
      const c = new THREE.Color();
      const v = new THREE.Vector3();
      for (let i = 0; i < pos.count; i++) {
        v.set(pos.getX(i), pos.getY(i), pos.getZ(i));
        const n = nz((v.x / r + 1) * 4.5 + (seed % 9), (v.z / r + 1) * 4.5 + (v.y / r + 1) * 2.8);
        v.multiplyScalar(0.72 + n * 0.52);
        pos.setXYZ(i, v.x, v.y * 0.7, v.z);
        const up = Math.max(0, v.y / r);
        c.copy(cWet).lerp(cDry, Math.pow(up, 1.25) * 0.9);
        colors.push(c.r, c.g, c.b);
      }
      geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
      geo.computeVertexNormals();
      return geo;
    }
    const seaRockMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true });

    // 水线白沫：一圈带透明度的噪声环，铺在礁石外圈，遮住石头与水面的硬边
    function makeFoamTex() {
      const S = 256;
      const cv = document.createElement('canvas');
      cv.width = cv.height = S;
      const cx = cv.getContext('2d');
      cx.clearRect(0, 0, S, S);
      for (let i = 0; i < 900; i++) {
        const a2 = Math.random() * Math.PI * 2;
        const rr = (0.615 + Math.random() * 0.185) * S / 2;
        const px = S / 2 + Math.cos(a2) * rr;
        const py = S / 2 + Math.sin(a2) * rr;
        const rad = 1.6 + Math.random() * 7.5;
        const gr = cx.createRadialGradient(px, py, 0, px, py, rad);
        gr.addColorStop(0, 'rgba(255,255,255,' + (0.10 + Math.random() * 0.30).toFixed(3) + ')');
        gr.addColorStop(1, 'rgba(255,255,255,0)');
        cx.fillStyle = gr;
        cx.beginPath();
        cx.arc(px, py, rad, 0, Math.PI * 2);
        cx.fill();
      }
      const tex = new THREE.CanvasTexture(cv);
      tex.needsUpdate = true;
      return tex;
    }

    // 塔灯的眩光：远处看是一团暖黄的光球，不是一个小点
    function makeGlowTex() {
      const S = 128;
      const cv = document.createElement('canvas');
      cv.width = cv.height = S;
      const cx = cv.getContext('2d');
      const gr = cx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
      gr.addColorStop(0, 'rgba(255,246,224,1)');
      gr.addColorStop(0.18, 'rgba(255,226,170,0.92)');
      gr.addColorStop(0.45, 'rgba(255,190,120,0.35)');
      gr.addColorStop(1, 'rgba(255,170,90,0)');
      cx.fillStyle = gr;
      cx.fillRect(0, 0, S, S);
      const tex = new THREE.CanvasTexture(cv);
      tex.needsUpdate = true;
      return tex;
    }

    (function placeLighthouse() {
      const a = 1.62;                            // 与旧塔同方位，在船泊位外侧的海面
      const lr = islandRadiusAt(a) + 17;
      const lx = Math.cos(a) * lr;
      const lz = Math.sin(a) * lr;
      const SINK = 4.55;                         // 礁石底面压到水面以下的深度（露出水面的只有顶上那圈圆礁）

      const g = new THREE.Group();
      g.position.set(lx, WATER_Y, lz);
      g.rotation.y = -a + Math.PI / 2;           // 小屋朝岛内
      root.add(g);

      lighthouse = { x: lx, z: lz, y: WATER_Y, lampY: WATER_Y + 12 };

      // 礁石外圈的碎礁 + 白沫：素材那块石头是一整块干净的多面体，
      // 水线一圈硬边特别出戏，铺一层湿碎礁和白沫才像是「从海里长出来的」。
      function buildReef() {
        const reef = new THREE.Group();
        for (let i = 0; i < 24; i++) {
          const ra = (i / 24) * Math.PI * 2 + (i % 3) * 0.19;
          const rr = 6.8 + (((i * 37) % 100) / 100) * 3.2;
          const size = 0.75 + (((i * 53) % 100) / 100) * 1.5;
          const mesh = new THREE.Mesh(makeSeaRockGeo(size, 910 + i * 29), seaRockMat);
          const dip = 0.28 + (((i * 71) % 100) / 100) * 0.52;   // 大半沉在水下
          mesh.position.set(Math.cos(ra) * rr, WATER_Y - size * dip, Math.sin(ra) * rr);
          mesh.rotation.set(0, ra * 2.3, (((i % 5) - 2) * 0.07));
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          reef.add(mesh);
        }
        const foam = new THREE.Mesh(
          new THREE.PlaneGeometry(24, 24),
          new THREE.MeshBasicMaterial({
            map: makeFoamTex(), transparent: true, depthWrite: false,
            opacity: 0.86, side: THREE.DoubleSide
          })
        );
        foam.rotation.x = -Math.PI / 2;
        foam.position.y = WATER_Y + 0.025;
        foam.renderOrder = 1;
        reef.add(foam);
        g.add(reef);
        lhReef = { foam };
      }

      // 光束：灯室里射出两道对穿的光锥（真灯塔就是这么转的），
      // 落到水面的那一圈暖光交给海面着色器画（见 oceanMat 的 beam* uniform），
      // 锥体本身只负责「看得见的那道光」。
      function buildBeam(lampLocalY) {
        const root2 = new THREE.Group();
        root2.position.set(0, lampLocalY, 0);
        g.add(root2);

        const LEN = 78;
        const HALF = 0.062;                       // 光锥半角
        const RAD = Math.tan(HALF) * LEN;
        // 光轴下压的角度：让光束在 58m 外正好扫到水面
        const TILT = Math.atan2(lampLocalY, 58);

        const coneGeo = (rad, len) => {
          const geo = new THREE.ConeGeometry(rad, len, 24, 1, true);
          geo.translate(0, -len / 2, 0);          // 顶点挪到原点，锥体朝 -Y 张开
          return geo;
        };
        const mats = [];
        const beamMat = (color, base) => {
          const mt = new THREE.ShaderMaterial({
            uniforms: {
              uColor: { value: new THREE.Color(color) },
              uOpacity: { value: 0 },
              uLen: { value: LEN }
            },
            vertexShader: [
              'varying float vT; varying float vF;',
              'uniform float uLen;',
              'void main(){',
              '  vT = clamp(-position.y / uLen, 0.0, 1.0);',
              '  vec4 mv = modelViewMatrix * vec4(position, 1.0);',
              '  vec3 n = normalize(normalMatrix * normal);',
              '  vF = abs(dot(n, normalize(-mv.xyz)));',
              '  gl_Position = projectionMatrix * mv;',
              '}'
            ].join('\n'),
            fragmentShader: [
              'varying float vT; varying float vF;',
              'uniform vec3 uColor; uniform float uOpacity;',
              'void main(){',
              // 越靠近灯室越亮，末端整体化进夜色；轮廓边缘按视角淡出，避免出现硬边圆台
              '  float body = pow(1.0 - vT, 2.2) * (1.0 - vT * 0.35);',
              '  float soft = smoothstep(0.02, 0.70, vF);',
              // 单层锥：外沿半透明、正对视线处堆到接近实心，等价于旧的「外层+内芯」
              '  float core = soft * soft;',
              '  gl_FragColor = vec4(uColor, body * (soft * 0.62 + core * 0.80) * uOpacity);',
              '}'
            ].join('\n'),
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            side: THREE.DoubleSide
          });
          mt.userData.base = base;
          mats.push(mt);
          return mt;
        };
        const mkBeam = (rad, len, color, base) => {
          const mesh = new THREE.Mesh(coneGeo(rad, len), beamMat(color, base));
          mesh.frustumCulled = false;
          mesh.renderOrder = 4;
          return mesh;
        };

        // 原来一条光柱套三层锥（外层/中层/内芯），夜里就是 6 次全屏加法混合；
        // 现在合成一层，靠片元里的「中心更亮」模拟内芯，观感接近、填充率省 2/3。
        [0, Math.PI].forEach((ya) => {
          const pivot = new THREE.Group();
          pivot.rotation.set(0, ya, 0);
          const tilt = new THREE.Group();
          tilt.rotation.x = -Math.PI / 2 + TILT;
          tilt.add(mkBeam(RAD, LEN, 0xffd7a4, 0.088));
          pivot.add(tilt);
          root2.add(pivot);
        });

        const glow = new THREE.Sprite(new THREE.SpriteMaterial({
          map: makeGlowTex(), color: 0xffdca8, transparent: true, depthWrite: false,
          blending: THREE.AdditiveBlending, opacity: 0
        }));
        glow.scale.set(5.2, 5.2, 1);
        root2.add(glow);

        // 一盏不投影的聚光：光束扫过礁石/小屋时，石头会被真的照亮一下
        const spot = new THREE.SpotLight(0xffd0a0, 0, 130, 0.10, 0.55, 1);
        spot.position.set(0, 0, 0);
        const spotT = new THREE.Object3D();
        spotT.position.set(0, -lampLocalY, 58);
        spot.target = spotT;
        root2.add(spotT);
        root2.add(spot);

        lhBeam = { root: root2, mats, glow, spot, baseYaw: g.rotation.y };
      }

      LighthouseAsset.whenReady((gltf) => {
        const m = gltf.scene;
        // 素材单位很大（礁石宽 1314、总高 1491），先量包围盒再统一缩到目标尺寸
        m.updateMatrixWorld(true);
        const bb = new THREE.Box3().setFromObject(m);
        const sz = bb.getSize(new THREE.Vector3());
        const S = 15.4 / Math.max(sz.x, sz.z);   // 礁石直径 ≈ 15.4m
        m.scale.setScalar(S);
        m.updateMatrixWorld(true);

        const bb2 = new THREE.Box3().setFromObject(m);
        const h = bb2.max.y - bb2.min.y;
        // 水平居中到塔轴，礁石底面压到水面下（露出一圈湿礁，塔基不悬空）
        m.position.x -= (bb2.min.x + bb2.max.x) / 2;
        m.position.z -= (bb2.min.z + bb2.max.z) / 2;
        m.position.y -= bb2.min.y + SINK;

        m.traverse((o) => {
          if (!o.isMesh) return;
          o.castShadow = true;
          o.receiveShadow = true;
          const mat = o.material;
          if (!mat) return;
          const nm = (mat.name || '') + ' ' + (o.name || '');
          // 灯室的玻璃罩在夜里点起来，远处看就是一团暖光
          if (/topLightGlass|lantern/i.test(nm)) {
            mat.emissive = new THREE.Color(0xffd9a0);
            mat.emissiveIntensity = 0.9;        // 夜里远看是一团暖光，白天也只是玻璃略亮
          } else if (/rock/i.test(nm) && mat.isMeshStandardMaterial) {
            // 素材的礁石贴图是浅灰的，压在深蓝海面上像一块塑料浮台。
            // 往青灰的湿石色压一档，剩下的交给外圈碎礁和白沫去接水线。
            mat.color = new THREE.Color(0xc2cac3);
            mat.roughness = 1;
            mat.metalness = 0;
            mat.needsUpdate = true;
          } else if (mat.isMeshStandardMaterial) {
            // 同一批导出的素材，金属度普遍偏高；没有环境贴图时金属面会发黑
            mat.metalness = Math.min(mat.metalness || 0, 0.15);
            mat.needsUpdate = true;
          }
        });
        g.add(m);

        // 塔灯：夜里亮，跟着昼夜系统走
        const lampY = -SINK + h * 0.87;
        const lamp = new THREE.PointLight(0xffcf88, 0, 64, 2);
        lamp.position.set(0, lampY, 0);
        g.add(lamp);
        nightLights.push({ light: lamp, base: 3.4 });

        // 塔身补光：塔灯在灯室里，照不到下面的塔身，远看只剩一根黑剪影。
        // 在塔身中段挂一盏很弱的暖光，只负责把砖面刷出一点轮廓。
        const bodyLamp = new THREE.PointLight(0xffb070, 0, 13, 2);
        bodyLamp.position.set(0, -SINK + h * 0.56, 0);
        g.add(bodyLamp);
        nightLights.push({ light: bodyLamp, base: 0.5 });

        lighthouse.lampY = WATER_Y + lampY;
        buildReef();
        buildBeam(lampY);
        if (typeof hourNow === 'number') setDayTime(hourNow);
        console.log('[lighthouse] 礁石灯塔就位', lx.toFixed(1), lz.toFixed(1), '高', h.toFixed(1));
      });
    })();

    // 船体局部坐标 -> 世界坐标
    function boatToWorld(b, lx, lz) {
      const c = Math.cos(b.yaw), sn = Math.sin(b.yaw);
      return { x: b.x + lx * c + lz * sn, z: b.z - lx * sn + lz * c };
    }

    // 甲板高度（世界 y，含随浪起伏）
    function boatDeckY() {
      // 船体 group 的 y 已经就是 WATER_Y + 起伏，甲板高度直接是「group.y + 舱底顶面」
      return boat.group.position.y + boat.deckY;
    }

    // 把一条钓上来的鱼放到甲板上：侧躺、会拍尾、有几率跳回水里
    function addBoatFish(name) {
      const model = new window.FishModel(name);
      const g2 = model.group;
      // 甲板只有 5.6m 长：3m 的苍龙按 1.25 倍摆上去就横穿船头船尾了
      const deckScale = model.len > 1.4 ? Math.max(0.5, 2.5 / model.len) : 1.25;
      g2.scale.multiplyScalar(deckScale);
      root.add(g2);
      // 沿船头方向随机铺开，避免全叠在一个点上
      const spots = boat.fish.length;
      const lx = (Math.random() - 0.5) * 0.55;
      const lz = -0.55 + (spots % 3) * 0.32 + Math.random() * 0.14;
      const w = boatToWorld(boat, lx, lz);
      // 鱼模型是「头朝 +X、背朝 +Y」建的：绕 Z 转 90° 会把鱼头竖起来立在甲板上，
      // 看着像鱼在做倒立。真正的"侧躺"是绕身体长轴（X 轴）转 90°，让一整片
      // 体侧贴着木板，尾巴还能左右拍。
      g2.position.set(w.x, boatDeckY() + 0.055, w.z);
      g2.rotation.set(Math.PI / 2 * (Math.random() < 0.5 ? 1 : -1), boat.yaw + (Math.random() - 0.5) * 1.2, 0);
      const f = {
        model, group: g2, name,
        lx, lz,
        flipT: 0.3 + Math.random() * 0.8,
        jumpT: 9 + Math.random() * 12,
        jumping: false, t: 0,
        vel: null, py: 0
      };
      boat.fish.push(f);
      // 甲板最多 6 条，多了就自己滑回水里（避免一直堆）
      if (boat.fish.length > 6) {
        const old = boat.fish.shift();
        root.remove(old.group);
        old.model.dispose();
      }
      return f;
    }

    // 回到初始泊位（新回合开始时调用），顺便清空甲板
    function resetBoat() {
      const a0 = 1.35;
      // resetBoat 在 boat 初始化之后才调用，这里可以安全读 halfLen
      const r0 = islandRadiusAt(a0) + 4.8 + boat.halfLen * 1.05 + 0.6;
      boat.x = Math.cos(a0) * r0;
      boat.z = Math.sin(a0) * r0;
      boat.yaw = a0 + Math.PI / 2;
      boat.speed = 0;
      boat.bob = 0;
      boat.fish.forEach((f) => { root.remove(f.group); f.model.dispose(); });
      boat.fish.length = 0;
      boat.occupied = false;
      boat.group.position.set(boat.x, WATER_Y, boat.z);
      boat.group.rotation.set(0, boat.yaw, 0);
    }

    function updateBoat(dt, t) {
      const b = boat;
      // 推进与转向（speed 由输入驱动）
      b.propSpin += dt * (2 + Math.abs(b.speed) * 6);
      if (boatProp) boatProp.rotation.z = b.propSpin;
      // 阻力
      b.speed *= Math.max(0, 1 - dt * 0.9);
      if (Math.abs(b.speed) < 0.02) b.speed = 0;

      const mov = b.speed * dt;
      // 船体建模时船头在局部 -z（马达在 +z 船尾），所以前进方向是 -z
      const nx = b.x - Math.sin(b.yaw) * mov;
      const nz = b.z - Math.cos(b.yaw) * mov;

      // 不允许开上沙滩，也不能开到天涯海角
      const da = Math.atan2(nz, nx);
      const shore = islandRadiusAt(da);
      const dist = Math.hypot(nx, nz);
      // 船头比船心还往前伸半个船长：按船心算距离，船头会直接扎进沙滩。
      const minR = shore + 4.8 + b.halfLen * 1.05;
      const maxR = shore + 62;
      if (dist < minR) {
        // 撞岸：推回水里并减速
        b.speed *= 0.2;
        b.x = (nx / dist) * minR;
        b.z = (nz / dist) * minR;
      } else if (dist > maxR) {
        b.speed *= 0.4;
        b.x = (nx / dist) * maxR;
        b.z = (nz / dist) * maxR;
      } else {
        b.x = nx;
        b.z = nz;
      }

      // 坐船时的浪涌起伏：船越大越稳，这里给小船一点明显摇摆
      b.bob += dt * (1.4 + Math.abs(b.speed) * 0.25);
      const bobY = Math.sin(b.bob) * 0.035 + Math.sin(b.bob * 0.63 + 1.1) * 0.022;
      const roll = Math.sin(b.bob * 0.9) * 0.022 + b.speed * 0.006;
      const pitch = Math.sin(b.bob * 1.3 + 0.7) * 0.014;

      b.group.position.set(b.x, WATER_Y + bobY, b.z);
      b.group.rotation.set(pitch, b.yaw, roll, 'YXZ');

      // 航行尾迹：船尾不断冒小涟漪
      b.wakeT -= dt;
      if (Math.abs(b.speed) > 0.8 && b.wakeT <= 0) {
        b.wakeT = 0.16;
        const st = boatToWorld(b, 0, b.halfLen * 0.9);
        spawnRipple(st.x, st.z, Math.min(0.9, 0.22 + Math.abs(b.speed) * 0.1));
      }

      // 甲板上的鱼：拍尾、挣扎、有几率跳回水里
      for (let i = b.fish.length - 1; i >= 0; i--) {
        const f = b.fish[i];
        const w = boatToWorld(b, f.lx, f.lz);
        if (!f.jumping) {
          // 躺着拍打：身体快速抖动 + 尾巴大幅摆动
          f.flipT -= dt;
          const k = Math.max(0, Math.sin(t * 13 + i) * 0.5 + 0.5);
          f.group.position.set(w.x, boatDeckY() + 0.055 + k * 0.030, w.z);
          // 侧躺姿态：绕 X 轴 90°（不是 Z），再叠加一点扑腾的侧倾
          const rollBase = f.roll || (f.roll = Math.PI / 2 * (Math.random() < 0.5 ? 1 : -1));
          f.group.rotation.x = rollBase + Math.sin(t * 11 + i) * 0.14 * k;
          f.group.rotation.y = b.yaw + 0.2 + Math.sin(t * 7 + i) * 0.12;
          f.group.rotation.z = 0;
          f.model.animate(dt * 1.6, 2.4);
          if (f.flipT <= 0) {
            f.flipT = 0.24 + Math.random() * 0.6;
          }
          // 跳船判定
          f.jumpT -= dt;
          if (f.jumpT <= 0) {
            f.jumpT = 14 + Math.random() * 16;
            if (Math.random() < 0.55) {
              f.jumping = true;
              f.t = 0;
              const out = boatToWorld(b, f.lx + (f.lx >= 0 ? 1.1 : -1.1), f.lz);
              f.vel = { x: (out.x - w.x) * 1.6, z: (out.z - w.z) * 1.6 };
              f.py = boatDeckY() + 0.08;
              if (window.FX) window.FX.ripple(new THREE.Vector3(w.x, WATER_Y + 0.02, w.z), 0x9df3ff, 0.7);
            }
          }
        } else {
          // 跃起 -> 抛物线 -> 落水消失
          f.t += dt;
          const p = f.t;
          f.group.position.set(
            w.x + f.vel.x * p,
            f.py + 3.4 * p - 6.2 * p * p,
            w.z + f.vel.z * p
          );
          f.group.rotation.x += dt * 7;
          f.group.rotation.z += dt * 5;
          if (f.group.position.y < WATER_Y + 0.02) {
            if (window.FX) {
              window.FX.ripple(new THREE.Vector3(f.group.position.x, WATER_Y + 0.02, f.group.position.z), 0xa8e8ff, 1.0);
              window.FX.sparks(new THREE.Vector3(f.group.position.x, WATER_Y + 0.1, f.group.position.z), 0xbfe9ff, 8);
            }
            root.remove(f.group);
            f.model.dispose();
            b.fish.splice(i, 1);
            if (window.onBoatSplash) window.onBoatSplash(f.group.position);
          }
        }
      }
    }
    // ---------- 钓鱼点（已废弃：现改为任意近水处均可钓鱼）----------
    const spots = [];

    // ---------- 碰撞求解 ----------
    // allowWater=true 时开放岛外海域（可游泳范围：岸线外 22m）
    function collide(pos, radius, allowWater, playerY, airborne) {
      let stepUp = 0;
      const py = playerY !== undefined ? playerY : pos.y;
      // 地面：0.6m 以内可以直接走上去（台阶、门槛、矮石）。
      // 空中：0.80m —— 跳跃最高点约 1.12m，这个阈值刚好能让 1.2~1.8m 的石头
      // 被踩上去（需要跳到 0.4~1.0m 高度），同时 2m 以上的木箱仍然只能从旁边
      // 的石头借高才上得去。之前收紧到 0.35 时，连 1.2m 的石头都跳不上去。
      const maxStep = airborne ? 0.80 : 0.6;
      const stepRefY = py;
      // 木箱/石头/树：可踩上去的低障碍不再阻挡水平移动
      for (let i = 0; i < colliders.length; i++) {
        const c = colliders[i];
        if (c.off) continue;
        // 玩家已在障碍顶面之上：不碰撞
        if (py > c.maxY - 0.15) continue;
        // 高悬障碍（如门楣）：玩家可从其下方通过，不做水平推挤
        if (py + 1.75 < c.minY) continue;
        const nx = Math.max(c.minX, Math.min(pos.x, c.maxX));
        const nz = Math.max(c.minZ, Math.min(pos.z, c.maxZ));
        const dx = pos.x - nx;
        const dz = pos.z - nz;
        const d2 = dx * dx + dz * dz;
        if (d2 < radius * radius) {
          const step = c.maxY - stepRefY;
          // 玩家中心是否在障碍水平范围内
          const insideBox = pos.x > c.minX && pos.x < c.maxX && pos.z > c.minZ && pos.z < c.maxZ;
          if (step <= maxStep && !c.noStand) {
            // 可踩踏：不阻挡水平移动；仅当玩家中心进入障碍范围时才抬升到顶面
            if (insideBox && c.maxY > stepUp) stepUp = c.maxY;
            continue;
          }
          if (d2 > 1e-6) {
            const d = Math.sqrt(d2);
            pos.x = nx + (dx / d) * radius;
            pos.z = nz + (dz / d) * radius;
          } else {
            // 在盒内：沿最近边推出
            const pxMin = pos.x - c.minX;
            const pxMax = c.maxX - pos.x;
            const pzMin = pos.z - c.minZ;
            const pzMax = c.maxZ - pos.z;
            const m = Math.min(pxMin, pxMax, pzMin, pzMax);
            if (m === pxMin) pos.x = c.minX - radius;
            else if (m === pxMax) pos.x = c.maxX + radius;
            else if (m === pzMin) pos.z = c.minZ - radius;
            else pos.z = c.maxZ + radius;
          }
        }
      }

      // 湖岸阻挡：湖水不再冻结，玩家不能走进湖里（站在岸上即可钓鱼）
      const pdx = pos.x - pond.x, pdz = pos.z - pond.z;
      const pd = Math.hypot(pdx, pdz);
      const pr = pondRadiusAt(Math.atan2(pdz, pdx)) + radius + 0.25;
      if (pd < pr && pd > 1e-4) {
        pos.x = pond.x + (pdx / pd) * pr;
        pos.z = pond.z + (pdz / pd) * pr;
      }

      // 岛边界（按不规则岸线）；开放水域时放宽到岸线外 22m
      const db = Math.sqrt(pos.x * pos.x + pos.z * pos.z);
      const maxD = islandRadiusAt(Math.atan2(pos.z, pos.x)) + (allowWater ? 22 : 5.6);
      if (db > maxD) {
        pos.x = (pos.x / db) * maxD;
        pos.z = (pos.z / db) * maxD;
      }
      return stepUp;
    }

    // 可站立高度：地形高度 + 玩家脚下/前方可达的障碍顶面
    function surfaceHeight(x, z, playerY, airborne) {
      let y = heightAt(x, z);
      // 湖面为开放水体，不再作为可站立顶面
      // 实体沙岸顶面（岸线向外 4.5m 环带）
      const dShore = Math.hypot(x, z);
      const rShore = islandRadiusAt(Math.atan2(z, x));
      if (dShore > rShore - 0.4 && dShore < rShore + 4.8 && y < 0.12) {
        if (airborne ? 0.12 <= playerY + 0.4 : 0.12 <= playerY + 0.6) y = 0.12;
      }
      for (let i = 0; i < colliders.length; i++) {
        const c = colliders[i];
        if (c.off || c.noStand) continue;
        if (x >= c.minX - 0.05 && x <= c.maxX + 0.05 &&
            z >= c.minZ - 0.05 && z <= c.maxZ + 0.05) {
          if (airborne) {
            // 空中：仅当接近顶面时才落上去（避免从低处瞬移）
            if (c.maxY <= playerY + 0.4 && c.maxY > y) y = c.maxY;
          } else {
            // 地面：可踩上低障碍
            if (c.maxY <= playerY + 0.6 && c.maxY > y) y = c.maxY;
          }
        }
      }
      return y;
    }

    // ---------- 射线 ----------
    function rayBox(o, d, box, maxT) {
      let tmin = 0, tmax = maxT, axis = -1, sign = 1;
      const mins = [box.minX, box.minY, box.minZ];
      const maxs = [box.maxX, box.maxY, box.maxZ];
      const os = [o.x, o.y, o.z];
      const ds = [d.x, d.y, d.z];
      for (let a = 0; a < 3; a++) {
        if (Math.abs(ds[a]) < 1e-8) {
          if (os[a] < mins[a] || os[a] > maxs[a]) return null;
        } else {
          let t1 = (mins[a] - os[a]) / ds[a];
          let t2 = (maxs[a] - os[a]) / ds[a];
          let s = -1;
          if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; s = 1; }
          if (t1 > tmin) { tmin = t1; axis = a; sign = s; }
          if (t2 < tmax) tmax = t2;
          if (tmin > tmax) return null;
        }
      }
      if (axis < 0) return null;
      return { t: tmin, axis, sign };
    }

    // 射线 vs 实心冰盖（不规则饼状柱体）：先按 y 区间与最大半径圆粗判，
    // 再定步长扫描 + 二分细化入点，命中返回最近 t
    function rayPond(o, d, maxT) {
      let t0 = 0, t1 = maxT;
      // y 限制在冰层厚度 [-0.05, POND_TOP] 内
      if (Math.abs(d.y) > 1e-6) {
        let ta = (-0.05 - o.y) / d.y;
        let tb = (POND_TOP - o.y) / d.y;
        if (ta > tb) { const tmp = ta; ta = tb; tb = tmp; }
        t0 = Math.max(t0, ta);
        t1 = Math.min(t1, tb);
      } else if (o.y < -0.05 || o.y > POND_TOP) return null;
      if (t1 <= t0) return null;
      // 水平粗判：与最大半径圆（约 11.6）求交
      const ox = o.x - pond.x, oz = o.z - pond.z;
      const a = d.x * d.x + d.z * d.z;
      if (a > 1e-8) {
        const b = 2 * (ox * d.x + oz * d.z);
        const c = ox * ox + oz * oz - 11.6 * 11.6;
        const disc = b * b - 4 * a * c;
        if (disc < 0) return null;
        const sq = Math.sqrt(disc);
        t0 = Math.max(t0, (-b - sq) / (2 * a));
        t1 = Math.min(t1, (-b + sq) / (2 * a));
      } else if (ox * ox + oz * oz > 11.6 * 11.6) return null;
      if (t1 <= t0) return null;
      // 定步长扫描 + 二分入点
      const inside = (t) => {
        const x = o.x + d.x * t - pond.x;
        const z = o.z + d.z * t - pond.z;
        return Math.hypot(x, z) < pondRadiusAt(Math.atan2(z, x));
      };
      const n = Math.max(1, Math.ceil((t1 - t0) / 0.22));
      let prevOut = t0;
      for (let i = 1; i <= n; i++) {
        const t = t0 + (t1 - t0) * (i / n);
        if (inside(t)) {
          let lo = prevOut, hi = t;
          for (let k = 0; k < 6; k++) {
            const m = (lo + hi) / 2;
            if (inside(m)) hi = m; else lo = m;
          }
          return { t: hi, axis: 1, sign: 1 };
        }
        prevOut = t;
      }
      return null;
    }

    function raycast(origin, dir, maxT) {
      let best = null;
      for (let i = 0; i < colliders.length; i++) {
        if (colliders[i].off) continue;
        const hit = rayBox(origin, dir, colliders[i], maxT);
        if (hit && (!best || hit.t < best.t)) {
          best = hit;
          best.collider = colliders[i];
        }
      }
      const iceHit = rayPond(origin, dir, maxT);
      if (iceHit && (!best || iceHit.t < best.t)) best = iceHit;
      return best;
    }

    function segmentBlocked(a, b) {
      const d = new THREE.Vector3().subVectors(b, a);
      const len = d.length();
      if (len < 1e-4) return false;
      d.divideScalar(len);
      const hit = raycast(a, d, len - 0.05);
      return !!hit;
    }

    // ---------- 门的开关 ----------
    function toggleDoor(door) {
      if (!door) return false;
      door.open = !door.open;
      door.target = door.open ? 1 : 0;
      return true;
    }
    function nearestDoor(x, z, maxDist) {
      let best = null, bestD = maxDist || 2.4;
      for (let i = 0; i < doors.length; i++) {
        const d = doors[i];
        const dist = Math.hypot(x - d.x, z - d.z);
        if (dist < bestD) { best = d; bestD = dist; }
      }
      return best;
    }

    function nearestBed(x, z, maxDist) {
      let best = null, bestD = maxDist || 2.6;
      for (let i = 0; i < beds.length; i++) {
        const b = beds[i];
        const dist = Math.hypot(x - b.x, z - b.z);
        if (dist < bestD) { best = b; bestD = dist; }
      }
      return best;
    }

    function nearestSeat(x, z, maxDist) {
      let best = null, bestD = maxDist || 1.7;
      for (let i = 0; i < seats.length; i++) {
        const s = seats[i];
        const dist = Math.hypot(x - s.x, z - s.z);
        if (dist < bestD) { best = s; bestD = dist; }
      }
      return best;
    }

    function nearestTable(x, z, maxDist) {
      let best = null, bestD = maxDist || 2.6;
      for (let i = 0; i < tables.length; i++) {
        const t = tables[i];
        const nx = Math.max(t.x - t.hw, Math.min(x, t.x + t.hw));
        const nz = Math.max(t.z - t.hd, Math.min(z, t.z + t.hd));
        const dist = Math.hypot(x - nx, z - nz);
        if (dist < bestD) { best = t; bestD = dist; }
      }
      return best;
    }

    // ---------- 昼夜 ----------
    // 白昼：晴朗海岛——天顶偏饱和的蓝、地平线明亮偏暖，海水青绿
    const C_DAY_TOP = new THREE.Color(0x3f7fae), C_NIGHT_TOP = new THREE.Color(0x050a14);
    const C_DAY_MID = new THREE.Color(0x9cc0d6), C_NIGHT_MID = new THREE.Color(0x0d1830);
    const C_DAY_BOT = new THREE.Color(0xdfe7e0), C_NIGHT_BOT = new THREE.Color(0x18243a);
    const C_DAY_SUN = new THREE.Color(0xfff4e0), C_NIGHT_SUN = new THREE.Color(0x2e3f66);
    const C_DAY_HEMI = new THREE.Color(0xd6e6f4), C_NIGHT_HEMI = new THREE.Color(0x36466e);
    const C_DAY_GROUND = new THREE.Color(0x7a8a58), C_NIGHT_GROUND = new THREE.Color(0x1c2432);
    const C_SUN_WARM = new THREE.Color(0xfff2da), C_SUN_DUSK = new THREE.Color(0xff9440);
    const C_DAY_DEEP = new THREE.Color(0x123a4a), C_NIGHT_DEEP = new THREE.Color(0x081520);
    const C_DAY_SHALLOW = new THREE.Color(0x2a707c), C_NIGHT_SHALLOW = new THREE.Color(0x122631);
    const C_DAY_SEASKY = new THREE.Color(0x83aec4), C_NIGHT_SEASKY = new THREE.Color(0x0f1b2e);
    const C_DAY_SEAFOG = new THREE.Color(0xd8e4dc), C_NIGHT_SEAFOG = new THREE.Color(0x0a1120);
    // 湖水四色：深水 / 浅水 / 天光 / 白沫（白天亮青蓝，夜里压成深靛，别发黑）
    const C_POND_DAY = new THREE.Color(0x4a96a6), C_POND_NIGHT = new THREE.Color(0x1e465c);
    const C_PONDSHAL_DAY = new THREE.Color(0x9ed2d0), C_PONDSHAL_NIGHT = new THREE.Color(0x2a5c72);
    const C_PONDAIR_DAY = new THREE.Color(0xe2f3f5), C_PONDAIR_NIGHT = new THREE.Color(0x203549);
    const C_PONDFOAM_DAY = new THREE.Color(0xf4fbfd), C_PONDFOAM_NIGHT = new THREE.Color(0x33506a);
    const C_LANTERN_OFF = new THREE.Color(0xff9a50);
    // ---- 血夜色板：所有颜色都从「夜」再往这组血色上拉 ----
    const C_BLOOD_TOP = new THREE.Color(0x2e0309), C_BLOOD_MID = new THREE.Color(0x6e0810);
    const C_BLOOD_BOT = new THREE.Color(0xb41c18), C_BLOOD_DEEP = new THREE.Color(0x35040a);
    const C_BLOOD_SHALLOW = new THREE.Color(0x5c0a12), C_BLOOD_SEASKY = new THREE.Color(0x3a0408);
    const C_BLOOD_FOG = new THREE.Color(0x2a0306), C_BLOOD_HEMI = new THREE.Color(0x4a0a10);
    const C_BLOOD_GROUND = new THREE.Color(0x1c0305), C_BLOOD_MOONLIGHT = new THREE.Color(0xff3a26);
    const C_BLOOD_AMB = new THREE.Color(0xff6a52), C_BLOOD_BEAM = new THREE.Color(0xff3a20);
    const C_BLOOD_LANTERN = new THREE.Color(0xff4a2a);
    // ---- 日魇色板：白天被蝠影遮住时用 ----
    // 不是「变成夜晚」，而是「太阳还在，但光被吃掉了」：天光偏灰绿、海面发铅、
    // 地平线留一条病态的黄白光带，比直接压黑更有"日蚀"的味道。
    const C_DM_TOP = new THREE.Color(0x4d5054), C_DM_MID = new THREE.Color(0x6a6a5e);
    const C_DM_BOT = new THREE.Color(0xc2b184), C_DM_DEEP = new THREE.Color(0x12202a);
    const C_DM_SHALLOW = new THREE.Color(0x2b3c40), C_DM_SEASKY = new THREE.Color(0x3a4044);
    const C_DM_FOG = new THREE.Color(0x8a8574), C_DM_HEMI = new THREE.Color(0x6a6e72);
    const C_DM_GROUND = new THREE.Color(0x2a2723), C_DM_SUN = new THREE.Color(0xe8c07a);
    const C_DM_AMB = new THREE.Color(0x9aa0a8), C_DM_POND = new THREE.Color(0x2c4448);
    const C_DM_PONDSHAL = new THREE.Color(0x53706e), C_DM_PONDAIR = new THREE.Color(0x7e8a84);
    let dayOn = false;            // 今天是不是日魇
    let dayMix = 0;               // 实际混合量（0..1，淡入用）
    let batWant = 0;              // 游戏逻辑要求的蝙蝠只数（10..30）
    let bloodOn = false;          // 目标状态：今夜是不是血夜
    let bloodMix = 0;             // 实际混合量（0..1，淡入淡出用）
    let lastAmbT = 0;             // 上一帧的场景时间，用来算淡入淡出的 dt
    let hourNow = 12;                 // 素材异步就位后要补一次昼夜状态，这里记一份当前小时

    function setDayTime(hour) {
      hourNow = hour;
      const ang = (hour - 6) * Math.PI / 12;
      const elev = Math.sin(ang);
      const night = Math.max(0, Math.min(1, (0.1 - elev) / 0.42));
      const day = 1 - night;

      // 太阳方向：东→西摆动，并抬高一点仰角，避免日落时投影无限拉长
      // 仰角设下限 0.38：否则傍晚太阳几乎贴着地平线，地面法线朝上收到的直射光接近 0，
      // 整个岛会黑成一片（这是第一版补丁把画面压暗的原因）
      sunDirV.set(Math.cos(ang), Math.max(0.38, Math.sin(ang) * 0.95), 0.40).normalize();
      sun.intensity = Math.pow(Math.max(0, elev), 0.55) * 3.15;
      sun.color.copy(C_SUN_WARM).lerp(C_SUN_DUSK, Math.max(0, 1 - Math.abs(elev) * 2.6));
      placeSun();

      hemi.intensity = 0.78 * day + 0.26 * night;
      hemi.color.copy(C_DAY_HEMI).lerp(C_NIGHT_HEMI, night);
      hemi.groundColor.copy(C_DAY_GROUND).lerp(C_NIGHT_GROUND, night);
      ambient.intensity = 0.11 * day + 0.10 * night;
      moon.intensity = 0.5 * night;

      const u = sky.material.uniforms;
      u.topColor.value.copy(C_DAY_TOP).lerp(C_NIGHT_TOP, night);
      u.midColor.value.copy(C_DAY_MID).lerp(C_NIGHT_MID, night);
      u.botColor.value.copy(C_DAY_BOT).lerp(C_NIGHT_BOT, night);
      u.sunColor.value.copy(C_DAY_SUN).lerp(C_NIGHT_SUN, night);
      u.sunDir.value.copy(sunDirV);

      stars.material.opacity = night;
      stars.visible = night > 0.02;

      oceanMat.uniforms.deepColor.value.copy(C_DAY_DEEP).lerp(C_NIGHT_DEEP, night);
      oceanMat.uniforms.shallowColor.value.copy(C_DAY_SHALLOW).lerp(C_NIGHT_SHALLOW, night);
      oceanMat.uniforms.skyColor.value.copy(C_DAY_SEASKY).lerp(C_NIGHT_SEASKY, night);
      oceanMat.uniforms.fogColor.value.copy(C_DAY_SEAFOG).lerp(C_NIGHT_SEAFOG, night);
      oceanMat.uniforms.sunColor.value.copy(C_SUN_WARM).lerp(C_SUN_DUSK, Math.max(0, 1 - Math.abs(elev) * 2.6));
      oceanMat.uniforms.sunDir.value.copy(sunDirV);

      waterMat.uniforms.waterColor.value.copy(C_POND_DAY).lerp(C_POND_NIGHT, night);
      waterMat.uniforms.waterColor2.value.copy(C_PONDSHAL_DAY).lerp(C_PONDSHAL_NIGHT, night);
      waterMat.uniforms.foamColor.value.copy(C_PONDFOAM_DAY).lerp(C_PONDFOAM_NIGHT, night);
      waterMat.uniforms.skyColor.value.copy(C_PONDAIR_DAY).lerp(C_PONDAIR_NIGHT, night);
      waterMat.uniforms.sunColor.value.copy(C_SUN_WARM).lerp(C_SUN_DUSK, Math.max(0, 1 - Math.abs(elev) * 2.6));
      waterMat.uniforms.sunDir.value.copy(sunDirV);

      for (let i = 0; i < nightLights.length; i++) {
        const nl = nightLights[i];
        nl.light.intensity = nl.base * (0.3 + night * 1.7);
        nl.light.color.copy(C_LANTERN_OFF);
      }

      // 灯塔：天黑才开灯。光束、眩光、海面光斑、那盏聚光一起跟着昼夜走，
      // 原来夜里只有灯室里一个小亮点，海面一片黑，玩家会以为灯没开。
      const beamOn = Math.max(0, Math.min(1, (night - 0.12) / 0.6));
      oceanMat.uniforms.beamOn.value = beamOn;
      oceanMat.uniforms.beamColor.value.copy(C_SUN_WARM).lerp(C_LANTERN_OFF, 0.55);
      if (lighthouse) oceanMat.uniforms.beamPos.value.set(lighthouse.x, lighthouse.z);
      if (lhBeam) {
        // 白天整组隐藏：透明+加法混合的锥体就算 opacity=0 也要走一遍全屏混合，
        // 集成显卡上这是白天最稳的掉帧来源（三层锥 × 两个方向 = 6 次全屏 pass）
        lhBeam.root.visible = beamOn > 0.004;
        for (let i = 0; i < lhBeam.mats.length; i++) {
          const mt = lhBeam.mats[i];
          mt.uniforms.uOpacity.value = mt.userData.base * beamOn;
        }
        lhBeam.glow.material.opacity = beamOn * 0.85;
        lhBeam.spot.intensity = beamOn * 5.5;
      }
      if (lhReef) {
        // 白沫跟着海水的夜色调暗，别在黑海面上发白
        lhReef.foam.material.color.copy(C_PONDFOAM_DAY).lerp(C_PONDFOAM_NIGHT, night);
        lhReef.foam.material.opacity = 0.86 - night * 0.30;
      }

      // ---- 血夜：在所有「正常昼夜」结果上再叠一层血色 ----
      // 白天残留的 bloodMix 不生效（乘 night），所以哪怕血夜中途天亮也会自然退掉。
      const bloodSky = bloodMix * Math.min(1, night * 1.45);
      sky.material.uniforms.bloodAmt.value = bloodSky;
      if (bloodMix > 0.002) {
        const b = Math.min(1, bloodMix * (0.35 + night * 1.05));
        const su = sky.material.uniforms;
        su.topColor.value.lerp(C_BLOOD_TOP, b);
        su.midColor.value.lerp(C_BLOOD_MID, b);
        su.botColor.value.lerp(C_BLOOD_BOT, b);
        oceanMat.uniforms.deepColor.value.lerp(C_BLOOD_DEEP, b);
        oceanMat.uniforms.shallowColor.value.lerp(C_BLOOD_SHALLOW, b);
        oceanMat.uniforms.skyColor.value.lerp(C_BLOOD_SEASKY, b);
        oceanMat.uniforms.fogColor.value.lerp(C_BLOOD_FOG, b);
        oceanMat.uniforms.beamColor.value.lerp(C_BLOOD_BEAM, b * 0.9);
        waterMat.uniforms.waterColor.value.lerp(C_BLOOD_DEEP, b);
        waterMat.uniforms.waterColor2.value.lerp(C_BLOOD_SHALLOW, b);
        waterMat.uniforms.skyColor.value.lerp(C_BLOOD_SEASKY, b);
        hemi.color.lerp(C_BLOOD_HEMI, b);
        hemi.groundColor.lerp(C_BLOOD_GROUND, b);
        ambient.color.lerp(C_BLOOD_AMB, b);
        moon.color.lerp(C_BLOOD_MOONLIGHT, b);
        // 血月的月光更亮更红：不然红海面会把整座岛吞成黑色
        moon.intensity = night * (0.5 + b * 0.85);
        ambient.intensity = (0.10 + b * 0.07) * Math.max(0.35, night);
        stars.material.opacity = night * (1 - b * 0.75);
        for (let i = 0; i < nightLights.length; i++) {
          nightLights[i].light.color.lerp(C_BLOOD_LANTERN, b * 0.8);
        }
      }
      if (bloodMoon) {
        const o = bloodMix * Math.min(1, night * 1.4) * 0.95;
        bloodMoon.material.opacity = o;
        bloodMoon.visible = o > 0.01;
      }

      // ---- 日魇：在白天的正常配色上再压一层「被遮住的太阳」 ----
      // 夜里日魇无效（事件本身只发生在白天），所以乘 day 因子。
      const dm = Math.min(1, dayMix * Math.max(0, 1 - night * 1.6));
      sky.material.uniforms.dayAmt.value = dm;
      if (dm > 0.002) {
        const su = sky.material.uniforms;
        su.topColor.value.lerp(C_DM_TOP, dm * 0.94);
        su.midColor.value.lerp(C_DM_MID, dm * 0.92);
        su.botColor.value.lerp(C_DM_BOT, dm * 0.88);
        su.sunColor.value.lerp(C_DM_SUN, dm);
        sun.color.lerp(C_DM_SUN, dm * 0.9);
        // 太阳被吃掉了大半：不是关灯，是「刺眼的白昼」被削成一层灰黄
        sun.intensity *= (1 - 0.58 * dm);
        hemi.color.lerp(C_DM_HEMI, dm * 0.9);
        hemi.groundColor.lerp(C_DM_GROUND, dm * 0.9);
        hemi.intensity *= (1 - 0.22 * dm);
        ambient.color.lerp(C_DM_AMB, dm);
        ambient.intensity = ambient.intensity * (0.7 + 0.3 * (1 - dm));
        oceanMat.uniforms.deepColor.value.lerp(C_DM_DEEP, dm * 0.92);
        oceanMat.uniforms.shallowColor.value.lerp(C_DM_SHALLOW, dm * 0.88);
        oceanMat.uniforms.skyColor.value.lerp(C_DM_SEASKY, dm * 0.9);
        oceanMat.uniforms.fogColor.value.lerp(C_DM_FOG, dm * 0.85);
        waterMat.uniforms.waterColor.value.lerp(C_DM_POND, dm * 0.9);
        waterMat.uniforms.waterColor2.value.lerp(C_DM_PONDSHAL, dm * 0.88);
        waterMat.uniforms.skyColor.value.lerp(C_DM_PONDAIR, dm * 0.9);
      }
    }

    // 血夜开关：game.js 的夜晚循环调用
    function setBloodNight(on) {
      bloodOn = !!on;
    }

    // 日魇开关：白天事件，game.js 的昼夜循环调用
    function setDaymare(on) {
      dayOn = !!on;
      if (!on) batWant = 0;
    }

    // 太阳是否还在地平线上（用来决定阴影贴图要不要每帧重画）
    function isSunUp() {
      return sun.intensity > 0.06;
    }

    // ---------- 水面涟漪（鱼游动时激起，向外扩散后淡出）----------
    const rippleSlots = [];
    for (let i = 0; i < RIP_N; i++) rippleSlots.push({ x: 0, z: 0, phase: 2, strength: 0 });

    function spawnRipple(x, z, strength) {
      let slot = null;
      for (let i = 0; i < rippleSlots.length; i++) {
        if (rippleSlots[i].phase >= 1) { slot = rippleSlots[i]; break; }
      }
      // 槽位全忙时抢占扩散得最远的那个
      if (!slot) {
        slot = rippleSlots[0];
        for (let i = 1; i < rippleSlots.length; i++) {
          if (rippleSlots[i].phase > slot.phase) slot = rippleSlots[i];
        }
      }
      slot.x = x;
      slot.z = z;
      slot.phase = 0;
      slot.strength = strength;
    }

    function updateRipples(step) {
      for (let i = 0; i < rippleSlots.length; i++) {
        const r = rippleSlots[i];
        if (r.phase < 1) r.phase = Math.min(1.05, r.phase + step / 2.9);
        rippleUni['rip' + i].value.set(r.x, r.z, r.phase, r.strength);
      }
    }

    // 菜单 / 轻量场景里只推进水与天空的时间、让棕榈和灯笼轻摆，
    // 跳过鱼群 / 海鸟 / 涟漪 / 船的逐帧模拟。主循环里这些才是真正吃 CPU 的：
    // 菜单只是缓慢环绕的静态背景，没必要每帧算几十条鱼的摆尾和鸟的扇翅。
    // ---------- 日魇蝠群 ----------
    // 需求是 10~30 只蝙蝠同时在天空盘旋。逐只造 Group 的话，30 只 × 5 个网格
    // = 150 个 draw call，白天本来就有 800 多，直接压垮集显。
    // 这里用 3 个 InstancedMesh（身体 / 左翼 / 右翼）：每帧只刷一次矩阵，
    // 不管多少只都只占 3 个 draw call。
    const BAT_MAX = 30;
    const batGeoBody = (() => {
      const prof = [
        [0.001, -0.30], [0.035, -0.26], [0.070, -0.18], [0.088, -0.06],
        [0.086, 0.06], [0.072, 0.16], [0.050, 0.23], [0.030, 0.27], [0.001, 0.30]
      ].map((p) => new THREE.Vector2(p[0], p[1]));
      const g = new THREE.LatheGeometry(prof, 12);
      g.rotateX(Math.PI / 2);          // 长度轴转到 Z
      g.scale(1.5, 1.4, 1.6);
      return g;
    })();
    // 翼：前缘平直、后缘三道指状凹口 —— 蝙蝠翼的剪影全靠这三个缺口
    const batGeoWing = (() => {
      const SPAN = 1.02, CH = 0.66;
      const s = new THREE.Shape();
      s.moveTo(CH * 0.34, 0);
      s.quadraticCurveTo(CH * 0.46, SPAN * 0.5, CH * 0.26, SPAN);
      s.lineTo(CH * 0.02, SPAN * 0.88);
      s.quadraticCurveTo(CH * 0.06, SPAN * 0.82, -CH * 0.10, SPAN * 0.72);
      s.quadraticCurveTo(CH * 0.06, SPAN * 0.64, -CH * 0.18, SPAN * 0.52);
      s.quadraticCurveTo(CH * 0.02, SPAN * 0.44, -CH * 0.24, SPAN * 0.30);
      s.quadraticCurveTo(-CH * 0.04, SPAN * 0.20, -CH * 0.30, SPAN * 0.06);
      s.lineTo(-CH * 0.24, 0);
      s.closePath();
      const g = new THREE.ShapeGeometry(s, 12);
      g.rotateX(Math.PI / 2);           // 展向 y → +z
      return g;
    })();
    // 蝙蝠在画面里就是一片逆光剪影，用 PBR 材质纯属白烧 —— 环境贴图采样 + 逐像素光照
    // 在 30 只同屏时实测多出 ~1.2ms；改成不受光的基础材质，剪影观感一模一样
    const batMat = new THREE.MeshBasicMaterial({ color: 0x0b0a0c, fog: true });
    const batWingMat = new THREE.MeshBasicMaterial({
      color: 0x161219, side: THREE.DoubleSide, fog: true
    });
    const batBody = new THREE.InstancedMesh(batGeoBody, batMat, BAT_MAX);
    const batWingR = new THREE.InstancedMesh(batGeoWing, batWingMat, BAT_MAX);
    const batWingL = new THREE.InstancedMesh(batGeoWing, batWingMat, BAT_MAX);
    batBody.name = 'daymareBats'; batWingR.name = 'daymareBatWingR'; batWingL.name = 'daymareBatWingL';
    [batBody, batWingR, batWingL].forEach((m) => {
      m.castShadow = false; m.receiveShadow = false;
      m.frustumCulled = false;
      m.count = 0;
      m.visible = false;
      root.add(m);
    });
    // 每只蝙蝠的轨道参数：绕岛盘旋 + 各自的高度/速度/相位差
    const batSel = [];
    for (let i = 0; i < BAT_MAX; i++) {
      const a = (i * 2.399) % (Math.PI * 2);
      batSel.push({
        r: 9 + (i % 7) * 2.2 + Math.random() * 2,
        y: 9 + (i % 5) * 2.0 + Math.random() * 2.0,
        sp: 0.10 + Math.random() * 0.07,
        ph: a,
        flap: 5.2 + Math.random() * 2.4,
        sc: 1.15 + (i % 4) * 0.2
      });
    }
    const _bm = new THREE.Matrix4(), _bq = new THREE.Quaternion(), _bv = new THREE.Vector3();
    const _bs = new THREE.Vector3(), _bw = new THREE.Matrix4(), _bt = new THREE.Matrix4(), _bx = new THREE.Matrix4();
    const _upY = new THREE.Vector3(0, 1, 0);

    function setBatCount(n) { batWant = Math.max(0, Math.min(BAT_MAX, n | 0)); }

    // 预热：蝠群默认 count=0/不可见，renderer.compile() 并不会把它们的 program 真编出来，
    // 于是「日魇开始、蝙蝠第一次进画面」那一帧要现编译 —— 实测一次 25ms+ 的硬卡顿。
    // 配合加载期的 composer.render() 让它们真被画一帧（这三个 mesh 都关掉了视锥剔除，
    // 所以只要 count>0 就一定会进绘制列表），事件触发时就不再掉帧。
    function prepareBats() {
      batWant = BAT_MAX;
      [batBody, batWingR, batWingL].forEach((m) => { m.visible = true; m.count = BAT_MAX; });
    }
    function resetBats() {
      batWant = 0;
      [batBody, batWingR, batWingL].forEach((m) => { m.visible = false; m.count = 0; });
    }

    function updateBats(t) {
      const n = batWant;
      if (n === 0) {
        if (batBody.visible) { batBody.visible = batWingR.visible = batWingL.visible = false; }
        return;
      }
      if (!batBody.visible) { batBody.visible = batWingR.visible = batWingL.visible = true; }
      batBody.count = batWingR.count = batWingL.count = n;
      for (let i = 0; i < n; i++) {
        const b = batSel[i];
        const a = b.ph + t * b.sp;
        const px = Math.cos(a) * b.r;
        const pz = Math.sin(a) * b.r;
        const py = b.y + Math.sin(t * 0.8 + b.ph * 3) * 1.4;
        // 朝向 = 轨道切线方向（跟鱼一样，模型正面是 -Z）
        const yaw = Math.atan2(-(-Math.sin(a)), -(Math.cos(a)));
        _bq.setFromAxisAngle(_upY, yaw);
        _bs.set(b.sc, b.sc, b.sc);
        _bv.set(px, py, pz);
        _bm.compose(_bv, _bq, _bs);
        batBody.setMatrixAt(i, _bm);
        const flap = Math.sin(t * b.flap + b.ph * 2.1) * 0.62 + 0.10;
        // 右翼（+Z）：肩点偏移 + 绕长轴抬落
        // 旋转矩阵复用预分配的 _bx：每帧 new 两个 Matrix4 × 30 只 × 60fps
        // 就是每秒 3600 个对象全交给 GC，停顿一次就是一次掉帧尖刺
        _bw.makeTranslation(0, 0.02, 0.10).multiply(_bx.makeRotationX(flap));
        _bt.multiplyMatrices(_bm, _bw);
        batWingR.setMatrixAt(i, _bt);
        // 左翼（-Z）：镜像 + 反相抬落
        _bw.makeTranslation(0, 0.02, -0.10)
          .multiply(_bx.makeRotationX(-flap))
          .multiply(_bx.makeScale(1, 1, -1));
        _bt.multiplyMatrices(_bm, _bw);
        batWingL.setMatrixAt(i, _bt);
      }
      batBody.instanceMatrix.needsUpdate = true;
      batWingR.instanceMatrix.needsUpdate = true;
      batWingL.instanceMatrix.needsUpdate = true;
    }

    function updateAmbient(t) {
      // 血夜淡入淡出：0.9 的速率大约 2.5 秒完成过渡，不会像开关灯一样突兀
      {
        const dtA = lastAmbT ? Math.max(0, Math.min(0.08, t - lastAmbT)) : 0.016;
        lastAmbT = t;
        const target = bloodOn ? 1 : 0;
        if (Math.abs(bloodMix - target) > 0.002) bloodMix += (target - bloodMix) * Math.min(1, dtA * 0.9);
        else bloodMix = target;
        // 日魇慢一点：天光被"吃掉"是个过程，0.55 的速率大约 4 秒
        const dtT = dayOn ? 1 : 0;
        if (Math.abs(dayMix - dtT) > 0.002) dayMix += (dtT - dayMix) * Math.min(1, dtA * 0.55);
        else dayMix = dtT;
      }
      updateBats(t);
      waterMat.uniforms.time.value = t;
      if (pondMixer) {
        const dt = Math.max(0, Math.min(0.05, t - pondClock));
        pondClock = t;
        pondMixer.update(dt);
      } else {
        pondClock = t;
      }
      for (let i = 0; i < lilies.length; i++) {
        const l = lilies[i];
        l.mesh.position.y = l.y0 + Math.sin(t * 0.9 + l.phase) * 0.013;
        if (l.spin) l.mesh.rotation.y += l.spin * 0.012;
      }
      oceanMat.uniforms.time.value = t;
      sky.material.uniforms.time.value = t;
      windUniform.value = t;
      // 灯塔光束：慢速旋转，约 14 秒转一圈；海面上的光斑跟着转
      if (lhBeam) {
        const bang = t * 0.46;
        lhBeam.root.rotation.y = bang;
        const byaw = lhBeam.baseYaw + bang;
        const bx = Math.sin(byaw), bz = Math.cos(byaw);
        oceanMat.uniforms.beamA.value.set(bx, bz);
        oceanMat.uniforms.beamB.value.set(-bx, -bz);
      }
      if (lhReef) lhReef.foam.rotation.z = t * 0.012;
      palms.forEach((p) => {
        p.group.rotation.z = Math.sin(t * 0.9 + p.phase) * 0.05;
      });
    }

    function update(dt, t) {
      updateAmbient(t);
      const step = Math.min(0.1, Math.max(0, dt || 0));
      // 门开合动画：转到约 88° 即完全打开，同时关闭门洞碰撞
      doors.forEach((d) => {
        d.rot += (d.target - d.rot) * Math.min(1, step * 7);
        d.pivot.rotation.y = d.rot * 1.52;
        if (d.collider) d.collider.off = d.rot > 0.22;
      });
      // 塘鱼：塘内绕圈游动；被打死的鱼翻肚浮一会儿再沉底、消失，不会自己刷新
      for (let fi = fishes.length - 1; fi >= 0; fi--) {
        const f = fishes[fi];
        if (!f.alive) {
          // 死亡动画：快速侧翻 → 浮在水面 1.2 秒 → 缓慢下沉 → 移除
          f.deadT += step;
          const roll = Math.min(1, f.deadT * 3.5);
          f.group.rotation.z = roll * Math.PI * 0.5;
          f.group.rotation.x = roll * 0.35;
          if (f.deadT < 1.2) {
            f.group.position.y += (POND_TOP + 0.055 - f.group.position.y) * Math.min(1, step * 3.4);
          } else {
            f.group.position.y -= step * 0.5;
            f.group.position.x += step * 0.12;
            const k = Math.max(0, 1 - (f.deadT - 1.2) / 2.6);
            f.group.scale.setScalar(1.35 * (0.35 + k * 0.65));
          }
          if (f.deadT > 3.8) {
            root.remove(f.group);
            const ri = raised.indexOf(f);
            if (ri >= 0) raised.splice(ri, 1);
            fishes.splice(fi, 1);
          }
          continue;
        }
        f.ang += (f.speed * step) / Math.max(1.5, f.r);
        const pr = Math.min(f.r, pondRadiusAt(f.ang) - 1.6);
        const fx = pond.x + Math.cos(f.ang) * pr;
        const fz = pond.z + Math.sin(f.ang) * pr;
        f.group.position.set(fx, f.swimY + Math.sin(t * 1.5 + f.wobble) * 0.05, fz);
        const dirX = -Math.sin(f.ang) * (f.speed > 0 ? 1 : -1);
        const dirZ = Math.cos(f.ang) * (f.speed > 0 ? 1 : -1);
        f.group.rotation.y = Math.atan2(-dirZ, dirX);
        // 摆尾 + 胸鳍摆动
        f.model.animate(step, Math.abs(f.speed));
        // 游动尾迹：贴着鱼尾的密集小涟漪 + 偶尔一个大圈，
        // 原来 1.4~3.2 秒才冒一圈，看起来像鱼在"瞬移"而不是在游。
        f.rippleT -= step;
        if (f.rippleT <= 0 && f.group.visible) {
          const sc = f.group.scale.x;
          const big = Math.random() < 0.22;
          f.rippleT = big ? 1.1 + Math.random() * 0.9 : 0.20 + Math.random() * 0.18;
          spawnRipple(
            fx - dirX * 0.35,
            fz - dirZ * 0.35,
            big ? Math.min(0.95, 0.4 + f.model.cfg.size * sc * 1.1) : 0.16 + f.model.cfg.size * sc * 0.16
          );
        }
      }
      updateRipples(step);
      updateBoat(step, t);
      // 海鸟：绕岛盘旋；扇翅与滑翔交替，转弯时压翼，叫声偶尔从远处传来
      birds.forEach((bd) => {
        if (!bd.alive) {
          bd.respawnT -= step;
          if (bd.respawnT <= 0) {
            bd.alive = true;
            bd.group.visible = true;
          }
          return;
        }
        // 飞行半径缓慢起伏，不是标准圆弧
        const rr = bd.r + Math.sin(t * 0.19 + bd.phase * 1.7) * 2.2;
        const a = t * bd.speed + bd.phase;
        const x = Math.cos(a) * rr;
        const z = Math.sin(a) * rr;
        const turnSign = bd.speed > 0 ? 1 : -1;

        // 扇翅 / 滑翔切换：滑翔时翅膀几乎不动，扇翅时成串快速摆动
        bd.flapClock -= step;
        if (bd.flapClock <= 0) {
          bd.glide = !bd.glide;
          bd.flapClock = bd.glide ? 1.8 + bd.phase % 1.7 : 0.65 + bd.phase % 0.5;
          bd.gullCryT = bd.glide ? 1 + Math.random() * 3 : bd.gullCryT;
        }
        bd.flapPhase += step * (bd.glide ? 1.5 : 9.2);
        const amp = bd.glide ? 0.04 : 0.62;
        const flap = Math.sin(bd.flapPhase) * amp;
        // 滑翔时翅膀上抬成浅 V 形并略后掠
        const vBase = bd.glide ? 0.15 : 0.02;
        // 内翼：肩关节
        bd.wr.rotation.z = -flap - vBase;
        bd.wl.rotation.z = flap + vBase;
        bd.wr.rotation.y = bd.glide ? -0.14 : Math.cos(bd.flapPhase) * 0.05;
        bd.wl.rotation.y = bd.glide ? 0.14 : -Math.cos(bd.flapPhase) * 0.05;
        // 外翼：比内翼慢 0.6 弧度。真实鸟的翼尖不是刚体，
        // 扇翅到底部时翼尖还在往上"甩"，这个延迟就是鸟和纸飞机的区别。
        const lagA = Math.sin(bd.flapPhase - 0.62) * amp * (bd.glide ? 0.7 : 1.45);
        const fold = bd.glide ? 0.10 : 0.26;
        if (bd.wr.userData.outer) {
          bd.wr.userData.outer.rotation.z = -lagA - vBase * 0.5;
          bd.wr.userData.outer.rotation.y = bd.glide ? -0.06 : fold + Math.cos(bd.flapPhase - 0.62) * 0.10;
        }
        if (bd.wl.userData.outer) {
          bd.wl.userData.outer.rotation.z = lagA + vBase * 0.5;
          bd.wl.userData.outer.rotation.y = bd.glide ? 0.06 : -fold - Math.cos(bd.flapPhase - 0.62) * 0.10;
        }

        // 下扑时被托起、上收时下坠
        const lift = bd.glide ? Math.sin(t * 0.9 + bd.phase) * 0.12 : -Math.cos(bd.flapPhase) * 0.10;
        const y = bd.h + Math.sin(t * 0.42 + bd.phase) * 1.05 + lift;
        bd.group.position.set(x, y, z);

        // 转弯压翼
        const targetRoll = (bd.glide ? -0.44 : -0.26) * turnSign;
        bd.roll += (targetRoll - bd.roll) * Math.min(1, step * 2.4);
        const dirX = -Math.sin(a) * turnSign;
        const dirZ = Math.cos(a) * turnSign;
        bd.group.rotation.set(
          -Math.cos(t * 0.42 + bd.phase) * 0.05,
          Math.atan2(dirX, dirZ),
          bd.roll,
          'YXZ'
        );

        // 偶尔一声海鸥叫（3D 定位，远处就是淡淡的背景音）
        bd.gullCryT -= step;
        if (bd.gullCryT <= 0) {
          bd.gullCryT = 4 + Math.random() * 9;
          if (window.onGullCry) window.onGullCry(bd.group.position);
        }
      });
    }

    return {
      colliders,
      pond,
      pondRadiusAt,
      pondTopY: POND_TOP,
      islandRadiusAt,
      heightAt,
      surfaceHeight,
      hills,
      spots,
      birds,
      fishes,
      baitShop,
      pondDeck,
      gunShop,
      rodShop,
      chestShop,
      bagShop,
      doors,
      beds,
      seats,
      tables,
      nearestBed,
      nearestSeat,
      nearestTable,
      toggleDoor,
      nearestDoor,
      setDayTime,
      setBloodNight,
      getBloodMix: () => bloodMix,
      setDaymare,
      setBatCount,
      prepareBats,
      resetBats,
      getDayMix: () => dayMix,
      getBatCount: () => batWant,
      isSunUp,
      focusShadow,
      addPondFish,
      pondStat,
      raised,
      boat,
      lighthouse,
      resetBoat,
      boatToWorld,
      boatDeckY,
      addBoatFish,
      pondCenter: { x: pond.x, z: pond.z },
      waterY: WATER_Y,
      swimOffset: 22,
      boundaryR: 32,
      collide,
      raycast,
      segmentBlocked,
      update,
      updateAmbient,
      group: root
    };
  };

  window.World = World;
})();
