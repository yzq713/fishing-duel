/* 钓鱼系统：抛竿、等待咬钩、时机小游戏、奖励 */
(function () {
  const THREE = window.THREE;

  // 一张柔和的圆形辉光贴图，给竿尖光球与浮标用
  let _glowTex = null;
  function makeGlowTexture() {
    if (_glowTex) return _glowTex;
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const ctx = c.getContext('2d');
    const gr = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.35, 'rgba(255,255,255,0.55)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gr;
    ctx.fillRect(0, 0, 64, 64);
    _glowTex = new THREE.CanvasTexture(c);
    return _glowTex;
  }

  // 鱼竿配置：dist = 最远抛投距离（米），price 0 = 初始拥有
  const RODS = {
    bamboo: {
      id: 'bamboo', name: '竹鱼竿', price: 0, tier: 0, zone: 1.00, speed: 1.00, wait: 1.00, bonus: 0, dist: 12,
      color: 0x8a6a3a, glow: 0x000000, desc: '祖传竹竿，最远 12m'
    },
    carbon: {
      id: 'carbon', name: '碳素鱼竿', price: 900, tier: 1, zone: 1.45, speed: 0.85, wait: 0.80, bonus: 8, dist: 18,
      color: 0x2f3a44, glow: 0x1a4a6a, desc: '轻、韧、判定区更宽，18m'
    },
    master: {
      id: 'master', name: '大师鱼竿', price: 2200, tier: 2, zone: 1.90, speed: 0.70, wait: 0.60, bonus: 20, dist: 26,
      color: 0x7a5a24, glow: 0xffb03a, desc: '老匠人手工缠线，快咬钩，26m'
    },
    glass: {
      id: 'glass', name: '玻璃钢矶竿', price: 4500, tier: 3, zone: 2.10, speed: 0.62, wait: 0.50, bonus: 30, dist: 34,
      color: 0x2f8ea8, glow: 0x56e0ff, desc: '矶钓利器，34m，深海鱼更易上钩'
    },
    abyss: {
      id: 'abyss', name: '深渊钛竿', price: 8500, tier: 4, zone: 2.40, speed: 0.50, wait: 0.40, bonus: 45, dist: 45,
      color: 0x4a3f70, glow: 0x9a7ae8, desc: '钛合金远投，45m，直取深海巨物'
    },
    crystal: {
      id: 'crystal', name: '水晶竿', price: 13000, tier: 5, zone: 2.65, speed: 0.46, wait: 0.36, bonus: 60, dist: 54,
      color: 0x9fe8ff, glow: 0x7ff0ff, desc: '整根晶体拉制，能感到鱼的心跳，54m'
    },
    dragon: {
      id: 'dragon', name: '龙骨竿', price: 20000, tier: 6, zone: 2.85, speed: 0.42, wait: 0.32, bonus: 80, dist: 64,
      color: 0x9a3a2a, glow: 0xff6a3a, desc: '以龙骨为竿身，拉力惊人，64m'
    },
    astral: {
      id: 'astral', name: '星辉竿', price: 30000, tier: 7, zone: 3.05, speed: 0.38, wait: 0.28, bonus: 105, dist: 74,
      color: 0x5a4ae0, glow: 0xbfa8ff, desc: '竿身封了一小片夜空，74m'
    },
    void: {
      id: 'void', name: '虚空竿', price: 42000, tier: 8, zone: 3.25, speed: 0.34, wait: 0.24, bonus: 135, dist: 86,
      color: 0x241a34, glow: 0xff4a6a, desc: '从深渊裂缝里捞出来的，86m'
    },
    genesis: {
      id: 'genesis', name: '创世竿', price: 60000, tier: 9, zone: 3.50, speed: 0.30, wait: 0.20, bonus: 180, dist: 99,
      color: 0xffe8a8, glow: 0x8affff, desc: '钓得上一切存在与不存在的鱼，99m'
    }
  };
  window.RODS = RODS;

  // 鱼种表：minD = 需要抛到的距离（米）才会出现，越远品质越高
  const POND_FISH = [
    { name: '小银鱼', points: 20, minD: 0 },
    { name: '青鱼', points: 28, minD: 4 },
    { name: '苔背龟鱼', points: 40, minD: 6 },
    { name: '肥鲤鱼', points: 36, minD: 7 },
    { name: '月光水灯鱼', points: 46, minD: 9 },
    { name: '彩虹鳟', points: 50, minD: 10 },
    { name: '泡泡小丑鱼', points: 62, minD: 12 },
    { name: '神秘鲈鱼', points: 68, minD: 13 },
    { name: '花冠金鱼', points: 70, minD: 14 },
    { name: '三眼蟾鱼', points: 88, minD: 16 },
    { name: '锦鲤', points: 92, minD: 16 },
    { name: '纸月鳐', points: 140, minD: 18 },
    { name: '黄金鲫鱼', points: 120, minD: 19 },
    { name: '水晶锦鲤', points: 150, minD: 21 },
    { name: '鲟鱼', points: 160, minD: 23 },
    { name: '九尾锦鲤', points: 330, minD: 25 },
    { name: '星图鲶', points: 420, minD: 28 },
    { name: '时之鲤', points: 780, minD: 32 },
    { name: '太初龙鲤', points: 1600, minD: 38 }
  ];
  const SEA_FISH = [
    { name: '海带鱼', points: 25, minD: 0 },
    { name: '银鲳鱼', points: 40, minD: 6 },
    { name: '石斑鱼', points: 58, minD: 12 },
    { name: '星辉鳐', points: 72, minD: 15 },
    { name: '骨刺鲷', points: 90, minD: 16 },
    { name: '大眼鲷', points: 78, minD: 18 },
    { name: '灯笼鮟鱇', points: 130, minD: 20 },
    { name: '熔岩鳗', points: 98, minD: 21 },
    { name: '金枪鱼', points: 105, minD: 24 },
    { name: '玻璃水母鱼', points: 190, minD: 28 },
    { name: '帝王鲑', points: 135, minD: 31 },
    { name: '机械银鲭', points: 155, minD: 33 },
    { name: '蓝鳍金枪鱼', points: 180, minD: 37 },
    { name: '幽灵灯笼鱼', points: 215, minD: 39 },
    { name: '深海皇带鱼', points: 240, minD: 43 },
    { name: '锤头骨鲨', points: 480, minD: 47 },
    { name: '深渊王冠鱼', points: 720, minD: 51 },
    { name: '幽光鲸鲨', points: 1200, minD: 56 },
    { name: '星界鳐', points: 2400, minD: 63 }
  ];
  // 远古鱼种：比海鱼表更高一档的「史前巨兽」，只有在最深的外海才钓得到。
  // 单独一张表是为了在图鉴里能单独成组（海洋 / 远古 · 史前巨兽），
  // 抽取时仍然并进 SEA_FISH，走同一套 minD + 权重逻辑。
  const ANCIENT_FISH = [
    { name: '苍龙', points: 3200, minD: 66, ancient: true },
    { name: '恐龙', points: 3800, minD: 74, ancient: true }
  ];
  SEA_FISH.push.apply(SEA_FISH, ANCIENT_FISH);

  // 血夜专属：只有血月升起的那一夜才会咬钩，不并进普通海鱼表。
  // minD 从 14m 起步 —— 血夜是随机事件，不能要求玩家先把鱼竿升到顶才看得见东西。
  const BLOOD_FISH = [
    { name: '赤鳍影',   points: 640,  minD: 14, blood: true },
    { name: '夜魇石斑', points: 980,  minD: 26, blood: true },
    { name: '血月鳗',   points: 1260, minD: 34, blood: true },
    { name: '绯红潮蛇', points: 2100, minD: 44, blood: true },
    { name: '朱红裂口', points: 3400, minD: 54, blood: true }
  ];
  // 血夜状态：game.js 的昼夜循环负责开关，pickFish 只读它
  window.BloodNight = window.BloodNight || { active: false, startedAt: 0 };
  window.BLOOD_FISH = BLOOD_FISH;

  // 日魇专属：白天才有，全天色发暗时出现。头五个按距离递增浮现，
  // 最后一个「日魇之核」是隐藏首领，只在事件高潮（蝠群最密）时咬钩，一场一次。
  const DAYMARE_FISH = [
    { name: '逆光之群', points: 700,  minD: 16, daymare: true },
    { name: '白夜蚀翼', points: 1500, minD: 26, daymare: true },
    { name: '盲光狂潮', points: 1800, minD: 34, daymare: true },
    { name: '苍白灾厄', points: 2800, minD: 40, daymare: true },
    { name: '烈日蝠影', points: 3000, minD: 48, daymare: true },
    { name: '日魇之核', points: 5200, minD: 58, daymare: true, boss: true, hidden: true }
  ];
  // 日魇状态：active 由 game.js 控制；climax 标记「蝠群最密」的那段，
  // bossed 记录这一场首领是否已经被钓走（一场一条，不刷屏）
  window.Daymare = window.Daymare || { active: false, startedAt: 0, climax: false, bossed: false, bats: 0 };
  window.DAYMARE_FISH = DAYMARE_FISH;

  window.FISH_TABLE = {
    pond: POND_FISH, sea: SEA_FISH, ancient: ANCIENT_FISH,
    blood: BLOOD_FISH, daymare: DAYMARE_FISH
  };

  class Fishing {
    constructor(scene, player, world, hooks) {
      this.scene = scene;
      this.player = player;
      this.world = world;
      this.hooks = hooks || {};

      this.state = 'idle'; // idle | charge | cast | wait | bite | reel | result
      this.timer = 0;
      this.cooldown = 0;
      this.markerT = 0;
      this.marker = 0;
      this.zoneCenter = 0.5;
      this.zoneWidth = 0.3;
      this.success = false;

      // 收线阶段（咬钩成功后再按住空格把鱼拖上岸）
      this.reelProgress = 0;
      this.reelHold = false;
      this.reelTime = 0;
      this.reelStruggleT = 0;
      this.reelPanic = 0;
      this.pickedFish = null;
      this.pickedTier = 0;

      // 蓄力抛竿
      this.chargeT = 0;
      this.charge = 0;
      this.castDist = 0;
      this.maxDist = 12;
      this.rodCfg = RODS.bamboo;
      this.waterY = 0.1;
      this.seaCast = false;
      this.rodOwned = false;
      // 这一竿挂的鱼饵（由 hooks.useBait 返回 {id,name,cap,luck,left}），null = 空钩
      this.baitCfg = null;

      this.bobberPos = new THREE.Vector3();
      this.bobberTarget = new THREE.Vector3();
      this.castFrom = new THREE.Vector3();

      this.panel = document.getElementById('fishPanel');
      this.zoneEl = document.getElementById('fishZone');
      this.markerEl = document.getElementById('fishMarker');

      this.buildVisuals();
    }

    buildVisuals() {
      // 竿身材质留成字段：换鱼竿时只改颜色/发光，不必重建整根竿
      const rodMat = new THREE.MeshStandardMaterial({ color: 0x8a6a3a, roughness: 0.72 });
      this.rodShaftMat = rodMat;
      const gripMat = new THREE.MeshStandardMaterial({ color: 0x24303a, roughness: 0.95 });
      const glowMat = new THREE.MeshStandardMaterial({
        color: 0xb9c6ce, metalness: 0.8, roughness: 0.35,
        emissive: 0x000000, emissiveIntensity: 0
      });
      this.rodGlowMat = glowMat;
      const rodGroup = new THREE.Group();
      rodGroup.position.set(0.34, -0.28, -0.46);
      rodGroup.rotation.set(-1.02, -0.2, 0.22);

      // 竿身：分节渐细
      const segs = [
        { y: 0.10, h: 0.24, r0: 0.030, r1: 0.026 },
        { y: 0.36, h: 0.34, r0: 0.026, r1: 0.019 },
        { y: 0.70, h: 0.42, r0: 0.019, r1: 0.0125 },
        { y: 1.06, h: 0.44, r0: 0.0125, r1: 0.0065 }
      ];
      segs.forEach((s) => {
        const m = new THREE.Mesh(new THREE.CylinderGeometry(s.r1, s.r0, s.h, 8), rodMat);
        m.position.y = s.y + s.h / 2;
        rodGroup.add(m);
      });
      // 握把
      const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.038, 0.30, 8), gripMat);
      grip.position.set(0, 0.02, 0);
      rodGroup.add(grip);
      // 渔轮 + 摇柄
      const reel = new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.058, 0.048, 12), glowMat);
      reel.rotation.z = Math.PI / 2;
      reel.position.set(0, 0.24, 0.055);
      rodGroup.add(reel);
      const crank = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.11, 0.014), gripMat);
      crank.position.set(0.045, 0.24, 0.12);
      rodGroup.add(crank);
      // 导环
      for (let i = 0; i < 3; i++) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.016 - i * 0.003, 0.0035, 5, 10), glowMat);
        ring.position.set(0, 0.62 + i * 0.26, 0.012);
        ring.rotation.x = Math.PI / 2;
        rodGroup.add(ring);
      }
      // 竿尖红点
      const tipDot = new THREE.Mesh(
        new THREE.SphereGeometry(0.0075, 6, 5),
        new THREE.MeshStandardMaterial({ color: 0xff5a3a, emissive: 0x802000, emissiveIntensity: 1 })
      );
      tipDot.position.y = 1.50;
      rodGroup.add(tipDot);

      // 竿尖发光球：高级竿才亮，越高越明显
      const tipGlow = new THREE.Sprite(new THREE.SpriteMaterial({
        map: makeGlowTexture(), transparent: true, opacity: 0.85,
        blending: THREE.AdditiveBlending, depthWrite: false
      }));
      tipGlow.position.set(0, 1.52, 0);
      tipGlow.scale.setScalar(0.16);
      tipGlow.visible = false;
      rodGroup.add(tipGlow);
      this.rodTipGlow = tipGlow;

      rodGroup.visible = false;
      this.player.camera.add(rodGroup);
      this.rod = rodGroup;
      this.rodTipLocal = new THREE.Vector3(0, 1.5, 0);

      const bobber = new THREE.Mesh(
        new THREE.SphereGeometry(0.11, 10, 8),
        new THREE.MeshStandardMaterial({ color: 0xff5a4a, roughness: 0.4, emissive: 0x551100 })
      );
      bobber.visible = false;
      this.scene.add(bobber);
      this.bobber = bobber;

      // 鱼线：原来是 9 根半径 5cm 的白色实心管，还关掉了深度测试——
      // 结果就是一根"穿墙的白水管"横在画面里。现在改成 16 段半径 6mm 的
      // 细圆柱，半透明、接受场景遮挡，弯曲按悬链线走，才是鱼线该有的样子。
      const lineMat = new THREE.MeshBasicMaterial({
        color: 0xd9e6ee, transparent: true, opacity: 0.52,
        toneMapped: false, fog: false, depthWrite: false
      });
      const segGeo = new THREE.CylinderGeometry(0.006, 0.006, 1, 5, 1, true);
      this.lineSegs = [];
      for (let i = 0; i < 16; i++) {
        const seg = new THREE.Mesh(segGeo, lineMat);
        seg.visible = false;
        seg.frustumCulled = false;
        this.scene.add(seg);
        this.lineSegs.push(seg);
      }
      this.lineSnapT = 0;

      // 鱼钩：鱼线末端的 J 形金属钩（程序化曲线，无外部素材）
      this.hook = this.buildHook();
      this.scene.add(this.hook);

      // 钓到的鱼（默认小银鱼，实际钓到后按鱼名重建）
      this.fishModel = new window.FishModel('小银鱼');
      this.fishModel.group.visible = false;
      this.scene.add(this.fishModel.group);
      this.fishVel = new THREE.Vector3();
      this.fishActive = false;

      // 咬钩提示：水面上跳动的 “!” 标记
      const exCanvas = document.createElement('canvas');
      exCanvas.width = exCanvas.height = 64;
      const exCtx = exCanvas.getContext('2d');
      exCtx.font = 'bold 52px Arial';
      exCtx.textAlign = 'center';
      exCtx.textBaseline = 'middle';
      exCtx.lineWidth = 9;
      exCtx.strokeStyle = '#7a2a00';
      exCtx.strokeText('!', 32, 36);
      exCtx.fillStyle = '#ffb020';
      exCtx.fillText('!', 32, 36);
      this.exclaim = new THREE.Sprite(new THREE.SpriteMaterial({
        map: new THREE.CanvasTexture(exCanvas), transparent: true, depthWrite: false
      }));
      this.exclaim.scale.setScalar(0.7);
      this.exclaim.visible = false;
      this.scene.add(this.exclaim);
      this.exclaimT = 0;

      // 鱼竿弯曲状态（咬钩下沉 / 扬竿拉鱼）
      this.rodBaseX = -1.05;
      this.rodBend = 0;
      this.rodBendTarget = 0;

      // 鱼的动画模式：reelHold = 按住空格拖鱼，haul = 到岸后飞向手中，escape = 脱钩跃回水中
      this.fishMode = 'idle';
      this.fishFrom = new THREE.Vector3();
      this.fishTo = new THREE.Vector3();
      this.fishT = 0;
      this.reelBar = document.getElementById('reelBar');
      this.reelFill = document.getElementById('reelFill');
      this.reelLabel = document.getElementById('reelLabel');
    }

    // 预热：鱼竿 / 浮标 / 鱼线 / 咬钩标记 / 鱼模型开局全是 visible=false 的，
    // renderer.compile() 只遍历可见对象 —— 这些材质会一直拖到"第一次抛竿"
    // 才现场编译，那一帧就是玩家说的"在湖里钓鱼会卡，窗口还会闪一下变透明"。
    // 这里把它们摆到镜头前真渲染一帧，再收回去；材质不 dispose，program 才留得住。
    warmup(renderer, camera) {
      if (!renderer || !camera) return;
      camera.updateMatrixWorld(true);
      const base = new THREE.Vector3();
      camera.getWorldPosition(base);
      const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion).normalize();
      const at = base.clone().addScaledVector(fwd, 1.2);
      const keep = {
        rod: this.rod.visible,
        tip: this.rodTipGlow ? this.rodTipGlow.visible : false,
        bob: this.bobber.visible,
        ex: this.exclaim.visible,
        fish: this.fishModel ? this.fishModel.group.visible : false
      };
      try {
        this.rod.visible = true;
        if (this.rodTipGlow) this.rodTipGlow.visible = true;
        this.bobber.visible = true;
        this.bobber.position.copy(at);
        this.lineSegs.forEach((s) => {
          s.visible = true;
          s.position.copy(base).addScaledVector(fwd, 1.05);
          s.scale.set(1, 0.6, 1);
          s.quaternion.identity();
        });
        this.exclaim.visible = true;
        this.exclaim.position.copy(at);
        if (this.fishModel) {
          this.fishModel.group.visible = true;
          this.fishModel.group.position.copy(at).addScaledVector(fwd, 0.9);
        }
        try { renderer.compile(this.scene, camera); } catch (e) { /* 老版本没有 compile */ }
        try { renderer.render(this.scene, camera); } catch (e) { /* ignore */ }
      } catch (e) { /* 预热失败不该拖垮启动 */ }
      this.rod.visible = keep.rod;
      if (this.rodTipGlow) this.rodTipGlow.visible = keep.tip;
      this.bobber.visible = keep.bob;
      this.exclaim.visible = keep.ex;
      if (this.fishModel) this.fishModel.group.visible = keep.fish;
      this.lineSegs.forEach((s) => { s.visible = false; });
    }

    get busy() {
      return this.state !== 'idle';
    }

    // 任意近水处均可钓鱼：海里游泳、湖冰/湖边 2.5m 内、海滩且面向大海
    nearSpot(pos) {
      // 站在船上：四周都是海，任意朝向都能抛竿
      if (this.player.riding) {
        return { x: pos.x, z: pos.z, sea: true };
      }
      if (this.player.swimming) {
        return { x: pos.x, z: pos.z, sea: true };
      }
      // 站在湖岸 2.5m 内即可向湖里抛竿
      const pond = this.world.pond;
      const dp = Math.hypot(pos.x - pond.x, pos.z - pond.z);
      const dr = dp - this.world.pondRadiusAt(Math.atan2(pos.z - pond.z, pos.x - pond.x));
      if (dr < 2.5) {
        return { x: pos.x, z: pos.z };
      }
      // 近岸且大致面向大海（海钓）；落点会在 castTarget 中强制推到海里
      const dc = Math.hypot(pos.x, pos.z);
      const shore = this.world.islandRadiusAt(Math.atan2(pos.z, pos.x));
      if (dc > shore - 3.0) {
        const fx = -Math.sin(this.player.yaw);
        const fz = -Math.cos(this.player.yaw);
        if (dc < 1e-3 || (fx * pos.x + fz * pos.z) / dc > 0.05) {
          return { x: pos.x, z: pos.z, sea: true };
        }
      }
      return null;
    }

    // 程序化 J 形鱼钩：顶部小环连接鱼线，竖直向下后弯回、向上收尖
    buildHook() {
      const group = new THREE.Group();
      const metal = new THREE.MeshStandardMaterial({ color: 0xdde6ee, metalness: .65, roughness: .3 });
      const pts = [
        new THREE.Vector3(0, 0.01, 0),
        new THREE.Vector3(0, -0.05, 0),
        new THREE.Vector3(0.03, -0.09, 0),
        new THREE.Vector3(0.075, -0.06, 0),
        new THREE.Vector3(0.062, -0.005, 0)
      ];
      const curve = new THREE.CatmullRomCurve3(pts);
      group.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 22, 0.008, 6, false), metal));
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.018, 0.006, 8, 16), metal);
      ring.position.set(0, 0.028, 0);
      group.add(ring);
      group.visible = false;
      return group;
    }

    getRodTip(target) {
      this.rod.updateWorldMatrix(true, false);
      return (target || new THREE.Vector3()).copy(this.rodTipLocal).applyMatrix4(this.rod.matrixWorld);
    }

    // 鱼竿是否在手中（由玩家槽位决定）
    setRodVisible(v) {
      this.rodOwned = !!v;
      this.rod.visible = !!v;
      if (v) this.applyRodLook();
    }

    // 按当前装备的鱼竿调整竿身颜色、长度、发光与竿尖光球
    applyRodLook() {
      const cfg = this.rodCfg || RODS.bamboo;
      const t = cfg.tier || 0;
      if (this.rodShaftMat) this.rodShaftMat.color.setHex(cfg.color);
      if (this.rodGlowMat) {
        this.rodGlowMat.color.setHex(t >= 4 ? cfg.glow : 0xb9c6ce);
        this.rodGlowMat.emissive.setHex(t >= 4 ? cfg.glow : 0x000000);
        this.rodGlowMat.emissiveIntensity = t >= 4 ? 0.4 + t * 0.22 : 0;
      }
      if (this.rodTipGlow) {
        this.rodTipGlow.visible = t >= 3;
        this.rodTipGlow.material.color.setHex(cfg.glow || 0xffffff);
        this.rodTipGlow.scale.setScalar(0.10 + t * 0.014);
      }
      // 越高阶的竿越长（竿尖位置同步换算，鱼线才不会从半空开始）
      const lenK = 0.90 + t * 0.026;
      this.rod.scale.set(1, lenK, 1);
      this.rodTipLocal.set(0, 1.52 * lenK, 0);
    }

    // 当前鱼竿最大抛距
    get maxCast() {
      const rodId = window.Economy ? window.Economy.rod : 'bamboo';
      return (RODS[rodId] || RODS.bamboo).dist;
    }

    // ---------------- 蓄力抛竿 ----------------
    startCharge() {
      if (this.busy || this.cooldown > 0 || !this.player.alive) return false;
      const spot = this.nearSpot(this.player.pos);
      if (!spot) {
        if (this.hooks.notice) this.hooks.notice('这里没有水，走到湖边或海边再抛竿', 'bad');
        return false;
      }
      const rodId = window.Economy ? window.Economy.rod : 'bamboo';
      this.rodCfg = RODS[rodId] || RODS.bamboo;
      this.seaCast = !!spot.sea;
      this.waterY = this.seaCast ? this.world.waterY + 0.04 : (this.world.pondTopY || 0.08) + 0.03;
      this.chargeT = 0;
      this.charge = 0;
      this.state = 'charge';
      this.player.frozen = true;
      this.setRodVisible(true);
      this.showChargeBar(true);
      if (this.hooks.audio) this.hooks.audio('cast');
      return true;
    }

    releaseCharge() {
      if (this.state !== 'charge') return;
      this.showChargeBar(false);
      const rodId = window.Economy ? window.Economy.rod : 'bamboo';
      this.rodCfg = RODS[rodId] || RODS.bamboo;
      const power = this.charge;
      // 4m 起步，蓄满到达鱼竿极限距离
      const want = 4 + power * (this.rodCfg.dist - 4);
      this.state = 'idle';
      this.begin(this.nearSpot(this.player.pos), want);
    }

    cancelCharge() {
      if (this.state !== 'charge') return;
      this.state = 'idle';
      this.player.frozen = false;
      this.showChargeBar(false);
      this.rodBendTarget = 0;
    }

    showChargeBar(on) {
      const bar = document.getElementById('castBar');
      if (!bar) return;
      bar.classList.toggle('on', !!on);
    }

    // 计算落点：湖钓落在湖面内，海钓落在岛外海面
    castTarget(spot, want) {
      const px = this.player.pos.x, pz = this.player.pos.z;
      const fwd = { x: -Math.sin(this.player.yaw), z: -Math.cos(this.player.yaw) };
      let dirX = fwd.x, dirZ = fwd.z;
      let dist = want;

      if (this.seaCast) {
        let tx = px + dirX * dist, tz = pz + dirZ * dist;
        const bd = Math.hypot(tx, tz);
        const bShore = this.world.islandRadiusAt(Math.atan2(tz, tx));
        const minR = bShore + 2.2;
        if (bd < minR) {
          const k = minR / Math.max(0.001, bd);
          tx *= k; tz *= k;
        }
        this.castDist = Math.hypot(tx - px, tz - pz);
        return { x: tx, z: tz };
      }

      // 湖钓：沿朝向投；若朝向背对湖心则改为朝湖心投
      const pond = this.world.pond;
      const inside = (t) => {
        const x = px + dirX * t, z = pz + dirZ * t;
        return Math.hypot(x - pond.x, z - pond.z) < this.world.pondRadiusAt(Math.atan2(z - pond.z, x - pond.x)) - 0.6;
      };
      let edge = 0;
      for (let t = 0; t <= 90; t += 0.2) {
        if (inside(t)) edge = t;
        else if (edge > 0) break;
      }
      if (edge <= 0) {
        // 背对湖：转向湖心
        dirX = pond.x - px; dirZ = pond.z - pz;
        const dl = Math.hypot(dirX, dirZ);
        if (dl > 1e-4) { dirX /= dl; dirZ /= dl; }
        edge = Math.hypot(pond.x - px, pond.z - pz) + this.world.pondRadiusAt(Math.atan2(pz - pond.z, px - pond.x)) * 2;
        dist = Math.min(want, edge * 0.92);
      } else {
        dist = Math.min(want, edge * 0.92);
      }
      const tx = px + dirX * dist, tz = pz + dirZ * dist;
      this.castDist = dist;
      return { x: tx, z: tz };
    }

    begin(spot, wantDist) {
      if (this.busy || this.cooldown > 0 || !this.player.alive) return false;

      const rodId = window.Economy ? window.Economy.rod : 'bamboo';
      this.rodCfg = RODS[rodId] || RODS.bamboo;
      this.seaCast = !!(spot && spot.sea);
      this.waterY = this.seaCast ? this.world.waterY + 0.04 : (this.world.pondTopY || 0.08) + 0.03;

      // 抛竿即消耗一份挂在钩上的鱼饵；没装饵就是空钩，照样能钓，只是钓不到好鱼
      this.baitCfg = this.hooks.useBait ? this.hooks.useBait() : null;

      const t = this.castTarget(spot, wantDist != null ? wantDist : this.rodCfg.dist);
      this.bobberTarget.set(t.x, this.waterY, t.z);

      this.player.frozen = true;
      // 抛竿消耗体力：一次 8 点。体力不足也能抛，但后面拉鱼会明显吃力
      this.player.addStamina(-8);
      // 原来 pitch 压到 -0.55（-31.5°），等鱼上钩时整屏像在看地面；改成 -0.16（约 -9°），
      // 基本平视、略微俯视就能看到浮标，不再戳向船板。
      this.player.faceTowards(this.bobberTarget.x, this.bobberTarget.z, -0.16);
      this.player.applyCamera(0);

      this.state = 'cast';
      this.timer = 0.65;
      this.rodBendTarget = 0; // 蓄力时的后弯归零，cast 阶段的挥竿动作单独驱动
      this.setRodVisible(true);
      this.bobber.visible = true;
      this.lineSegs.forEach((s) => { s.visible = true; });

      this.castFrom.copy(this.getRodTip());
      this.bobberPos.copy(this.castFrom);
      this.bobber.position.copy(this.bobberPos);

      if (this.hooks.notice) {
        const bc = this.baitCfg;
        // 空钩 / 剩最后一份都在抛竿提示里说清楚，玩家不用翻背包才知道
        const baitTxt = bc
          ? ('挂' + bc.name + (bc.left > 0 ? '（还剩 ' + bc.left + ' 份）' : '（最后一份）'))
          : '空钩 · 只能钓到普通鱼';
        const bloodTxt = (window.BloodNight && window.BloodNight.active)
          ? (bc ? ' · 血月：深水里有东西在动' : ' · 血月当空，空钩引不来它们')
          : '';
        this.hooks.notice('抛竿 ' + this.castDist.toFixed(1) + 'm · ' + baitTxt + bloodTxt + ' · 安静等鱼咬钩…', 'info');
      }
      return true;
    }

    update(dt) {
      if (this.cooldown > 0) this.cooldown -= dt;
      if (this.lineSnapT > 0) this.lineSnapT -= dt;
      if (this.state === 'idle') {
        // 只有「手上真的拿着鱼竿」才画线。原来只要买过鱼竿（rodOwned）
        // 就一直挂着一根 1.15m 的垂线，玩家走路、蹲下、贴墙时它直接戳进地里。
        if (this.rod.visible) this.updateIdleLine();
        else this.lineSegs.forEach((s) => { s.visible = false; });
        return;
      }

      // 蓄力：三角波（到最远点后开始回退），松开左键按当前蓄力抛投
      if (this.state === 'charge') {
        this.chargeT += dt;
        const p = this.chargeT % 2.0;
        this.charge = p > 1 ? 2 - p : p;
        this.rodBendTarget = -0.16 - this.charge * 0.26;
        this.updateIdleLine();
        const fill = document.getElementById('castFill');
        const lab = document.getElementById('castLabel');
        if (fill) fill.style.width = (this.charge * 100).toFixed(0) + '%';
        if (lab) {
          const d = 4 + this.charge * (this.rodCfg.dist - 4);
          lab.textContent = d.toFixed(0) + 'm / ' + this.rodCfg.dist + 'm';
        }
      } else {
        if (this.state === 'reel') this.updateReel(dt);
        this.updateLine();
        this.updateFishFx(dt);
      }

      // 鱼竿弯曲平滑过渡；咬钩/挣扎时的高频抖动在对应状态段直接叠加到 rod.rotation.x
      this.rodBend += (this.rodBendTarget - this.rodBend) * Math.min(1, dt * 8);
      this.rod.rotation.x = this.rodBaseX + this.rodBend;
      // 咬钩 “!” 标记跟随浮标上下跳动
      if (this.exclaim.visible) {
        this.exclaimT += dt;
        this.exclaim.position.set(
          this.bobber.position.x,
          this.waterY + 0.95 + Math.abs(Math.sin(this.exclaimT * 7)) * 0.14,
          this.bobber.position.z
        );
        this.exclaim.scale.setScalar(0.66 + Math.abs(Math.sin(this.exclaimT * 9)) * 0.08);
      }

      if (this.state === 'cast') {
        this.timer -= dt;
        const p = 1 - Math.max(0, this.timer) / 0.65;
        this.bobberPos.lerpVectors(this.castFrom, this.bobberTarget, p);
        this.bobberPos.y += Math.sin(p * Math.PI) * 2.2;
        this.bobber.position.copy(this.bobberPos);
        // 抛竿挥竿动画：后引(0~0.3) → 前甩(0.3~0.7) → 回正(0.7~1)，直接覆盖这一帧竿身角度
        let castSwing;
        if (p < 0.3) {
          castSwing = -0.55 * (p / 0.3);
        } else if (p < 0.7) {
          castSwing = -0.55 + ((p - 0.3) / 0.4) * 1.05;
        } else {
          castSwing = 0.5 * (1 - (p - 0.7) / 0.3);
        }
        this.rod.rotation.x = this.rodBaseX + this.rodBend + castSwing;
        if (this.timer <= 0) {
          this.state = 'wait';
          this.timer = (0.9 + Math.random() * 1.8) * this.rodCfg.wait;
          if (window.FX) window.FX.ripple(new THREE.Vector3(this.bobberTarget.x, this.waterY, this.bobberTarget.z));
        }
      } else if (this.state === 'wait') {
        this.timer -= dt;
        this.bobber.position.y = this.waterY + 0.02 + Math.sin(performance.now() * 0.003) * 0.03;
        if (this.timer <= 0) {
          this.state = 'bite';
          this.timer = 2.3;
          this.markerT = Math.random() * 1.2;
          // 判定区 = 鱼竿等级 × 角色特长（老渔夫 +30%）
          const charCfg = window.CHARACTERS && window.CHARACTERS[window.Economy ? window.Economy.character : 'angler'];
          const charZone = (charCfg && charCfg.zone) || 1;
          // 绿色判定区原来基础 0.22~0.34 再乘鱼竿 zone(最高3.5) 和角色(1.3)，高档竿几乎整条全绿。
          // 现在基础压到 0.13~0.19，并把鱼竿/角色的放大弱化成小幅加成，上限 0.42，
          // 普通竿约占 15%、最高配也只占 1/3 左右，咬钩时机重新有挑战。
          const zoneBase = 0.13 + Math.random() * 0.06;
          const rodZoneK = 1 + (this.rodCfg.zone - 1) * 0.22;
          const charZoneK = 1 + (charZone - 1) * 0.5;
          this.zoneWidth = Math.min(0.42, zoneBase * rodZoneK * charZoneK);
          this.zoneCenter = 0.22 + Math.random() * 0.56;
          this.zoneEl.style.left = (this.zoneCenter - this.zoneWidth / 2) * 100 + '%';
          this.zoneEl.style.width = this.zoneWidth * 100 + '%';
          this.panel.classList.remove('hidden');
          // 提前确定这条鱼（beginReel 直接复用，不再二次随机），按品质 tier 决定咬钩的猛烈程度
          const pickedInfo = this.pickFish();
          this.pickedFish = pickedInfo.picked;
          this.pickedTier = pickedInfo.tier;
          this.bitePower = 0.6 + Math.min(1.4, pickedInfo.tier * 0.16); // 普通 0.6 → 高tier 约 2
          this.biteShakeT = 0;
          // 咬钩反馈：竿尖下压（好鱼压得更猛）+ 水面 “!” 标记
          this.rodBendTarget = -0.34 - pickedInfo.tier * 0.05;
          this.exclaim.visible = true;
          this.exclaimT = 0;
          if (window.FX) {
            const bp = new THREE.Vector3(this.bobberTarget.x, this.waterY, this.bobberTarget.z);
            window.FX.ripple(bp, 0x9df3ff);
            // 好鱼水花更多，tier≥4 再补一圈大涟漪
            window.FX.sparks(new THREE.Vector3(this.bobberTarget.x, this.waterY + 0.1, this.bobberTarget.z),
              0x9df3ff, 6 + Math.round(pickedInfo.tier * 1.2));
            if (pickedInfo.tier >= 4) window.FX.ripple(bp, 0x9df3ff);
          }
          if (this.hooks.notice) {
            const big = pickedInfo.tier >= 4;
            this.hooks.notice(
              window.isTouchUI()
                ? (big ? '大家伙咬钩了！' : '有鱼咬钩！') + '<span class="gi-wrap">' + window.GI.tap + '</span>点按收杆'
                : (big ? '猛地一沉！大家伙咬钩了，按 空格 收杆' : '有鱼咬钩！按 空格 收杆'),
              'warn');
          }
          if (this.hooks.audio) this.hooks.audio('bite');
        }
      } else if (this.state === 'bite') {
        this.timer -= dt;
        this.markerT += dt * 0.95 * this.rodCfg.speed;
        const p = this.markerT % 2;
        this.marker = p > 1 ? 2 - p : p;
        this.markerEl.style.left = this.marker * 100 + '%';
        // 按咬钩力度（好鱼更强）：浮标下沉更深、抖动更快
        const power = this.bitePower || 0.6;
        this.biteShakeT += dt;
        this.bobber.position.y =
          this.waterY - 0.06 * power + Math.sin(this.timer * (8 + power * 6)) * (0.05 + power * 0.05);
        // 竿身高频抖动，好鱼抖得更凶，直接覆盖这一帧的竿身角度
        const jitter = Math.sin(this.biteShakeT * (14 + power * 8)) * 0.05 * power;
        this.rod.rotation.x = this.rodBaseX + this.rodBend + jitter;

        if (this.timer <= 0) {
          this.finish(false, '鱼吐钩跑了…');
        }
      } else if (this.state === 'result') {
        this.timer -= dt;
        if (this.timer <= 0) {
          this.cleanup();
        }
      }
    }

    strike() {
      if (this.state !== 'bite') return;
      const ok = Math.abs(this.marker - this.zoneCenter) <= this.zoneWidth / 2;
      if (ok) this.beginReel();
      else this.finish(false);
    }

    // 收线阶段按住空格（由 game.js 的 keydown/keyup 调用）
    holdReel(on) {
      this.reelHold = !!on;
    }

    showReelBar(on) {
      if (!this.reelBar) return;
      this.reelBar.classList.toggle('on', !!on);
      if (!on) {
        if (this.reelFill) this.reelFill.style.width = '0%';
        if (this.reelLabel) {
          if (window.isTouchUI()) this.reelLabel.innerHTML = '<span class="gi-wrap">' + window.GI.hold + '</span>按住收线';
          else this.reelLabel.textContent = '按住 空格 收线';
        }
      }
    }

    pickFish() {
      // 依据抛出距离筛选鱼种：抛得越远，可出现的鱼品质越高
      const table = this.seaCast ? SEA_FISH : POND_FISH;
      const castD = this.castDist || 4;
      const bait = this.baitCfg;
      const gradeOf = (f) => (window.fishGradeOf ? window.fishGradeOf(f.name) : 0);
      // 空钩只能钓到「优良」及以下（cap 1）；饵越好，天花板越高、好鱼越容易咬。
      const cap = bait ? bait.cap : 1;
      const reach = bait ? 3 : 0;          // 挂饵后能多诱到 3m 外的鱼
      let eligible = table.filter((f) => f.minD <= castD + reach);
      // 品质上限过滤：抛得再远，空钩也出不了好鱼 —— 这就是「不带饵钓不到好鱼」
      const capped = eligible.filter((f) => gradeOf(f) <= cap);
      eligible = capped.length ? capped : [table[0]];
      if (!eligible.length) eligible = [table[0]];

      // ---- 血夜：钩上得有饵，才闻得到血月里的东西 ----
      // 这一竿先决定「是不是血夜渔获」，是就完全从血夜鱼池里抽，不掺普通鱼；
      // 饵越好越容易撞上，品质越高的越靠后、权重越低。
      if (bait && window.BloodNight && window.BloodNight.active) {
        const blood = BLOOD_FISH.filter((f) => f.minD <= castD + reach);
        if (blood.length) {
          const bloodChance = Math.min(0.62, 0.24 + (bait.luck - 1) * 0.11);
          if (Math.random() < bloodChance) {
            // 基础权重按 minD 从近到远递减（越深越稀有）；
            // 好饵只是「小幅」把重心往后推，不能像之前那样把朱红裂口顶到 30%。
            const base = [40, 26, 16, 8, 3];
            const bw = blood.map((f, i) => (base[i] || 2) * (1 + (bait.luck - 1) * 0.10 * i));
            let bt = 0;
            for (let i = 0; i < bw.length; i++) bt += bw[i];
            let rb = Math.random() * bt;
            let bi = 0;
            for (let i = 0; i < bw.length; i++) { rb -= bw[i]; if (rb <= 0) { bi = i; break; } }
            const bp = blood[bi];
            const bg = window.fishGradeOf ? window.fishGradeOf(bp.name) : 0;
            return { picked: bp, tier: bg, grade: bg, blood: true };
          }
        }
      }
      // ---- 日魇：白昼被蝠影遮住时，深渊里的变异鱼顺着暗潮浮上来 ----
      // 与血夜同一套骨架：挂饵才有戏，饵越好越容易撞上；
      // 区别是白天只剩五个普通档，第六个（首领）要等「蝠群最密」+ 还没被钓走。
      if (bait && window.Daymare && window.Daymare.active) {
        const pool = DAYMARE_FISH.filter((f) => !f.boss && f.minD <= castD + reach);
        if (pool.length) {
          const dmChance = Math.min(0.58, 0.22 + (bait.luck - 1) * 0.10);
          if (Math.random() < dmChance) {
            const bossOk = window.Daymare.climax && !window.Daymare.bossed && this.seaCast;
            const boss = DAYMARE_FISH[DAYMARE_FISH.length - 1];
            // 首领概率随「蝠群密度」抬高：高潮期每竿约 12%，一场通常只出一两次机会
            if (bossOk && Math.random() < 0.12) {
              window.Daymare.bossed = true;
              return { picked: boss, tier: 6, grade: 6, daymare: true, boss: true };
            }
            const base = [42, 26, 16, 9, 4];
            const w = pool.map((f, i) => (base[i] || 3) * (1 + (bait.luck - 1) * 0.09 * i));
            let tot = 0;
            for (let i = 0; i < w.length; i++) tot += w[i];
            let r = Math.random() * tot;
            let bi = 0;
            for (let i = 0; i < w.length; i++) { r -= w[i]; if (r <= 0) { bi = i; break; } }
            const dp = pool[bi];
            const dg = window.fishGradeOf ? window.fishGradeOf(dp.name) : 3;
            return { picked: dp, tier: dg, grade: dg, daymare: true };
          }
        }
      }
      // 高 tier 权重随距离上升（幸运星角色进一步放大），距离越远越容易出好鱼；
      // 鱼饵再按品种把「越靠后（品质越高）」的那几条额外加权，饵越好越明显。
      const charCfg = window.CHARACTERS && window.CHARACTERS[window.Economy ? window.Economy.character : 'angler'];
      const luck = (charCfg && charCfg.luck) || 1;
      const bias = (0.4 + castD / 25) * luck;
      const baitLuck = bait ? bait.luck : 1;
      const nE = eligible.length;
      const weights = eligible.map((f, i) =>
        (1 + i * bias) * Math.pow(baitLuck, nE > 1 ? (i / (nE - 1)) * 1.6 : 0));
      let total = 0;
      for (let i = 0; i < eligible.length; i++) total += weights[i];
      let roll = Math.random() * total;
      let idx = 0;
      for (let i = 0; i < eligible.length; i++) { roll -= weights[i]; if (roll <= 0) { idx = i; break; } }
      const picked = eligible[idx];
      // tier 直接用鱼种分級（0..9），背包与提示都按这个显示
      const gd = window.fishGradeOf ? window.fishGradeOf(picked.name) : 0;
      return { picked, tier: gd, grade: gd };
    }

    // 咬钩判定成功：鱼挂在线上，进入拉扯阶段
    beginReel() {
      this.state = 'reel';
      this.timer = 0;
      this.panel.classList.add('hidden');
      this.exclaim.visible = false;
      this.reelProgress = 0;
      this.reelHold = false;
      this.reelTime = 0;
      this.reelStruggleT = 0.7 + Math.random() * 0.8;
      this.reelPanic = 0;
      // 首领战状态：张力 / 阶段 / 破防阶段的停手计时
      this.bossTension = 0.12;
      this.bossPhase = -1;
      this.bossMaxPhase = -1;
      this.bossIdle = 0;
      this._bossPrevHold = false;

      // 复用咬钩进入时已确定的鱼；若没有（异常兜底）才重新 pick，避免两次随机
      if (!this.pickedFish) {
        const info = this.pickFish();
        this.pickedFish = info.picked;
        this.pickedTier = info.tier;
      }
      const picked = this.pickedFish, tier = this.pickedTier;

      const bob = this.bobberTarget;
      this.bobber.position.set(bob.x, this.waterY - 0.06, bob.z);
      if (this.fishModel) {
        this.scene.remove(this.fishModel.group);
        this.fishModel.dispose();
      }
      this.fishModel = new window.FishModel(picked.name);
      this.scene.add(this.fishModel.group);
      this.fishModel.group.position.copy(this.bobber.position);
      this.fishModel.group.rotation.set(0, 0, 0);
      this.fishModel.group.visible = true;
      this.fishActive = true;
      this.fishMode = 'reelHold';
      this.rodBendTarget = 0.44;
      this.showReelBar(true);

      if (window.FX) {
        window.FX.ripple(new THREE.Vector3(bob.x, this.waterY, bob.z), 0x9df3ff);
        window.FX.sparks(new THREE.Vector3(bob.x, this.waterY + 0.1, bob.z), 0x9df3ff, 8);
      }
      if (this.hooks.notice) {
        if (picked.boss) {
          this.hooks.notice('日魇之核咬钩了！三阶段：按住拉扯 → 松紧僵持 → 连点破防。张力满了就断线', 'bad');
        } else {
          this.hooks.notice(
            window.isTouchUI()
              ? '鱼咬实了！<span class="gi-wrap">' + window.GI.hold + '</span>按住收线拖上岸（松手回退）'
              : '鱼咬实了！按住 空格 把鱼拖上岸（松手会回退）',
            'warn');
        }
      }
      if (this.hooks.audio) this.hooks.audio('bite');
    }

    // 鱼挣扎时绷断鱼线：短线消失 + 火花 + 鱼逃走
    snapLine() {
      this.lineSnapT = 1.6;
      this.reelHold = false;
      const tip = this.getRodTip();
      if (window.FX) {
        window.FX.sparks(tip, 0xffe0a0, 12);
        window.FX.ripple(new THREE.Vector3(
          this.bobber.position.x, this.waterY, this.bobber.position.z
        ), 0xffe6b0);
      }
      this.lineSegs.forEach((s) => { s.visible = false; });
      this.finish(false, '鱼线被绷断了！鱼带着鱼钩跑进水里…');
    }

    updateReel(dt) {
      // 首领鱼走自己的三阶段：拉扯 → 僵持 → 破防，张力满了直接断线
      if (this.pickedFish && this.pickedFish.boss) { this.updateBossReel(dt); return; }
      this.reelTime += dt;
      // 鱼的蛮力：随品质 tier 增大，决定收线快慢、挣扎频率、松手回退力度（普通1 → 神域约2.26）
      const tier = this.pickedTier || 0;
      const fishPower = 1 + tier * 0.14;
      this.reelStruggleT -= dt;
      if (this.reelStruggleT <= 0) {
        // 鱼挣扎：短暂发力，收线变慢、竿尖下压；好鱼挣扎更频繁；此刻有概率绷断鱼线
        this.reelStruggleT = (0.8 + Math.random() * 1.0) / fishPower;
        this.reelPanic = 1;
        this.rodBendTarget = 0.66 + tier * 0.05;
        const snapChance = 0.10 + this.reelProgress * 0.12;
        if (this.fishActive && this.reelProgress < 0.92 && Math.random() < snapChance) {
          this.snapLine();
          return;
        }
        if (window.FX && this.fishActive) {
          window.FX.ripple(new THREE.Vector3(
            this.fishModel.group.position.x, this.waterY, this.fishModel.group.position.z
          ), 0x9df3ff);
        }
      }
      // 好鱼发力持续更久，panic 衰减更慢
      this.reelPanic = Math.max(0, this.reelPanic - dt * (2.4 / fishPower));

      let rate = this.reelHold
        ? (0.32 / fishPower) - this.reelPanic * (0.2 + tier * 0.012)
        : -0.18 * fishPower; // 松手时好鱼拽得更凶，进度掉得更快
      // 体力耗尽：没力气主动收线，进度爬得极慢（去打鸟回体力再来）
      if (this.reelHold && this.player.stamina <= 0) rate = 0.05;
      this.reelProgress += rate * dt;
      this.reelProgress = Math.max(0, Math.min(1, this.reelProgress));

      // 鱼沿鱼线从浮标被拖向岸边
      if (this.fishActive) {
        const g = this.fishModel.group;
        const bobX = this.bobberTarget.x, bobZ = this.bobberTarget.z;
        const fwdX = -Math.sin(this.player.yaw), fwdZ = -Math.cos(this.player.yaw);
        const landX = this.player.pos.x + fwdX * 1.15;
        const landZ = this.player.pos.z + fwdZ * 1.15;
        const p = this.reelProgress;
        const sideX = -fwdZ, sideZ = fwdX;
        const wiggle = Math.sin(this.reelTime * 13 + this.reelPanic * 4) * (0.28 - p * 0.16);
        g.position.set(
          bobX + (landX - bobX) * p + sideX * wiggle,
          this.waterY + 0.02 + Math.sin(this.reelTime * 9) * 0.06 + p * 0.16,
          bobZ + (landZ - bobZ) * p + sideZ * wiggle
        );
        const faceDir = Math.atan2(this.player.pos.x - g.position.x, this.player.pos.z - g.position.z);
        g.rotation.y = faceDir + (this.reelPanic > 0.4 ? Math.sin(this.reelTime * 18) * 0.5 : 0);
        this.fishModel.animate(dt, this.reelPanic > 0.4 ? 3.2 : 1.4);
        // 挣扎发力时竿身跟着猛抖，强化"它在拼命拽"的手感
        if (this.reelPanic > 0.3) {
          this.rod.rotation.x = this.rodBaseX + this.rodBend +
            Math.sin(this.reelTime * 22) * 0.05 * this.reelPanic;
        }
      }

      if (this.reelFill) this.reelFill.style.width = (this.reelProgress * 100).toFixed(0) + '%';
      if (this.reelLabel) {
        this.reelLabel.textContent = (this.reelHold ? '收线中' : '松手回退') +
          ' · ' + Math.round(this.reelProgress * 100) + '%';
      }

      // 海边钓鱼：相机跟随鱼线上的鱼
      if (this.seaCast && this.fishActive) {
        const g = this.fishModel.group;
        const dx = g.position.x - this.player.pos.x;
        const dz = g.position.z - this.player.pos.z;
        const dist = Math.max(0.8, Math.hypot(dx, dz));
        const targetYaw = Math.atan2(-dx, -dz);
        let dyaw = targetYaw - this.player.yaw;
        dyaw = Math.atan2(Math.sin(dyaw), Math.cos(dyaw));
        this.player.yaw += dyaw * Math.min(1, dt * 3.2);
        const eyeY = this.player.pos.y + (this.player.eyeHeight || 1.66);
        let targetPitch = Math.atan2(g.position.y - eyeY, dist);
        targetPitch = Math.max(-0.9, Math.min(-0.08, targetPitch));
        this.player.pitch += (targetPitch - this.player.pitch) * Math.min(1, dt * 3.2);
        this.player.applyCamera(0, 0);
      }

      if (this.reelProgress >= 1) {
        this.completeCatch();
      } else if (this.reelTime > 32) {
        this.finish(false, '鱼挣扎太久，脱钩跑了…');
      }
    }

    // ---------- 首领鱼：三段式博弈 ----------
    // 0 拉扯：它还只是「很重」，按住收线、松手回退，张力持续上涨
    // 1 僵持：它开始反向发力，张力涨得更快，必须学会「松一松再收」
    // 2 破防：它力竭露出空档，改为连点蓄力，只在按住的那一下才推进度
    // 张力满 = 断线（这条鱼当场跑掉，且这一场的首领不会再出现）
    updateBossReel(dt) {
      this.reelTime += dt;
      const PH = ['拉扯', '僵持', '破防'];
      const HOLD_RATE = [0.22, 0.16, 0.0];
      const TENSION_UP = [0.19, 0.28, 0.0];

      // 按住/松手的边沿：破防阶段靠「点」不靠「按」
      const pressed = !!this.reelHold;
      const edge = pressed && !this._bossPrevHold;
      this._bossPrevHold = pressed;

      const phase = this.reelProgress < 0.34 ? 0 : (this.reelProgress < 0.70 ? 1 : 2);
      if (phase !== this.bossPhase) {
        const advancing = phase > (this.bossMaxPhase == null ? -1 : this.bossMaxPhase);
        this.bossPhase = phase;
        this.bossMaxPhase = Math.max(this.bossMaxPhase == null ? -1 : this.bossMaxPhase, phase);
        if (advancing && this.hooks.notice) {
          this.hooks.notice(
            phase === 1 ? '它开始往回拽了 —— 按住会崩，松手会退，学会找节奏'
              : (window.isTouchUI()
                  ? '它力竭了！<span class="gi-wrap">' + window.GI.tap + '</span>连点破防，别停'
                  : '它力竭了！连点 空格 破防，别停'),
            phase === 1 ? 'warn' : 'good');
        }
        if (window.FX) window.FX.sparks(this.getRodTip(), phase === 1 ? 0xffb066 : 0xffe6a0, 10);
      }

      if (phase < 2) {
        let rate = pressed ? HOLD_RATE[phase] : -0.12;
        // 体力见底收不动线，但张力照样涨 —— 打鸟回体力再来
        if (pressed && this.player.stamina <= 0) rate = 0.03;
        this.reelProgress += rate * dt;
        this.bossTension += (pressed ? TENSION_UP[phase] : -0.36) * dt;
      } else {
        // 破防：每点一下涨一小截，停手就开始滑回去
        this.bossIdle += dt;
        this.reelProgress -= 0.05 * dt;
        this.bossTension -= 0.30 * dt;
        if (edge) {
          this.reelProgress += 0.058;
          this.bossTension += 0.011;
          this.bossIdle = 0;
          if (this.hooks.audio) this.hooks.audio('bite');
          if (window.FX) window.FX.sparks(this.getRodTip(), 0xffe2a8, 3);
        }
      }
      this.reelProgress = Math.max(0, Math.min(1, this.reelProgress));
      this.bossTension = Math.max(0, Math.min(1.15, this.bossTension));

      // 张力满：断线
      if (this.bossTension >= 1) {
        this.bossTension = 1;
        if (this.hooks.notice) this.hooks.notice('张力拉满 —— 啪！鱼线断了，它拖着半边鱼鳍沉回暗潮里', 'bad');
        this.snapLine();
        return;
      }
      // 破防阶段停手太久：它缓过来了
      if (phase === 2 && this.bossIdle > 1.6) {
        this.bossTension += 0.5 * dt;
      }

      // 鱼体沿鱼线被拖向岸边（与普通鱼同一套位移，速度更慢）
      if (this.fishActive) {
        const g = this.fishModel.group;
        const bobX = this.bobberTarget.x, bobZ = this.bobberTarget.z;
        const fwdX = -Math.sin(this.player.yaw), fwdZ = -Math.cos(this.player.yaw);
        const landX = this.player.pos.x + fwdX * 1.15;
        const landZ = this.player.pos.z + fwdZ * 1.15;
        const p = this.reelProgress;
        const sideX = -fwdZ, sideZ = fwdX;
        const wiggle = Math.sin(this.reelTime * 9 + this.bossTension * 5) * (0.42 - p * 0.22);
        g.position.set(
          bobX + (landX - bobX) * p + sideX * wiggle,
          this.waterY + Math.sin(this.reelTime * 7) * 0.10 + p * 0.2,
          bobZ + (landZ - bobZ) * p + sideZ * wiggle
        );
        const faceDir = Math.atan2(this.player.pos.x - g.position.x, this.player.pos.z - g.position.z);
        g.rotation.y = faceDir;
        this.fishModel.animate(dt, 1.4 + this.bossTension * 2.4);
        this.rod.rotation.x = this.rodBaseX + this.rodBend + Math.sin(this.reelTime * 18) * 0.06 * this.bossTension;
      }

      if (this.reelFill) {
        this.reelFill.style.width = (this.reelProgress * 100).toFixed(0) + '%';
        // 张力越高，进度条越红 —— 不用额外做一条张力条，玩家也能感到「快崩了」
        const t = this.bossTension;
        this.reelFill.style.background = t > 0.55
          ? 'linear-gradient(90deg,#ffb35c,#ff4a3a)'
          : 'linear-gradient(90deg,#8fe1ff,#4fc3f7)';
      }
      if (this.reelLabel) {
        this.reelLabel.textContent = '首领 · ' + PH[phase] + ' ' + (phase + 1) + '/3 · 张力 ' +
          Math.round(this.bossTension * 100) + '%' +
          (phase === 2 ? (this.bossIdle > 0.8 ? ' · 快点！' : ' · 连点') : '');
      }

      // 相机跟随
      if (this.seaCast && this.fishActive) {
        const g = this.fishModel.group;
        const dx = g.position.x - this.player.pos.x;
        const dz = g.position.z - this.player.pos.z;
        const dist = Math.max(0.8, Math.hypot(dx, dz));
        const targetYaw = Math.atan2(-dx, -dz);
        let dyaw = targetYaw - this.player.yaw;
        dyaw = Math.atan2(Math.sin(dyaw), Math.cos(dyaw));
        this.player.yaw += dyaw * Math.min(1, dt * 3.2);
        const eyeY = this.player.pos.y + (this.player.eyeHeight || 1.66);
        let targetPitch = Math.atan2(g.position.y - eyeY, dist);
        targetPitch = Math.max(-0.9, Math.min(-0.08, targetPitch));
        this.player.pitch += (targetPitch - this.player.pitch) * Math.min(1, dt * 3.2);
        this.player.applyCamera(0, 0);
      }

      if (this.reelProgress >= 1) this.completeCatch();
      else if (this.reelTime > 60) this.finish(false, '僵持太久，它最终还是挣脱了…');
    }

    // 收线到底：结算奖励，鱼飞进手里
    completeCatch() {
      const picked = this.pickedFish;
      if (!picked) { this.cleanup(); return; }
      this.state = 'result';
      this.timer = 2.6; // 容纳「飞进手里 0.95s + 举鱼展示约 1.3s」两段动画
      this.showReelBar(false);
      this.panel.classList.add('hidden');
      this.exclaim.visible = false;

      const castD = this.castDist || 4;
      const tier = this.pickedTier || 0;
      if (this.hooks.heal) this.hooks.heal(25);
      if (this.hooks.addAmmo) this.hooks.addAmmo(4);
      if (this.hooks.score) this.hooks.score(picked.points, picked.name);
      let bagOk = true;
      if (this.hooks.bag) {
        bagOk = this.hooks.bag({
          name: picked.name, points: picked.points, tier,
          sea: this.seaCast, dist: +castD.toFixed(1)
        }) !== false;
      }
      let extra = null;
      // 杂物走独立侧袋：主袋被鱼塞满时（鱼放生）也照样捡珍珠贝壳，
      // 之前绑在 bagOk 上，囤鱼去鱼市卖的那阵子杂物就绝迹了。
      if (this.hooks.itemRoll) extra = this.hooks.itemRoll(this.seaCast, castD);
      // 在船上钓到的鱼：直接甩到甲板上，会扑腾、也可能跳回海里
      let onDeck = false;
      if (this.world.addBoatFish && this.player.riding) {
        this.world.addBoatFish(picked.name);
        onDeck = true;
        if (window.FX) {
          const b = this.player.riding;
          window.FX.sparks(new THREE.Vector3(b.x, this.world.boatDeckY() + 0.2, b.z), 0xbfe9ff, 6);
        }
      }
      const gInfo = (window.FISH_GRADES && window.FISH_GRADES[tier]) || null;
      const gName = (gInfo && gInfo.name) || '异种';
      const tag = picked.boss ? '【日魇·神话首领】'
        : picked.daymare ? '【日魇·' + gName + '】'
          : picked.blood ? '【血夜·' + gName + '】'
            : (gInfo ? '【' + gInfo.name + '】' : '');
      if (this.hooks.notice) {
        this.hooks.notice(
          bagOk
            ? tag + '钓到' + picked.name + '！+' + picked.points + ' 分 · ' +
              (onDeck ? '已扔上甲板，小心它跳回海里' : '已放入背包')
            : '背包已满（' + (window.Economy ? window.Economy.usedSpace() : '?') + '/' +
              (window.Economy ? window.Economy.bagCapacity : '?') + '），这条鱼放生了',
          bagOk ? 'good' : 'warn'
        );
      }
      // 高等级渔获额外播一个上扬的音
      if (this.hooks.audio && tier >= 5) this.hooks.audio('catch');
      if (extra && this.hooks.notice) this.hooks.notice('还捡到了「' + extra.name + '」，已收进背包', 'info');
      if (this.hooks.audio) this.hooks.audio('catch');

      if (this.fishActive) {
        const g = this.fishModel.group;
        this.fishMode = 'haul';
        this.fishT = 0;
        this.showT = 0;          // 举鱼展示阶段计时
        this.showHold = 1.3;     // 展示停留秒数
        this.fishFrom.copy(g.position);
        const fwd = new THREE.Vector3(-Math.sin(this.player.yaw), 0, -Math.cos(this.player.yaw));
        this.fishTo.copy(this.player.pos).add(new THREE.Vector3(0, 1.1, 0)).addScaledVector(fwd, 1.0);
      }
      this.rodBendTarget = 0.5;

      if (window.FX) {
        const bob = this.bobberTarget;
        window.FX.ripple(new THREE.Vector3(bob.x, this.waterY, bob.z), 0x9df3ff);
        window.FX.sparks(new THREE.Vector3(bob.x, this.waterY + 0.1, bob.z), 0x9df3ff, 10);
      }
    }

    finish(ok, failText) {
      if (ok) { this.beginReel(); return; }
      this.state = 'result';
      this.timer = 1.15;
      this.panel.classList.add('hidden');
      this.exclaim.visible = false;
      this.showReelBar(false);

      {
        // 鱼脱钩：竿子弹回，鱼影跃出水面后扎回水里
        this.rodBendTarget = 0.12;
        if (this.fishModel) {
          this.scene.remove(this.fishModel.group);
          this.fishModel.dispose();
        }
        this.fishModel = new window.FishModel('小银鱼');
        this.scene.add(this.fishModel.group);
        this.fishModel.group.position.copy(this.bobber.position);
        this.fishModel.group.rotation.set(0, 0, 0);
        this.fishModel.group.visible = true;
        const away = new THREE.Vector3(-Math.sin(this.player.yaw), 0, -Math.cos(this.player.yaw));
        this.fishVel.copy(away).multiplyScalar(2.4);
        this.fishVel.y = 3.6;
        this.fishActive = true;
        this.fishMode = 'escape';
        if (window.FX) {
          const bp = new THREE.Vector3(this.bobber.position.x, this.waterY, this.bobber.position.z);
          window.FX.ripple(bp, 0x9df3ff);
          window.FX.sparks(bp.clone().setY(this.waterY + 0.1), 0x9df3ff, 8);
        }
        if (this.hooks.notice) this.hooks.notice(failText || '收杆时机不对，鱼跑掉了', 'bad');
        if (this.hooks.audio) this.hooks.audio('fail');
      }
    }

    updateFishFx(dt) {
      if (!this.fishActive) return;
      const g = this.fishModel.group;
      if (this.fishMode === 'reelHold') return; // 位置由 updateReel 驱动
      if (this.fishMode === 'haul') {
        // 拉鱼上岸：先快后慢沿抛物线飞向玩家，到位后进入举鱼展示
        this.fishT += dt / 0.95;
        const p = Math.min(1, this.fishT);
        const ease = p * (2 - p);
        g.position.lerpVectors(this.fishFrom, this.fishTo, ease);
        g.position.y += Math.sin(p * Math.PI) * 1.6;
        this.fishModel.tumble(dt * 1.6); // 剧烈翻滚摆尾
        if (p >= 1) {
          // 不立刻消失：举到眼前停留展示，再收进背包
          this.fishMode = 'show';
          this.showT = 0;
          g.position.copy(this.fishTo);
          g.rotation.set(0, 0, 0);
        }
      } else if (this.fishMode === 'show') {
        // 举鱼展示：鱼停在手中轻轻摆尾扑腾，showHold 秒后再收起
        this.showT += dt;
        g.position.copy(this.fishTo);
        g.position.y += Math.sin(this.showT * 3) * 0.03;
        if (this.fishModel.tail) this.fishModel.tail.rotation.y = Math.sin(this.showT * 9) * 0.5;
        g.rotation.z = Math.sin(this.showT * 5) * 0.08;
        if (this.showT >= (this.showHold || 1.3)) {
          g.visible = false;
          this.fishActive = false;
          this.fishMode = 'idle';
          this.rodBendTarget = 0;
        }
      } else {
        // 脱钩：鱼影抛物线跃出，扎回水中溅起涟漪
        this.fishVel.y -= 9 * dt;
        g.position.addScaledVector(this.fishVel, dt);
        this.fishModel.tumble(dt);
        if (g.position.y < this.waterY - 0.3) {
          if (window.FX) {
            window.FX.ripple(new THREE.Vector3(g.position.x, this.waterY, g.position.z), 0x9df3ff);
          }
          g.visible = false;
          this.fishActive = false;
          this.fishMode = 'idle';
          this.rodBendTarget = 0;
        }
      }
    }

    updateLine() {
      if (this.lineSnapT > 0 || (!this.rod.visible && !this.rodOwned && !this.busy)) {
        this.lineSegs.forEach((s) => { s.visible = false; });
        this.hook.visible = false;
        return;
      }
      // 举鱼展示时鱼已在手里，松开的鱼线藏掉，避免还连着远处浮标
      if (this.fishMode === 'show') {
        this.lineSegs.forEach((s) => { s.visible = false; });
        this.hook.visible = false;
        return;
      }
      const tip = this.getRodTip();
      // 拉鱼阶段鱼线绷紧指向鱼，其余时间垂向浮标
      const reel = this.fishActive && (this.fishMode === 'reelHold' || this.fishMode === 'haul');
      const end = reel ? this.fishModel.group.position : this.bobber.position;
      // 抛竿飞行中把松弛收到很小：线要跟着浮标一起"甩"出去，
      // 否则浮标飞了、线还挂着一大坨弧，看着像两根东西。
      const casting = (this.state === 'cast');
      this.layoutLine(end, reel ? 0.18 : (casting ? 0.06 : 0.9));
      // 鱼钩跟着末端走（拉鱼时随鱼，其余随浮标）
      this.hook.visible = true;
      this.hook.position.copy(end);
      this.hook.rotation.set(0, 0, 0);
    }

    // 收竿/手持状态：从竿尖垂下一段短线，让鱼线始终看得见
    // 取某点的地面/支撑面高度（用于把闲置鱼线钳在地面之上，避免穿模）
    groundYAt(x, z) {
      if (this.world && this.world.surfaceHeight) {
        return this.world.surfaceHeight(x, z, this.player.pos.y, false);
      }
      if (this.world && this.world.heightAt) return this.world.heightAt(x, z);
      return 0;
    }

    updateIdleLine() {
      if (this.lineSnapT > 0 || !this.rod.visible) {
        this.lineSegs.forEach((s) => { s.visible = false; });
        return;
      }
      const tip = this.getRodTip();
      // 垂线长度按竿尖下方实际支撑面裁剪，避免站在斜坡/石头上时线插进地里
      const drop = Math.min(1.15, Math.max(0.16, tip.y - this.groundYAt(tip.x, tip.z) - 0.06));
      const end = tip.clone();
      end.y -= drop;
      // clampGround：逐点钳到地面之上，下垂弧也不会穿地；闲置垂线 sag 收小
      this.layoutLine(end, Math.min(0.12, 0.08 + drop * 0.1), true);
      // 鱼钩挂在垂线末端
      this.hook.visible = true;
      this.hook.position.copy(end);
      this.hook.rotation.set(0, 0, 0);
    }

    layoutLine(end, sag, clampGround) {
      const tip = this.getRodTip();
      const n = this.lineSegs.length;
      const pts = [];
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        const p = tip.clone().lerp(end, t);
        p.y -= Math.sin(t * Math.PI) * sag;
        if (clampGround) {
          // 每个点都不低于其 x,z 处的地面（留 3cm 缝隙），下垂弧和斜坡都不会插进地里
          p.y = Math.max(p.y, this.groundYAt(p.x, p.z) + 0.03);
        }
        pts.push(p);
      }
      const up = new THREE.Vector3(0, 1, 0);
      const dir = new THREE.Vector3();
      for (let i = 0; i < n; i++) {
        const seg = this.lineSegs[i];
        const a = pts[i], b = pts[i + 1];
        dir.subVectors(b, a);
        const len = dir.length();
        seg.visible = len > 1e-4;
        if (!seg.visible) continue;
        seg.position.copy(a).addScaledVector(dir, 0.5);
        seg.quaternion.setFromUnitVectors(up, dir.normalize());
        seg.scale.set(1, len, 1);
      }
    }

    cancel(text) {
      if (!this.busy) return;
      if (text && this.hooks.notice) this.hooks.notice(text, 'bad');
      this.cleanup();
      this.cooldown = 0.8;
    }

    cleanup() {
      this.state = 'idle';
      this.bobber.visible = false;
      this.lineSegs.forEach((s) => { s.visible = false; });
      this.hook.visible = false;
      this.setRodVisible(!!this.rodOwned);
      this.panel.classList.add('hidden');
      this.exclaim.visible = false;
      this.showChargeBar(false);
      this.rodBendTarget = 0;
      this.fishMode = 'idle';
      this.reelHold = false;
      this.reelProgress = 0;
      if (this.fishModel) this.fishModel.group.visible = false;
      this.fishActive = false;
      this.showReelBar(false);
      this.player.frozen = false;
      this.cooldown = Math.max(this.cooldown, 1.1);
      if (window.FX) window.FX.clear();
    }

    reset() {
      this.state = 'idle';
      this.timer = 0;
      this.cooldown = 0;
      this.chargeT = 0;
      this.charge = 0;
      this.baitCfg = null;
      this.rod.visible = false;
      this.bobber.visible = false;
      this.lineSegs.forEach((s) => { s.visible = false; });
      this.hook.visible = false;
      this.showChargeBar(false);
      this.exclaim.visible = false;
      this.rodBendTarget = 0;
      this.rodBend = 0;
      this.fishMode = 'idle';
      this.fishModel.group.visible = false;
      this.fishActive = false;
      this.reelHold = false;
      this.reelProgress = 0;
      this.showReelBar(false);
      this.panel.classList.add('hidden');
      this.player.frozen = false;
    }
  }

  window.Fishing = Fishing;
})();
