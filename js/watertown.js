(function () {
  'use strict';

  var canvas = document.getElementById('c');
  var startEl = document.getElementById('start');
  var statsEl = document.getElementById('stats');
  var loadingEl = document.getElementById('loading');

  var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.6));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  if (THREE.SRGBColorSpace && 'outputColorSpace' in renderer) renderer.outputColorSpace = THREE.SRGBColorSpace;
  else if (THREE.sRGBEncoding) renderer.outputEncoding = THREE.sRGBEncoding;

  var FOG_COLOR = 0xa8bcc8;
  var FOG_STEPS = [0.005, 0.0085, 0.014];
  var fogIdx = 1;

  var scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(FOG_COLOR, FOG_STEPS[fogIdx]);

  var camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 700);
  camera.position.set(0, 2.6, 44);

  var BANK_Y = 1.15;
  var WATER_Y = 0.12;
  var WATER_W = 12;

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  // ---------- 纹理 ----------
  function makeSkyTexture() {
    var w = 1024, h = 512;
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    var ctx = c.getContext('2d');
    var g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0.00, '#7c93a3');
    g.addColorStop(0.30, '#9db2bf');
    g.addColorStop(0.52, '#c6d3da');
    g.addColorStop(0.66, '#e0e7e9');
    g.addColorStop(1.00, '#a8bcc8');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    ctx.globalAlpha = 0.09;
    for (var i = 0; i < 24; i++) {
      var y = 36 + Math.random() * 150;
      var x = Math.random() * w;
      var rx = 70 + Math.random() * 190;
      var rg = ctx.createRadialGradient(x, y, 0, x, y, rx);
      rg.addColorStop(0, 'rgba(255,255,255,0.95)');
      rg.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(1, (10 + Math.random() * 22) / rx);
      ctx.beginPath();
      ctx.arc(0, 0, rx, 0, Math.PI * 2);
      ctx.fillStyle = rg;
      ctx.fill();
      ctx.restore();
    }
    ctx.globalAlpha = 1;

    var tex = new THREE.CanvasTexture(c);
    if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
    tex.mapping = THREE.EquirectangularReflectionMapping;
    return tex;
  }

  function makeNoiseTexture(hex, amp) {
    var size = 256;
    var c = document.createElement('canvas');
    c.width = c.height = size;
    var ctx = c.getContext('2d');
    var base = new THREE.Color(hex);
    var img = ctx.createImageData(size, size);
    for (var i = 0; i < size * size; i++) {
      var n = (Math.random() - 0.5) * amp;
      img.data[i * 4] = clamp(base.r * 255 + n, 0, 255);
      img.data[i * 4 + 1] = clamp(base.g * 255 + n, 0, 255);
      img.data[i * 4 + 2] = clamp(base.b * 255 + n, 0, 255);
      img.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    var tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(2, 2);
    if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  function makeGlowTexture() {
    var s = 128;
    var c = document.createElement('canvas');
    c.width = c.height = s;
    var ctx = c.getContext('2d');
    var g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, 'rgba(255,200,150,1)');
    g.addColorStop(0.22, 'rgba(255,126,64,0.6)');
    g.addColorStop(0.55, 'rgba(255,92,40,0.18)');
    g.addColorStop(1, 'rgba(255,80,30,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
    var tex = new THREE.CanvasTexture(c);
    if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  scene.background = makeSkyTexture();

  // ---------- 材质 ----------
  var wallTex = makeNoiseTexture('#eae7dd', 24);
  var wallMat = new THREE.MeshStandardMaterial({ color: 0xffffff, map: wallTex, roughness: 0.94, metalness: 0.0 });
  var wallMatSide = new THREE.MeshStandardMaterial({ color: 0xdedacf, roughness: 0.95 });
  var roofMat = new THREE.MeshStandardMaterial({ color: 0x474d54, roughness: 0.84, metalness: 0.05 });
  var woodMat = new THREE.MeshStandardMaterial({ color: 0x6a5140, roughness: 0.88 });
  var darkMat = new THREE.MeshStandardMaterial({ color: 0x2e3337, roughness: 0.55, metalness: 0.22 });
  var winBarMat = new THREE.MeshStandardMaterial({ color: 0xc8c8c0, roughness: 0.8 });
  var stoneMat = new THREE.MeshStandardMaterial({ color: 0x9aa2a4, roughness: 0.93 });
  var bankMat = new THREE.MeshStandardMaterial({ color: 0x8c9083, roughness: 0.96 });
  var lanternMat = new THREE.MeshStandardMaterial({ color: 0xd8352a, emissive: 0xff3d1e, emissiveIntensity: 1.2, roughness: 0.55 });

  // ---------- 灯光 ----------
  scene.add(new THREE.HemisphereLight(0xc6d6e1, 0x4b5647, 0.95));

  var sun = new THREE.DirectionalLight(0xfff0dd, 1.55);
  sun.position.set(44, 64, 28);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -95;
  sun.shadow.camera.right = 95;
  sun.shadow.camera.top = 95;
  sun.shadow.camera.bottom = -95;
  sun.shadow.camera.near = 5;
  sun.shadow.camera.far = 240;
  sun.shadow.bias = -0.0006;
  if ('normalBias' in sun.shadow) sun.shadow.normalBias = 0.045;
  scene.add(sun);
  scene.add(sun.target);

  // ---------- 岸 ----------
  [-1, 1].forEach(function (side) {
    var bank = new THREE.Mesh(new THREE.BoxGeometry(20, BANK_Y, 220), bankMat);
    bank.position.set(side * 16, BANK_Y / 2, 0);
    bank.receiveShadow = true;
    scene.add(bank);

    var path = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.12, 220), stoneMat);
    path.position.set(side * 8.3, BANK_Y + 0.06, 0);
    path.receiveShadow = true;
    scene.add(path);
  });

  // ---------- 建筑 ----------
  var buildingGroup = new THREE.Group();
  scene.add(buildingGroup);

  function buildBuilding(cx, cz, facing, W, L, H) {
    var g = new THREE.Group();
    g.position.set(cx, 0, cz);

    var wall = new THREE.Mesh(new THREE.BoxGeometry(W, H, L), wallMat);
    wall.position.y = BANK_Y + H / 2;
    wall.castShadow = true;
    wall.receiveShadow = true;
    g.add(wall);

    var rw = W * 0.58;
    var theta = 0.40;
    var slabLen = rw / Math.cos(theta);
    [-1, 1].forEach(function (s) {
      var slab = new THREE.Mesh(new THREE.BoxGeometry(slabLen, 0.28, L * 1.05), roofMat);
      slab.position.set(s * rw * 0.5, BANK_Y + H + 0.78, 0);
      slab.rotation.z = -s * theta;
      slab.castShadow = true;
      slab.receiveShadow = true;
      g.add(slab);
    });

    var ridge = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.42, L * 1.06), roofMat);
    ridge.position.set(0, BANK_Y + H + 1.62, 0);
    ridge.castShadow = true;
    g.add(ridge);

    var steps = [[W * 1.04, H + 0.9], [W * 0.70, H + 2.0], [W * 0.40, H + 3.1]];
    for (var sz = -1; sz <= 1; sz += 2) {
      for (var i = 0; i < steps.length; i++) {
        var sw = steps[i][0];
        var sh = steps[i][1];
        var m = new THREE.Mesh(new THREE.BoxGeometry(sw, sh, 0.42), wallMatSide);
        m.position.set(0, BANK_Y + sh / 2, sz * L / 2);
        m.castShadow = true;
        m.receiveShadow = true;
        g.add(m);

        var cap = new THREE.Mesh(new THREE.BoxGeometry(sw + 0.18, 0.16, 0.56), roofMat);
        cap.position.set(0, BANK_Y + sh + 0.08, sz * L / 2);
        g.add(cap);
      }
    }

    var door = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.6, 1.8), woodMat);
    door.position.set(facing * (W / 2 + 0.06), BANK_Y + 1.3, 0);
    g.add(door);

    for (var k = 0; k < 2; k++) {
      var zz = (k === 0 ? -1 : 1) * L * 0.24;
      var frame = new THREE.Mesh(new THREE.BoxGeometry(0.14, 2.35, 2.55), wallMatSide);
      frame.position.set(facing * (W / 2 + 0.04), BANK_Y + H * 0.63, zz);
      g.add(frame);

      var pane = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.95, 2.15), darkMat);
      pane.position.set(facing * (W / 2 + 0.1), BANK_Y + H * 0.63, zz);
      g.add(pane);

      for (var b = -1; b <= 1; b++) {
        var bar = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.9, 0.075), winBarMat);
        bar.position.set(facing * (W / 2 + 0.16), BANK_Y + H * 0.63, zz + b * 0.62);
        g.add(bar);
      }
      for (var hb = -1; hb <= 1; hb += 2) {
        var hbar = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.075, 2.1), winBarMat);
        hbar.position.set(facing * (W / 2 + 0.16), BANK_Y + H * 0.63 + hb * 0.6, zz);
        g.add(hbar);
      }
    }

    buildingGroup.add(g);
    return g;
  }

  var Z_START = -84;
  var Z_STEP = 21;
  for (var bi = 0; bi < 9; bi++) {
    var bz = Z_START + bi * Z_STEP;
    [-1, 1].forEach(function (side) {
      var W = 8 + Math.random() * 2.4;
      var L = 12 + Math.random() * 4;
      var H = 5.2 + Math.random() * 3.2;
      var cx = side * (6.6 + W / 2 + Math.random() * 1.2);
      buildBuilding(cx, bz + (Math.random() - 0.5) * 3, side === -1 ? 1 : -1, W, L, H);
    });
  }

  // ---------- 灯笼 ----------
  var glowTex = makeGlowTexture();
  var lanternLightCount = 0;

  function addLantern(x, y, z) {
    var g = new THREE.Group();
    g.position.set(x, y, z);

    var body = new THREE.Mesh(new THREE.SphereGeometry(0.34, 14, 10), lanternMat);
    body.scale.set(1, 1.24, 1);
    g.add(body);

    var cap = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.25, 0.14, 10), darkMat);
    cap.position.y = 0.45;
    g.add(cap);

    var base = new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.18, 0.1, 10), darkMat);
    base.position.y = -0.45;
    g.add(base);

    var tassel = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.02, 0.42, 6), lanternMat);
    tassel.position.y = -0.68;
    g.add(tassel);

    var spr = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTex,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      opacity: 0.8
    }));
    spr.scale.set(2.7, 2.7, 1);
    g.add(spr);

    if (lanternLightCount < 6) {
      var pl = new THREE.PointLight(0xff7a3c, 1.5, 14, 2);
      g.add(pl);
      lanternLightCount++;
    }

    scene.add(g);
    return g;
  }

  function buildLanternPost(x, z) {
    var g = new THREE.Group();
    g.position.set(x, BANK_Y, z);

    var pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 4.5, 8), woodMat);
    pole.position.y = 2.25;
    pole.castShadow = true;
    g.add(pole);

    var arm = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.1, 0.1), woodMat);
    arm.position.set(-Math.sign(x) * 0.5, 4.42, 0);
    g.add(arm);

    scene.add(g);
    addLantern(x - Math.sign(x) * 0.92, BANK_Y + 3.95, z);
  }

  for (var li = 0; li < 9; li++) {
    var lz = Z_START + li * Z_STEP + 7;
    buildLanternPost(-8.2, lz);
    buildLanternPost(8.2, lz);
  }

  // ---------- 垂柳 ----------
  var willowMat = new THREE.LineBasicMaterial({ color: 0x86a06d, transparent: true, opacity: 0.92 });
  var trunkMat = new THREE.MeshStandardMaterial({ color: 0x5d5346, roughness: 0.96 });

  function buildWillow(x, z, scale) {
    var g = new THREE.Group();
    g.position.set(x, BANK_Y, z);

    var h = (5.6 + Math.random() * 2.6) * scale;
    var trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.24 * scale, 0.4 * scale, h, 8), trunkMat);
    trunk.position.y = h / 2;
    trunk.castShadow = true;
    g.add(trunk);

    var crownY = h - 0.5;
    var posArr = [];
    var strands = 130;
    for (var i = 0; i < strands; i++) {
      var a = Math.random() * Math.PI * 2;
      var r = 0.4 + Math.random() * 2.0;
      var x0 = Math.cos(a) * r;
      var z0 = Math.sin(a) * r;
      var y0 = crownY + Math.random() * 1.2 - 0.3;
      var len = 2.6 + Math.random() * 3.6;
      var dx = Math.cos(a) * (0.7 + Math.random() * 1.0);
      var dz = Math.sin(a) * (0.7 + Math.random() * 1.0);
      var segs = 9;
      var px = x0, py = y0, pz = z0;
      for (var s = 1; s <= segs; s++) {
        var t = s / segs;
        var nx = x0 + dx * t;
        var ny = y0 - len * t * t;
        var nz = z0 + dz * t;
        posArr.push(px, py, pz, nx, ny, nz);
        px = nx; py = ny; pz = nz;
      }
    }

    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(posArr, 3));
    g.add(new THREE.LineSegments(geo, willowMat));

    scene.add(g);
  }

  for (var wi = 0; wi < 8; wi++) {
    var wz = Z_START + 10 + wi * 23;
    buildWillow(-9.2 + Math.random() * 1.6, wz, 0.9 + Math.random() * 0.35);
    buildWillow(9.2 - Math.random() * 1.6, wz + 9, 0.9 + Math.random() * 0.35);
  }

  // ---------- 石桥 ----------
  function buildBridge(z) {
    var g = new THREE.Group();
    g.position.z = z;

    var span = 13.4;
    var segs = 7;
    var rise = 1.35;

    for (var i = 0; i < segs; i++) {
      var tm = -1 + (2 * i + 1) / segs;
      var y = BANK_Y + rise * (1 - tm * tm) + 0.16;
      var deck = new THREE.Mesh(new THREE.BoxGeometry(span / segs * 1.1, 0.32, 3.2), stoneMat);
      deck.position.set(tm * span, y, 0);
      deck.rotation.z = -Math.atan(-2 * tm * rise / (span / segs * 1.1));
      deck.castShadow = true;
      deck.receiveShadow = true;
      g.add(deck);
    }

    for (var s = -1; s <= 1; s += 2) {
      for (var p = 0; p <= 6; p++) {
        var tm2 = -1 + p / 3;
        var y2 = BANK_Y + rise * (1 - tm2 * tm2) + 0.16;
        var post = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.05, 0.16), stoneMat);
        post.position.set(tm2 * span, y2 + 0.68, s * 1.45);
        post.castShadow = true;
        g.add(post);
      }
    }

    scene.add(g);
  }

  buildBridge(-6);

  // ---------- 小船 ----------
  function buildBoat(x, z, rot) {
    var g = new THREE.Group();
    g.position.set(x, WATER_Y + 0.06, z);
    g.rotation.y = rot;

    var hull = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.5, 4.2), woodMat);
    hull.position.y = 0.12;
    hull.castShadow = true;
    g.add(hull);

    var bow = new THREE.Mesh(new THREE.ConeGeometry(0.86, 1.5, 4), woodMat);
    bow.rotation.x = Math.PI / 2;
    bow.rotation.y = Math.PI / 4;
    bow.position.set(0, 0.12, 2.85);
    g.add(bow);

    var pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 3.2, 6), woodMat);
    pole.rotation.z = 0.5;
    pole.position.set(0.9, 0.85, -0.6);
    g.add(pole);

    scene.add(g);
  }

  buildBoat(-4.2, -22, 0.42);
  buildBoat(4.4, 30, -0.28);

  // ---------- 远山 ----------
  var mountainMat = new THREE.MeshStandardMaterial({ color: 0x8297a5, roughness: 1.0, metalness: 0.0 });
  for (var mi = 0; mi < 6; mi++) {
    var mr = 26 + Math.random() * 32;
    var mh = 28 + Math.random() * 36;
    var mountain = new THREE.Mesh(new THREE.ConeGeometry(mr, mh, 5), mountainMat);
    mountain.position.set(-150 + mi * 58 + Math.random() * 20, mh / 2 - 8, -118 - Math.random() * 30);
    mountain.rotation.y = Math.random() * Math.PI;
    scene.add(mountain);
  }

  // ---------- 水面 ----------
  var reflectRT = new THREE.WebGLRenderTarget(2, 2, {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    format: THREE.RGBAFormat
  });
  var reflectCamera = new THREE.PerspectiveCamera(62, 1, 0.1, 700);

  var waterUniforms = {
    tReflect: { value: reflectRT.texture },
    uReflectMatrix: { value: new THREE.Matrix4() },
    uTime: { value: 0 },
    uDeep: { value: new THREE.Color(0x2b3f46) },
    uShallow: { value: new THREE.Color(0x5d767e) },
    uFogColor: { value: new THREE.Color(FOG_COLOR) },
    uFogDensity: { value: FOG_STEPS[fogIdx] },
    uReflect: { value: 1.0 }
  };

  var waterMat = new THREE.ShaderMaterial({
    uniforms: waterUniforms,
    vertexShader: [
      'uniform mat4 uReflectMatrix;',
      'varying vec4 vCoord;',
      'varying vec2 vUv;',
      'varying float vDepth;',
      'void main() {',
      '  vUv = uv;',
      '  vec4 world = modelMatrix * vec4(position, 1.0);',
      '  vCoord = uReflectMatrix * world;',
      '  vec4 mv = viewMatrix * world;',
      '  vDepth = -mv.z;',
      '  gl_Position = projectionMatrix * mv;',
      '}'
    ].join('\n'),
    fragmentShader: [
      'uniform sampler2D tReflect;',
      'uniform float uTime;',
      'uniform vec3 uDeep;',
      'uniform vec3 uShallow;',
      'uniform vec3 uFogColor;',
      'uniform float uFogDensity;',
      'uniform float uReflect;',
      'varying vec4 vCoord;',
      'varying vec2 vUv;',
      'varying float vDepth;',
      'void main() {',
      '  vec2 wuv = vUv * vec2(6.0, 120.0);',
      '  float w1 = sin(wuv.y * 1.7 + uTime * 0.55) * 0.5 + sin(wuv.x * 2.6 - uTime * 0.35) * 0.5;',
      '  float w2 = sin(wuv.x * 1.9 + uTime * 0.70) * 0.5 + sin(wuv.y * 3.1 + uTime * 0.42) * 0.5;',
      '  vec2 distort = vec2(w1, w2) * 0.0022;',
      '  vec2 ndc = vCoord.xy / max(vCoord.w, 0.0001);',
      '  vec2 ruv = ndc * 0.5 + 0.5 + distort;',
      '  vec3 refl = texture2D(tReflect, ruv).rgb;',
      '  vec3 base = mix(uDeep, uShallow, 0.45);',
      '  vec3 col = mix(base, refl, 0.86 * uReflect);',
      '  float fogFactor = 1.0 - exp(-uFogDensity * uFogDensity * vDepth * vDepth);',
      '  col = mix(col, uFogColor, fogFactor);',
      '  gl_FragColor = vec4(col, 1.0);',
      '}'
    ].join('\n')
  });

  var water = new THREE.Mesh(new THREE.PlaneGeometry(WATER_W, 220, 1, 1), waterMat);
  water.rotation.x = -Math.PI / 2;
  water.position.y = WATER_Y;
  scene.add(water);

  var clipPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -WATER_Y - 0.02);
  var reflectOn = true;

  function updateReflection() {
    reflectCamera.position.set(camera.position.x, 2 * WATER_Y - camera.position.y, camera.position.z);

    var dir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    dir.y = -dir.y;

    var up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
    up.y = -up.y;
    reflectCamera.up.copy(up);

    reflectCamera.lookAt(
      reflectCamera.position.x + dir.x,
      reflectCamera.position.y + dir.y,
      reflectCamera.position.z + dir.z
    );

    reflectCamera.fov = camera.fov;
    reflectCamera.aspect = camera.aspect;
    reflectCamera.near = camera.near;
    reflectCamera.far = camera.far;
    reflectCamera.updateProjectionMatrix();
    reflectCamera.updateMatrixWorld(true);

    waterUniforms.uReflectMatrix.value.multiplyMatrices(
      reflectCamera.projectionMatrix,
      reflectCamera.matrixWorldInverse
    );

    water.visible = false;
    renderer.clippingPlanes = [clipPlane];
    renderer.setRenderTarget(reflectRT);
    renderer.clear();
    renderer.render(scene, reflectCamera);
    renderer.setRenderTarget(null);
    renderer.clippingPlanes = [];
    water.visible = true;
  }

  // ---------- 控制 ----------
  var keys = {};
  var yaw = 0;
  var pitch = 0;
  var locked = false;
  var lastTime = performance.now();

  function setFog(i) {
    fogIdx = i;
    scene.fog.density = FOG_STEPS[i];
    waterUniforms.uFogDensity.value = FOG_STEPS[i];
  }

  window.addEventListener('keydown', function (e) {
    keys[e.code] = true;
    if (e.code === 'KeyR') {
      reflectOn = !reflectOn;
      waterUniforms.uReflect.value = reflectOn ? 1.0 : 0.0;
    }
    if (e.code === 'KeyF') {
      setFog((fogIdx + 1) % FOG_STEPS.length);
    }
  });

  window.addEventListener('keyup', function (e) {
    keys[e.code] = false;
  });

  function requestLock() {
    if (canvas.requestPointerLock) canvas.requestPointerLock();
  }

  startEl.addEventListener('click', function () {
    startEl.classList.add('hide');
    requestLock();
  });

  canvas.addEventListener('click', requestLock);

  document.addEventListener('pointerlockchange', function () {
    locked = document.pointerLockElement === canvas;
    if (!locked) startEl.classList.remove('hide');
  });

  document.addEventListener('mousemove', function (e) {
    if (!locked) return;
    yaw -= e.movementX * 0.0022;
    pitch -= e.movementY * 0.0020;
    pitch = clamp(pitch, -1.3, 1.3);
  });

  var tmpEuler = new THREE.Euler(0, 0, 0, 'YXZ');
  var moveVec = new THREE.Vector3();
  var fwdVec = new THREE.Vector3();
  var rightVec = new THREE.Vector3();

  function updateControls(dt) {
    tmpEuler.set(pitch, yaw, 0);
    camera.quaternion.setFromEuler(tmpEuler);

    var speed = (keys['ShiftLeft'] || keys['ShiftRight']) ? 26 : 10;

    fwdVec.set(0, 0, -1).applyEuler(new THREE.Euler(0, yaw, 0));
    rightVec.set(1, 0, 0).applyEuler(new THREE.Euler(0, yaw, 0));

    moveVec.set(0, 0, 0);
    if (keys['KeyW']) moveVec.add(fwdVec);
    if (keys['KeyS']) moveVec.sub(fwdVec);
    if (keys['KeyD']) moveVec.add(rightVec);
    if (keys['KeyA']) moveVec.sub(rightVec);
    if (keys['Space']) moveVec.y += 1;
    if (keys['KeyC']) moveVec.y -= 1;

    if (moveVec.lengthSq() > 0) {
      moveVec.normalize().multiplyScalar(speed * dt);
      camera.position.add(moveVec);
    }

    camera.position.x = clamp(camera.position.x, -27, 27);
    camera.position.z = clamp(camera.position.z, -96, 96);
    camera.position.y = clamp(camera.position.y, 1.5, 16);
  }

  // ---------- 循环 ----------
  function resize() {
    var w = window.innerWidth;
    var h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();

    var rw = Math.max(2, Math.floor(w / 2));
    var rh = Math.max(2, Math.floor(h / 2));
    reflectRT.setSize(rw, rh);
    reflectCamera.aspect = w / h;
    reflectCamera.updateProjectionMatrix();
  }

  window.addEventListener('resize', resize);
  resize();

  var frames = 0;
  var fpsAccum = 0;

  function animate(now) {
    requestAnimationFrame(animate);

    var dt = (now - lastTime) / 1000;
    if (!isFinite(dt) || dt <= 0) dt = 0.016;
    dt = Math.min(dt, 0.05);
    lastTime = now;

    updateControls(dt);
    waterUniforms.uTime.value += dt;

    if (reflectOn) updateReflection();
    renderer.render(scene, camera);

    frames++;
    fpsAccum += dt;
    if (fpsAccum >= 0.5) {
      var fps = Math.round(frames / fpsAccum);
      statsEl.textContent = fps + ' FPS · 反射 ' + (reflectOn ? '开' : '关') + ' · 雾 ' + (fogIdx + 1) + '/3';
      frames = 0;
      fpsAccum = 0;
    }
  }

  if (loadingEl) loadingEl.style.display = 'none';
  requestAnimationFrame(animate);
})();
