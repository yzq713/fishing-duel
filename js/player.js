/* 第一人称玩家：移动、视角、武器与射击参数 */
(function () {
  const THREE = window.THREE;

  // 可选武器配置（price 0 = 开局配发，不用买）
  // 只留 4 把、每把都有自己的模型：
  //   手枪（程序化，配发）· 霰弹枪 / 突击步枪 / 狙击步枪（glb，ithappy 免费包）
  // 删掉的 8 把：左轮、冲锋枪、双管霰弹、精确射手、轻机枪、反器材是复用手枪/
  // 步枪/霰弹/狙击的模型，只改长度和染色，摆在商店里一眼就是同一把枪；
  // 加特林和鱼叉电磁炮没有真实模型（几个大方块拼的），也一并去掉。
  const GUNS = {
    pistol: {
      id: 'pistol', name: '制式手枪', price: 0, mag: 12, fireCd: 0.2,
      body: 22, head: 44, spread: 0.009, reload: 1.05, aimFov: 58, color: 0xd8e2ea,
      desc: '随身配枪，打水面上的鸟够用', stats: [30, 58, 55, 88]
    },
    shotgun: {
      id: 'shotgun', name: '泵动霰弹枪', price: 1200, mag: 6, fireCd: 0.75,
      body: 15, head: 26, spread: 0.03, reload: 1.6, aimFov: 62, color: 0xffd166,
      pellets: 9, pelletSpread: 0.055,
      desc: '一次喷出 9 颗弹丸，鸟群一枪一片', stats: [92, 30, 20, 35]
    },
    rifle: {
      id: 'rifle', name: '突击步枪', price: 2300, mag: 12, fireCd: 0.15,
      body: 26, head: 50, spread: 0.006, reload: 1.35, aimFov: 52, color: 0xff8a3d,
      desc: '均衡之选，中距离点鱼最稳', stats: [55, 60, 40, 70]
    },
    sniper: {
      id: 'sniper', name: '狙击步枪', price: 4500, mag: 5, fireCd: 1.05,
      body: 80, head: 150, spread: 0.0012, reload: 1.8, aimFov: 30, color: 0xb78cff,
      zooms: [2, 4, 6, 8], scope: true,
      desc: '远距离狙击，倍镜可调 2/4/6/8', stats: [100, 14, 16, 95]
    },
  };
  window.GUNS = GUNS;

  // 子弹种类：在武器商店购买并切换。品质越高，打鸟给的体力上限经验越多；
  // 每种子弹有独立弹道颜色（见 FX.tracer）。每包 40 发。
  const AMMO_TYPES = {
    standard: {
      id: 'standard', name: '普通弹', price: 180, color: 0xffd166, exp: 1,
      desc: '常规弹药，打鸟体力经验 +1'
    },
    ap: {
      id: 'ap', name: '穿甲弹', price: 320, color: 0xff8a3d, exp: 2,
      desc: '穿透力强，打鸟体力经验 +2'
    },
    tracer: {
      id: 'tracer', name: '曳光弹', price: 380, color: 0x5fe0b0, exp: 2.5,
      desc: '青绿光迹，打鸟体力经验 +2.5'
    },
    incendiary: {
      id: 'incendiary', name: '燃烧弹', price: 520, color: 0xff5a4a, exp: 3,
      desc: '燃烧加持，打鸟体力经验 +3'
    },
    energy: {
      id: 'energy', name: '能量弹', price: 720, color: 0x8a7eff, exp: 4,
      desc: '高能弹药，打鸟体力经验 +4'
    }
  };
  window.AMMO_TYPES = AMMO_TYPES;

  // 拳头（近战，不占弹药）
  const FIST = {
    id: 'fist', name: '拳头', price: 0, mag: 0, fireCd: 0.5,
    body: 35, head: 35, spread: 0, reload: 0, aimFov: 66, color: 0xd9a679,
    melee: true, range: 2.8, desc: '近身一拳，拍得到岸边的鸟和鱼', stats: [40, 60, 0, 90]
  };
  window.FIST = FIST;

  // ---------------- 第三人称角色模型：Godot 机器人 ----------------
  // 取自 Godot 3D Multiplayer Template（github.com/devmoreir4/godot-3d-multiplayer-template），
  // 角色本体是 AGChow 的 "3D Godot Robot Platformer Character"，CC0，可商用。
  // 模型自带 4 套调色板贴图，正好对上游戏里的 4 名角色。
  const RobotModel = (function () {
    // index.html 是单文件版，模型被 base64 内联进页面（window.ROBOT_ASSETS），
    // 这样双击本地文件也能加载；开发时走 assets/ 目录的相对路径。
    const INLINE = window.ROBOT_ASSETS || null;
    const URL = (INLINE && INLINE.model) || 'assets/char/robot.glb';
    const PALETTES = {
      angler:     'assets/char/pal_green.png',   // 老渔夫 → 绿
      gunslinger: 'assets/char/pal_red.png',     // 快枪手 → 红
      diver:      'assets/char/pal_blue.png',    // 追风者 → 蓝（内部 id 保留为 diver）
      lucky:      'assets/char/pal_yellow.png'   // 幸运星 → 黄
    };
    let gltf = null;
    let loading = false;
    const waiting = [];
    const texCache = {};

    function load(cb) {
      if (gltf) { if (cb) cb(gltf); return; }
      if (cb) waiting.push(cb);
      if (loading) return;
      loading = true;
      new THREE.GLTFLoader().load(URL, (g) => {
        gltf = g;
        loading = false;
        g.scene.traverse((o) => {
          if (!o.isMesh) return;
          o.castShadow = true;
          o.receiveShadow = false;
          // 骨骼网格的包围球是按绑定姿势算的，转身/摆手时会算错而被整块剔除，
          // 表现就是角色突然消失——直接关掉剔除最省事（角色只有几块网格）。
          o.frustumCulled = false;
        });
        const list = waiting.splice(0);
        for (const f of list) { try { f(gltf); } catch (e) { console.error(e); } }
      }, undefined, (err) => {
        loading = false;
        console.warn('[player] 机器人模型加载失败，继续用方块角色', err);
      });
    }

    // 调色板贴图：glTF 的 UV 是 flipY=false，换上去的图必须一致，否则贴图整体翻转
    function paletteTexture(charId) {
      const url = (INLINE && INLINE.palettes && INLINE.palettes[charId])
        || PALETTES[charId] || PALETTES.angler;
      if (texCache[url]) return texCache[url];
      const tex = new THREE.TextureLoader().load(url, (t) => { t.needsUpdate = true; });
      tex.flipY = false;
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
      texCache[url] = tex;
      return tex;
    }

    return {
      load,
      paletteTexture,
      ready: () => gltf
    };
  })();

  // ---------------- 第一人称枪械模型：ithappy《Weapons FREE》 ----------------
  // 作者 ithappy（ithappystudios.com/free/weapons-free/），免费包，8 个模型共 7K 三角面，
  // 每把约 875 面，共用一张 1024 图集，真实尺寸。这里只取 4 把枪：
  // rifle / shotgun / sniper_rifle / pistol(左轮)。
  // 模型统一是「枪口朝 +X、上方 +Y」，接进游戏（前方 -Z）时绕 Y 轴转 90°。
  // 单文件版 index.html 走 window.WEAPON_ASSETS（base64 内联），开发时读 assets/weapons/。
  const GunAssets = (function () {
    const FILES = {
      rifle: 'rifle_001',
      shotgun: 'shotgun_001',
      sniper: 'sniper_rifle_001',
      pistol: 'pistol_001'
    };
    const INLINE = window.WEAPON_ASSETS || null;
    const cache = {};
    const waiting = [];
    let pending = Object.keys(FILES).length;
    let started = false;

    function url(name) {
      // opt/ 里是压过贴图的版本（512px/256 色，单把 120KB 左右）；
      // Separate_assets_glb/ 是原包（每把 720KB，贴图 1024px），要原画质可以指回去。
      return (INLINE && INLINE[name])
        || ('assets/weapons/opt/' + FILES[name] + '.glb');
    }

    function fire() {
      const list = waiting.splice(0);
      for (const f of list) { try { f(cache); } catch (e) { console.error(e); } }
    }

    function loadAll(cb) {
      if (cb) waiting.push(cb);
      if (started) return;
      started = true;
      Object.keys(FILES).forEach((name) => {
        new THREE.GLTFLoader().load(url(name), (g) => {
          const root = g.scene;
          root.traverse((o) => {
            if (!o.isMesh) return;
            // 枪就贴在相机前面，包围球判错会整块消失，直接关掉剔除
            o.frustumCulled = false;
            o.castShadow = false;
            o.receiveShadow = false;
          });
          cache[name] = root;
          if (--pending === 0) fire();
        }, undefined, (err) => {
          console.warn('[player] 武器模型加载失败：' + name, err);
          if (--pending === 0) fire();
        });
      });
    }

    return { loadAll, cache, FILES };
  })();

  // 6 把枪 → 4 个 glb 模型的映射（一枪一模型，不再复用）。
  // len 是接入后的整枪长度（本地坐标），stockZ 是枪托末端位置，
  // hand 是右手握把点。加特林和鱼叉电磁炮走程序化模型，不在这张表里。
  const GUN_MODELS = {
    shotgun:  { src: 'shotgun', len: 0.62, stockZ: 0.42, hand: [0.050, -0.100, 0.290], tilt: 0.30 },
    rifle:    { src: 'rifle',   len: 0.62, stockZ: 0.46, hand: [0.050, -0.105, 0.300], tilt: 0.30 },
    sniper:   { src: 'sniper',  len: 0.62, stockZ: 0.30, hand: [0.050, -0.102, 0.190], tilt: 0.28 }
  };
  window.GUN_MODELS = GUN_MODELS;

  class Player {
    constructor(camera, world) {
      this.camera = camera;
      this.world = world;

      this.pos = new THREE.Vector3(-30, 0, -6);
      this.velocity = new THREE.Vector3();
      this.yaw = -Math.PI / 2;
      this.pitch = 0;
      this.radius = 0.42;
      this.eyeHeight = 1.66;

      this.maxHealth = 100;
      this.health = 100;
      // 体力：没有敌人之后，血条形同虚设，改成「冲刺/游泳消耗」的体力。
      // 见底就只能走，站着或慢走会回满。
      this.maxStamina = 100;
      this.stamina = 100;
      // 背包：两个枪槽 + 拳头
      // 槽位：0/1 枪械，2 鱼竿，3 拳头
      // 开局就一根竹竿 + 一把手枪（用户口径），其余枪要自己买
      this.slots = ['pistol', null, 'rod', 'fist'];
      this.slot = 0;
      this.fishingRef = null;
      this.ammoByGun = { pistol: GUNS.pistol.mag };
      this.gun = GUNS.pistol;
      this.magSize = this.gun.mag;
      this.ammo = this.magSize;
      this.fireCd = 0;
      this.reloading = 0;
      this.recoil = 0;
      this.reserve = 0;
      this.onAmmoChange = null;
      this.frozen = false;
      this.seated = false;   // 坐在凳子上：视角可转动但不能走动

      // 跳跃 / 蹲下
      this.vy = 0;
      this.airborne = false;
      this.crouching = false;

      // 乘船：riding 指向 world.boat，位置改由船体局部坐标驱动
      this.riding = null;
      this.boatLx = 0;
      this.boatLz = -0.15;

      this.bobPhase = 0;
      this.walkSpeed = 3.0;
      this.sensitivity = 0.0022;
      this.alive = true;

      this.aiming = false;
      this.aimBlend = 0;
      this.baseFov = camera.fov;
      this.aimFov = this.gun.aimFov;

      // 战斗手感：镜头后坐、屏幕震动、准星扩散、脚步
      this.camKick = 0;
      this.camKickYaw = 0;
      this.shake = 0;
      this.bloom = 0;
      this.stepDist = 0;
      this.onFootstep = null;
      this.onLand = null;

      // 探头 / 第三人称 / 狙击倍镜
      this.leanL = false;
      this.leanR = false;
      this.leanBlend = 0;
      this.thirdPerson = false;
      this.zoomIdx = 0;
      this.scoped = false;

      this.buildWeapon();
      this.buildAvatar();
      this.applyCamera(0, 0);
    }

    // 当前开镜 FOV：带 zooms 的枪按「真实放大倍率」换算，
    // 直接给 FOV 数字（原来 30/18/10）会出现「写着 2.6 倍其实是 2.2 倍」的错位。
    currentAimFov() {
      const g = this.gun;
      if (g && g.zooms && g.zooms.length) {
        const z = g.zooms[Math.min(this.zoomIdx, g.zooms.length - 1)];
        // 视场角与倍率是 tan 关系：fov = 2*atan(tan(base/2)/zoom)
        const half = Math.tan((this.baseFov * Math.PI / 180) / 2) / z;
        return Math.max(4, 2 * Math.atan(half) * 180 / Math.PI);
      }
      return this.aimFov;
    }

    zoomList() {
      return (this.gun && this.gun.zooms && this.gun.zooms.length) ? this.gun.zooms : null;
    }

    cycleZoom(dir) {
      const list = this.zoomList();
      if (!list) return;
      const n = list.length;
      this.zoomIdx = (this.zoomIdx + (dir > 0 ? 1 : -1) + n) % n;
      this.zoomChanged = 1;
    }

    // ---------------- 第三人称角色模型 ----------------
    // 有机器人模型就上机器人；模型还没加载完（或加载失败）先退回方块人顶一下，
    // 加载完再自动重建一次。
    buildAvatar() {
      const charId = (window.Economy && window.Economy.character) || 'angler';
      this.avatarChar = charId;
      const gltf = RobotModel.ready();
      if (gltf) {
        this.buildRobotAvatar(charId, gltf);
      } else {
        this.buildBoxAvatar(charId);
        RobotModel.load(() => { if (this.avatarChar === charId) this.buildAvatar(); });
      }
    }

    // ---- 机器人角色（骨骼 + 动画） ----
    buildRobotAvatar(charId, gltf) {
      if (this.avatar && this.avatar.parent) this.avatar.parent.remove(this.avatar);
      if (this.robotMixer) { this.robotMixer.stopAllAction(); this.robotMixer = null; }
      this.robotClipName = null;
      this.robotAction = null;

      const g = new THREE.Group();
      // 必须用 skeletonClone：普通 clone 只复制骨骼对象，蒙皮仍绑在旧骨架上，
      // 两个实例会互相抢骨骼（一动就抽成一团）。
      const model = THREE.skeletonClone(gltf.scene);
      // 模型在 glTF 里朝 +Z，而游戏里角色的正面是 -Z，转 180° 才一致
      model.rotation.y = Math.PI;
      model.scale.setScalar(1.02);

      const pal = RobotModel.paletteTexture(charId);
      model.traverse((o) => {
        if (!o.isMesh) return;
        // clone 出来的网格和原模型共用材质，先各自复制一份，否则换色会串到别的实例
        o.material = Array.isArray(o.material) ? o.material.map((m) => m.clone()) : o.material.clone();
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) {
          // 只换本来就有贴图的部位；眼睛那块纯黑材质保持原样，不然瞳孔会被涂白
          if (m.map) { m.map = pal; m.needsUpdate = true; }
        }
      });
      g.add(model);

      // 动画：Idle-loop / Run-loop / Sprint-loop / Jump / Fall-loop
      this.robotClips = {};
      for (const c of gltf.animations) this.robotClips[c.name] = c;
      this.robotMixer = new THREE.AnimationMixer(model);
      this.setRobotClip('Idle-loop', 0);

      // 骨架自带动画，旧的方块四肢、持枪手臂组全部置空，避免两套动作打架
      this.avatarLegL = null;
      this.avatarLegR = null;
      this.avatarAim = null;

      g.visible = false;
      this.avatar = g;
      if (this.camera.parent) this.camera.parent.add(g);
    }

    // 切换机器人动画（带淡入淡出，避免走路/站立之间硬切）
    setRobotClip(name, fade = 0.22) {
      if (!this.robotMixer || !this.robotClips) return;
      const clip = this.robotClips[name];
      if (!clip || this.robotClipName === name) return;
      const next = this.robotMixer.clipAction(clip);
      const prev = this.robotAction;
      next.reset();
      next.setEffectiveWeight(1);
      next.setEffectiveTimeScale(1);
      next.play();
      if (prev && prev !== next) {
        prev.fadeOut(fade);
        next.fadeIn(fade);
      }
      this.robotAction = next;
      this.robotClipName = name;
    }

    // ---- 方块角色（模型加载前的兜底，也是加载失败时的退路） ----
    buildBoxAvatar(charId) {
      const std = (c, r, m) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m });
      if (this.avatar && this.avatar.parent) this.avatar.parent.remove(this.avatar);
      if (this.robotMixer) { this.robotMixer.stopAllAction(); this.robotMixer = null; }
      this.robotClipName = null;
      this.robotAction = null;
      // 四名角色外观各不相同：老渔夫斗笠蓑衣、快枪手红巾皮甲、追风者轻身劲装、幸运星紫袍金饰
      // （追风者内部 id 仍为 diver，替换掉原「潜水员」——游戏无游泳玩法，改为陆地移动速度特长）
      const LOOK = {
        angler:     { skin: 0xe8b890, armor: 0x9a7f55, dark: 0x6b5638, gold: 0xd9b46a, cape: 0x4a6b52, capeIn: 0x2f4736, leather: 0x5a4326, eye: 0x6fe0a8, head: 'straw' },
        gunslinger: { skin: 0xe0a878, armor: 0x3e4652, dark: 0x2a303a, gold: 0xe0b341, cape: 0x8f2f2f, capeIn: 0x5f1d1d, leather: 0x5a3a24, eye: 0xffcc66, head: 'bandana' },
        diver:      { skin: 0xe8b890, armor: 0x3a7d72, dark: 0x24544c, gold: 0xd9c24a, cape: 0x4f9e8c, capeIn: 0x2f6b5e, leather: 0x4a3a28, eye: 0x7fe8d0, head: 'wind' },
        lucky:      { skin: 0xf0c4a0, armor: 0x9a86c8, dark: 0x6a5a94, gold: 0xffd166, cape: 0x6a3fa0, capeIn: 0x452670, leather: 0x6a4a7a, eye: 0xe6c8ff, head: 'lucky' }
      }[charId] || {
        skin: 0xe8b890, armor: 0xc8ccd4, dark: 0x6b7280, gold: 0xe0b341,
        cape: 0x2f6fb0, capeIn: 0x1a4a80, leather: 0x6b4a2b, eye: 0x4fc3f7, head: 'straw'
      };
      const g = new THREE.Group();
      const matSkin = std(LOOK.skin, 0.85, 0);
      const matArmor = std(LOOK.armor, 0.4, 0.55);
      const matArmorDark = std(LOOK.dark, 0.5, 0.45);
      const matGold = std(LOOK.gold, 0.35, 0.7);
      const matCape = std(LOOK.cape, 0.8, 0.05);
      const matCapeInner = std(LOOK.capeIn, 0.85, 0.05);
      const matLeather = std(LOOK.leather, 0.9, 0);
      const matGun = std(0x2a2f38, 0.4, 0.8);

      const box = (w, h, d, m, x, y, z, rx, ry, rz) => {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
        mesh.position.set(x, y, z);
        if (rx) mesh.rotation.x = rx;
        if (ry) mesh.rotation.y = ry;
        if (rz) mesh.rotation.z = rz;
        mesh.castShadow = true;
        g.add(mesh);
        return mesh;
      };
      const cyl = (rTop, rBot, h, m, x, y, z, rx, ry, rz) => {
        const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, h, 12), m);
        mesh.position.set(x, y, z);
        if (rx) mesh.rotation.x = rx;
        if (ry) mesh.rotation.y = ry;
        if (rz) mesh.rotation.z = rz;
        mesh.castShadow = true;
        g.add(mesh);
        return mesh;
      };

      // ---- 腿（皮甲护腿） ----
      this.avatarLegL = box(0.17, 0.55, 0.2, matLeather, -0.12, 0.38, 0);
      this.avatarLegR = box(0.17, 0.55, 0.2, matLeather, 0.12, 0.38, 0);
      // 铁靴
      box(0.2, 0.12, 0.3, matArmor, -0.12, 0.08, -0.02);
      box(0.2, 0.12, 0.3, matArmor, 0.12, 0.08, -0.02);
      // 靴尖金饰
      box(0.2, 0.05, 0.08, matGold, -0.12, 0.12, -0.14);
      box(0.2, 0.05, 0.08, matGold, 0.12, 0.12, -0.14);

      // ---- 躯干（板甲胸甲） ----
      box(0.44, 0.52, 0.26, matArmor, 0, 1.05, 0);
      // 胸甲中线装饰（前方）
      box(0.06, 0.4, 0.04, matGold, 0, 1.05, -0.14);
      // 腰带
      box(0.46, 0.1, 0.28, matLeather, 0, 0.8, 0);
      box(0.08, 0.12, 0.3, matGold, 0, 0.8, 0);
      // 肩甲
      box(0.16, 0.12, 0.2, matArmor, -0.28, 1.28, 0);
      box(0.16, 0.12, 0.2, matArmor, 0.28, 1.28, 0);
      // 肩甲金钉
      cyl(0.03, 0.03, 0.04, matGold, -0.28, 1.34, 0);
      cyl(0.03, 0.03, 0.04, matGold, 0.28, 1.34, 0);

      // ---- 披风（追风者 head 为 wind，会正常获得披风；原潜水员无披风） ----
      if (LOOK.head !== 'diver') {
        const cape = box(0.5, 0.9, 0.04, matCape, 0, 0.95, 0.16);
        cape.scale.set(1, 1.1, 1);
        box(0.5, 0.9, 0.02, matCapeInner, 0, 0.95, 0.14);
        box(0.08, 0.12, 0.05, matCape, -0.2, 0.45, 0.16);
        box(0.08, 0.12, 0.05, matCape, 0, 0.42, 0.16);
        box(0.08, 0.12, 0.05, matCape, 0.2, 0.45, 0.16);
      }

      // ---- 头（Q 版大头）：按角色做不同头部外观 ----
      box(0.3, 0.32, 0.3, matSkin, 0, 1.58, 0);
      const eyeMat = std(LOOK.eye, 0.3, 0.3);
      eyeMat.emissive = new THREE.Color(LOOK.eye);
      eyeMat.emissiveIntensity = 0.6;
      box(0.05, 0.04, 0.03, eyeMat, -0.07, 1.6, -0.16);
      box(0.05, 0.04, 0.03, eyeMat, 0.07, 1.6, -0.16);

      if (LOOK.head === 'straw') {
        // 老渔夫：宽檐草帽 + 白胡子 + 蓑衣领
        cyl(0.46, 0.46, 0.05, std(0xc9b37a, 0.95, 0), 0, 1.74, 0);
        cyl(0.17, 0.22, 0.18, std(0xb89a5e, 0.95, 0), 0, 1.84, 0);
        cyl(0.225, 0.225, 0.035, std(0x6b5a34, 0.9, 0), 0, 1.77, 0);
        box(0.24, 0.16, 0.09, std(0xecece4, 0.95, 0), 0, 1.45, -0.15);
        box(0.3, 0.08, 0.34, matLeather, 0, 1.4, 0);
        box(0.38, 0.1, 0.38, std(0x6f7d5a, 0.95, 0), 0, 1.37, 0);
      } else if (LOOK.head === 'bandana') {
        // 快枪手：红头巾 + 小胡子 + 胸口金徽
        box(0.36, 0.16, 0.36, std(0xa62a26, 0.8, 0), 0, 1.73, 0);
        box(0.09, 0.16, 0.05, std(0xa62a26, 0.8, 0), -0.12, 1.66, 0.17, 0, 0, 0.35);
        box(0.06, 0.1, 0.04, std(0x7f1f1c, 0.8, 0), -0.01, 1.48, -0.17);
        box(0.13, 0.035, 0.035, matArmorDark, 0.05, 1.47, -0.16);
        box(0.1, 0.1, 0.03, matGold, 0, 1.05, -0.15, 0, 0, Math.PI / 4);
      } else if (LOOK.head === 'wind') {
        // 追风者：束发头带 + 脑后飘带 + 发髻，轻身劲装（无潜水镜、无氧气瓶）
        box(0.34, 0.13, 0.34, matArmorDark, 0, 1.74, 0);             // 头带
        box(0.1, 0.13, 0.05, matGold, 0, 1.72, -0.18);               // 头带金饰
        cyl(0.06, 0.08, 0.12, matArmorDark, 0, 1.86, 0);             // 束发发髻
        box(0.05, 0.24, 0.02, matCape, 0.14, 1.7, 0.16, 0, 0, 0.3);  // 脑后飘带
        box(0.05, 0.24, 0.02, matCape, -0.14, 1.7, 0.16, 0, 0, -0.3);
      } else {
        // 幸运星：紫色兜帽 + 金色星星胸针
        box(0.38, 0.12, 0.36, matCape, 0, 1.8, 0);
        box(0.36, 0.3, 0.12, matCape, 0, 1.62, 0.14);
        box(0.06, 0.26, 0.28, matCape, -0.2, 1.6, 0);
        box(0.06, 0.26, 0.28, matCape, 0.2, 1.6, 0);
        box(0.38, 0.05, 0.04, matCapeInner, 0, 1.72, -0.17);
        box(0.1, 0.1, 0.035, matGold, 0, 1.06, -0.16, 0, 0, Math.PI / 4);
        box(0.055, 0.055, 0.04, matGold, 0, 1.86, 0, 0, 0, Math.PI / 4);
      }

      // ---- 持枪手臂组（随俯仰转动，枢轴在肩部） ----
      const aim = new THREE.Group();
      aim.position.set(0, 1.3, 0);
      const abox = (w, h, d, m, x, y, z) => {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
        mesh.position.set(x, y, z);
        mesh.castShadow = true;
        aim.add(mesh);
        return mesh;
      };
      // 臂甲
      abox(0.12, 0.12, 0.42, matArmor, 0.16, -0.02, -0.26);
      abox(0.12, 0.12, 0.34, matArmor, -0.08, -0.06, -0.3);
      // 护手
      abox(0.14, 0.1, 0.12, matArmorDark, 0.16, -0.04, -0.46);
      // 枪
      abox(0.07, 0.13, 0.6, matGun, 0.1, 0, -0.5);
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.32, 10), matGun);
      barrel.rotation.x = Math.PI / 2;
      barrel.position.set(0.1, 0.02, -0.92);
      aim.add(barrel);
      // 枪身金饰
      abox(0.02, 0.04, 0.15, matGold, 0.1, 0.06, -0.4);

      g.add(aim);
      this.avatarAim = aim;

      g.visible = false;
      this.avatar = g;
      if (this.camera.parent) this.camera.parent.add(g);
      // 第一人称手部肤色与袖口也跟随角色变化。
      // 袖子不要直接用 armor 色（多数角色的护甲色偏土黄，和肤色太接近，
      // 手臂会看成一根裸露的肉色柱子），在 armor 基础上压暗、去饱和。
      if (this.wMats) {
        this.wMats.skin.color.setHex(LOOK.skin);
        const sl = new THREE.Color(LOOK.armor);
        const hsl = { h: 0, s: 0, l: 0 };
        sl.getHSL(hsl);
        sl.setHSL(hsl.h, hsl.s * 0.5, Math.min(0.19, hsl.l * 0.40));
        this.wMats.sleeve.color.copy(sl);
      }
    }

    setGun(id) {
      this.setLoadout([id, null]);
    }

    // 配置背包（两把枪出战）；鱼竿固定占用 3 号槽，拳头 4 号
    setLoadout(ids) {
      this.slots[0] = ids[0] || 'pistol';
      this.slots[1] = ids[1] || null;
      this.slots[2] = 'rod';
      this.slots[3] = 'fist';
      this.ammoByGun = {};
      [this.slots[0], this.slots[1]].forEach((id) => {
        // 老存档里可能塞着已经删掉的枪，查一下再取弹匣容量
        if (id && GUNS[id]) this.ammoByGun[id] = GUNS[id].mag;
      });
      this.slot = 0;
      this.applySlot();
    }

    isMelee() {
      return this.slots[this.slot] === 'fist';
    }

    isRod() {
      return this.slots[this.slot] === 'rod';
    }

    applySlot() {
      this.reloading = 0;
      this.reloadAnim = 0;
      if (this.isRod()) {
        const rodCfg = (window.RODS && window.RODS[window.Economy ? window.Economy.rod : 'bamboo']) || null;
        this.gun = {
          id: 'rod', name: rodCfg ? rodCfg.name : '竹鱼竿', desc: '长按左键蓄力抛竿，抛得越远鱼越好',
          aimFov: 0.75, recoil: 0, spread: 0, mag: 0, rpm: 0, damage: 0, auto: false, zoom: 1.1
        };
        this.magSize = 0;
        this.ammo = 0;
      } else if (this.isMelee()) {
        this.gun = FIST;
        this.magSize = 0;
        this.ammo = 0;
      } else {
        this.gun = GUNS[this.slots[this.slot]] || GUNS.pistol;
        this.magSize = this.gun.mag;
        this.ammo = this.ammoByGun[this.slots[this.slot]] != null ? this.ammoByGun[this.slots[this.slot]] : this.magSize;
      }
      this.aimFov = this.gun.aimFov;
      this.zoomIdx = 0;
      this.refreshWeaponModel();
      const hideAll = this.frozen;
      if (this.weapon) this.weapon.visible = !this.isMelee() && !this.isRod() && !hideAll;
      if (this.fistMesh) this.fistMesh.visible = this.isMelee() && !hideAll;
      // 同步鱼竿模型：选中鱼竿（或正在钓鱼）时显示
      if (this.fishingRef) {
        this.fishingRef.setRodVisible(this.isRod() || this.fishingRef.busy);
      }
    }

    selectSlot(i) {
      if (!this.slots[i]) return false;
      if (i === this.slot) return true;
      // 保存当前弹匣余弹（当前槽可能已被丢空）
      const curId = this.slots[this.slot];
      if (curId && !this.isMelee() && !this.isRod()) this.ammoByGun[curId] = this.ammo;
      this.slot = i;
      this.applySlot();
      return true;
    }

    switchNext() {
      const order = [0, 1, 2, 3].filter((i) => !!this.slots[i]);
      const idx = order.indexOf(this.slot);
      this.selectSlot(order[(idx + 1) % order.length]);
    }

    // ---------------- 视模型：每把枪独立精细建模 ----------------
    buildWeapon() {
      const std = (color, roughness, metalness, extra) =>
        new THREE.MeshStandardMaterial(Object.assign({ color, roughness, metalness }, extra));

      // 程序化枪械表面纹理：512² 磨砂颗粒 + 划痕 + 深色锈迹
      const scratchTex = (() => {
        const s = 512;
        const cv = document.createElement('canvas');
        cv.width = cv.height = s;
        const ctx = cv.getContext('2d');
        const img = ctx.createImageData(s, s);
        for (let i = 0; i < s * s; i++) {
          const v = 132 + Math.random() * 58;
          img.data[i * 4] = v;
          img.data[i * 4 + 1] = v;
          img.data[i * 4 + 2] = v;
          img.data[i * 4 + 3] = 255;
        }
        ctx.putImageData(img, 0, 0);
        // 划痕（亮）
        ctx.strokeStyle = 'rgba(255,255,255,0.7)';
        for (let i = 0; i < 160; i++) {
          ctx.lineWidth = Math.random() < 0.8 ? 1 : 2;
          const x = Math.random() * s;
          const y = Math.random() * s;
          const len = 8 + Math.random() * 40;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x + len * (Math.random() < 0.5 ? 1 : -1), y + (Math.random() - 0.5) * 4);
          ctx.stroke();
        }
        // 锈迹/深色污渍
        ctx.globalAlpha = 0.25;
        for (let i = 0; i < 30; i++) {
          const gr = ctx.createRadialGradient(
            Math.random() * s, Math.random() * s, 0,
            Math.random() * s, Math.random() * s, 30 + Math.random() * 60
          );
          gr.addColorStop(0, 'rgba(100,70,40,0.35)');
          gr.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = gr;
          ctx.beginPath();
          ctx.arc(Math.random() * s, Math.random() * s, 30 + Math.random() * 60, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
        const t = new THREE.CanvasTexture(cv);
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.repeat.set(2, 2);
        t.anisotropy = 4;
        t.colorSpace = THREE.SRGBColorSpace;
        return t;
      })();

      // 程序化木纹 512²（枪托 / 护木）：多层波纹 + 深色节疤
      const woodTex = (() => {
        const s = 512;
        const cv = document.createElement('canvas');
        cv.width = cv.height = s;
        const ctx = cv.getContext('2d');
        ctx.fillStyle = '#8a5a34';
        ctx.fillRect(0, 0, s, s);
        for (let i = 0; i < 140; i++) {
          ctx.strokeStyle = 'rgba(56,32,16,' + (0.08 + Math.random() * 0.2) + ')';
          ctx.lineWidth = 0.6 + Math.random() * 1.6;
          ctx.beginPath();
          const x = Math.random() * s;
          for (let y = 0; y <= s; y += 8) ctx.lineTo(x + Math.sin(y * 0.05 + i) * 3, y);
          ctx.stroke();
        }
        // 深色节疤
        ctx.globalAlpha = 0.4;
        for (let i = 0; i < 8; i++) {
          const gr = ctx.createRadialGradient(
            Math.random() * s, Math.random() * s, 0,
            Math.random() * s, Math.random() * s, 15 + Math.random() * 30
          );
          gr.addColorStop(0, '#3a2412');
          gr.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = gr;
          ctx.beginPath();
          ctx.arc(Math.random() * s, Math.random() * s, 15 + Math.random() * 30, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
        const t = new THREE.CanvasTexture(cv);
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.repeat.set(1.5, 1.5);
        t.anisotropy = 4;
        t.colorSpace = THREE.SRGBColorSpace;
        return t;
      })();

      // 统一材质库（环境贴图由 game.js 提供，金属会有反射高光）
      // 原来的 dark=0x22262c + metalness 0.82，在没有强环境光的第一人称距离上
      // 几乎不反射任何东西，整把枪就是一团黑。这里整体提亮并降低金属度，
      // 让粗糙度贴图和边缘高光能真正读出来。
      const armMat = (color, rough, metal, extra) => {
        const m = std(color, rough, metal, extra);
        m.envMapIntensity = 1.15;
        m.userData.keepEnv = true;   // 别被 game.js 的全局压暗碰掉
        return m;
      };
      this.wMats = {
        dark: armMat(0x5a636c, 0.44, 0.34, { roughnessMap: scratchTex }),
        mid: armMat(0x8a949e, 0.34, 0.52, { roughnessMap: scratchTex }),
        black: armMat(0x262a2f, 0.58, 0.22, { roughnessMap: scratchTex }),
        polymer: armMat(0x3f4a3a, 0.70, 0.10, { roughnessMap: scratchTex }),
        wood: armMat(0xffffff, 0.68, 0.08, { map: woodTex }),
        brass: armMat(0xc79a48, 0.30, 0.88),
        skin: armMat(0xd09c76, 0.76, 0.0),
        leather: armMat(0x4a3524, 0.78, 0.05, { roughnessMap: scratchTex }),
        lens: std(0x0d2836, 0.06, 0.95, { emissive: 0x2a86b8, emissiveIntensity: 0.7 })
      };
      const chId = (window.Economy && window.Economy.character) || 'angler';
      const SLEEVE = {
        angler: 0x474234,
        gunslinger: 0x3b2620,
        diver: 0x2c5a50,
        lucky: 0x4c3040
      };
      this.wMats.sleeve = armMat(SLEEVE[chId] || 0x5c4a3a, 0.88, 0.02, { roughnessMap: scratchTex });
      this.wMats.glove = armMat(0x2b2f34, 0.72, 0.08, { roughnessMap: scratchTex });

      // 容器：位置/旋转由 updateWeapon 统一驱动
      const weapon = new THREE.Group();
      // 枪是相机的子物体，本地 -z 轴就是枪管朝向。要"对准准星"，枪管轴线必须
      // 与相机视线（屏幕中心）平行——即 weaponRot 的偏航/滚转要接近 0。
      // 上一版 weaponRot=(0.052,-0.105,-0.035) 带了一个 -0.105 的偏航和
      // -0.035 的滚转，枪管被掰向侧边、枪身还绕轴歪着，玩家看着就是"枪是歪的、
      // 没对准准星"。这里把旋转压到接近 0（只留 0.02 的轻微偏航让枪身显得自然），
      // 枪在屏幕右下角由 position 偏移实现，枪管轴线投影必然汇聚到准星。
      weapon.position.set(0.19, -0.20, -0.60);
      this.camera.add(weapon);
      // 注意：基础朝向必须存起来，updateWeapon 每帧都会重写 rotation，
      // 构造函数里直接写 rotation.set 会被立刻冲掉（上一版就是这个坑）。
      this.weaponRot = new THREE.Vector3(0, -0.02, -0.01);

      // 每把枪的模型与枪口位置（本地坐标，前方为 -z）
      this.weaponModels = {};
      this.weaponMuzzles = {};
      const builders = {
        pistol: () => this.modelPistol(),
        shotgun: () => this.modelShotgun(),
        rifle: () => this.modelRifle(),
        sniper: () => this.modelSniper()
      };
      Object.keys(builders).forEach((id) => {
        const g = builders[id]();
        g.visible = false;
        weapon.add(g);
        this.weaponModels[id] = g;
      });
      this.weaponMuzzles = {
        pistol: new THREE.Vector3(0, 0.02, -0.25),
        shotgun: new THREE.Vector3(0, 0.03, -0.7),
        rifle: new THREE.Vector3(0, 0.035, -0.72),
        sniper: new THREE.Vector3(0, 0.04, -1.0)
      };

      // 拳头模型（近战槽位显示）：拳套 + 小臂
      const fist = new THREE.Group();
      const fm = this.wMats.skin;
      const glove = std(0x3a3f45, 0.55, 0.2);
      const mkFist = (x) => {
        const f = new THREE.Group();
        const palm = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.09, 0.14), glove);
        f.add(palm);
        const knuckle = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.05, 0.06), fm);
        knuckle.position.set(0, 0.03, -0.08);
        f.add(knuckle);
        const wrist = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.14, 10), fm);
        wrist.rotation.x = Math.PI / 2 - 0.25;
        wrist.position.set(0, -0.02, 0.12);
        f.add(wrist);
        f.position.x = x;
        return f;
      };
      fist.add(mkFist(0.19));
      const f2 = mkFist(-0.02);
      f2.position.set(-0.02, -0.07, 0.1);
      f2.rotation.z = 0.25;
      fist.add(f2);
      fist.position.set(0.2, -0.22, -0.48);
      fist.visible = false;
      this.camera.add(fist);
      this.fistMesh = fist;

      this.weapon = weapon;
      // 78° 视场下第一人称武器天生显小，只能靠"离得近"来放大；但离得越近，
      // 枪托这一截离相机就越近——上一版 1.18 / z=-0.70 时枪托落在相机前
      // 12cm 处，在屏幕上糊成右下角一块巨大的灰板，反而看不出是枪。
      // 这里把整把枪往前推、同时放大到 1.34：枪托退到相机平面之后（被近裁剪
      // 自然剔掉），画面上留下来的是机匣 / 导轨 / 护木 / 枪管这一段"长枪"，
      // 尺寸比 0.90 那版大得多，透视也没那么炸。
      weapon.scale.setScalar(1.34);
      this.weaponBase = weapon.position.clone();
      // 开镜时枪口往画面中心收一点（枪管轴线已经对准准星，这里只把枪整体往
      // 视线中轴靠，让开镜后枪口更贴准星；原来 y 太低会顶到画面下沿）
      this.weaponAim = new THREE.Vector3(0.13, -0.14, -0.56);
      this.muzzleLocal = this.weaponMuzzles.rifle.clone();
      this.reloadAnim = 0;
      this.swapAnim = 0;
      this.refreshWeaponModel();
      // 低多边形枪械模型（异步）：到位后替换掉上面那批程序化模型
      this.initGunModels();
    }

    // 预热用：把 12 把枪的模型全部点亮。开局只有当前槽位那把是 visible=true，
    // 其余 11 把的材质永远进不了 program 缓存 —— 第一次换到某把枪就会顿一下。
    setAllWeaponModelsVisible(v) {
      if (!this.weaponModels) return;
      Object.keys(this.weaponModels).forEach((k) => {
        this.weaponModels[k].visible = !!v;
      });
    }

    // 切枪/换槽时调用：切换可见模型 + 枪口位置 + 播切枪动画
    refreshWeaponModel() {
      if (!this.weaponModels) return;
      const id = this.isMelee() ? null : this.gun.id;
      Object.keys(this.weaponModels).forEach((k) => {
        this.weaponModels[k].visible = (k === id);
      });
      if (id && this.weaponMuzzles[id]) this.muzzleLocal = this.weaponMuzzles[id];
      this.swapAnim = 1;
    }

    gunMats(accentHex) {
      const m = this.wMats;
      return { accent: new THREE.MeshStandardMaterial({ color: accentHex, roughness: 0.35, metalness: 0.55, emissive: accentHex, emissiveIntensity: 0.25 }), m };
    }

    // 用 ithappy 的低多边形 glb 替换某把枪的程序化模型。
    // 模型是真实尺寸（步枪 1.76m），所以要先按目标长度缩放，再把枪托末端、
    // 机匣中线对齐到原来程序化模型的位置，最后把右手重新挂到握把上。
    buildGunFromGlb(id) {
      const cfg = GUN_MODELS[id];
      const grp = this.weaponModels && this.weaponModels[id];
      if (!cfg || !grp) return false;
      const src = GunAssets.cache[cfg.src];
      if (!src) return false;

      // 清掉程序化几何（枪身 + 之前挂的手）
      while (grp.children.length) grp.remove(grp.children[0]);

      const wrap = new THREE.Group();
      const model = src.clone(true);
      model.traverse((o) => {
        if (!o.isMesh) return;
        o.frustumCulled = false;
        // 每个变体独立材质：同一把 rifle 模型被 smg / lmg 复用，换色不能串
        o.material = o.material.clone();
        // 图集里的金属偏亮，配上游戏里的 bloom 会糊成一片白，压一档
        o.material.color.multiplyScalar(0.86);
        if (cfg.tint) o.material.color.multiply(new THREE.Color(cfg.tint));
      });
      // 源模型枪口朝 +X，游戏里前方是 -Z
      model.rotation.y = Math.PI / 2;
      wrap.add(model);

      // 注意：测量必须在 wrap 还没挂进场景时做，这时 wrap 的世界矩阵是单位阵，
      // 包围盒坐标就等于 wrap 的本地坐标，后面加偏移才不会串坐标系。
      wrap.updateMatrixWorld(true);
      let bb = new THREE.Box3().setFromObject(wrap);
      const rawLen = Math.max(bb.max.z - bb.min.z, 1e-4);
      model.scale.setScalar(cfg.len / rawLen);

      wrap.updateMatrixWorld(true);
      bb = new THREE.Box3().setFromObject(wrap);
      model.position.z += cfg.stockZ - bb.max.z;                 // 枪托末端对齐
      model.position.y += 0.02 - (bb.min.y + bb.max.y) / 2;      // 机匣中线压到 y≈0

      wrap.updateMatrixWorld(true);
      bb = new THREE.Box3().setFromObject(wrap);
      // 枪口：包围盒最前端，高度取枪管附近（枪身中线偏上一点）
      const h = bb.max.y - bb.min.y;
      this.weaponMuzzles[id] = new THREE.Vector3(0, bb.min.y + h * 0.62, bb.min.z);

      grp.add(wrap);

      const hand = cfg.hand;
      this.handOn(grp, hand[0], hand[1], hand[2], cfg.tilt, 'pistol');

      if (this.gun && this.gun.id === id) this.muzzleLocal = this.weaponMuzzles[id];
      return true;
    }

    // glb 是异步加载的：加载完统一替换；没加载到的枪继续用程序化模型，不会白屏
    initGunModels() {
      GunAssets.loadAll(() => {
        Object.keys(GUN_MODELS).forEach((id) => this.buildGunFromGlb(id));
        this.refreshWeaponModel();
      });
    }

    addBox(parent, w, h, d, mat, x, y, z, rx, ry, rz) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      mesh.position.set(x, y, z);
      if (rx) mesh.rotation.x = rx;
      if (ry) mesh.rotation.y = ry;
      if (rz) mesh.rotation.z = rz;
      parent.add(mesh);
      return mesh;
    }

    addCyl(parent, r1, r2, len, mat, x, y, z, alongZ, seg) {
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, len, seg || 16), mat);
      if (alongZ !== false) mesh.rotation.x = Math.PI / 2;
      mesh.position.set(x, y, z);
      parent.add(mesh);
      return mesh;
    }

    // 第一人称手：手掌 + 四指 + 拇指 + 手套护背 + 手腕 + 前臂 + 卷袖
    // ── 上一版的根本错误：手掌（0.072×0.088×0.098 的方块）中心正好落在
    //    握把中心，整只手被埋进枪身里，只露出一点皮；而且四指沿 X 轴并排，
    //    像一只张开的巴掌拍在枪上。真实握枪是：掌心贴住握把「右侧」，
    //    四指从右侧绕到前方，拇指从上方扣过来，所以看到的是手背与指节。
    //    这一版按这个结构重建，并按 grip 分成握把式与托护木式两种姿态。
    handOn(parent, x, y, z, tilt, grip) {
      const skin = this.wMats.skin;
      const glove = this.wMats.glove || skin;
      const sleeveMat = this.wMats.sleeve;
      const isFore = grip === 'fore';
      // 托护木的左手直接不做：第一人称里它在画面左侧很容易糊成一团肉色，
      // 玩家明确要求删掉（现实里托枪的手也基本被枪身挡住）。
      if (isFore) { const empty = new THREE.Group(); parent.add(empty); return empty; }
      const grp = new THREE.Group();
      grp.position.set(x, y, z);
      grp.rotation.x = tilt || 0;
      // 第一人称的手要略大于真实比例，否则屏幕上只有一小块像素
      grp.scale.setScalar(isFore ? 1.30 : 1.36);
      if (isFore) {
        // 托护木：手掌翻过来朝上，四指从护木左侧绕过去
        grp.rotation.z = -Math.PI / 2;
      }

      // 手掌：薄片状，掌心朝 -x（贴住枪身右/上侧），手背朝 +x 对着玩家
      const palm = new THREE.Mesh(new THREE.BoxGeometry(0.050, 0.100, 0.088), skin);
      grp.add(palm);
      // 手背的硬质护甲（手套）
      const back = new THREE.Mesh(new THREE.BoxGeometry(0.020, 0.098, 0.084), glove);
      back.position.set(0.030, 0.002, 0);
      grp.add(back);
      // 指根处的护甲块，让"手背"读得出来
      const knuck = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.090, 0.036), glove);
      knuck.position.set(0.016, 0.0, -0.048);
      grp.add(knuck);

      // 四指：沿 Y 轴上下并排（这是握枪时手指的真实排布），
      // 从掌前缘伸向 -z，再向 -x 折过去包住握把
      const fy = [0.036, 0.013, -0.010, -0.033];
      const fLen = [0.040, 0.045, 0.043, 0.036];
      for (let i = 0; i < 4; i++) {
        const L1 = fLen[i];
        const f1 = new THREE.Mesh(new THREE.BoxGeometry(0.030, 0.019, L1), skin);
        f1.position.set(-0.006, fy[i], -0.044 - L1 * 0.5);
        f1.rotation.x = 0.06;
        grp.add(f1);
        // 第二指节：指尖向内收，扣住枪身
        const L2 = L1 * 0.86;
        const f2 = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.017, L2), skin);
        f2.position.set(-0.026, fy[i], -0.044 - L1 - L2 * 0.34);
        f2.rotation.y = isFore ? 0.95 : 0.80;
        grp.add(f2);
      }

      // 拇指：从掌根上方伸出，压在枪身另一侧
      const thumb = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.015, 0.072, 8), skin);
      thumb.rotation.set(Math.PI / 2, 0, isFore ? -0.35 : 0.35);
      thumb.position.set(-0.012, 0.050, -0.030);
      grp.add(thumb);

      // 手腕（皮肤，跟手同尺度）
      const wrist = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.040, 0.070, 10), skin);
      const wDir = new THREE.Vector3(0.12, -0.30, 0.95).normalize();
      wrist.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), wDir);
      wrist.position.set(0.004, -0.030, 0.058);
      grp.add(wrist);
      parent.add(grp);

      // ── 小臂 ───────────────────────────────────────────────────────────
      // 这里踩过两个坑：
      // 1) 小臂挂在「手」的 Group 里会跟着手放大 1.3 倍，变成横穿半个屏幕的水管；
      // 2) 左手（托护木）离相机 1.2m 远，要画到画面下边缘就得 50cm 长，
      //    结果是一根又长又直的杆子斜插在准星下方——这就是"拿枪姿势诡异"的来源。
      // 现实里托枪的左手小臂几乎整个被枪身和身体挡住，所以干脆不画，
      // 只保留右手小臂，而且让它很快从画面下沿甩出去。
      if (isFore) return grp;

      const HS = 1.36;
      const wristW = new THREE.Vector3(0.004, -0.030, 0.062).multiplyScalar(HS).add(new THREE.Vector3(x, y, z));
      // 朝右下后方收：角度越陡，小臂越早离开画面，越不会变成"木棍"
      // 小臂原来朝 +z 收得太多（几乎朝着摄像机伸过来），
      // 近距离透视下会变成一根比枪还粗的"木头"，把枪全挡住了。
      // 改成主要朝下收，让它很快离开画面底部。
      const fdir = new THREE.Vector3(0.26, -0.94, 0.22).normalize();
      const foreLen = 0.32;
      const fore = new THREE.Mesh(new THREE.CylinderGeometry(0.023, 0.033, foreLen, 12), sleeveMat);
      fore.position.copy(wristW).addScaledVector(fdir, foreLen / 2);
      fore.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), fdir);
      parent.add(fore);

      // 袖口：一圈深色皮革，把手腕和袖子分开
      const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.030, 0.030, 12), this.wMats.leather || sleeveMat);
      cuff.position.copy(wristW).addScaledVector(fdir, 0.028);
      cuff.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), fdir);
      parent.add(cuff);

      return grp;
    }

    modelRifle() {
      const g = new THREE.Group();
      const { accent, m } = this.gunMats(0xff8a3d);
      // 机匣 + 上导轨
      this.addBox(g, 0.09, 0.11, 0.42, m.dark, 0, 0, -0.06);
      this.addBox(g, 0.05, 0.018, 0.36, m.black, 0, 0.066, -0.1);
      for (let i = 0; i < 6; i++) this.addBox(g, 0.052, 0.008, 0.03, m.mid, 0, 0.078, -0.24 + i * 0.05);
      // 准星 + 照门
      this.addBox(g, 0.014, 0.05, 0.014, m.mid, 0, 0.1, -0.28);
      this.addBox(g, 0.045, 0.035, 0.02, m.mid, 0, 0.09, 0.06);
      // 护木 + 散热槽
      this.addBox(g, 0.075, 0.08, 0.22, m.polymer, 0, 0.005, -0.34);
      this.addBox(g, 0.078, 0.02, 0.2, accent, 0, 0.045, -0.34);
      // 枪管 + 消焰器
      this.addCyl(g, 0.024, 0.026, 0.28, m.mid, 0, 0.03, -0.56);
      this.addCyl(g, 0.033, 0.036, 0.07, m.black, 0, 0.03, -0.7);
      // 弹匣（弧形两段）
      this.addBox(g, 0.06, 0.12, 0.085, m.mid, 0, -0.1, -0.04, 0.12);
      this.addBox(g, 0.055, 0.1, 0.075, m.mid, 0, -0.2, -0.02, 0.3);
      // 握把 + 扳机护圈 + 枪托
      this.addBox(g, 0.07, 0.15, 0.09, m.polymer, 0, -0.12, 0.1, 0.28);
      this.addBox(g, 0.05, 0.012, 0.07, m.black, 0, -0.065, 0.02);
      this.addBox(g, 0.056, 0.072, 0.30, m.polymer, 0, -0.022, 0.325, -0.05);
      this.addBox(g, 0.060, 0.034, 0.12, m.black, 0, 0.020, 0.375);
      // 托底胶垫
      this.addBox(g, 0.062, 0.070, 0.020, m.black, 0, -0.024, 0.482);
      // 机匣细节：抛壳口、拉机柄、枪带环
      this.addBox(g, 0.012, 0.032, 0.07, m.black, 0.05, 0.02, 0.02);
      this.addBox(g, 0.028, 0.014, 0.03, m.mid, 0.055, 0.05, 0.09);
      this.addBox(g, 0.012, 0.008, 0.46, m.black, -0.05, -0.06, -0.05, 0, 0, 0.06);
      // 战术灯：护木侧面小筒 + 发光镜片，开镜时给枪一点光源感
      this.addCyl(g, 0.019, 0.019, 0.09, m.black, 0.058, 0.012, -0.36);
      this.addCyl(g, 0.016, 0.016, 0.008, m.lens, 0.058, 0.012, -0.41);
      // 弹匣井与快慢机
      this.addBox(g, 0.07, 0.03, 0.1, m.dark, 0, -0.062, -0.04);
      this.addCyl(g, 0.011, 0.011, 0.012, m.mid, 0.048, 0.0, 0.06, false);
      // 后握把上的防滑纹（三条）
      for (let i = 0; i < 3; i++) this.addBox(g, 0.072, 0.006, 0.014, m.black, 0, -0.14 + i * 0.038, 0.102, 0.28);
      // 双手：右手握手枪把，左手托护木
      this.handOn(g, 0.052, -0.128, 0.098, 0.30, 'pistol');
      // 左手原来放在 x=0（枪身中轴上），整只手被 0.075 宽的护木吞掉了，
      // 只从侧面漏出一条肉色——所以看起来"没有手"。挪到护木左侧面才看得见。
      this.handOn(g, -0.052, -0.030, -0.305, 0.06, 'fore');
      return g;
    }

    modelSniper() {
      const g = new THREE.Group();
      const { accent, m } = this.gunMats(0xb78cff);
      // 长机匣
      this.addBox(g, 0.09, 0.11, 0.52, m.dark, 0, 0, -0.1);
      this.addBox(g, 0.05, 0.015, 0.4, m.black, 0, 0.062, -0.14);
      // 瞄准镜：镜管 + 镜环 + 前后镜片
      this.addCyl(g, 0.036, 0.036, 0.24, m.black, 0, 0.115, -0.08);
      this.addCyl(g, 0.042, 0.042, 0.05, m.black, 0, 0.115, -0.2);
      this.addCyl(g, 0.034, 0.034, 0.006, m.lens, 0, 0.115, -0.222);
      this.addCyl(g, 0.03, 0.03, 0.006, m.lens, 0, 0.115, 0.042);
      this.addBox(g, 0.02, 0.045, 0.03, m.mid, 0, 0.085, -0.15);
      this.addBox(g, 0.02, 0.045, 0.03, m.mid, 0, 0.085, -0.01);
      // 重型枪管 + 制退器
      this.addCyl(g, 0.026, 0.03, 0.5, m.mid, 0, 0.025, -0.62);
      this.addBox(g, 0.075, 0.075, 0.1, m.black, 0, 0.025, -0.9);
      this.addBox(g, 0.08, 0.02, 0.03, m.black, 0, 0.025, -0.9);
      // 护木 + 两脚架
      this.addBox(g, 0.08, 0.07, 0.24, m.polymer, 0, -0.01, -0.38);
      this.addCyl(g, 0.007, 0.007, 0.2, m.mid, 0.045, -0.1, -0.5, false);
      g.children[g.children.length - 1].rotation.z = 0.35;
      this.addCyl(g, 0.007, 0.007, 0.2, m.mid, -0.045, -0.1, -0.5, false);
      g.children[g.children.length - 1].rotation.z = -0.35;
      // 栓柄 + 弹匣 + 拇指孔枪托
      this.addCyl(g, 0.008, 0.008, 0.07, m.brass, 0.055, 0.02, 0.02, false);
      g.children[g.children.length - 1].rotation.z = Math.PI / 2 - 0.5;
      const boltTip = new THREE.Mesh(new THREE.SphereGeometry(0.016, 10, 8), m.brass);
      boltTip.position.set(0.085, 0.035, 0.02);
      g.add(boltTip);
      this.addBox(g, 0.06, 0.1, 0.1, m.mid, 0, -0.09, -0.02);
      this.addBox(g, 0.08, 0.11, 0.28, m.polymer, 0, -0.005, 0.32, -0.05);
      this.addBox(g, 0.082, 0.035, 0.12, accent, 0, 0.055, 0.36);
      this.addBox(g, 0.085, 0.05, 0.06, m.black, 0, -0.01, 0.44);
      // 握把 + 手
      this.addBox(g, 0.07, 0.14, 0.09, m.polymer, 0, -0.12, 0.1, 0.25);
      // 枪带
      this.addBox(g, 0.012, 0.008, 0.5, m.black, -0.052, -0.07, -0.02, 0, 0, 0.05);
      this.handOn(g, 0.052, -0.124, 0.098, 0.30, 'pistol');
      this.handOn(g, -0.050, -0.028, -0.37, 0.06, 'fore');
      return g;
    }

    modelShotgun() {
      const g = new THREE.Group();
      const { accent, m } = this.gunMats(0xffd166);
      // 机匣
      this.addBox(g, 0.095, 0.115, 0.32, m.dark, 0, 0, -0.02);
      this.addBox(g, 0.05, 0.02, 0.12, accent, 0, 0.062, -0.02);
      // 粗枪管 + 下挂管状弹仓
      this.addCyl(g, 0.03, 0.032, 0.44, m.mid, 0, 0.03, -0.44);
      this.addCyl(g, 0.023, 0.023, 0.38, m.dark, 0, -0.018, -0.42);
      this.addCyl(g, 0.026, 0.026, 0.03, m.brass, 0, -0.018, -0.6);
      // 大口径枪口（内膛黑洞）
      this.addCyl(g, 0.036, 0.036, 0.04, m.black, 0, 0.03, -0.66);
      this.addCyl(g, 0.026, 0.026, 0.045, m.black, 0, 0.03, -0.66);
      // 准珠
      const bead = new THREE.Mesh(new THREE.SphereGeometry(0.008, 8, 6), m.brass);
      bead.position.set(0, 0.062, -0.62);
      g.add(bead);
      // 木质护木（泵动，带防滑纹）
      this.addCyl(g, 0.04, 0.045, 0.16, m.wood, 0, -0.018, -0.38);
      for (let i = 0; i < 3; i++) this.addCyl(g, 0.047, 0.047, 0.012, m.black, 0, -0.018, -0.42 + i * 0.04);
      // 木枪托 + 握把
      this.addBox(g, 0.075, 0.1, 0.26, m.wood, 0, -0.02, 0.28, -0.1);
      this.addBox(g, 0.078, 0.05, 0.08, m.wood, 0, -0.08, 0.38, -0.35);
      this.addBox(g, 0.065, 0.12, 0.085, m.wood, 0, -0.11, 0.1, 0.3);
      this.handOn(g, 0.052, -0.114, 0.098, 0.30, 'pistol');
      this.handOn(g, -0.050, -0.020, -0.37, 0.06, 'fore');
      return g;
    }

    // ---------------- 新增枪械模型 ----------------
    modelPistol() {
      const g = new THREE.Group();
      const { accent, m } = this.gunMats(0xd8e2ea);
      // 套筒 + 复进簧导杆
      this.addBox(g, 0.054, 0.072, 0.25, m.dark, 0, 0.022, -0.07);
      this.addBox(g, 0.048, 0.010, 0.23, m.mid, 0, 0.060, -0.07);
      for (let i = 0; i < 5; i++) this.addBox(g, 0.056, 0.006, 0.012, m.black, 0, 0.040, -0.16 + i * 0.028);
      // 枪身 + 扳机护圈
      this.addBox(g, 0.046, 0.048, 0.19, m.polymer, 0, -0.012, -0.05);
      this.addBox(g, 0.030, 0.012, 0.075, m.black, 0, -0.044, -0.045);
      // 枪口 + 准星 + 照门
      this.addCyl(g, 0.014, 0.014, 0.045, m.black, 0, 0.022, -0.20);
      this.addBox(g, 0.010, 0.014, 0.012, m.mid, 0, 0.062, -0.178);
      this.addBox(g, 0.040, 0.012, 0.012, m.mid, 0, 0.062, 0.045);
      // 握把（带防滑纹）
      this.addBox(g, 0.044, 0.105, 0.072, m.polymer, 0, -0.088, 0.042, 0.20);
      for (let i = 0; i < 4; i++) this.addBox(g, 0.046, 0.006, 0.062, m.black, 0, -0.070 - i * 0.024, 0.040, 0.20);
      this.addBox(g, 0.018, 0.010, 0.05, accent, 0, 0.048, -0.02);
      this.handOn(g, 0.044, -0.095, 0.042, 0.22, 'pistol');
      return g;
    }
    // 打鸟回复体力（带上限钳制）
    addStamina(amount) {
      this.stamina = Math.max(0, Math.min(this.maxStamina, this.stamina + amount));
    }
    // 从 Economy 同步当前等级对应的体力上限（1-10 级，每级 +20）
    syncStamLevel() {
      const lv = window.Economy ? window.Economy.stamLevel : 1;
      this.maxStamina = 100 + (lv - 1) * 20;
      this.stamina = Math.min(this.stamina, this.maxStamina);
    }
    // 打鸟获得体力经验：攒满「当前等级×5」自动升级，返回新等级（未升级返回 null）
    addStamExp(points) {
      const Eco = window.Economy;
      if (!Eco) return null;
      Eco.stamExp += points;
      let leveled = null;
      while (Eco.stamLevel < 10 && Eco.stamExp >= Eco.stamLevel * 5) {
        Eco.stamExp -= Eco.stamLevel * 5;
        Eco.stamLevel += 1;
        leveled = Eco.stamLevel;
      }
      if (Eco.stamLevel >= 10) Eco.stamExp = 0;
      this.syncStamLevel();
      Eco.save();
      return leveled;
    }
    reset() {
      // 重新开局时先下船，否则会被"钉"在甲板上
      if (this.riding) {
        this.riding.occupied = false;
        this.riding = null;
      }
      this.pos.set(-30, 0, -6);
      this.velocity.set(0, 0, 0);
      this.yaw = -Math.PI / 2;
      this.pitch = 0;
      this.thirdPerson = false;
      this.health = this.maxHealth;
      this.stamina = this.maxStamina;
      this.selectSlot(0);
      this.ammo = this.magSize;
      if (!this.isMelee()) this.ammoByGun[this.slots[0]] = this.ammo;
      this.fireCd = 0;
      this.reloading = 0;
      this.recoil = 0;
      this.reloadAnim = 0;
      this.vy = 0;
      this.airborne = false;
      this.crouching = false;
      this.swimming = false;
      this.eyeHeight = 1.66;
      this.frozen = false;
      this.seated = false;
      this.alive = true;
      this.aiming = false;
      this.aimBlend = 0;
      this.camera.fov = this.baseFov;
      this.camera.updateProjectionMatrix();
      this.camera.position.set(this.pos.x, this.pos.y + this.eyeHeight, this.pos.z);
      this.camKick = 0;
      this.camKickYaw = 0;
      this.shake = 0;
      this.bloom = 0;
      this.stepDist = 0;
      this.applyCamera(0, 0);
    }

    setAim(on) {
      this.aiming = !!on;
    }

    applyLook(dx, dy) {
      if (this.frozen && !this.seated) return;
      // 倍镜越高灵敏度越低，便于微调准星
      const zoomK = 1 - this.aimBlend * (1 - this.currentAimFov() / this.baseFov) * 0.85;
      const s = this.sensitivity * (1 - this.aimBlend * 0.45) * zoomK;
      this.yaw -= dx * s;
      this.pitch -= dy * s;
      this.pitch = Math.max(-1.42, Math.min(1.42, this.pitch));
    }

    faceTowards(x, z, pitch) {
      const dx = x - this.pos.x;
      const dz = z - this.pos.z;
      this.yaw = Math.atan2(-dx, -dz);
      this.pitch = pitch;
    }

    getEyePosition(target) {
      return (target || new THREE.Vector3()).set(this.pos.x, this.pos.y + this.eyeHeight, this.pos.z);
    }

    getMuzzleWorld(target) {
      const v = target || new THREE.Vector3();
      // 第三人称时枪口跟随角色模型，而非隐藏的第一人称枪模
      if (this.thirdPerson && !this.scoped) {
        const cp = Math.cos(this.pitch * 0.8);
        return v.set(
          this.pos.x - Math.sin(this.yaw) * cp * 1.0,
          this.pos.y + 1.36 + Math.sin(this.pitch * 0.8) * 0.35,
          this.pos.z - Math.cos(this.yaw) * cp * 1.0
        );
      }
      this.weapon.updateWorldMatrix(true, false);
      return v.copy(this.muzzleLocal).applyMatrix4(this.weapon.matrixWorld);
    }

    // ---------------- 乘船 ----------------
    boardBoat(boat) {
      if (!boat || this.riding) return false;
      this.riding = boat;
      boat.occupied = true;
      this.boatLx = 0;
      this.boatLz = -0.15;
      this.airborne = false;
      this.vy = 0;
      this.swimming = false;
      this.crouching = false;
      this.sprinting = false;
      this.velocity.set(0, 0, 0);
      return true;
    }

    leaveBoat() {
      const b = this.riding;
      if (!b) return false;
      b.occupied = false;
      this.riding = null;
      // 从右舷一侧下水（靠岸时为沙滩，离岸时为浅水）
      const c = Math.cos(b.yaw);
      const s = Math.sin(b.yaw);
      // 落点必须离开船体碰撞盒：原来只推开 0.85m，正好落在船壳里，
      // 每帧被 surfaceHeight 顶到甲板高度、又掉回水里 —— 就是"上下船时水面一直闪"。
      const off = b.halfWid + 1.85;
      this.pos.x = b.x - off * c;
      this.pos.z = b.z + off * s;
      this.pos.y = Math.max(this.world.heightAt(this.pos.x, this.pos.z), this.world.waterY - 0.92);
      this.airborne = true;
      this.vy = 0;
      this.velocity.set(0, 0, 0);
      return true;
    }

    // 船上：视角决定船头，W/S 油门，A/D 在甲板上左右挪
    updateRiding(dt, input, locked, mx, mz) {
      const b = this.riding;
      const w = this.world;
      const drive = locked && !this.frozen;
      this.swimming = false;
      this.crouching = false;
      this.sprinting = false;
      this.airborne = false;
      this.vy = 0;
      this.stepDist = 0;

      // 船头跟随视线，转舵有一点惯性
      if (drive) {
        let dy = this.yaw - b.yaw;
        dy = Math.atan2(Math.sin(dy), Math.cos(dy));
        b.yaw += dy * Math.min(1, dt * 3.4);
      }

      let thr = 0;
      if (drive) {
        if (input.forward) thr += 1;
        if (input.back) thr -= 1;
      }
      const tgt = thr > 0 ? 8.6 : thr < 0 ? -2.6 : 0;
      b.speed += (tgt - b.speed) * Math.min(1, dt * (thr !== 0 ? 2.0 : 1.3));
      if (Math.abs(b.speed) < 0.04) b.speed = 0;

      let side = 0;
      if (drive) {
        if (input.right) side += 1;
        if (input.left) side -= 1;
      }
      const maxLx = Math.max(0.1, b.halfWid * 0.6);
      this.boatLx = Math.max(-maxLx, Math.min(maxLx, this.boatLx + side * dt * 1.4));
      // 船在动的时候人会被带着轻微晃到船尾
      if (Math.abs(b.speed) > 0.5) {
        const drift = Math.min(0.18, Math.abs(b.speed) * 0.02) * Math.sign(b.speed);
        this.boatLz -= drift * dt;
        this.boatLz = Math.max(-b.halfLen * 0.5, Math.min(b.halfLen * 0.55, this.boatLz));
      }

      // 局部 -> 世界
      const c = Math.cos(b.yaw);
      const s = Math.sin(b.yaw);
      const deck = w.boatDeckY();
      this.pos.set(b.x + this.boatLx * c + this.boatLz * s, deck, b.z - this.boatLx * s + this.boatLz * c);
      this.velocity.set(0, 0, 0);

      this.eyeHeight += (1.66 - this.eyeHeight) * Math.min(1, dt * 10);
      this.bobPhase += dt * (2.4 + Math.abs(b.speed) * 0.5);
      const shakeAmt = 0.4 + Math.min(1, Math.abs(b.speed) / 6) * 0.55;
      this.applyCamera(dt, shakeAmt * 0.5);
      this.updateWeapon(dt, shakeAmt * 0.6, Math.abs(b.speed));
      this.weapon.visible = false;
      if (this.fistMesh) this.fistMesh.visible = false;
    }

    update(dt, input, locked) {
      if (!this.alive) {
        this.velocity.multiplyScalar(Math.max(0, 1 - dt * 6));
        return;
      }

      // 计时器
      this.fireCd = Math.max(0, this.fireCd - dt);
      // 角色选择改变后重建第三人称外观
      const curChar = (window.Economy && window.Economy.character) || 'angler';
      if (this.avatarChar !== curChar) this.buildAvatar();
      this.recoil = Math.max(0, this.recoil - dt * 7);
      // 后坐力/震动/准星扩散回弹
      const decay = Math.exp(-13 * dt);
      this.camKick *= decay;
      this.camKickYaw *= decay;
      this.bloom = Math.max(0, this.bloom - dt * 3.6);
      this.shake = Math.max(0, this.shake - dt * 4.2);
      this.swapAnim = Math.max(0, this.swapAnim - dt * 3.4);

      // 开镜过渡（FOV 收窄）
      this.aimBlend += ((this.aiming ? 1 : 0) - this.aimBlend) * (1 - Math.exp(-14 * dt));
      if (this.aimBlend < 0.001 && !this.aiming) this.aimBlend = 0;
      const aimFov = this.currentAimFov();
      const fov = this.baseFov + (aimFov - this.baseFov) * this.aimBlend;
      if (Math.abs(this.camera.fov - fov) > 0.01) {
        this.camera.fov = fov;
        this.camera.updateProjectionMatrix();
      }

      // 探头平滑 + 狙击开镜状态
      const leanT = (this.leanR ? 1 : 0) - (this.leanL ? 1 : 0);
      this.leanBlend += (leanT - this.leanBlend) * (1 - Math.exp(-11 * dt));
      this.scoped = !!this.gun && this.gun.id === 'sniper' && this.aimBlend > 0.55;

      if (this.reloading > 0) {
        this.reloading -= dt;
        this.reloadAnim = Math.min(1, this.reloadAnim + dt * 3.5);
        if (this.reloading <= 0) {
          this.reloading = 0;
          // 从备弹补入弹匣
          const need = this.magSize - this.ammo;
          const take = Math.min(need, this.reserve);
          this.ammo += take;
          this.reserve -= take;
          this.reloadAnim = 0;
          if (this.onAmmoChange) this.onAmmoChange();
        }
      } else {
        this.reloadAnim = Math.max(0, this.reloadAnim - dt * 5);
      }

      // 移动
      let mx = 0;
      let mz = 0;
      if (locked && !this.frozen) {
        if (input.forward) mz += 1;
        if (input.back) mz -= 1;
        if (input.right) mx += 1;
        if (input.left) mx -= 1;
      }
      const len = Math.hypot(mx, mz);
      if (len > 0) { mx /= len; mz /= len; }

      // 在船上：移动、站立高度、朝向全部交给船体
      if (this.riding) {
        this.updateRiding(dt, input, locked, mx, mz);
        return;
      }

      // 移动方向相对玩家当前朝向（yaw）：W 沿角色前方，A/D 沿左右
      const sinY = Math.sin(this.yaw);
      const cosY = Math.cos(this.yaw);
      const forwardX = -sinY;
      const forwardZ = -cosY;
      const rightX = cosY;
      const rightZ = -sinY;

      // 海域判定：走过沙滩与礁石滩，到岛缘悬崖才下海
      const distC = Math.hypot(this.pos.x, this.pos.z);
      const shoreR = this.world.islandRadiusAt(Math.atan2(this.pos.z, this.pos.x));
      const inSea = distC > shoreR + 5.6;
      this.swimming = inSea && !this.airborne;

      // 蹲下 / 加速（游泳时不可蹲下/加速）
      this.crouching = !!input.crouch && !this.airborne && !this.swimming;
      const targetEye = this.seated ? 1.0 : (this.swimming ? 1.74 : (this.crouching ? 1.05 : 1.66));
      this.eyeHeight += (targetEye - this.eyeHeight) * Math.min(1, dt * 10);
      // 体力见底跑不动；游泳不冲刺但也耗体力（见下面的收支）
      const sprinting = !!input.sprint && !this.crouching && !this.swimming && mz > 0 &&
        this.aimBlend < 0.3 && this.stamina > 1;
      this.sprinting = sprinting;

      // 体力收支（钓鱼循环），优先级：拉鱼 > 持竿等鱼 > 游泳 > 冲刺 > 静止恢复
      // 拉鱼消耗随鱼的稀有度（tier）上升，体现「鱼越稀有拉力越强」。
      let drain;
      const fref = this.fishingRef;
      if (fref && fref.state === 'reel') {
        const tier = fref.pickedTier || 0;
        const pull = 4 + tier * 1.2;                  // 普通 4/秒 → 神域 14.8/秒
        drain = fref.reelHold ? pull : pull * 0.5;    // 主动收线全速率，松手角力减半
      } else if (fref && (fref.state === 'cast' || fref.state === 'wait' || fref.state === 'bite')) {
        drain = 2.5;                                   // 持竿等鱼，基础消耗
      } else if (this.swimming) {
        drain = 4;
      } else if (sprinting) {
        drain = 9;
      } else {
        drain = -7;                                    // 静止自然恢复
      }
      this.stamina = Math.max(0, Math.min(this.maxStamina, this.stamina - drain * dt));

      let speed = this.walkSpeed * (1 - this.aimBlend * 0.45);
      if (sprinting) speed *= 1.15;
      if (this.crouching) speed *= 0.55;
      if (this.swimming) {
        // 游泳速度（追风者 swim 已归 1，不再有特殊加成）
        const ch = window.CHARACTERS && window.CHARACTERS[window.Economy ? window.Economy.character : 'angler'];
        speed *= 0.5 * ((ch && ch.swim) || 1);
      } else {
        // 追风者：陆地移动速度加成（move 字段，全程生效）
        const ch = window.CHARACTERS && window.CHARACTERS[window.Economy ? window.Economy.character : 'angler'];
        if (ch && ch.move) speed *= ch.move;
      }
      const desiredX = (forwardX * mz + rightX * mx) * speed;
      const desiredZ = (forwardZ * mz + rightZ * mx) * speed;
      const k = 1 - Math.exp(-11 * dt);
      this.velocity.x += (desiredX - this.velocity.x) * k;
      this.velocity.z += (desiredZ - this.velocity.z) * k;

      // 注意：yaw 由鼠标（applyLook）控制，移动方向已相对 yaw 计算，
      // 切勿在移动时改写 this.yaw，否则第一人称视角会持续自转。

      const next = new THREE.Vector3(
        this.pos.x + this.velocity.x * dt,
        this.pos.y,
        this.pos.z + this.velocity.z * dt
      );
      // 判断是否在水中（水里不能跳）
      const nextDistC = Math.hypot(next.x, next.z);
      const nextShoreR = this.world.islandRadiusAt(Math.atan2(next.z, next.x));
      const nextInSea = nextDistC > nextShoreR + 5.6;
      // 跳跃提前到 collide 之前：起跳瞬间就用空中踩踏阈值，不会被箱子侧面挡住
      // 边沿检测：按住跳跃只跳一次，避免落上箱子后立刻二段跳弹飞
      const jumpPressed = input.jump && !this.jumpHeld;
      this.jumpHeld = input.jump;
      if (!this.airborne && !nextInSea && jumpPressed && locked && !this.frozen) {
        this.airborne = true;
        this.vy = 6.0;
      }
      // 水平碰撞 + 可踩踏台阶：stepUp 为前方可达的最高障碍顶面
      const stepUp = this.world.collide(next, this.radius, true, this.pos.y, this.airborne);
      // 可站立高度：地形 + 箱子/石头顶面
      let groundY = this.world.surfaceHeight(next.x, next.z, this.pos.y, this.airborne);
      const swimY = this.world.waterY - 0.92;
      if (stepUp > this.pos.y + 0.05) {
        // 踩到箱子/石头顶面：直接落上去
        next.y = stepUp;
        this.airborne = false;
        this.vy = 0;
      } else if (this.airborne) {
        this.vy -= 16 * dt;
        next.y = this.pos.y + this.vy * dt;
        const floorY = nextInSea ? swimY : groundY;
        if (next.y <= floorY && this.vy <= 0) {
          const fall = -this.vy;
          next.y = floorY;
          this.airborne = false;
          this.vy = 0;
          if (fall > 3.2 && this.onLand) this.onLand(Math.min(1, fall / 8));
        }
      } else if (nextInSea) {
        // 游泳：身体没入水中，不能跳跃（平滑下沉，避免卡进岸边实体）
        next.y = this.pos.y + (swimY - this.pos.y) * Math.min(1, dt * 6);
        this.vy = 0;
      } else if (groundY - this.pos.y > 0.5) {
        // 出水上岸：从泳姿平滑抬升，避免瞬间弹跳
        next.y = this.pos.y + (groundY - this.pos.y) * Math.min(1, dt * 6);
        if (groundY - next.y < 0.05) next.y = groundY;
      } else {
        next.y = groundY;
        if (groundY < this.pos.y - 0.1) {
          // 走出了箱子/悬崖边缘：开始下落
          this.airborne = true;
          this.vy = 0;
          next.y = this.pos.y;
        }
      }
      this.pos.copy(next);

      const speedNow = Math.hypot(this.velocity.x, this.velocity.z);
      this.bobPhase += dt * (4 + speedNow * 1.1);
      const bobAmt = Math.min(1, speedNow / this.walkSpeed);

      // 脚步节奏：按移动距离触发，蹲走更轻更慢
      if (!this.airborne && !this.swimming) {
        this.stepDist += speedNow * dt;
        const stride = this.crouching ? 2.2 : (this.sprinting ? 3.0 : 2.5);
        if (this.stepDist >= stride) {
          this.stepDist = 0;
          if (this.onFootstep) this.onFootstep(this.crouching ? 0.4 : (this.sprinting ? 1 : 0.7));
        }
      }

      this.applyCamera(dt, bobAmt);
      this.updateWeapon(dt, bobAmt, speedNow);
      // 每帧同步一次槽位可见性：切枪、钓鱼冻结、上下船都会改变状态，
      // 只在 setSlot 里设一次的话，状态变化后就会残留（枪一直显示或一直不显示）。
      if (this.weapon) this.weapon.visible = !this.isMelee() && !this.isRod() && !this.frozen;
      if (this.fistMesh) this.fistMesh.visible = this.isMelee() && !this.frozen;
      if (this.fishingRef) this.fishingRef.setRodVisible(this.isRod() || !!this.fishingRef.busy);
    }

    applyCamera(dt, bobAmt) {
      const bobY = Math.sin(this.bobPhase * 2) * 0.035 * bobAmt;
      const bobX = Math.cos(this.bobPhase) * 0.02 * bobAmt;
      // 屏幕震动：伤害与重武器开火
      const sh = this.shake;
      const shX = (Math.random() - 0.5) * 0.05 * sh;
      const shY = (Math.random() - 0.5) * 0.04 * sh;
      const shR = (Math.random() - 0.5) * 0.045 * sh;

      // 探头：沿右向偏移，带简易防穿墙
      const cosY = Math.cos(this.yaw);
      const sinY = Math.sin(this.yaw);
      const rx = cosY;
      const rz = -sinY;
      let leanOff = this.leanBlend * 0.55;
      const eyeY = this.pos.y + this.eyeHeight;
      if (Math.abs(leanOff) > 0.02 && this.world.raycast) {
        const o = new THREE.Vector3(this.pos.x, eyeY, this.pos.z);
        const d = new THREE.Vector3(rx * Math.sign(leanOff), 0, rz * Math.sign(leanOff));
        const hit = this.world.raycast(o, d, Math.abs(leanOff) + 0.05);
        if (hit) leanOff = Math.sign(leanOff) * Math.max(0, hit.t - 0.18);
      }
      const ex = this.pos.x + rx * leanOff + bobX + shX;
      const ey = eyeY + bobY + shY;
      const ez = this.pos.z + rz * leanOff + shX * 0;

      const pitch = this.pitch + this.recoil * 0.02 + this.camKick + shY * 0.6;
      const yaw = this.yaw + this.camKickYaw + shX * 0.6;
      const roll = shR - this.leanBlend * 0.14;

      let boomDist = 0;
      if (this.thirdPerson && !this.scoped) {
        // 越肩第三人称：镜头在角色右后上方，角色落到画面左下，别压住准星。
        // boom 别小于 3：角色高 1.77，2.4 米的机位装不下全身，只在画面底部露个头。
        const boom = 4.4 - this.aimBlend * 1.6;
        const side = 0.95 - this.aimBlend * 0.35;
        const pivotY = this.pos.y + 1.42;
        const backX = Math.sin(yaw);
        const backZ = Math.cos(yaw);
        const rightX = Math.cos(yaw);
        const rightZ = -Math.sin(yaw);
        let tx = ex + backX * boom + rightX * side;
        let ty = pivotY + 0.62;
        let tz = ez + backZ * boom + rightZ * side;

        // 相机碰撞：后方被掩体挡住时收近
        const dir = new THREE.Vector3(tx - ex, ty - ey, tz - ez);
        const len = dir.length();
        if (len > 1e-3 && this.world.raycast) {
          dir.divideScalar(len);
          const hit = this.world.raycast(new THREE.Vector3(ex, ey, ez), dir, len);
          if (hit) {
            const k = Math.max(0.3, hit.t - 0.25) / len;
            tx = ex + (tx - ex) * k;
            ty = ey + (ty - ey) * k;
            tz = ez + (tz - ez) * k;
          }
        }
        // 地形下限，避免镜头钻地
        if (this.world.heightAt) {
          const minY = this.world.heightAt(tx, tz) + 0.35;
          if (ty < minY) ty = minY;
        }

        // 平滑跟随，切换视角/探头时不瞬移
        if (!this.camSmooth) this.camSmooth = new THREE.Vector3(tx, ty, tz);
        const k = dt > 0 ? 1 - Math.exp(-18 * dt) : 1;
        this.camSmooth.x += (tx - this.camSmooth.x) * k;
        this.camSmooth.y += (ty - this.camSmooth.y) * k;
        this.camSmooth.z += (tz - this.camSmooth.z) * k;
        this.camera.position.copy(this.camSmooth);

        boomDist = Math.hypot(tx - ex, ty - ey, tz - ez);
      } else {
        this.camSmooth = null;
        this.camera.position.set(ex, ey, ez);
      }
      this.camera.rotation.set(pitch, yaw, roll, 'YXZ');

      // 自己的角色模型：仅第三人称非开镜显示，避免挡视野
      if (this.avatar) {
        // 贴墙时镜头会被碰撞挤到角色身上（boomDist 只剩零点几米），
        // 这时镜头其实已经钻进了角色脑袋里，必须把自己的模型藏掉，
        // 否则整块绿色/木色的面片糊满屏幕。
        this.avatar.visible =
          this.thirdPerson && !this.scoped && boomDist > 1.15 &&
          this.alive && !this.frozen;
        if (this.avatar.visible) {
          this.avatar.position.set(this.pos.x, this.pos.y, this.pos.z);
          // 身体朝向：只跟随键盘移动方向，不随鼠标转动；停下时保持最后朝向
          const spd = Math.hypot(this.velocity.x, this.velocity.z);
          if (this.bodyYaw === undefined) this.bodyYaw = this.yaw;
          if (spd > 0.4) {
            const targetYaw = Math.atan2(-this.velocity.x, -this.velocity.z);
            let diff = targetYaw - this.bodyYaw;
            while (diff > Math.PI) diff -= Math.PI * 2;
            while (diff < -Math.PI) diff += Math.PI * 2;
            this.bodyYaw += diff * Math.min(1, 14 * dt);
          }
          this.avatar.rotation.y = this.bodyYaw;
          if (this.avatarAim) this.avatarAim.rotation.x = this.pitch * 0.8;
          // 走路时双腿交替摆动（方块角色）
          if (this.avatarLegL) {
            const swing = Math.sin(this.bobPhase * 2) * 0.3 * bobAmt;
            this.avatarLegL.rotation.x = swing;
            this.avatarLegR.rotation.x = -swing;
          }
          // 机器人：按速度和腾空状态切骨骼动画
          if (this.robotMixer) {
            const spd = Math.hypot(this.velocity.x, this.velocity.z);
            let clip = 'Idle-loop';
            if (this.airborne) clip = this.vy > 1.5 ? 'Jump' : 'Fall-loop';
            else if (this.swimming) clip = 'Idle-loop';
            else if (spd > this.walkSpeed * 1.3) clip = 'Sprint-loop';
            else if (spd > 0.5) clip = 'Run-loop';
            this.setRobotClip(clip);
            // 步频跟着实际速度走，跑起来不会出现"滑步"
            if (this.robotAction && (clip === 'Run-loop' || clip === 'Sprint-loop')) {
              this.robotAction.setEffectiveTimeScale(
                Math.max(0.65, Math.min(1.55, spd / this.walkSpeed)));
            }
            this.robotMixer.update(dt);
          }
        }
      }
    }

    addShake(amount) {
      this.shake = Math.min(1.2, this.shake + amount);
    }

    updateWeapon(dt, bobAmt, speedNow) {
      const reloadP = this.reloadAnim;
      const aim = this.aimBlend;
      // 切枪动画：先下沉再抬起（swapAnim 1→0）
      const sw = this.swapAnim;
      const swDrop = sw < 0.5 ? sw * 2 : (1 - sw) * 2;
      const swayScale = 1 - aim * 0.8;
      const swayX = Math.cos(this.bobPhase) * 0.012 * bobAmt * swayScale;
      const swayY = Math.sin(this.bobPhase * 2) * 0.01 * bobAmt * swayScale;

      const baseX = this.weaponBase.x + (this.weaponAim.x - this.weaponBase.x) * aim;
      const baseY = this.weaponBase.y + (this.weaponAim.y - this.weaponBase.y) * aim;
      const baseZ = this.weaponBase.z + (this.weaponAim.z - this.weaponBase.z) * aim;

      this.weapon.position.set(
        baseX + swayX,
        baseY + swayY - reloadP * 0.16 - swDrop * 0.24,
        baseZ + this.recoil * 0.075
      );
      this.weapon.rotation.set(
        this.weaponRot.x + this.recoil * 0.13 - reloadP * 0.85 - swDrop * 0.95,
        this.weaponRot.y - reloadP * 0.35,
        this.weaponRot.z + reloadP * 0.5 + swDrop * 0.35
      );

      // 出拳动画
      if (this.fistMesh) {
        this.fistMesh.position.set(0.2, -0.22, -0.48 - this.recoil * 0.3);
        this.fistMesh.rotation.x = -this.recoil * 0.4;
      }
    }

    canFire() {
      if (this.isRod()) return false;
      if (this.isMelee()) {
        return this.alive && !this.frozen && this.fireCd <= 0;
      }
      return this.alive && !this.frozen && this.reloading <= 0 && this.fireCd <= 0 && this.ammo > 0;
    }

    fire() {
      // 鱼竿不发射，由钓鱼系统接管左键
      if (this.isRod()) return null;
      // 近战出拳
      if (this.isMelee()) {
        if (!this.canFire()) return null;
        this.fireCd = this.gun.fireCd;
        this.recoil = 1;
        this.camKick += 0.032;
        this.bloom = Math.min(1.4, this.bloom + 0.16);
        this.addShake(0.12);
        const origin = this.getEyePosition();
        const dir = new THREE.Vector3();
        this.camera.updateMatrixWorld(true);
        this.camera.getWorldDirection(dir);
        return { origin, dir, melee: true, range: this.gun.range, damage: this.gun.body };
      }

      if (!this.canFire()) {
        // 弹匣空且有备弹时自动换弹
        if (this.alive && !this.frozen && this.reloading <= 0 && this.ammo <= 0 && this.reserve > 0) {
          this.startReload();
        }
        return null;
      }

      this.ammo -= 1;
      this.fireCd = this.gun.fireCd;
      this.recoil = 1;
      // 不同枪械的后坐与准星扩散手感
      const kickByGun = {
        pistol: 0.55, shotgun: 1.5,
        rifle: 0.85, sniper: 1.75
      };
      const kick = kickByGun[this.gun.id] || 0.8;
      this.camKick += kick * 0.038;
      this.camKickYaw += (Math.random() - 0.5) * kick * 0.028;
      this.bloom = Math.min(1.6, this.bloom + kick * 0.3);
      this.addShake(kick * 0.22);
      if (this.ammo <= 0) this.startReload();

      const origin = this.getEyePosition();
      const dir = new THREE.Vector3();
      this.camera.updateMatrixWorld(true);
      this.camera.getWorldDirection(dir);

      const spread = (this.gun.spread + this.recoil * 0.012) * (1 - this.aimBlend * 0.7);

      // 霰弹：一次打出 N 颗弹丸，各自朝锥形内不同方向飞（原来只是把单发伤害调高，
      // 视觉和判定上都是一条直线，完全没有"散"出去的感觉）。
      if (this.gun.pellets) {
        const q = this.camera.quaternion;
        const right = new THREE.Vector3(1, 0, 0).applyQuaternion(q);
        const up = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
        const cone = (this.gun.pelletSpread || 0.05) * (1 - this.aimBlend * 0.42);
        const list = [];
        for (let i = 0; i < this.gun.pellets; i++) {
          // 均匀分布在圆盘内（sqrt 保证面积均匀，不会全挤在中心）
          const r = Math.sqrt(Math.random()) * cone;
          const a = Math.random() * Math.PI * 2;
          const d = dir.clone()
            .addScaledVector(right, Math.cos(a) * r)
            .addScaledVector(up, Math.sin(a) * r)
            .normalize();
          list.push(d);
        }
        return { origin, dir: list[0], pellets: list, gunId: this.gun.id };
      }

      dir.x += (Math.random() - 0.5) * spread * 2;
      dir.y += (Math.random() - 0.5) * spread * 2;
      dir.z += (Math.random() - 0.5) * spread * 2;
      dir.normalize();

      return { origin, dir };
    }

    startReload() {
      if (this.reloading > 0 || this.ammo >= this.magSize || this.reserve <= 0) return;
      this.reloading = this.gun.reload;
      this.reloadAnim = 0;
    }

    takeDamage(amount) {
      if (!this.alive) return;
      this.health = Math.max(0, this.health - amount);
      if (this.health <= 0) {
        this.alive = false;
      }
    }
  }

  window.Player = Player;
  // 远程玩家模块（network.js）复用同一套机器人模型与调色板
  window.RobotModel = RobotModel;
})();
