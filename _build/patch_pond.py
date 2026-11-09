# -*- coding: utf-8 -*-
"""把 Fab「Little Pond & fish」接进 js/world.js 的湖：植被 / 白色水纹 / 鱼 + 重写水面着色器。"""
import io, sys, os

P = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'js', 'world.js')
s = io.open(P, encoding='utf-8').read()

# ---------------- 1) 水面材质整段替换 ----------------
START = "    // 湖水：卡通手绘风格（亮青蓝平涂 + 白沫色块 + 涟漪）"
END = "    const water = new THREE.Mesh(new THREE.ShapeGeometry(new THREE.Shape(pondPoints(1.0))), waterMat);"
i = s.index(START)
k = s.index(END)
old = s[i:k]

NEW = r'''    // ---------- 湖水素材：Fab「Little Pond & fish」（Mot Panda's Store · 免费）----------
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
    function remapPondGeo(geo, matrix, dy) {
      const g2 = geo.clone();
      g2.applyMatrix4(matrix);
      const pos = g2.attributes.position;
      const v = new THREE.Vector3();
      for (let n = 0; n < pos.count; n++) {
        v.fromBufferAttribute(pos, n);
        const r = Math.hypot(v.x, v.z);
        if (r > 1e-4) {
          const a = Math.atan2(v.z, v.x);
          const f = (r + pondRadiusAt(a) - POND_R0) / r;
          v.x *= f;
          v.z *= f;
        }
        pos.setXYZ(n, v.x, v.y + dy, v.z);
      }
      pos.needsUpdate = true;
      g2.computeBoundingSphere();
      return g2;
    }

    // 砍掉沉到地下的部分（素材底部有一圈垂到 -4 的草裙，会插进湖床里露出来）
    function cullBelow(geo, yMin) {
      const idx = geo.index;
      if (!idx) return geo;
      const pos = geo.attributes.position;
      const keep = [];
      for (let n = 0; n < idx.count; n += 3) {
        const a = idx.getX(n), b = idx.getX(n + 1), c = idx.getX(n + 2);
        if (Math.max(pos.getY(a), pos.getY(b), pos.getY(c)) > yMin) keep.push(a, b, c);
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

      // --- 1. 岸边的植被（叶子 / 白花 / 蘑菇）---
      let veg = null;
      sc.traverse((o) => { if (!veg && o.isMesh && /polySurface2_grass03/.test(o.name)) veg = o; });
      let lipTop = 0;
      if (veg) {
        // 素材的草沿紧贴水缘，先量出这一圈的最高点，等下让岸沿坐在地面上
        const ap = veg.geometry.attributes.position;
        const v = new THREE.Vector3();
        let best = -9;
        for (let n = 0; n < ap.count; n++) {
          v.fromBufferAttribute(ap, n).applyMatrix4(veg.matrixWorld);
          const r = Math.hypot(v.x, v.z);
          if (r > POND_R0 * 0.97 && r < POND_R0 * 1.05) best = Math.max(best, v.y);
        }
        if (best > -8) POND_LIP_Y = best;
        const dy = 0.05 - POND_LIP_Y;
        const geo = cullBelow(remapPondGeo(veg.geometry, veg.matrixWorld, dy), POND_TOP - 0.5);
        const mat = veg.material.clone();
        mat.side = THREE.DoubleSide;
        mat.metalness = 0;
        const m = new THREE.Mesh(geo, mat);
        m.castShadow = true;
        m.receiveShadow = true;
        pondDeco.add(m);
      }

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
        const N = 72;
        for (let n = 0; n < N; n++) {
          const t = tmpl[Math.floor(rnd() * tmpl.length)];
          const a = rnd() * TAU;
          const rr = pondRadiusAt(a) * (0.08 + rnd() * 0.82);
          const ss = 0.5 + rnd() * 0.95;
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
          transparent: true, opacity: 0.92, depthWrite: false
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
        // 素材里鱼游在 1.6~2.9m 深，本作湖只有 2m，压扁 Y 再整体上抬
        const wrap = new THREE.Group();
        wrap.scale.set(0.78, 0.58, 0.78);
        wrap.position.set(pond.x, POND_TOP + 0.42, pond.z);
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
        waterColor: { value: new THREE.Color(0x1f6f80) },   // 湖心深色
        waterColor2: { value: new THREE.Color(0x6cbcc0) },  // 近岸浅色
        skyColor: { value: new THREE.Color(0xd6eef2) },     // 天光
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
        // 素材的水面本来就是半透明的，能看到底；本作湖床也是青绿色，压到 0.44~0.64
        '  float alpha = mix(0.44, 0.64, deepF);',
        '  gl_FragColor = vec4(col, alpha);',
        '}'
      ].join('\n')
    });
'''

s = s[:i] + NEW + s[k:]

# ---------------- 2) 水建好后触发素材加载 ----------------
OLD2 = """    water.renderOrder = 2;
    root.add(water);"""
NEW2 = """    water.renderOrder = 2;
    root.add(water);
    PondAsset.whenReady(installPondDeco);"""
assert OLD2 in s
s = s.replace(OLD2, NEW2, 1)

# ---------------- 3) 昼夜水色换成素材的调子 ----------------
OLD3 = """    const C_POND_DAY = new THREE.Color(0x2b8fc2), C_POND_NIGHT = new THREE.Color(0x14364f);
    const C_PONDSHAL_DAY = new THREE.Color(0x8ad6ef), C_PONDSHAL_NIGHT = new THREE.Color(0x15334a);
    const C_PONDAIR_DAY = new THREE.Color(0xc4e8f4), C_PONDAIR_NIGHT = new THREE.Color(0x1b2c44);
    const C_PONDFOAM_DAY = new THREE.Color(0xf2fbfe), C_PONDFOAM_NIGHT = new THREE.Color(0x33506a);"""
NEW3 = """    const C_POND_DAY = new THREE.Color(0x1f6f80), C_POND_NIGHT = new THREE.Color(0x0e2a3e);
    const C_PONDSHAL_DAY = new THREE.Color(0x6cbcc0), C_PONDSHAL_NIGHT = new THREE.Color(0x16394a);
    const C_PONDAIR_DAY = new THREE.Color(0xd6eef2), C_PONDAIR_NIGHT = new THREE.Color(0x1e3348);
    const C_PONDFOAM_DAY = new THREE.Color(0xf4fbfd), C_PONDFOAM_NIGHT = new THREE.Color(0x33506a);"""
assert OLD3 in s
s = s.replace(OLD3, NEW3, 1)

# ---------------- 4) 环境更新里推进鱼的动画 ----------------
OLD4 = """    function updateAmbient(t) {
      waterMat.uniforms.time.value = t;"""
NEW4 = """    function updateAmbient(t) {
      waterMat.uniforms.time.value = t;
      if (pondMixer) {
        const dt = Math.max(0, Math.min(0.05, t - pondClock));
        pondClock = t;
        pondMixer.update(dt);
      } else {
        pondClock = t;
      }"""
assert OLD4 in s
s = s.replace(OLD4, NEW4, 1)

io.open(P, 'w', encoding='utf-8', newline='').write(s)
print('patched world.js  (%d chars)' % len(s))
