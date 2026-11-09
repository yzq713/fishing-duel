/* 主循环：场景、输入、战斗判定、HUD 与回合状态 */
(function () {
  const THREE = window.THREE;

  // 米白卡片上的品质文字色：把品质色压暗到 55%，既保色相又读得清。
  const inkOf = (c) => {
    const n = parseInt(String(c).replace('#', ''), 16) || 0;
    const r = Math.round(((n >> 16) & 255) * 0.55);
    const g = Math.round(((n >> 8) & 255) * 0.55);
    const b = Math.round((n & 255) * 0.55);
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  };

  // ---------------- 音效 ----------------
  const Sound = {
    ctx: null,
    master: null,
    noiseBuf: null,

    init() {
      if (this.ctx) {
        if (this.ctx.state === 'suspended') this.ctx.resume();
        return;
      }
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      this.ctx = new Ctx();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.32;
      this.master.connect(this.ctx.destination);

      const len = this.ctx.sampleRate * 1.0;
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      this.noiseBuf = buf;
    },

    // 首次开枪的卡顿不止着色器：AudioContext 刚建好时只是「对象就绪」，
    // Windows 上的输出设备一般要等第一个声音真正提交才启动，那一下
    // 能卡 80~200ms。这里用增益为 0 的极小一段，把
    // 振荡器 / 噪声源 / 低通 / 立体声声像 / 总线 整条链路先跑一遍。
    warm() {
      if (!this.ctx) this.init();
      if (!this.ctx) return;
      if (this.ctx.state === 'suspended') this.ctx.resume();
      const t = this.ctx.currentTime;
      const G = 0.0007;
      try {
        this.noise(0.03, G, 2400, t);
        this.tone(120, 0.03, 'sawtooth', G, t, 60);
        this.tone(900, 0.02, 'square', G, t);
        this.tone(58, 0.03, 'sine', G, t);
      } catch (e) { /* 静音策略下个别浏览器会抛错 */ }
      // 定位播放那条链路（增益 + 低通 + 声像）也建一次，但增益压到 0
      try {
        const bus = this.ctx.createGain();
        bus.gain.value = 0;
        const lp = this.ctx.createBiquadFilter();
        lp.frequency.value = 1200;
        bus.connect(lp);
        let node = lp;
        if (this.ctx.createStereoPanner) {
          const pn = this.ctx.createStereoPanner();
          pn.pan.value = 0;
          node.connect(pn);
          node = pn;
        }
        node.connect(this.master);
        const src = this.ctx.createBufferSource();
        src.buffer = this.noiseBuf;
        src.connect(bus);
        src.start(t);
        src.stop(t + 0.02);
      } catch (e) { /* ignore */ }
    },

    tone(freq, dur, type, vol, when, slideTo) {
      if (!this.ctx) return;
      const t = when || this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = type || 'sine';
      osc.frequency.setValueAtTime(freq, t);
      if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      osc.connect(g);
      g.connect(this._dest || this.master);
      osc.start(t);
      osc.stop(t + dur + 0.03);
    },

    noise(dur, vol, cutoff, when) {
      if (!this.ctx) return;
      const t = when || this.ctx.currentTime;
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuf;
      const f = this.ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = cutoff || 2000;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      src.connect(f);
      f.connect(g);
      g.connect(this._dest || this.master);
      src.start(t);
      src.stop(t + dur + 0.02);
    },

    play(name, dest) {
      if (!this.ctx) return;
      this._dest = dest || null;
      const now = this.ctx.currentTime;
      switch (name) {
        case 'shot':
          this.noise(0.1, 0.75, 2600, now);
          this.tone(160, 0.09, 'sawtooth', 0.3, now, 55);
          break;
        case 'shot_smg':
          this.noise(0.055, 0.6, 3200, now);
          this.tone(210, 0.05, 'square', 0.2, now, 95);
          break;
        case 'shot_rifle':
          this.noise(0.1, 0.78, 2600, now);
          this.tone(160, 0.09, 'sawtooth', 0.3, now, 55);
          break;
        case 'shot_sniper':
          this.noise(0.22, 0.95, 1500, now);
          this.tone(96, 0.22, 'sawtooth', 0.42, now, 38);
          break;
        case 'shot_shotgun':
          this.noise(0.2, 0.9, 900, now);
          this.tone(72, 0.26, 'sawtooth', 0.45, now, 34);
          break;
        case 'shot_lmg':
          this.noise(0.1, 0.82, 2100, now);
          this.tone(180, 0.08, 'square', 0.26, now, 60);
          break;
        case 'shot_pistol':
          this.noise(0.07, 0.55, 3000, now);
          this.tone(240, 0.06, 'square', 0.18, now, 110);
          break;
        case 'shot_revolver':
          this.noise(0.16, 0.85, 1700, now);
          this.tone(110, 0.16, 'sawtooth', 0.36, now, 46);
          break;
        case 'shot_db':
          this.noise(0.26, 0.95, 780, now);
          this.tone(62, 0.3, 'sawtooth', 0.5, now, 30);
          break;
        case 'shot_dmr':
          this.noise(0.13, 0.8, 2200, now);
          this.tone(140, 0.12, 'sawtooth', 0.32, now, 52);
          break;
        case 'shot_minigun':
          this.noise(0.045, 0.55, 3400, now);
          this.tone(190, 0.04, 'square', 0.15, now, 100);
          break;
        case 'shot_amr':
          this.noise(0.3, 1.0, 1100, now);
          this.tone(80, 0.34, 'sawtooth', 0.5, now, 30);
          break;
        case 'shot_railgun':
          this.tone(1200, 0.05, 'square', 0.2, now, 300);
          this.tone(220, 0.3, 'sawtooth', 0.35, now + 0.02, 60);
          this.noise(0.18, 0.5, 5200, now);
          break;
        case 'punch':
          this.noise(0.09, 0.4, 520, now);
          this.tone(120, 0.08, 'triangle', 0.2, now, 70);
          break;
        case 'headshot':
          this.tone(1500, 0.06, 'square', 0.28, now);
          this.tone(980, 0.09, 'square', 0.18, now + 0.03);
          break;
        case 'kill':
          this.tone(660, 0.12, 'sine', 0.22, now);
          this.tone(880, 0.14, 'sine', 0.22, now + 0.1);
          this.tone(1200, 0.22, 'sine', 0.2, now + 0.2);
          break;
        case 'step':
          this.noise(0.045, 0.14, 760, now);
          break;
        case 'land':
          this.noise(0.1, 0.28, 500, now);
          this.tone(85, 0.08, 'triangle', 0.15, now, 60);
          break;
        case 'heartbeat':
          this.tone(62, 0.1, 'sine', 0.2, now);
          this.tone(58, 0.12, 'sine', 0.16, now + 0.16);
          break;
        case 'swap':
          this.tone(520, 0.03, 'square', 0.1, now);
          this.tone(360, 0.04, 'square', 0.08, now + 0.06);
          break;
        case 'enemyShot':
          this.noise(0.08, 0.35, 1600, now);
          this.tone(120, 0.08, 'square', 0.16, now, 60);
          break;
        case 'hit':
          this.tone(1180, 0.05, 'square', 0.18, now);
          break;
        case 'hurt':
          this.noise(0.16, 0.4, 700, now);
          this.tone(95, 0.18, 'sawtooth', 0.25, now, 45);
          break;
        case 'reload':
          this.tone(320, 0.035, 'square', 0.12, now);
          this.tone(240, 0.04, 'square', 0.12, now + 0.32);
          break;
        case 'bite':
          this.tone(880, 0.1, 'sine', 0.2, now);
          this.tone(1320, 0.08, 'sine', 0.12, now + 0.09);
          break;
        // 心跳：日魇期间的闷响，低频两下（"咚—咚"）
        case 'heartbeat':
          this.tone(54, 0.19, 'sine', 0.40, now, 34);
          this.tone(48, 0.15, 'sine', 0.26, now + 0.19, 30);
          break;
        // 单次振翅（钓鱼/抓起时的近距离"扑"）
        case 'flutter':
          this.noise(0.16, 0.14, 1500, now);
          break;
        case 'catch':
          this.tone(523, 0.13, 'sine', 0.2, now);
          this.tone(659, 0.13, 'sine', 0.2, now + 0.1);
          this.tone(784, 0.2, 'sine', 0.2, now + 0.2);
          break;
        case 'fail':
          this.tone(300, 0.16, 'sine', 0.16, now, 170);
          break;
        case 'win':
          this.tone(523, 0.15, 'sine', 0.2, now);
          this.tone(659, 0.15, 'sine', 0.2, now + 0.13);
          this.tone(784, 0.15, 'sine', 0.2, now + 0.26);
          this.tone(1046, 0.3, 'sine', 0.2, now + 0.39);
          break;
        case 'lose':
          this.tone(220, 0.4, 'sawtooth', 0.2, now, 90);
          break;

        // ---- 弹壳落地：黄铜小圆筒的两声脆响 ----
        case 'shell':
          this.tone(3200 + Math.random() * 900, 0.035, 'sine', 0.05, now, 2600);
          this.tone(2100 + Math.random() * 500, 0.05, 'sine', 0.03, now + 0.02, 1700);
          break;
        // ---- 命中分层：血肉 / 金属 / 木头 / 泥土 ----
        case 'hit_flesh':
          this.noise(0.075, 0.5, 620, now);
          this.tone(148, 0.075, 'triangle', 0.22, now, 74);
          break;
        case 'hit_metal':
          this.tone(2400, 0.055, 'square', 0.16, now, 1500);
          this.tone(3650, 0.09, 'sine', 0.12, now + 0.008, 2900);
          this.noise(0.05, 0.28, 5200, now);
          break;
        case 'hit_wood':
          this.noise(0.085, 0.42, 1150, now);
          this.tone(232, 0.07, 'triangle', 0.16, now, 140);
          break;
        case 'hit_ground':
          this.noise(0.07, 0.3, 800, now);
          this.tone(120, 0.06, 'triangle', 0.1, now, 70);
          break;
        // ---- 子弹擦过耳边 ----
        case 'whiz':
          this.tone(2100, 0.11, 'sawtooth', 0.12, now, 620);
          this.noise(0.09, 0.2, 3400, now);
          break;
        // ---- 击倒确认：低频冲击 + 上行金属铃 + 尾巴 ----
        case 'kill_confirm':
          this.noise(0.2, 0.62, 480, now);
          this.tone(64, 0.26, 'sine', 0.4, now, 38);
          this.tone(880, 0.1, 'square', 0.14, now + 0.02);
          this.tone(1320, 0.13, 'sine', 0.16, now + 0.09);
          this.tone(1760, 0.3, 'sine', 0.1, now + 0.17, 1980);
          break;
        // ---- 敌人脚步（远处闷） ----
        case 'step_enemy':
          this.noise(0.06, 0.22, 480, now);
          this.tone(84, 0.05, 'triangle', 0.1, now, 58);
          break;
        // ---- 连杀宣告 ----
        case 'multikill':
          this.tone(660, 0.1, 'square', 0.16, now);
          this.tone(990, 0.1, 'square', 0.14, now + 0.08);
          this.tone(1320, 0.22, 'sine', 0.14, now + 0.16, 1480);
          break;
        // ---- 落水 ----
        case 'splash':
          this.noise(0.34, 0.75, 900, now);
          this.noise(0.5, 0.4, 420, now + 0.03);
          this.tone(150, 0.22, 'sine', 0.14, now, 70);
          break;
        // ---- 海鸥叫：两声下滑的沙哑啼叫 ----
        case 'gull':
          this.tone(1180, 0.13, 'sawtooth', 0.13, now, 720);
          this.tone(1560, 0.07, 'triangle', 0.07, now + 0.01, 980);
          this.noise(0.13, 0.13, 2600, now);
          this.tone(1080, 0.16, 'sawtooth', 0.11, now + 0.24, 610);
          this.tone(1420, 0.08, 'triangle', 0.06, now + 0.25, 900);
          break;
      }
      this._dest = null;
    },

    // ---------------- 3D 定位播放 ----------------
    // 没有距离 HUD 之后，方位与远近全靠这套：距离衰减 + 左右声像 + 远处低通。
    listener: { pos: { x: 0, y: 0, z: 0 }, yaw: 0 },

    setListener(pos, yaw) {
      this.listener.pos.x = pos.x;
      this.listener.pos.y = pos.y;
      this.listener.pos.z = pos.z;
      this.listener.yaw = yaw;
    },

    playAt(name, pos, opts) {
      if (!this.ctx) return;
      const o = opts || {};
      const L = this.listener;
      const dx = pos.x - L.pos.x;
      const dy = pos.y - L.pos.y;
      const dz = pos.z - L.pos.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (dist > (o.maxDist || 58)) return;

      // 距离衰减：近处几乎不衰减，远处快速变轻
      let vol = 1 / (1 + Math.max(0, dist - 1.5) * (o.falloff || 0.085));
      if (o.vol != null) vol *= o.vol;

      // 左/右：听者右向量 = (cos yaw, -sin yaw)
      const rx = Math.cos(L.yaw);
      const rz = -Math.sin(L.yaw);
      let pan = 0;
      if (dist > 0.5) pan = Math.max(-1, Math.min(1, ((dx * rx + dz * rz) / dist) * 0.85));

      // 前后：声音从背后来时压掉高频，方向更好分辨
      const fx = -Math.sin(L.yaw);
      const fz = -Math.cos(L.yaw);
      const front = dist > 0.5 ? (dx * fx + dz * fz) / dist : 1;

      const bus = this.ctx.createGain();
      bus.gain.value = Math.max(0.02, vol);
      let node = bus;

      if (this.ctx.createBiquadFilter) {
        const lp = this.ctx.createBiquadFilter();
        lp.type = 'lowpass';
        // 远处 + 背后 → 高频更少
        const openness = Math.max(0.12, 1 - dist / 60);
        lp.frequency.value = 900 + openness * 9000 * (0.55 + 0.45 * Math.max(0, front));
        node.connect(lp);
        node = lp;
      }
      if (this.ctx.createStereoPanner) {
        const panner = this.ctx.createStereoPanner();
        panner.pan.value = pan;
        node.connect(panner);
        node = panner;
      }
      node.connect(this.master);
      this.play(name, bus);
    },

    // 日魇底噪：一段被方波 LFO 剁碎的窄带噪声 = 密集的「扑扑」振翅声。
    // 白天原本只有海浪和鸟叫，事件一开就换成这层 + 心跳，反差才够。
    daymareBed: null,
    daymare(on) {
      if (!this.ctx) return;
      if (on && !this.daymareBed) {
        const src = this.ctx.createBufferSource();
        src.buffer = this.noiseBuf;
        src.loop = true;
        const bp = this.ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = 560;
        bp.Q.value = 0.85;
        const g = this.ctx.createGain();
        g.gain.value = 0.0;
        const lfo = this.ctx.createOscillator();
        lfo.type = 'square';
        lfo.frequency.value = 8.5;
        const amp = this.ctx.createGain();
        amp.gain.value = 0.030;
        lfo.connect(amp);
        amp.connect(g.gain);
        src.connect(bp);
        bp.connect(g);
        g.connect(this.master);
        src.start();
        lfo.start();
        this.daymareBed = { src, lfo, g };
      } else if (!on && this.daymareBed) {
        try { this.daymareBed.src.stop(); this.daymareBed.lfo.stop(); } catch (e) { /* 已停 */ }
        this.daymareBed = null;
      }
    }
  };

  // ---------------- 射线与球体 ----------------
  function raySphere(o, d, cx, cy, cz, r) {
    const ox = o.x - cx;
    const oy = o.y - cy;
    const oz = o.z - cz;
    const b = ox * d.x + oy * d.y + oz * d.z;
    const c = ox * ox + oy * oy + oz * oz - r * r;
    const disc = b * b - c;
    if (disc < 0) return null;
    const sq = Math.sqrt(disc);
    let t = -b - sq;
    if (t < 0) t = -b + sq;
    if (t < 0) return null;
    return t;
  }

  // ---------------- 渔获附赠杂物（丰富背包种类） ----------------
  const CATCH_ITEMS = [
    { name: '海藻', kind: '材料', color: 0x5f8f4a },
    { name: '贝壳', kind: '材料', color: 0xd8b48c },
    { name: '旧瓶子', kind: '杂物', color: 0x5fc9c4 },
    { name: '海玻璃', kind: '材料', color: 0x9fe8d8 },
    { name: '珍珠', kind: '珍宝', color: 0xf4eee2 }
  ];

  // ---------------- 游戏 ----------------
  class Game {
    // 用 6 张 256² 渐变 canvas 拼一个天空盒，作为 PBR 环境反射源；
    // 比 64² 版本更精细，金属/水面反射不再出现像素块状。
    makeEnvMap() {
      const faces = [];
      const S = 256;
      for (let i = 0; i < 6; i++) {
        const c = document.createElement('canvas');
        c.width = c.height = S;
        const ctx = c.getContext('2d');
        const grad = ctx.createLinearGradient(0, 0, 0, S);
        if (i === 2) {
          // +Y 顶部：晴蓝天穹
          grad.addColorStop(0.00, '#7fa4bd');
          grad.addColorStop(0.55, '#a6c3d6');
          grad.addColorStop(1.00, '#c6d6df');
        } else if (i === 3) {
          // -Y 底部：岛地 + 远处水域
          grad.addColorStop(0.00, '#56624f');
          grad.addColorStop(0.40, '#3a4639');
          grad.addColorStop(0.75, '#6a828e');
          grad.addColorStop(1.00, '#3d5361');
        } else {
          // +X/-X/+Z/-Z 侧面：太阳方向偏右上 + 地平线 + 水面反射的多层渐变
          grad.addColorStop(0.00, '#7a9ab0');
          grad.addColorStop(0.40, '#b7cfdb');
          grad.addColorStop(0.48, '#e0ebef');
          grad.addColorStop(0.52, '#d5e2e7');
          grad.addColorStop(0.56, '#a3b9c4');
          grad.addColorStop(0.60, '#6a8492');
          grad.addColorStop(0.80, '#4a6574');
          grad.addColorStop(1.00, '#3a4f5c');
        }
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, S, S);
        // 用带噪点的柔光叠加增加细节，让金属反射有内容
        ctx.globalAlpha = 0.07;
        for (let k = 0; k < 40; k++) {
          const gr = ctx.createRadialGradient(
            Math.random() * S, Math.random() * S, 0,
            Math.random() * S, Math.random() * S, 40 + Math.random() * 80
          );
          gr.addColorStop(0, '#ffffff');
          gr.addColorStop(1, 'rgba(255,255,255,0)');
          ctx.fillStyle = gr;
          ctx.beginPath();
          ctx.arc(Math.random() * S, Math.random() * S, 40 + Math.random() * 80, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
        faces.push(c);
      }
      const tex = new THREE.CubeTexture(faces);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.needsUpdate = true;
      return tex;
    }

    constructor() {
      // 老存档里可能还留着已经删掉的枪（左轮/冲锋枪/双管/精确射手/轻机枪/反器材），
      // 这里先清一遍再读 loadout，否则背包槽位会指到不存在的枪上。
      if (window.Economy && window.Economy.sanitize) window.Economy.sanitize();
      this.canvas = document.getElementById('game');
      this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true,
        // 笔记本双显卡时优先要独显，否则 Chrome 可能一直用核显跑
        powerPreference: 'high-performance' });
      // 上屏分辨率 = resScale，不再乘 devicePixelRatio。后处理链的 RT 一直是 CSS 像素尺寸，
      // canvas 撑到 DPR 倍只会让最后那次全屏 blit 多算 2.25 倍像素，画面不会更清楚。
      this.renderer.setPixelRatio(1);
      this.renderer.setSize(window.innerWidth, window.innerHeight);
      // ---------- 动态分辨率（帧率治理） ----------
      // 后处理链（bloom 5 级 mip + FXAA + 分级）全是全屏 pass，分辨率是最大的性能杠杆。
      // 帧时间 EMA 掉到 40fps 以下持续 ~1.5s 就降一档渲染比例，回升到 55fps+ 持续 ~10s 再升回来，
      // 有冷却时间防抖。玩家几乎察觉不到，弱 GPU 上能稳住 60fps。
      this.resScale = 1;
      this._resLevels = [1, 0.88, 0.75, 0.66, 0.55];
      this._emaDt = 16.7; this._slowN = 0; this._goodN = 0; this._resCooldown = 0;

      // ---------- 画质档位 ----------
      // 白天最贵的一笔是阴影贴图（4096² 里重画整座岛），其次是全屏 bloom 的 5 级 mip。
      // 按显卡分三档，首次进游戏自动判定一次，之后可在「设置」里改，存 localStorage。
      this.quality = 'mid';
      this._qualityCfg = {
        high: { shadow: 4096, start: 1, levels: [1, 0.88, 0.75, 0.66, 0.55], shadowMs: 33, bloom: true },
        // mid：bloom 只在夜间开。白天草地上没有强高光，泛光对画面几乎无贡献，
        // 却是整条后处理链里最贵的一段（实测关掉直接 +48% 帧率）。
        mid: { shadow: 2048, start: 0.9, levels: [0.9, 0.8, 0.7, 0.6, 0.5], shadowMs: 50, bloom: 'night' },
        low: { shadow: 1024, start: 0.7, levels: [0.7, 0.6, 0.5, 0.42], shadowMs: 100, bloom: false }
      };
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1.02;  // 略收曝光，保留高光层次不过曝

      this.scene = new THREE.Scene();
      // 指数雾：改用与地平线同色的淡青灰，密度从 0.0135 降到 0.0082。
      // 之前的雾把 40m 外的景物全部刷白，是「整体发灰、远景糊成一片」的第二主因。
      this.scene.fog = new THREE.FogExp2(0xd8e4dc, 0.0082);
      // PBR 环境贴图：让金属/水面产生天空反射
      this.scene.environment = this.makeEnvMap();

      this.camera = new THREE.PerspectiveCamera(78, window.innerWidth / window.innerHeight, 0.08, 420);
      this.scene.add(this.camera);

      // ---------- 后处理链 ----------
      // 1) RenderPass：把场景渲染到离屏 RT
      // 2) UnrealBloomPass：提取高亮 + 高斯模糊发光
      // 3) ShaderPass(FXAA)：基于边缘检测的抗锯齿（比普通后处理 AA 更快）
      // 4) CopyShader：输出到屏幕
      this.composer = null;
      this.bloomPass = null;
      this.fxaaPass = null;
      try {
        const W = window.innerWidth, H = window.innerHeight;
        const size = new THREE.Vector2(W, H);
        // 主 RT：和渲染器输出同分辨率，带深度
        const renderTarget = new THREE.WebGLRenderTarget(W, H, {
          minFilter: THREE.LinearFilter,
          magFilter: THREE.LinearFilter,
          format: THREE.RGBAFormat,
          colorSpace: THREE.SRGBColorSpace
        });
        renderTarget.depthBuffer = true;

        this.composer = new THREE.EffectComposer(this.renderer, renderTarget);
        this.composer.setSize(W, H);
        this.composer.addPass(new THREE.RenderPass(this.scene, this.camera));

        // Bloom：柔和泛光（强度 0.42、阈值 0.82、半径 0.75）；和 hitstop / player.bloom 动态联动
        // 半分辨率：bloom 本身是大范围模糊，降到 1/2 尺寸肉眼看不出差别，
        // 但 5 级 mip 的填充成本直接掉到 1/4（弱 GPU 上这是仅次于阴影的一笔）
        const bsize = new THREE.Vector2(Math.max(64, Math.round(W * 0.5)), Math.max(64, Math.round(H * 0.5)));
        this.bloomPass = new THREE.UnrealBloomPass(bsize, 0.34, 0.62, 0.88);
        this.bloomPass.name = 'bloom';
        this.composer.addPass(this.bloomPass);

        // 色彩分级：降饱和 + 轻微提亮 + 暖调，统一全画面为柔和莫兰迪色调
        const GradeShader = {
          uniforms: {
            tDiffuse: { value: null },
            resolution: { value: new THREE.Vector2(W, H) },
            saturation: { value: 1.06 },
            contrast: { value: 1.10 },
            lift: { value: 0.012 },
            warm: { value: new THREE.Vector3(1.035, 1.0, 0.965) },
            cool: { value: new THREE.Vector3(0.94, 0.985, 1.06) },
            splitAmt: { value: 0.55 },
            vignette: { value: 0.30 }
          },
          vertexShader:
            'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
          fragmentShader: [
            'uniform sampler2D tDiffuse; uniform vec2 resolution;',
            'uniform float saturation; uniform float contrast; uniform float lift;',
            'uniform vec3 warm; uniform vec3 cool; uniform float splitAmt; uniform float vignette;',
            'varying vec2 vUv;',
            // 快速哈希：给暗角与色阶做抖动，消除大面积天空的色带
            'float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }',
            'void main(){',
            '  vec3 c = texture2D(tDiffuse, vUv).rgb;',
            // 1) 亮度保持的饱和度调整（按相对亮度做 lerp，避免整体发灰）
            '  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));',
            '  c = mix(vec3(l), c, saturation);',
            // 2) S 形反差曲线：中间调拉开，黑白端点保持不截断
            '  c = (c - 0.5) * contrast + 0.5;',
            '  c = c + lift * (1.0 - c);',
            // 3) 分离色调：亮部偏暖、暗部偏冷，画面立刻有电影感
            '  float lum = dot(c, vec3(0.2126, 0.7152, 0.0722));',
            '  vec3 tone = mix(cool, warm, smoothstep(0.18, 0.82, lum));',
            '  c = mix(c, c * tone, splitAmt);',
            // 4) 暗角：把注意力收到画面中心
            '  vec2 d = (vUv - 0.5) * vec2(resolution.x / resolution.y, 1.0);',
            '  float vig = 1.0 - vignette * smoothstep(0.42, 1.10, length(d));',
            '  c *= vig;',
            // 5) 抖动，抹掉 8bit 色带
            '  c += (hash(vUv * resolution) - 0.5) * 0.0022;',
            '  gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);',
            '}'
          ].join('\n')
        };
        this.gradePass = new THREE.ShaderPass(GradeShader);
        this.gradePass.name = 'grade';
        this.composer.addPass(this.gradePass);

        // FXAA：后处理抗锯齿，补充 WebGL 主 AA 在高对比度边缘的不足
        this.fxaaPass = new THREE.ShaderPass(THREE.FXAAShader);
        this.fxaaPass.material.uniforms['resolution'].value.set(1 / W, 1 / H);
        this.fxaaPass.name = 'fxaa';
        this.composer.addPass(this.fxaaPass);

        // 让 FXAA pass 输出到屏幕
        const last = this.composer.passes[this.composer.passes.length - 1];
        if (last) last.renderToScreen = true;
      } catch (err) {
        // 后处理加载失败时的降级：直接 renderer.render，游戏仍可玩
        console.warn('[postprocess] 未启用，降级为直渲染：', err.message);
        this.composer = null;
      }

      this.world = window.World.create(this.scene);
      // 画质：优先用玩家在设置里选过的，没有就按显卡自动判一次
      // 先探测一次 GPU：即使存档里有画质档位也要探，因为 GPU 名称和「软件渲染」标记
      // 只在 detectQuality 里记录（软件渲染警告、帧率角标都要用）
      const autoQ = this.detectQuality();
      let q0 = autoQ;
      const qUrl = (location.search.match(/[?&]q=(high|mid|low)/) || [])[1];
      if (qUrl) q0 = qUrl;
      else {
        try {
          // 画质方案改版（档位含义变了）时丢掉旧选择，否则老存档里的
          // 'high' 会一直压着新的自动判定，玩家永远卡在旧设置上
          if (localStorage.getItem('fishingDuel.qver') !== '3') {
            localStorage.removeItem('fishingDuel.quality');
            localStorage.setItem('fishingDuel.qver', '3');
          }
          const saved = localStorage.getItem('fishingDuel.quality');
          if (saved && this._qualityCfg[saved]) q0 = saved;
        } catch (e) { /* ignore */ }
      }
      this.applyQuality(q0, false);
      // 天空环境贴图会作为 IBL 给所有 PBR 材质补光。默认强度 1.0 时相当于给
      // 每个物体都加了层柔和天光，明暗被抹平、颜色被冲淡，因此统一压到 0.45。
      this.scene.traverse((o) => {
        const m = o.material;
        if (!m || Array.isArray(m)) return;
        if ((m.isMeshStandardMaterial || m.isMeshPhysicalMaterial) && !m.userData.keepEnv) {
          m.envMapIntensity = 0.45;
        }
      });
      // 读档时把此前养在湖里的鱼重新投回湖中（按明细还原鱼种与分值；
      // 老存档只有条数没有鱼种，就用塘鱼表轮流补上名字）
      this.pondAcc = 0;
      this.pondTick = 0;
      if (window.Economy && window.Economy.pondFish.length && this.world.addPondFish) {
        const pondNames = (window.FISH_TABLE ? window.FISH_TABLE.pond : []).map((f) => f.name);
        const list = window.Economy.pondFish.slice(0, 30);
        window.Economy.pondFish = list;
        list.forEach((entry, i) => {
          if (!entry.name) entry.name = pondNames[i % pondNames.length] || '青鱼';
          // 老存档没有 tier，按鱼名补一次品质并写回明细，下次存档就带品质了
          if (typeof entry.tier !== 'number') entry.tier = window.Economy.pondGradeOf(entry);
          this.world.addPondFish(entry.name, entry.points, entry.id, entry.tier);
        });
      }
      window.FX.init(this.scene, {
        groundAt: (x, z) => {
          const g = this.world.surfaceHeight(x, z, 0.4, false);
          return Math.max(g, this.world.heightAt(x, z));
        },
        onShellBounce: (pos, power) => {
          if (power > 0.6) Sound.playAt('shell', pos, { vol: 0.55, maxDist: 16, falloff: 0.22 });
        }
      });
      // 注意：预热**不能**放在这里。three 的着色器 program 是按「场景里点光源
      // 数量」编译的，而 Player 构造时会给相机挂一盏 viewLight（照亮手中的枪）。
      // 灯一加，program 的 key 就变了，这之前编译出来的全部作废 —— 上一版就是
      // 把 FX.warmup 放在 Player 之前，等于白跑，玩家反馈"第一枪还是会卡"。
      // 真正的预热统一放到构造函数最后（所有灯、所有模型都就位之后）。
      // 甲板上的鱼跳回水里：由 world 在鱼落水时回调
      window.onBoatSplash = (pos) => {
        if (pos) Sound.playAt('splash', pos, { vol: 1.0, maxDist: 40, falloff: 0.07 });
      };
      // 海鸥啼叫：远处淡淡传来，配合盘旋营造海边氛围
      window.onGullCry = (pos) => {
        if (pos) Sound.playAt('gull', pos, { vol: 0.85, maxDist: 46, falloff: 0.075 });
      };

      this.player = new window.Player(this.camera, this.world);
      // 从存档恢复体力等级对应的上限
      this.player.syncStamLevel();
      // 第一人称武器几乎贴在相机上，几乎收不到场景光照，在所有画面里都糊成一团黑。
      // 挂一盏射程很短（1.6m）的补光，只照亮手中的枪械，不影响环境。
      this.viewLight = new THREE.PointLight(0xfff2e2, 1.55, 3.0, 1.4);
      this.viewLight.position.set(0.20, -0.02, -0.10);
      this.camera.add(this.viewLight);
      // 敌人已经整体移除（这一版正式改成钓鱼游戏），场景里只剩玩家、鱼和鸟。

      this.fishing = new window.Fishing(this.scene, this.player, this.world, {
        notice: (text, kind) => this.notice(text, kind),
        heal: (amount) => {
          this.player.health = Math.min(this.player.maxHealth, this.player.health + amount);
        },
        addAmmo: (amount) => {
          this.player.reserve += amount;
          this.syncAmmo();
        },
        score: (points, name) => {
          this.score += points;
          this.catches += 1;
          // 实时入账
          if (window.Economy) {
            window.Economy.addScore(points);
            // 图鉴：第一次钓到的鱼种，等"钓到xx"的提示滚完再补一条解锁提示
            if (window.Economy.recordCatch(name)) {
              const total = window.Economy.codexTotal();
              const got = window.Economy.codexCount();
              setTimeout(() => {
                this.notice('图鉴解锁 ' + got + '/' + total + '：' + name + '（按 J 查看图鉴）', 'good');
                Sound.play('swap');
              }, 1900);
            }
          }
        },
        bag: (fish) => {
          return window.Economy ? window.Economy.addFish(fish) : true;
        },
        itemRoll: (sea, dist) => {
          if (!window.Economy || !window.Economy.hasItemSpace()) return null;
          // 基础 30% 起步，远投再抬：钓个七八条就该见到一次杂物
          const chance = 0.30 + Math.min(0.30, (dist || 0) / 110);
          if (Math.random() > chance) return null;
          const def = CATCH_ITEMS[Math.floor(Math.random() * CATCH_ITEMS.length)];
          const item = { name: def.name, kind: def.kind, sea: !!sea };
          return window.Economy.addItem(item) ? item : null;
        },
        // 抛竿时消耗钩上那份饵，并把这一档的参数（品质上限 / 好鱼权重）交给钓鱼系统
        useBait: () => (window.Economy ? window.Economy.consumeBait() : null),
        audio: (name) => Sound.play(name)
      });
      // 玩家持有鱼竿引用，用于槽位切换时同步竿子可见性
      this.player.fishingRef = this.fishing;
      // 换竿后立刻刷新手上那根竿的外观；同时把配置同步进去，
      // 这样即便玩家在菜单里升级鱼竿，再进战斗也是新竿，而不是要抛一次竿才变。
      if (window.Economy) {
        window.Economy.onRodChanged = (id) => this.applyRodChange(id);
        this.applyRodChange(window.Economy.rod || 'bamboo');
      }

      this.state = 'menu';
      this.locked = false;
      this.elapsed = 0;
      this.score = 0;
      // 湖中养鱼的每秒结算状态
      this.pondSaveT = 0;
      this.pondCount = 0;
      this.pondRate = 0;
      this.catches = 0;
      this.playerRespawn = 0;
      this.ammoHintCd = 0;
      this.input = { forward: false, back: false, left: false, right: false, fire: false, aim: false, jump: false, sprint: false, crouch: false };
      this.loadout = ['pistol'];
      // 武器槽从存档恢复；开局只有手枪，其余枪要在武器商店重新买
      this.loadoutSel = (window.Economy && window.Economy.loadout && window.Economy.loadout.length)
        ? window.Economy.loadout.slice(0, 2) : ['pistol'];
      // 换更高一档鱼竿 → 枪械全部作废（economy 里重置），这里负责弹提示
      if (window.Economy) {
        window.Economy.onGunsReset = (tier) => {
          this.loadout = ['pistol'];
          this.loadoutSel = ['pistol'];
          this.player.setLoadout(['pistol']);
          // 换季刷新体力等级：上限回到 1 级（100），当前体力也归位
          this.player.syncStamLevel();
          this.player.stamina = this.player.maxStamina;
          const rod = window.RODS && window.RODS[window.Economy.rod];
          this.notice('换上了' + (rod ? rod.name : '新鱼竿') + '：枪械收回、体力等级刷新为 1 级', 'warn');
        };
      }
      this.overlaySource = null;
      this.overlayKind = null;
      this.vignetteTimer = null;
      // 丢在地上的物品（可 F 键拾取）
      this.dropped = [];
      this.droppedSeq = 0;

      // 备弹变化时同步回库存
      this.player.onAmmoChange = () => this.syncAmmo();

      // 手感反馈：顿帧、慢放、连杀、心跳、脚步与落地
      this.hitstop = 0;
      this.slowmo = 0;
      this.killChain = 0;
      this.killChainT = 0;
      this.flashWhite = 0;
      this.hitConfirm = 0;
      this.damageFlashT = 0;
      this.heartCd = 0;
      this.damageDirTimer = null;
      this.player.onFootstep = (vol) => {
        if (this.state === 'playing') Sound.play('step');
      };
      this.player.onLand = (k) => {
        if (this.state !== 'playing') return;
        Sound.play('land');
        this.player.addShake(0.3 * k);
      };

      this.bindUI();
      this.bindInput();

      this.ui = {
        hud: document.getElementById('hud'),
        hpFill: document.getElementById('hpFill'),
        hpNum: document.getElementById('hpNum'),
        stamLevelBadge: document.getElementById('stamLevelBadge'),
        ammoNum: document.getElementById('ammoNum'),
        ammoIcon: document.getElementById('ammoIcon'),
        gunName: document.getElementById('gunName'),
        ammoLabel: document.getElementById('ammoLabel'),
        modeTag: document.getElementById('modeTag'),
        reloadTag: document.getElementById('reloadTag'),
        balanceHud: document.getElementById('balanceHud'),
        scoreNum: document.getElementById('scoreNum'),
        pondHud: document.getElementById('pondHud'),
        pondSep: document.getElementById('pondSep'),
        prompt: document.getElementById('prompt'),
        hitmarker: document.getElementById('hitmarker'),
        vignette: document.getElementById('vignette'),
        crosshair: document.getElementById('crosshair'),
        scope: document.getElementById('scope'),
        scopeZoom: document.getElementById('scopeZoom'),
        damageDir: document.getElementById('damageDir'),
        killBanner: document.getElementById('killBanner'),
        notices: document.getElementById('notices'),
        loadingOverlay: document.getElementById('loadingOverlay'),
        loadingTip: document.getElementById('loadingTip'),
        startOverlay: document.getElementById('startOverlay'),
        charOverlay: document.getElementById('charOverlay'),
        baitOverlay: document.getElementById('baitOverlay'),
        pondOverlay: document.getElementById('pondOverlay'),
        weaponOverlay: document.getElementById('weaponOverlay'),
        shopOverlay: document.getElementById('shopOverlay'),
        tradeOverlay: document.getElementById('tradeOverlay'),
        statsOverlay: document.getElementById('statsOverlay'),
        codexOverlay: document.getElementById('codexOverlay'),
        backpackOverlay: document.getElementById('backpackOverlay'),
        pauseOverlay: document.getElementById('pauseOverlay'),
        endOverlay: document.getElementById('endOverlay'),
        endPanel: document.getElementById('endPanel'),
        endTitle: document.getElementById('endTitle'),
        endText: document.getElementById('endText'),
        clock: document.getElementById('clock'),
        bloodTag: document.getElementById('bloodTag'),
        bloodVeil: document.getElementById('bloodVeil'),
        dayTag: document.getElementById('dayTag'),
        dayVeil: document.getElementById('dayVeil'),
        sleepOverlay: document.getElementById('sleepOverlay'),
        flash: null,
        hitVignette: null
      };

      // 击杀闪白与命中红晕：动态建两层叠在 HUD 上，不依赖 index.html 的既有结构
      const mkOverlay = (id, css) => {
        const d = document.createElement('div');
        d.id = id;
        d.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:58;opacity:0;' + css;
        document.body.appendChild(d);
        return d;
      };
      this.ui.flash = mkOverlay('killFlash',
        'background:radial-gradient(circle at 50% 52%, rgba(255,246,214,0.75), rgba(255,214,140,0.22) 45%, rgba(255,180,90,0) 72%);mix-blend-mode:screen;transition:opacity 90ms linear;');
      this.ui.hitVignette = mkOverlay('hitVig',
        'background:radial-gradient(circle at 50% 50%, rgba(150,20,14,0) 42%, rgba(150,20,14,0.55) 100%);mix-blend-mode:multiply;transition:opacity 120ms linear;');

      this.clock = new THREE.Clock();
      // 昼夜与睡觉
      this.hour = 17.2;          // 开局傍晚，很快能看到天黑
      this.dayLength = 720;      // 现实 12 分钟 = 游戏 24 小时
      this.sleeping = false;
      this.sleepT = 0;
      this.sleepFrom = 0;
      this.sleepDelta = 0;
      this.wasNight = false;
      // 血夜：入夜时掷骰子，掷中就整夜变成血月（血夜专属鱼只在此时咬钩）
      this.bloodNight = false;
      this.daymare = false;
      this.daymareT = 0;
      this.batMax = 0;
      this.batN = 0;
      this.daymareClimax = false;
      // 坐凳子
      this.sitting = false;
      this.sitSeat = null;
      this.interactTip = document.getElementById('interactTip');
      this.resize = this.resize.bind(this);
      window.addEventListener('resize', this.resize);
      this.resize();

      this.renderShop();

      // ---------- 统一预热（所有灯、所有模型到这里都建好了）----------
      // 这一步之前不能有任何"加灯"的操作，否则 program 会重新编译。
      // 1) 把没装备的 11 把枪模型临时点亮，让它们的材质一起进 program 缓存，
      //    否则第一次换到某把枪时还会顿一下。
      if (this.player && this.player.setAllWeaponModelsVisible) {
        this.player.setAllWeaponModelsVisible(true);
      }
      // 2) 特效：曳光 / 枪口烟 / 血雾 / 火花 / 弹壳 / 弹孔 / 击杀爆发
      if (window.FX && window.FX.warmup) {
        try { window.FX.warmup(this.renderer, this.camera); } catch (e) { /* ignore */ }
      }
      // 3) 钓鱼：鱼竿、浮标、鱼线、咬钩标记、鱼模型开局全是隐藏的，
      //    compile() 只认可见对象，不预热的话第一次抛竿同样要现编译。
      if (this.fishing && this.fishing.warmup) {
        try { this.fishing.warmup(this.renderer, this.camera); } catch (e) { /* ignore */ }
      }
      // 4) 所有鱼的花纹贴图（每条 192×96 的 canvas）提前烘出来
      if (window.FishWarm) {
        try { window.FishWarm(); } catch (e) { /* ignore */ }
      }
      // 4b) 血夜 / 日魇的专属鱼模型 + 蝠群预热。
      //     这些模型都是「事件触发时才第一次 new」的，那一刻要现建几何 + 编译 program，
      //     弱 GPU 上就是事件开始瞬间的一次硬卡顿（蝠群实测单帧 40ms+）。
      //     这里在加载期把模型摆到镜头前、连同蝠群一起真渲染一遍（第 6 步那次 composer.render），
      //     画完再删掉，玩家看不到这一帧。
      if (window.FishModel) {
        const warm = [];
        const camDir = new THREE.Vector3();
        this.camera.getWorldDirection(camDir);
        const base = this.camera.position.clone().addScaledVector(camDir, 7);
        const lists = [window.BLOOD_FISH, window.DAYMARE_FISH];
        for (let li = 0; li < lists.length; li++) {
          const list = lists[li];
          if (!list) continue;
          for (let i = 0; i < list.length; i++) {
            try {
              const m = new window.FishModel(list[i].name);
              if (m.halo && m.halo.parent) m.halo.parent.remove(m.halo);
              m.group.position.copy(base).add(new THREE.Vector3((i - 2) * 1.6, (li ? -1.8 : 1.8), 0));
              this.scene.add(m.group);
              warm.push(m.group);
            } catch (e) { /* ignore */ }
          }
        }
        this._warmGroups = warm;       // 第 6 步渲染完再清，别忘了
      }
      // 蝠群放到最大档并设为可见，让第 6 步那次真渲染把它们画一遍
      if (this.world.prepareBats) {
        try { this.world.prepareBats(); } catch (e) { /* ignore */ }
      }
      // 5) 场景里所有可见材质
      if (this.renderer && this.scene && this.camera) {
        try { this.renderer.compile(this.scene, this.camera); } catch (e) { /* ignore */ }
      }
      // 枪模型收回去，恢复成"只显示当前槽位"
      if (this.player && this.player.refreshWeaponModel) {
        try { this.player.refreshWeaponModel(); this.player.swapAnim = 0; } catch (e) { /* ignore */ }
      }
      // 6) 后处理链也要空跑一遍：bloom 的 5 级 mip 降采样 + FXAA 的 shader
      //    都是第一次 composer.render() 时才建的，那一帧同样会顿一下。
      if (this.composer && this.scene && this.camera) {
        try {
          this.camera.updateMatrixWorld(true);
          this.composer.render();
        } catch (e) { /* ignore */ }
      }
      // 预热渲染完就把临时模型和蝠群恢复原状
      if (this.world.resetBats) {
        try { this.world.resetBats(); } catch (e) { /* ignore */ }
      }
      if (this._warmGroups) {
        this._warmGroups.forEach((g) => { this.scene.remove(g); });
        this._warmGroups = null;
      }
      // 联机：网络管理器（未连接前完全不影响单机流程）
      this.net = new window.NetworkManager();
      this.bindPlatform();
      this.bindMultiplayer();
      this.warmLateAssets();
      this.renderer.setAnimationLoop(() => this.animate());
    }

    // ---------- 迟到的素材补预热 ----------
    // 灯塔 / 鱼市 / 渔屋 / 湖 这些 glb 是异步加载的，构造函数里那次统一预热
    // 跑的时候它们往往还没到位，于是玩家第一次走到它们面前，几十个材质要现编译：
    // 实测灯塔每块 650~860ms，一串下来三四秒硬卡顿（这就是"走两步卡一下"的真凶）。
    // 这里在启动后补几次「异步编译 + 渲染一帧」——compileAsync 走
    // KHR_parallel_shader_compile，在主线程之外编译，菜单界面不会被拖住；
    // 已经编过的材质会被 three 的 program 缓存直接跳过，重复调用几乎没有开销。
    warmLateAssets() {
      // 素材 ready 时由 world 回调置位，animate 里挑一帧把 program 编掉
      window.onWorldAssetReady = () => { this._warmPending = true; };
      const doIt = () => this._warmScene();
      // 素材就位时间不确定：600ms 大概率已经有了，后面几次兜住慢网
      [600, 1500, 3000, 5500, 9000].forEach((ms) => setTimeout(doIt, ms));
    }

    // 真正的编译动作：compile 覆盖整棵场景树（不看视锥），再渲染一帧让阴影的
    // depth program 也一并生成。已编过的材质走 program 缓存，重复调用只有遍历开销。
    _warmScene() {
      if (!this.renderer || !this.scene || !this.camera) return;
      try { this.camera.updateMatrixWorld(true); } catch (e) { /* ignore */ }
      try { this.renderer.compile(this.scene, this.camera); } catch (e) { /* ignore */ }
      try {
        if (this.composer) this.composer.render();
        else this.renderer.render(this.scene, this.camera);
      } catch (e) { /* ignore */ }
    }

    bindUI() {
      // 主页面：单人 → 选角色 → 选武器，多人暂未开放
      document.getElementById('soloBtn').addEventListener('click', () => {
        this.renderChar();
        this.ui.startOverlay.classList.add('hidden');
        this.ui.charOverlay.classList.remove('hidden');
      });
      // 角色选择（事件委托）
      document.getElementById('charGrid').addEventListener('click', (e) => {
        const card = e.target.closest('.char-card');
        if (!card) return;
        if (window.Economy) window.Economy.setCharacter(card.dataset.char);
        this.renderChar();
      });
      document.getElementById('charNextBtn').addEventListener('click', () => {
        this.renderShop();
        this.ui.charOverlay.classList.add('hidden');
        this.ui.weaponOverlay.classList.remove('hidden');
      });
      // 鱼市 · 买鱼饵：一次一整包（10 份），买完进背包，要自己装钩
      document.getElementById('baitRow').addEventListener('click', (e) => {
        const card = e.target.closest('.bait-card');
        if (!card) return;
        const id = card.dataset.bait;
        const n = parseInt(card.dataset.n, 10) || 10;
        const cost = parseInt(card.dataset.cost, 10);
        const b = window.BAITS[id];
        if (!b) return;
        if (window.Economy.buyBait(id, n)) {
          this.baitMsg('买下 ' + n + ' 份' + b.name + '，已放进背包（按 B 打开，点「装钩」）', true);
          Sound.play('catch');
        } else {
          this.baitMsg('积分不足，还差 ' + (cost - window.Economy.balance), false);
        }
        this.renderMarket();
      });
      // 鱼市 · 卖鱼：单条收购
      document.getElementById('sellFishList').addEventListener('click', (e) => {
        const btn = e.target.closest('.mkt-sell');
        if (!btn) return;
        const r = window.Economy.sellFish(parseInt(btn.dataset.fish, 10));
        if (!r) return;
        this.baitMsg('卖出「' + r.fish.name + '」· +' + r.price + ' 积分', true);
        Sound.play('catch');
        this.renderMarket();
      });
      // 鱼市 · 卖鱼：一键清空
      document.getElementById('sellAllFish').addEventListener('click', () => {
        const r = window.Economy.sellAllFish();
        if (!r.n) { this.baitMsg('背包里没有可卖的鱼', false); return; }
        this.baitMsg('卖出 ' + r.n + ' 条鱼 · +' + r.price + ' 积分', true);
        Sound.play('catch');
        this.renderMarket();
      });
      // 鱼市 · 杂物：单个收购
      document.getElementById('sellItemList').addEventListener('click', (e) => {
        const btn = e.target.closest('.mkt-item-sell');
        if (!btn) return;
        const r = window.Economy.sellItem(parseInt(btn.dataset.item, 10));
        if (!r) return;
        this.baitMsg('卖出「' + r.item.name + '」· +' + r.price + ' 积分', true);
        Sound.play('catch');
        this.renderMarket();
      });
      // 鱼市 · 杂物：一键全卖
      document.getElementById('sellAllItems').addEventListener('click', () => {
        const r = window.Economy.sellAllItems();
        if (!r.n) { this.baitMsg('没有可卖的杂物', false); return; }
        this.baitMsg('卖出 ' + r.n + ' 件杂物 · +' + r.price + ' 积分', true);
        Sound.play('catch');
        this.renderMarket();
      });
      document.getElementById('baitBackBtn').addEventListener('click', () => {
        if (this.overlaySource === 'game') this.closeInGameOverlay();
      });
      const pondBack = document.getElementById('pondBackBtn');
      if (pondBack) pondBack.addEventListener('click', () => {
        if (this.overlaySource === 'game') this.closeInGameOverlay();
      });
      // 背包渔获：放入湖中养鱼 / 丢到地上
      document.getElementById('bpFish').addEventListener('click', (e) => {
        const dropBtn = e.target.closest('.fc-drop');
        if (dropBtn) {
          const i = parseInt(dropBtn.dataset.fish, 10);
          const f = window.Economy.takeFish(i);
          if (!f) return;
          this.dropItem({
            type: 'fish',
            fish: { name: f.name, points: f.points, tier: f.tier, sea: f.sea, dist: f.dist }
          });
          this.renderBackpack();
          this.notice('把' + f.name + '丢在了地上，走近按 F 可以捡回', 'info');
          return;
        }
        const btn = e.target.closest('.fc-raise');
        if (!btn) return;
        const i = parseInt(btn.dataset.fish, 10);
        const f = window.Economy.raiseFish(i);
        if (!f) return;
        const entry = window.Economy.addPondFish(f.name, f.points, f.tier);
        if (this.world.addPondFish) this.world.addPondFish(f.name, entry.points, entry.id, entry.tier);
        this.renderBackpack();
        const st = this.world.pondStat ? this.world.pondStat() : { n: window.Economy.pondFish.length, rate: 0 };
        const self = window.Economy.pondRateFor(entry).toFixed(1);
        const gi = window.FISH_GRADES ? window.FISH_GRADES[entry.tier] : null;
        this.notice('把' + f.name + (gi ? '（' + gi.name + '）' : '') + '放进湖里养起来了 · 它自己每秒 +' +
          self + ' · 湖中合计 +' + st.rate.toFixed(1) + '/秒 · ' + st.n + ' 条', 'good');
      });
      // 道具 / 材料背包：丢到地上
      document.getElementById('bpItems').addEventListener('click', (e) => {
        // 珍珠 / 贝壳这类杂物可以直接在背包里卖给鱼市
        const sellBtn = e.target.closest('.fc-sell');
        if (sellBtn) {
          const r = window.Economy.sellItem(parseInt(sellBtn.dataset.item, 10));
          if (!r) return;
          this.notice('卖出「' + r.item.name + '」· +' + r.price + ' 积分（鱼市收购）', 'good');
          Sound.play('catch');
          this.renderBackpack();
          return;
        }
        const btn = e.target.closest('.fc-drop');
        if (!btn) return;
        const i = parseInt(btn.dataset.item, 10);
        const it = window.Economy.takeItem(i);
        if (!it) return;
        const def = CATCH_ITEMS.find((c) => c.name === it.name);
        this.dropItem({
          type: 'item',
          item: { name: it.name, kind: it.kind, sea: it.sea, color: def ? def.color : 0xbfe3e0 }
        });
        this.renderBackpack();
        this.notice('丢下了「' + it.name + '」，按 F 可捡回', 'info');
      });
      // 背包 · 鱼饵：点「装钩」把这一种挂上，点「卸下」回到空钩
      document.getElementById('bpBaits').addEventListener('click', (e) => {
        const eco = window.Economy;
        const on = e.target.closest('.bait-use');
        if (on) {
          const id = on.dataset.bait;
          if (!eco.loadBait(id)) {
            this.notice('这份鱼饵已经用光了', 'warn');
          } else {
            this.notice('钩上挂了' + window.BAITS[id].name + '（' + eco.baitCount(id) + ' 份）· 下一竿开始生效', 'good');
            Sound.play('swap');
          }
          this.renderBackpack();
          return;
        }
        const off = e.target.closest('.bait-off');
        if (off) {
          eco.unloadBait();
          this.notice('收起了鱼饵，现在是空钩 —— 还能钓，但钓不到好鱼', 'warn');
          this.renderBackpack();
        }
      });
      document.getElementById('mpBtn').addEventListener('click', () => {
        this.openMpOverlay();
      });
      document.getElementById('backBtn').addEventListener('click', () => {
        this.ui.weaponOverlay.classList.add('hidden');
        this.ui.startOverlay.classList.remove('hidden');
      });
      // 选枪卡片（事件委托）：已拥有 → 加入/移出背包（最多两把），未拥有 → 购买
      document.getElementById('gunGrid').addEventListener('click', (e) => {
        const card = e.target.closest('.gun-card');
        if (!card || card.classList.contains('unknown')) return;
        const id = card.dataset.gun;
        if (!window.Economy.ownsGun(id)) {
          if (window.Economy.buyGun(id)) {
            this.shopMsg('已解锁 ' + window.GUNS[id].name + '！点击加入背包', true);
          } else {
            this.shopMsg('积分不足，还差 ' + (window.GUNS[id].price - window.Economy.balance), false);
          }
          this.renderShop();
          return;
        }
        const idx = this.loadoutSel.indexOf(id);
        if (idx >= 0) {
          if (this.loadoutSel.length <= 1) {
            this.shopMsg('至少保留一把武器', false);
          } else {
            this.loadoutSel.splice(idx, 1);
          }
        } else {
          if (this.loadoutSel.length >= 2) {
            this.loadoutSel.shift();
            this.shopMsg('背包已满，已替换槽位 1', true);
          }
          this.loadoutSel.push(id);
        }
        if (window.Economy) window.Economy.setLoadout(this.loadoutSel);
        this.renderShop();
      });
      // 出战按钮：带当前背包进入战斗
      document.getElementById('fightBtn').addEventListener('click', () => {
        Sound.init();
        this.startRound(this.loadoutSel.slice());
      });
      document.getElementById('rodGrid').addEventListener('click', (e) => {
        const card = e.target.closest('.gun-card');
        if (!card || card.classList.contains('unknown')) return;
        const id = card.dataset.rod;
        if (window.Economy.ownsRod(id)) {
          window.Economy.equipRod(id);
          this.shopMsg('已装备 ' + window.RODS[id].name, true);
        } else if (window.Economy.buyRod(id)) {
          this.shopMsg('已解锁并装备 ' + window.RODS[id].name, true);
        } else {
          this.shopMsg('积分不足，还差 ' + (window.RODS[id].price - window.Economy.balance), false);
        }
        this.renderShop();
      });
      document.getElementById('restartBtn').addEventListener('click', () => {
        Sound.init();
        this.startRound(this.loadout);
      });
      document.getElementById('homeBtn').addEventListener('click', () => {
        this.state = 'menu';
        this.ui.endOverlay.classList.add('hidden');
        this.ui.hud.classList.remove('on');
        this.renderShop();
        this.ui.startOverlay.classList.remove('hidden');
      });
      document.getElementById('resumeBtn').addEventListener('click', () => {
        this.acquireControl();
      });
      document.getElementById('endBtn').addEventListener('click', () => {
        this.finishRound();
      });

      // 主页：商店 / 战绩
      document.getElementById('shopBtn').addEventListener('click', () => {
        document.getElementById('shopBackBtn').textContent = '返回主页';
        this.renderShop();
        this.ui.startOverlay.classList.add('hidden');
        this.ui.shopOverlay.classList.remove('hidden');
      });
      document.getElementById('statsBtn').addEventListener('click', () => {
        document.getElementById('statsBackBtn').textContent = '返回主页';
        this.renderStats();
        this.ui.startOverlay.classList.add('hidden');
        this.ui.statsOverlay.classList.remove('hidden');
      });
      document.getElementById('codexBtn').addEventListener('click', () => {
        document.getElementById('codexBackBtn').textContent = '返回主页';
        this.renderCodex();
        this.ui.startOverlay.classList.add('hidden');
        this.ui.codexOverlay.classList.remove('hidden');
      });
      const cxX = document.getElementById('codexCloseX');
      if (cxX) cxX.addEventListener('click', () => {
        if (this.overlaySource === 'game') this.closeInGameOverlay();
        else this.ui.codexOverlay.classList.add('hidden'), this.ui.startOverlay.classList.remove('hidden');
      });
      document.getElementById('codexBackBtn').addEventListener('click', () => {
        if (this.overlaySource === 'game') {
          this.closeInGameOverlay();
          return;
        }
        this.ui.codexOverlay.classList.add('hidden');
        this.ui.startOverlay.classList.remove('hidden');
      });
      document.getElementById('settingsBtn').addEventListener('click', () => {
        this.ui.startOverlay.classList.add('hidden');
        this.refreshQualityUI();
        document.getElementById('settingsOverlay').classList.remove('hidden');
      });
      // 画质档位按钮（设置页和暂停页各有一组，共用一个 data-q）
      const qbtns = document.querySelectorAll('.qbtn');
      for (let i = 0; i < qbtns.length; i++) {
        qbtns[i].addEventListener('click', (ev) => {
          this.applyQuality(ev.currentTarget.dataset.q, true);
        });
      }
      this.refreshQualityUI();

      // 浏览器关了硬件加速 → WebGL 退化成软件渲染，降画质也救不回来，
      // 只能直接告诉玩家去开（这是「明显卡顿」里唯一无法靠改代码解决的一类）
      if (this._softGL) {
        const panel = document.querySelector('#startOverlay .panel');
        if (panel) {
          const warn = document.createElement('p');
          warn.className = 'glwarn';
          warn.innerHTML = '检测到浏览器正在<b>软件渲染</b>（硬件加速被关闭），画面会非常卡。'
            + '请打开 <b>设置 → 系统 → 使用图形加速</b>，重启浏览器后再进游戏。';
          const row = panel.querySelector('.mode-row');
          if (row) panel.insertBefore(warn, row); else panel.appendChild(warn);
        }
      }

      // 帧率角标：游戏里按 F3 开/关（?stats=1 也能直接打开）。
      // 软件渲染时默认打开，玩家能立刻看见"只有 8fps"，而不是笼统觉得"好卡"。
      this._statsOn = /[?&]stats=1/.test(location.search) || !!this._softGL;
      {
        const el = document.createElement('div');
        el.id = 'fpsTag';
        el.style.cssText = 'position:fixed;left:10px;bottom:10px;z-index:9999;padding:5px 9px;'
          + 'border-radius:6px;background:rgba(18,20,18,.66);color:#e8f0e2;'
          + 'font:12px/1.5 ui-monospace,Consolas,monospace;pointer-events:none;white-space:pre';
        if (!this._statsOn) el.style.display = 'none';
        document.body.appendChild(el);
        this._fpsEl = el; this._fpsN = 0; this._fpsT = 0;
        window.addEventListener('keydown', (ev) => {
          if (ev.key !== 'F3') return;
          ev.preventDefault();
          this._statsOn = !this._statsOn;
          el.style.display = this._statsOn ? '' : 'none';
          this._fpsN = 0; this._fpsT = 0;
        });
      }
      document.getElementById('settingsBackBtn').addEventListener('click', () => {
        document.getElementById('settingsOverlay').classList.add('hidden');
        this.ui.startOverlay.classList.remove('hidden');
      });
      // 返回：局内打开 → 回到战斗；主页打开 → 回到主页
      document.getElementById('shopBackBtn').addEventListener('click', () => {
        if (this.overlaySource === 'game') {
          this.closeInGameOverlay();
          return;
        }
        this.ui.shopOverlay.classList.add('hidden');
        this.renderShop();
        this.ui.startOverlay.classList.remove('hidden');
      });
      document.getElementById('statsBackBtn').addEventListener('click', () => {
        if (this.overlaySource === 'game') {
          this.closeInGameOverlay();
          return;
        }
        this.ui.statsOverlay.classList.add('hidden');
        this.renderShop();
        this.ui.startOverlay.classList.remove('hidden');
      });
      const bpX = document.getElementById('bpCloseX');
      if (bpX) bpX.addEventListener('click', () => {
        if (this.overlaySource === 'game') this.closeInGameOverlay();
        else {
          this.ui.backpackOverlay.classList.add('hidden');
          this.ui.startOverlay.classList.remove('hidden');
        }
      });
      document.getElementById('bpBackBtn').addEventListener('click', () => {
        if (this.overlaySource === 'game') {
          this.closeInGameOverlay();
          return;
        }
        // 主菜单打开的背包：返回主页
        this.ui.backpackOverlay.classList.add('hidden');
        this.ui.startOverlay.classList.remove('hidden');
      });

      // 商店内购买（不出战）
      document.getElementById('shopGunGrid').addEventListener('click', (e) => {
        const card = e.target.closest('.gun-card');
        if (!card || card.classList.contains('unknown')) return;
        const id = card.dataset.gun;
        if (window.Economy.ownsGun(id)) return;
        if (window.Economy.buyGun(id)) {
          this.shopMsg2('已解锁 ' + window.GUNS[id].name, true);
        } else {
          this.shopMsg2('积分不足，还差 ' + (window.GUNS[id].price - window.Economy.balance), false);
        }
        this.renderShop();
      });

      // 鱼竿 / 宝箱 / 背包店：卡片点击统一在这里分发
      const tradeGrid = document.getElementById('tradeGrid');
      if (tradeGrid) {
        tradeGrid.addEventListener('click', (e) => {
          const card = e.target.closest('.trade-card');
          if (!card) return;
          this.buyFromTrade(card.dataset.id);
        });
      }
      const tradeBack = document.getElementById('tradeBackBtn');
      if (tradeBack) {
        tradeBack.addEventListener('click', () => {
          if (this.overlaySource === 'game') this.closeInGameOverlay();
          else {
            this.ui.tradeOverlay.classList.add('hidden');
            this.ui.startOverlay.classList.remove('hidden');
          }
        });
      }

      // 子弹种类：点击购买（40 发）并切换当前类型
      const ammoTypeGrid = document.getElementById('ammoTypeGrid');
      if (ammoTypeGrid) {
        ammoTypeGrid.addEventListener('click', (e) => {
          const card = e.target.closest('.ammo-type-card');
          if (!card) return;
          const t = window.AMMO_TYPES[card.dataset.ammoType];
          if (window.Economy.buyAmmoType(t.id)) {
            // 局内购买立刻补到备弹
            this.player.reserve = window.Economy.ammoStock;
            this.shopMsg2('已购入 ' + t.name + ' +40 发并切换，库存 ' + window.Economy.ammoStock, true);
          } else {
            this.shopMsg2('积分不足，还差 ' + (t.price - window.Economy.balance), false);
          }
          this.renderShop();
        });
      }
    }

    // 鱼饵图标：四档饵是四种完全不同的东西（蚯蚓/虾肉/亮片/香饵罐），
    // 之前鱼市和背包里只有一行文字 + 一个色点，玩家根本认不出是哪一档。
    baitIcon(id, px) {
      const S = px || 30;
      const wrap = (inner) =>
        '<svg class="bait-svg" viewBox="0 0 48 48" width="' + S + '" height="' + S +
        '" fill="none" stroke-linejoin="round">' + inner + '</svg>';
      if (id === 'worm') {
        // 蚯蚓：卷成一团的粉褐色虫体，旁边挂一枚钩
        return wrap(
          '<path d="M11 34 q2 -13 12 -12.5 q10 .5 9.5 8.5 q-.5 7 -7.5 6.5 q-6.5 -.5 -6 -6.5 q.5 -5 6.5 -5" ' +
            'stroke="#b4645a" stroke-width="7.4" stroke-linecap="round"/>' +
          '<path d="M11 34 q2 -13 12 -12.5 q10 .5 9.5 8.5 q-.5 7 -7.5 6.5 q-6.5 -.5 -6 -6.5 q.5 -5 6.5 -5" ' +
            'stroke="#8a4038" stroke-width="2.2" stroke-linecap="round" opacity=".5"/>' +
          '<path d="M16 30 q1 -7 7 -7.6 M24 23 q6 .4 7 4.4" stroke="#e3a79c" stroke-width="1.8" stroke-linecap="round" opacity=".9"/>' +
          '<path d="M39 16 q4 3 4 9 q0 8 -6 8" stroke="#cfc7b6" stroke-width="2.4" stroke-linecap="round"/>' +
          '<circle cx="37" cy="33.5" r="2" fill="#cfc7b6"/>');
      }
      if (id === 'shrimp') {
        // 虾肉饵：弯成 C 形的虾身 + 分节纹 + 尾扇 + 两根长须
        return wrap(
          '<path d="M15 34 q1 -12 11 -15.5 q10 -3.4 12.5 5 q1.9 6.6 -5.5 8.6" ' +
            'stroke="#e08a74" stroke-width="8.4" stroke-linecap="round"/>' +
          '<path d="M15 34 q1 -12 11 -15.5 q10 -3.4 12.5 5 q1.9 6.6 -5.5 8.6" ' +
            'stroke="#b9604b" stroke-width="1.6" stroke-linecap="round" opacity=".35"/>' +
          '<path d="M18 27 l4.6 2.6 M22 22.4 l4.8 2.8 M27 19.6 l4.8 2.6" stroke="#b9604b" stroke-width="1.7" opacity=".85"/>' +
          '<path d="M15 34 l-6.6 4.4 l7.2 2.4 l3.4 -6.4 z" fill="#f0a891" stroke="#a0523f" stroke-width="1.5"/>' +
          '<path d="M13.4 39.4 l-3.4 3.4 M17 41.6 l-1.4 3.8" stroke="#a0523f" stroke-width="1.4" stroke-linecap="round"/>' +
          '<circle cx="35.4" cy="21.4" r="1.9" fill="#2a1a16"/>' +
          '<path d="M35 18.6 q6 -5.4 10.6 -3 M35.6 24 q6 1.6 9.6 5.6" stroke="#b9604b" stroke-width="1.5" stroke-linecap="round"/>');
      }
      if (id === 'lure') {
        // 亮片假饵：斜挂的金属勺片 + 青色反光条 + 红点 + 三本钩。
        // 整体转 14°，不然正着放太像一面小手镜。
        return wrap(
          '<g transform="rotate(-14 24 24)">' +
          '<path d="M24 11 q10.4 2.4 9.4 12.6 q-1.1 9.8 -9.4 14 q-8.3 -4.2 -9.4 -14 q-1 -10.2 9.4 -12.6 z" ' +
            'fill="#c9d7dd" stroke="#4f6a77" stroke-width="1.9"/>' +
          '<path d="M24 15.2 q5.4 4.6 5 12 q-.4 7 -5 9.4 q-4.6 -2.4 -5 -9.4 q-.4 -7.4 5 -12 z" ' +
            'fill="#8fd8f0" opacity=".82"/>' +
          '<path d="M17.8 17.4 q-2.8 6.8 .4 13.6" stroke="#ffffff" stroke-width="2" opacity=".85" stroke-linecap="round"/>' +
          '<circle cx="24" cy="29.4" r="2.6" fill="#e0563f"/>' +
          '<path d="M27.2 31.2 l3 -5" stroke="#ffffff" stroke-width="1.5" opacity=".6" stroke-linecap="round"/>' +
          '<circle cx="24" cy="8.4" r="2.6" fill="none" stroke="#4f6a77" stroke-width="2"/>' +
          '<path d="M24 40.6 v3" stroke="#4f6a77" stroke-width="2.2"/>' +
          '<path d="M24 43.4 q0 3.6 -4.6 3 q-2.6 -.5 -1.8 -3" fill="none" stroke="#7f939d" stroke-width="2.1" stroke-linecap="round"/>' +
          '<path d="M24 43.4 q0 3.6 4.6 3 q2.6 -.5 1.8 -3" fill="none" stroke="#7f939d" stroke-width="2.1" stroke-linecap="round"/>' +
          '</g>');
      }
      if (id === 'secret') {
        // 秘制香饵：带锡盖的陶罐 + 一点荧光，最贵的那档要有辨识度
        return wrap(
          '<rect x="15" y="16" width="18" height="21" rx="4.4" fill="#e0a95e" stroke="#7c5622" stroke-width="1.9"/>' +
          '<rect x="12.6" y="10.6" width="22.8" height="7.2" rx="3.4" fill="#8a5d2c" stroke="#4e3315" stroke-width="1.7"/>' +
          '<path d="M18 25 q6 -4.2 12 0 q-6 3.4 -12 0 z" fill="#ffe6ae" opacity=".9"/>' +
          '<path d="M19.6 31.4 q4.6 2 9 0" stroke="#a8752f" stroke-width="1.7" stroke-linecap="round" opacity=".75"/>' +
          '<path d="M35.6 27.4 l1.5 3.2 3.2 1.3 -3.2 1.3 -1.5 3.2 -1.5 -3.2 -3.2 -1.3 3.2 -1.3 z" fill="#ffe08a"/>' +
          '<circle cx="13.4" cy="33.6" r="1.5" fill="#ffe08a" opacity=".9"/>');
      }
      return wrap('<circle cx="24" cy="24" r="10" stroke="#9fb0ba" stroke-width="2.4"/>');
    }

    // 鱼的图标：先查鱼表，查不到（老存档里的特殊鱼）也得画一条鱼，
    // 否则面板会留一个空白方块，看起来像"没有图标"。
    fishIcon(name) {
      if (window.FISH_TYPES && window.FISH_TYPES[name]) return this.iconFor(name);
      return '<svg viewBox="0 0 64 64" fill="none">' +
        '<path d="M54 32 q-12 -13 -28 -7 q-11 4 -13 7 q2 3 13 7 q16 6 28 -7 z" fill="#93a8b1" stroke="#1d2a33" stroke-width="2.4" stroke-linejoin="round"/>' +
        '<path d="M54 32 l8 -10 q3 10 0 10 q3 0 0 10 z" fill="#6f8791" stroke="#1d2a33" stroke-width="2" stroke-linejoin="round"/>' +
        '<path d="M30 25 l5 -7 l5 7 z" fill="#6f8791"/>' +
        '<circle cx="20" cy="30" r="2.6" fill="#12191d"/></svg>';
    }

    // 物品图标：按 id 绘制内联 SVG（枪械/鱼竿/弹药/鱼/杂物/鱼饵）
    iconFor(id) {
      const hexCss = (n) => '#' + ((n || 0) & 0xffffff).toString(16).padStart(6, '0');
      const C = {
        rifle: '#ff8a3d', sniper: '#b78cff',
        shotgun: '#ffd166', fist: '#d9a679',
        bamboo: '#c8a86a', carbon: '#7d94a3', master: '#ffd166', ammo: '#ffb454',
        crystal: '#8fe8ff', dragon: '#ff9a5a', astral: '#b78cff', void: '#7a7ff0', genesis: '#8affc8',
        '海藻': '#5fbf7a', '贝壳': '#ffd9a6', '旧瓶子': '#8ed6c6', '珍珠': '#f2ecff', '鱼饵': '#e07a5f'
      }[id] || '#e8f7ff';
      const F = 'fill="' + C + '" stroke="none"';
      const wrap = (inner) =>
        '<svg viewBox="0 0 64 64" fill="none" stroke="' + C +
        '" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">' + inner + '</svg>';
      // 鱼：不再是一个模板换颜色——按体形（prof）画完全不同的剪影。
      // 原来 38 种鱼共用同一条 Q 曲线，只换填充色，图标墙一眼看过去全是同一条鱼。
      const fishCfg = window.FISH_TYPES && window.FISH_TYPES[id];
      if (fishCfg) {
        // 深色鱼（夜行鱼、深海鱼）的体色放在深色面板上整条都糊掉了，
        // 这里按亮度把过暗的体色往白色提，保证轮廓永远能读出来。
        const liftTo = (hex, minL) => {
          const n = parseInt(hex.slice(1), 16);
          const r0 = (n >> 16) & 255, g0 = (n >> 8) & 255, b0 = n & 255;
          const L = (r0 * 0.299 + g0 * 0.587 + b0 * 0.114) / 255;
          if (L >= minL) return hex;
          const k = (minL - L) / (1 - L);
          const mix = (v) => Math.round(v + (255 - v) * k);
          return '#' + ((1 << 24) + (mix(r0) << 16) + (mix(g0) << 8) + mix(b0)).toString(16).slice(1);
        };
        // 原来取的是 fishCfg.body，而鱼表里只有 back —— 所有鱼图标都掉到 #000000，
        // 再被 liftTo 提成同一片灰，图鉴里 38 张卡看着像一套剪影。
        // 血夜鱼是「黑身红鳍」，不能按普通鱼提到 0.46 亮度 —— 一提就变成灰褐色泥鳅。
        // 只把最暗处抬一点点，靠深色剪影 + 鲜红鳍/牙/鳃来认。
        const liftBase = fishCfg.blood ? 0.20 : 0.46;
        let fc = liftTo(hexCss(fishCfg.back || fishCfg.body), liftBase);
        let fin = liftTo(hexCss(fishCfg.fin || fishCfg.body), fishCfg.blood ? 0.34 : 0.40);
        // 血夜鱼：鳍是自发光的，图标里直接用鲜红，才能和黑身拉开
        if (fishCfg.finGlow) fin = '#ff3a2a';
        let belly = liftTo(hexCss(fishCfg.belly || fishCfg.body), fishCfg.blood ? 0.46 : 0.68);
        // 日魇组一半是"苍白"色：在米白卡片上白鱼等于没画，统一压暗成中灰
        if (fishCfg.daymare) {
          const shade = (c, f) => {
            const n = parseInt(String(c).slice(1), 16) || 0;
            const r = Math.round(((n >> 16) & 255) * f);
            const g2 = Math.round(((n >> 8) & 255) * f);
            const b2 = Math.round((n & 255) * f);
            return '#' + ((1 << 24) + (r << 16) + (g2 << 8) + b2).toString(16).slice(1);
          };
          fc = shade(fc, 0.60);
          fin = shade(fin, 0.72);
          belly = shade(belly, 0.82);
        }
        const prof = fishCfg.prof || 'torpedo';
        // 每个体形：身体轮廓 + 眼睛位置 + 尾根 x + 背鳍基线
        const SH = {
          torpedo: { b: 'M55 33 Q42 20 22 25 Q12 29 12 33 Q12 37 22 41 Q42 46 55 34 Z', eye: [21, 31], tx: 54, fy: 25 },
          slim:    { b: 'M55 33 Q38 27 18 29.5 Q9 31 9 33 Q9 35 18 36.5 Q38 39 55 33 Z', eye: [18, 31.5], tx: 54, fy: 28 },
          plump:   { b: 'M51 33 Q49 16 31 15 Q13 15 13 31 Q13 41 22 45 Q40 49 51 33 Z', eye: [22, 30], tx: 50, fy: 18 },
          disc:    { b: 'M32 10 Q12 12 11 33 Q12 52 32 54 Q52 52 53 33 Q52 12 32 10 Z', eye: [21, 30], tx: 52, fy: 14 },
          eel:     { b: 'M58 34 Q50 28 42 31 Q34 34 26 30 Q18 26 9 30 Q7 33 9 35 Q18 33 26 36 Q34 40 42 36 Q50 34 58 35 Z', eye: [12, 31], tx: 57, fy: 30 },
          ribbon:  { b: 'M44 7 Q24 15 24 32 Q24 49 44 57 Q37 40 37 32 Q37 24 44 7 Z', eye: [33, 30], tx: 43, fy: 12 },
          blob:    { b: 'M32 11 Q14 11 13 31 Q13 50 32 51 Q51 50 51 31 Q51 11 32 11 Z', eye: [22, 29], tx: 50, fy: 15 },
          arrow:   { b: 'M58 33 Q44 24 26 26 L8 33 L26 40 Q44 44 58 33 Z', eye: [22, 31], tx: 57, fy: 27 },
          bat:     { b: 'M32 31 Q50 14 60 25 Q54 35 60 44 Q46 42 32 34 Q18 42 4 44 Q10 35 4 25 Q14 14 32 31 Z', eye: [30, 30], tx: 59, fy: 20 },
          longflat:{ b: 'M58 31 Q40 26 20 28 Q8 29 7 32 Q8 35 20 37 Q40 39 58 35 Z', eye: [17, 31], tx: 57, fy: 28 },
          // 沧龙：细长身 + 长吻 + 竖起的尾叶
          mosasaur:{ b: 'M60 32 L44 27 Q30 25 20 26.5 Q12 27.5 7 31 Q6 32 7 33 Q12 36.5 20 37.5 Q30 39 44 37 L60 32 Z', eye: [19, 30], tx: 60, fy: 27 },
          // 恐龙：大头大颚 + 粗身 + 背脊
          dino:    { b: 'M54 32 Q50 27 40 27 Q30 27 22 29 Q14 30.5 11 26 Q7 22 5 26 Q3 30 8 32 Q10 36 18 37 Q28 39 38 37 Q48 35 54 32 Z', eye: [15, 28], tx: 54, fy: 26 }
        };
        const sh = SH[prof] || SH.torpedo;
        const tail = fishCfg.tail || 'fork';
        // 尾型：叉/圆/扇/新月/飘带/细带
        let tailPath;
        if (tail === 'round') tailPath = 'M' + sh.tx + ' 33 q13 -13 13 0 q0 13 -13 0 z';
        else if (tail === 'fan') tailPath = 'M' + sh.tx + ' 33 l13 -14 q4 14 0 28 z';
        else if (tail === 'lance') tailPath = 'M' + sh.tx + ' 33 q10 -6 15 -15 q-3 12 -3 15 q0 3 3 15 q-5 -9 -15 -15 z';
        else if (tail === 'veil') tailPath = 'M' + sh.tx + ' 33 q14 -10 16 -18 q-6 16 0 18 q-6 2 0 18 q-2 -8 -16 -18 z';
        else if (tail === 'ribbon') tailPath = 'M' + sh.tx + ' 33 q16 -4 18 -12 q-4 12 0 12 q-4 0 0 12 q-2 -8 -18 -12 z';
        else if (tail === 'fluke') tailPath = 'M' + sh.tx + ' 33 q9 0 15 -16 q1 9 1 15 q0 10 -1 18 q-5 -12 -15 -14 z';
        else tailPath = 'M' + sh.tx + ' 33 l13 -12 q-2 12 0 12 q-2 0 0 12 z';
        // 背部花纹：从 pattern 推断，最多三笔，图标里够读出来
        const pat = fishCfg.pattern || 'scale';
        let marks = '';
        if (pat === 'stripe') marks = '<path d="M26 22 v20 M35 21 v22 M44 24 v18" stroke="' + fin + '" stroke-width="2.6" opacity="0.78"/>';
        else if (pat === 'band') marks = '<path d="M14 29 q16 -4 34 0 M14 37 q16 4 34 0" stroke="' + fin + '" stroke-width="2.2" opacity="0.7"/>';
        else if (pat === 'spots') marks = '<circle cx="24" cy="29" r="2.8" fill="' + fin + '" stroke="none" opacity="0.85"/><circle cx="34" cy="36" r="2.2" fill="' + fin + '" stroke="none" opacity="0.85"/><circle cx="43" cy="28" r="2" fill="' + fin + '" stroke="none" opacity="0.85"/>';
        else if (pat === 'scale') marks = '<path d="M22 27 q4 4 8 0 M30 27 q4 4 8 0 M38 29 q4 4 8 0 M26 35 q4 4 8 0 M34 35 q4 4 8 0" stroke="' + fin + '" stroke-width="1.5" opacity="0.5" fill="none"/>';
        else if (pat === 'marble') marks = '<path d="M20 34 q8 -8 16 0 q8 8 16 0" stroke="' + fin + '" stroke-width="2" opacity="0.55" fill="none"/>';
        else marks = '<path d="M16 32 q18 -2 34 0" stroke="' + fin + '" stroke-width="1.8" opacity="0.55"/>';
        // 等级高（≥5）加一圈光晕，图标也能看出稀有度
        const halo = (fishCfg.grade >= 5)
          ? '<circle cx="32" cy="32" r="28" fill="none" stroke="' + hexCss((window.FISH_GRADES[fishCfg.grade] || {}).ring || fishCfg.fin) + '" stroke-width="1.6" opacity="0.65"/>'
          : '';
        // 史前巨兽：光靠体形和别的鱼太像，补两笔桨鳍 / 背棘 / 张开的嘴
        let extra = '';
        if (fishCfg.flippers) {
          extra += '<path d="M28 39 q7 8 15 9 q-4 -7 -7 -10 z" fill="' + fin + '" opacity="0.92"/>' +
                   '<path d="M42 38 q5 7 11 8 q-2 -6 -5 -9 z" fill="' + fin + '" opacity="0.80"/>' +
                   '<path d="M7 32 l6 -1.6 l0 3.2 z" fill="#0d1417" opacity="0.85"/>';
        }
        if (fishCfg.ridge) {
          for (let i = 0; i < 5; i++) {
            extra += '<path d="M' + (18 + i * 7) + ' 27 l3 -8 l3 8 z" fill="' + fin + '" opacity="0.9"/>';
          }
          extra += '<path d="M6 29 l11 1.4 l0 4 l-11 1.6 z" fill="#0d1417" opacity="0.85"/>';
        }
        // ---- 血夜鱼：图标里也要一眼认出「这不是普通鱼」 ----
        if (fishCfg.finGlow) {
          // 赤鳍影：身后一层暗红光晕 + 两笔放射状鳍条
          extra += '<ellipse cx="36" cy="33" rx="26" ry="12" fill="#ff2a1a" opacity="0.12"/>' +
                   '<path d="M62 33 l-7 -11 M62 33 l-7 11" stroke="#ff6a4a" stroke-width="1.8" opacity="0.85"/>';
        }
        if (fishCfg.constellation) {
          // 绯红潮蛇：沿体侧一串发光鳞点，图标里也要有「潮蛇在发光」的感觉
          const cd = fishCfg.constellation.color;
          const dotCol = '#' + ((cd || 0xff5a6a) & 0xffffff).toString(16).padStart(6, '0');
          [[16, 33], [22, 30], [28, 36], [34, 31], [40, 35], [46, 30]].forEach((pt) => {
            extra += '<circle cx="' + pt[0] + '" cy="' + pt[1] + '" r="1.5" fill="' + dotCol + '" opacity="0.95"/>';
          });
        }
        if (fishCfg.gills) {
          // 夜魇石斑：侧头三道透光的红鳃
          for (let i = 0; i < 3; i++) {
            extra += '<path d="M' + (27 + i * 4.2) + ' 26 q-4.4 7 0 14" stroke="#ff2a3a" ' +
              'stroke-width="2.1" fill="none" opacity="0.92"/>';
          }
        }
        if (fishCfg.maw) {
          // 朱红裂口：整颗头就是一张开着的嘴 —— 红唇 + 黑腔 + 发亮的喉部 + 一圈针牙
          extra += '<ellipse cx="50" cy="33" rx="10" ry="12" fill="#d8322a" stroke="#5a0a10" stroke-width="1.6"/>' +
                   '<ellipse cx="49" cy="33" rx="6.4" ry="8" fill="#380306"/>' +
                   '<ellipse cx="48.4" cy="33" rx="3.4" ry="4.4" fill="#ff5a30" opacity="0.95"/>';
          for (let i = 0; i < 9; i++) {
            const a = (i / 9) * Math.PI * 2;
            const tx = 50 + Math.cos(a) * 8.6;
            const ty = 33 + Math.sin(a) * 10.4;
            const ix = 50 + Math.cos(a) * 6.2;
            const iy = 33 + Math.sin(a) * 7.6;
            const nx = -Math.sin(a) * 1.7;
            const ny = Math.cos(a) * 1.7;
            extra += '<path d="M' + (tx + nx).toFixed(1) + ' ' + (ty + ny).toFixed(1) +
              ' L' + (tx - nx).toFixed(1) + ' ' + (ty - ny).toFixed(1) +
              ' L' + ix.toFixed(1) + ' ' + iy.toFixed(1) + ' z" fill="#f6efdf" opacity="0.95"/>';
          }
        }
        const hideDorsal = !!(fishCfg.flippers || fishCfg.ridge || fishCfg.maw || fishCfg.batWings);
        // ---- 日魇鱼：白天变暗时图标要能一眼跳出「蝠翼 / 无眼 / 鱼群」 ----
        if (fishCfg.batWings) {
          const bw = fishCfg.batWings;
          // 图标底色是米白：翼膜用主体压暗色 + 深描边，白翼会整片消失
          const wingCol = fc;
          const edgeCol = '#39424a';
          // 背后两片带指状凹口的膜翼：这是「蝙蝠鱼」唯一认得出的剪影
          extra += '<path d="M31 27 Q45 6 61 17 Q56 25 60 33 Q50 31 43 28 Q35 30 31 27 Z" fill="' + wingCol +
            '" opacity="0.80" stroke="' + edgeCol + '" stroke-width="1.2"/>' +
            '<path d="M31 33 Q45 54 61 43 Q56 35 60 27 Q50 29 43 32 Q35 30 31 33 Z" fill="' + wingCol +
            '" opacity="0.66" stroke="' + edgeCol + '" stroke-width="1.2"/>';
        }
        if (fishCfg.school) {
          // 逆光之群：身后跟一小群黑色剪影
          for (let i = 0; i < 5; i++) {
            extra += '<ellipse cx="' + (8 + i * 6.5) + '" cy="' + (13 + (i % 2) * 9) + '" rx="4.2" ry="2.1" fill="#0a0a0c" opacity="0.5"/>';
          }
        }
        if (fishCfg.bubbles) {
          [[52, 15], [58, 21], [47, 10], [61, 12]].forEach((p) => {
            extra += '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="1.7" fill="#ffd6b8" opacity="0.6"/>';
          });
        }
        const dayBase = fishCfg.daymare
          ? '<circle cx="32" cy="32" r="27" fill="#d9c98a" opacity="0.10"/>' +
            '<circle cx="32" cy="32" r="27" fill="none" stroke="#9a8a58" stroke-width="1.1" opacity="0.35"/>'
          : '';
        const bloodBase = fishCfg.blood
          ? '<circle cx="32" cy="32" r="27" fill="#ff2a1a" opacity="0.13"/>' +
            '<circle cx="32" cy="32" r="27" fill="none" stroke="#ff3a2a" stroke-width="1.2" opacity="0.45"/>'
          : '';
        // 无眼 / 白膜：直接改掉那只眼睛，别的地方怎么画都盖不住这个特征
        const eyeSvg = fishCfg.eyeless
          ? '<path d="M' + (sh.eye[0] - 2.6) + ' 31 q2.6 -1.6 5 0" stroke="#8f867a" stroke-width="1.6" fill="none" opacity="0.8"/>'
          : fishCfg.blind
            ? '<circle cx="' + sh.eye[0] + '" cy="' + sh.eye[1] + '" r="3.1" fill="#f7fbfd" stroke="#5d6b72" stroke-width="1.1"/>'
            : '<circle cx="' + sh.eye[0] + '" cy="' + sh.eye[1] + '" r="2.6" fill="#12181c"/>';
        return '<svg viewBox="0 0 64 64" fill="none">' + bloodBase + dayBase + halo +
          '<g transform="translate(32 32) scale(1.16) translate(-32 -32)">' +
          '<path d="' + tailPath + '" fill="' + fin + '" opacity="0.95"/>' +
          '<path d="' + sh.b + '" fill="' + fc + '" stroke="' + hexCss(0x10161a) + '" stroke-width="2.4" stroke-linejoin="round"/>' +
          (hideDorsal ? '' : '<path d="M' + (sh.eye[0] + 4) + ' ' + sh.fy + ' l6 -9 7 10 z" fill="' + fin + '" opacity="0.9"/>') +
          extra +
          '<path d="M' + (sh.eye[0] + 4) + ' 30 L' + (sh.eye[0] + 4) + ' 39" stroke="' + belly + '" stroke-width="1.4" opacity="0.5"/>' +
          marks +
          eyeSvg +
          '</g></svg>';
      }
      const rod = (extra) => wrap(
        '<path d="M12 54 L46 12"/>' +
        '<path d="M46 12 Q55 22 52 34" stroke-width="1.6"/>' +
        '<circle cx="52" cy="38" r="2.4" ' + F + '/>' +
        '<circle cx="24" cy="42" r="5.5" ' + F + '/>' +
        '<path d="M10 54 l7 -7" stroke-width="5.5"/>' + (extra || ''));
      // ===== 卡通水墨鱼竿（10 根独立造型）— 不需要时整体删除本段，并删除下面的提前返回即可 =====
      // 每根竿都是独立完整 SVG：手竿/海竿、纺车轮/鼓轮/封闭轮、导环与专属装饰全部不同；
      // 配色统一用中等偏深主题色 + 墨色描边，保证在宣纸浅底上轮廓清晰、不再靠默认近白色。
      const rodShell = (inner) =>
        '<svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">' + inner + '</svg>';
      const ROD_ART = {
        // 1 竹鱼竿：无轮手竿，明显竹节 + 缠绳手柄
        bamboo: rodShell(
          '<path d="M14 52 Q30 32 50 10" stroke="#a8814a" stroke-width="4.5" stroke-linecap="round"/>' +
          '<path d="M22 43 l3 2.5 M30 34 l3 2.5 M38 25 l3 2.5 M45 17 l2.5 2.5" stroke="#6f5226" stroke-width="2" stroke-linecap="round"/>' +
          '<path d="M12 54 l6 -6" stroke="#7a5a2e" stroke-width="7" stroke-linecap="round"/>' +
          '<path d="M50 10 q4 8 2 16" stroke="#5e574a" stroke-width="1.4"/>' +
          '<circle cx="52" cy="28" r="1.6" fill="#b8402e"/>'),
        // 2 碳素鱼竿：无轮伸缩手竿，笔直分节环，深灰蓝
        carbon: rodShell(
          '<path d="M14 52 L50 12" stroke="#3d4d58" stroke-width="4" stroke-linecap="round"/>' +
          '<path d="M23 42 l2.5 -2.5 M31 33 l2.5 -2.5 M39 24 l2.5 -2.5 M46 16 l2 -2" stroke="#7d94a3" stroke-width="2.2"/>' +
          '<path d="M12 54 l6 -6" stroke="#28353e" stroke-width="7" stroke-linecap="round"/>' +
          '<path d="M50 12 q3 7 1 14" stroke="#5e574a" stroke-width="1.3"/>' +
          '<circle cx="51" cy="27" r="1.5" fill="#4f93a8"/>'),
        // 3 大师鱼竿：无轮手竿，缠线 X 绑点 + 金环 + 梢金星
        master: rodShell(
          '<path d="M14 52 Q32 30 48 12" stroke="#b37f4d" stroke-width="4.2" stroke-linecap="round"/>' +
          '<path d="M26 38 l4 4 M30 38 l-4 4 M36 27 l4 4 M40 27 l-4 4" stroke="#7a5230" stroke-width="1.8"/>' +
          '<circle cx="22" cy="43" r="2.2" stroke="#cf9b45" stroke-width="1.8"/>' +
          '<path d="M12 54 l6 -6" stroke="#8a5a30" stroke-width="7" stroke-linecap="round"/>' +
          '<path d="M48 6 l1.2 2.6 2.6 1.2 -2.6 1.2 -1.2 2.6 -1.2 -2.6 -2.6 -1.2 2.6 -1.2 z" fill="#cf9b45"/>' +
          '<path d="M48 12 q3 8 1 16" stroke="#5e574a" stroke-width="1.3"/>'),
        // 4 玻璃钢矶竿：纺车轮（下垂带摇臂）+ 沿竿多导环，明显弯，花青加深
        glass: rodShell(
          '<path d="M14 50 Q26 38 40 30 Q48 22 50 12" stroke="#2f7e96" stroke-width="4" stroke-linecap="round"/>' +
          '<path d="M11 53 l6 -6" stroke="#235e72" stroke-width="7" stroke-linecap="round"/>' +
          '<circle cx="20" cy="44" r="5" fill="#3a7488" stroke="#235e72" stroke-width="2"/>' +
          '<path d="M20 49 v5" stroke="#235e72" stroke-width="2.2"/><circle cx="20" cy="55" r="1.8" fill="#235e72"/>' +
          '<circle cx="28" cy="38" r="2" fill="none" stroke="#235e72" stroke-width="1.8"/>' +
          '<circle cx="37" cy="31" r="1.7" fill="none" stroke="#235e72" stroke-width="1.6"/>' +
          '<circle cx="45" cy="20" r="1.5" fill="none" stroke="#235e72" stroke-width="1.5"/>' +
          '<path d="M50 12 q2 10 0 18" stroke="#5e574a" stroke-width="1.2"/>'),
        // 5 深渊钛竿：横置大鼓式轮 + 侧摇柄，粗壮，紫色加深（不再近白）
        abyss: rodShell(
          '<path d="M14 50 L48 14" stroke="#5a4a80" stroke-width="4.6" stroke-linecap="round"/>' +
          '<path d="M11 53 l6 -6" stroke="#3a2f56" stroke-width="7.5" stroke-linecap="round"/>' +
          '<rect x="16" y="40" width="12" height="9" rx="3" fill="#6a5a96" stroke="#3a2f56" stroke-width="2"/>' +
          '<circle cx="22" cy="44.5" r="2.4" fill="#3a2f56"/>' +
          '<path d="M28 44 h5" stroke="#3a2f56" stroke-width="2.2"/><circle cx="34" cy="44" r="1.7" fill="#3a2f56"/>' +
          '<circle cx="32" cy="32" r="2" fill="none" stroke="#3a2f56" stroke-width="1.8"/>' +
          '<circle cx="40" cy="23" r="1.7" fill="none" stroke="#3a2f56" stroke-width="1.6"/>' +
          '<path d="M48 14 q3 9 1 17" stroke="#5e574a" stroke-width="1.2"/>'),
        // 6 水晶竿：多面切割切面竿身 + 透明感纺车轮，浅蓝但深蓝描边保证轮廓
        crystal: rodShell(
          '<path d="M14 50 L24 40 L22 36 L32 28 L30 24 L40 16 L48 12" stroke="#3f7d96" stroke-width="3.4" stroke-linejoin="round" stroke-linecap="round"/>' +
          '<path d="M24 40 L22 36 M32 28 L30 24" stroke="#a8d8e8" stroke-width="1.6"/>' +
          '<path d="M18 46 l4 -4 M28 32 l4 -4" stroke="#a8d8e8" stroke-width="1.4"/>' +
          '<path d="M11 53 l6 -6" stroke="#2f6a80" stroke-width="7" stroke-linecap="round"/>' +
          '<circle cx="19" cy="45" r="4.6" fill="#7fc0d6" stroke="#2f6a80" stroke-width="2"/>' +
          '<path d="M19 49.5 v4.5" stroke="#2f6a80" stroke-width="2"/><circle cx="19" cy="55" r="1.6" fill="#2f6a80"/>' +
          '<path d="M33 29 l2 2 -2 2 -2 -2 z" fill="#a8d8e8" stroke="#2f6a80" stroke-width="1.3"/>' +
          '<path d="M43 18 l1.6 1.6 -1.6 1.6 -1.6 -1.6 z" fill="#a8d8e8" stroke="#2f6a80" stroke-width="1.2"/>'),
        // 7 龙骨竿：一排金色龙棘 + 红金鼓轮，红棕
        dragon: rodShell(
          '<path d="M14 50 Q30 34 48 14" stroke="#b8402e" stroke-width="4.4" stroke-linecap="round"/>' +
          '<path d="M11 53 l6 -6" stroke="#7a2c20" stroke-width="7.5" stroke-linecap="round"/>' +
          '<path d="M24 40 l3 -7 3 7 z" fill="#cf9b45" stroke="#7a2c20" stroke-width="1.4"/>' +
          '<path d="M32 32 l3 -7 3 7 z" fill="#cf9b45" stroke="#7a2c20" stroke-width="1.4"/>' +
          '<path d="M40 24 l3 -7 3 7 z" fill="#cf9b45" stroke="#7a2c20" stroke-width="1.4"/>' +
          '<rect x="15" y="40" width="11" height="8.5" rx="3" fill="#cf9b45" stroke="#7a2c20" stroke-width="2"/>' +
          '<circle cx="20.5" cy="44.2" r="2.2" fill="#7a2c20"/>' +
          '<path d="M48 14 l2 -6 3 5 z" fill="#cf9b45" stroke="#7a2c20" stroke-width="1.3"/>' +
          '<path d="M50 12 q3 8 1 16" stroke="#5e574a" stroke-width="1.2"/>'),
        // 8 星辉竿：四角星 + 星点 + 纺车轮，紫
        astral: rodShell(
          '<path d="M14 50 Q30 32 48 14" stroke="#6a5aa8" stroke-width="4.2" stroke-linecap="round"/>' +
          '<path d="M11 53 l6 -6" stroke="#463a78" stroke-width="7" stroke-linecap="round"/>' +
          '<path d="M40 16 l1.6 3.4 3.4 1.6 -3.4 1.6 -1.6 3.4 -1.6 -3.4 -3.4 -1.6 3.4 -1.6 z" fill="#b7a8ff" stroke="#463a78" stroke-width="1.2"/>' +
          '<path d="M30 28 l1.2 2.6 2.6 1.2 -2.6 1.2 -1.2 2.6 -1.2 -2.6 -2.6 -1.2 2.6 -1.2 z" fill="#b7a8ff"/>' +
          '<circle cx="35" cy="34" r="1.5" fill="#b7a8ff"/><circle cx="25" cy="40" r="1.3" fill="#b7a8ff"/>' +
          '<circle cx="19" cy="45" r="4.6" fill="#7d6cc0" stroke="#463a78" stroke-width="2"/>' +
          '<path d="M19 49.5 v4.5" stroke="#463a78" stroke-width="2"/><circle cx="19" cy="55" r="1.6" fill="#463a78"/>'),
        // 9 虚空竿：同心虚空眼 + 封闭轮，深紫黑
        void: rodShell(
          '<path d="M14 50 Q30 32 48 14" stroke="#3a2f54" stroke-width="4.6" stroke-linecap="round"/>' +
          '<path d="M11 53 l6 -6" stroke="#241c38" stroke-width="7.5" stroke-linecap="round"/>' +
          '<circle cx="34" cy="30" r="6.5" fill="none" stroke="#7a6ab0" stroke-width="2"/>' +
          '<circle cx="34" cy="30" r="3.4" fill="none" stroke="#7a6ab0" stroke-width="1.8"/>' +
          '<circle cx="34" cy="30" r="1.4" fill="#b8402e"/>' +
          '<rect x="15" y="41" width="10" height="8" rx="4" fill="#5a4a80" stroke="#241c38" stroke-width="2"/>' +
          '<circle cx="44" cy="20" r="2.4" fill="none" stroke="#7a6ab0" stroke-width="1.5"/>' +
          '<path d="M48 14 q3 8 1 16" stroke="#5e574a" stroke-width="1.2"/>'),
        // 10 创世竿：金色多环 + 宝珠光环 + 华丽鼓轮，最华丽
        genesis: rodShell(
          '<path d="M14 50 Q30 32 48 14" stroke="#cf9b45" stroke-width="4.6" stroke-linecap="round"/>' +
          '<path d="M11 53 l6 -6" stroke="#9a6a24" stroke-width="7.5" stroke-linecap="round"/>' +
          '<circle cx="26" cy="38" r="2.4" fill="none" stroke="#b8862e" stroke-width="2"/>' +
          '<circle cx="35" cy="29" r="2" fill="none" stroke="#b8862e" stroke-width="1.8"/>' +
          '<rect x="15" y="40" width="11" height="8.5" rx="3" fill="#e0b25c" stroke="#9a6a24" stroke-width="2"/>' +
          '<circle cx="20.5" cy="44.2" r="2.2" fill="#b8402e"/>' +
          '<circle cx="48" cy="10" r="6" fill="none" stroke="#cf9b45" stroke-width="1.6" opacity="0.85"/>' +
          '<circle cx="48" cy="10" r="3.2" fill="#b8402e" stroke="#9a6a24" stroke-width="1.4"/>' +
          '<path d="M48 2 v2 M56 10 h-2 M40 10 h2" stroke="#cf9b45" stroke-width="1.5" stroke-linecap="round"/>')
      };
      if (ROD_ART[id]) return ROD_ART[id];
      // ===== 卡通水墨鱼竿段结束 =====
      switch (id) {
        case 'rifle': return wrap(
          '<path d="M4 40 l14 -5 2 6 -12 5 z" ' + F + '/>' +
          '<rect x="20" y="29" width="22" height="9" rx="2" ' + F + '/>' +
          '<path d="M42 31 h18 M42 36 h14"/>' +
          '<path d="M28 38 l1.5 9 h6 l1.5 -9 z" ' + F + '/>' +
          '<path d="M38 38 v6"/>');
        case 'smg': return wrap(
          '<path d="M14 32 l-9 -4 v10 l9 1 z" ' + F + '/>' +
          '<rect x="14" y="30" width="26" height="9" rx="3.5" ' + F + '/>' +
          '<path d="M40 33 h16"/>' +
          '<path d="M20 27 h10"/>' +
          '<path d="M26 39 l1 8 h5 l1 -8 z" ' + F + '/>');
        case 'sniper': return wrap(
          '<path d="M4 41 l16 -6 2 6 -14 6 z" ' + F + '/>' +
          '<rect x="20" y="31" width="24" height="8" rx="2" ' + F + '/>' +
          '<path d="M44 33 h16 M44 37 h18"/>' +
          '<rect x="26" y="23" width="12" height="5" rx="2.5" ' + F + '/>' +
          '<path d="M30 39 l1 8 h5 l1 -8 z" ' + F + '/>');
        case 'shotgun': return wrap(
          '<path d="M4 40 l14 -5 2 7 -12 5 z" ' + F + '/>' +
          '<path d="M20 33 h38 M20 38 h34" stroke-width="5"/>' +
          '<rect x="18" y="29" width="12" height="11" rx="2" ' + F + '/>' +
          '<rect x="38" y="41" width="11" height="4.5" rx="2" ' + F + '/>');
        case 'lmg': return wrap(
          '<path d="M4 40 l14 -5 2 6 -12 5 z" ' + F + '/>' +
          '<rect x="20" y="28" width="24" height="11" rx="2" ' + F + '/>' +
          '<path d="M44 31 h16 M44 36 h14"/>' +
          '<rect x="24" y="39" width="12" height="9" rx="1.5" ' + F + '/>' +
          '<path d="M50 39 l5 9 M44 39 l-4 9"/>');
        case 'fist': return wrap(
          '<path d="M17 36 a9 9 0 0 1 9 -9 h12 a9 9 0 0 1 9 9 v8 a9 9 0 0 1 -9 9 h-12 a9 9 0 0 1 -9 -9 z" ' + F + '/>' +
          '<path d="M20 36 h24 M27 27 v9 M34 27 v9 M41 29 v7" stroke="#00000055" stroke-width="2.2"/>' +
          '<path d="M17 40 l-7 5 v-11 z" ' + F + '/>');
        case 'bamboo': return rod();
        case 'carbon': return rod('<path d="M30 34 l6 -6" stroke-width="4"/>');
        case 'rod': return rod();
        case 'master': return rod(
          '<path d="M52 4 l1.6 3.4 3.4 1.6 -3.4 1.6 -1.6 3.4 -1.6 -3.4 -3.4 -1.6 3.4 -1.6 z" ' + F + '/>');
        case 'glass': return rod('<rect x="26" y="30" width="7" height="7" rx="1.5" ' + F + '/>');
        case 'abyss': return rod(
          '<path d="M46 6 l1.6 3.4 3.4 1.6 -3.4 1.6 -1.6 3.4 -1.6 -3.4 -3.4 -1.6 3.4 -1.6 z" ' + F + '/>' +
          '<path d="M28 32 h7 v7 h-7 z" ' + F + '/>');
        case 'pistol': return wrap(
          '<path d="M18 26 h26 v9 h-26 z" ' + F + '/>' +
          '<path d="M44 28 h10" stroke-width="5"/>' +
          '<path d="M22 35 h9 l-2 12 h-8 z" ' + F + '/>' +
          '<path d="M33 35 q4 6 0 10" stroke-width="2.4"/>' +
          '<path d="M20 24 h20" stroke-width="2" opacity="0.6"/>');
        case 'revolver': return wrap(
          '<path d="M16 28 h24 v8 h-24 z" ' + F + '/>' +
          '<circle cx="32" cy="32" r="8" ' + F + '/>' +
          '<circle cx="32" cy="32" r="3" fill="#00000055" stroke="none"/>' +
          '<path d="M40 30 h16" stroke-width="5"/>' +
          '<path d="M22 36 h8 l-3 13 h-8 z" ' + F + '/>');
        case 'db': return wrap(
          '<path d="M14 38 l12 -5 2 8 -11 5 z" ' + F + '/>' +
          '<path d="M26 30 h32 M26 36 h32" stroke-width="5.5"/>' +
          '<rect x="22" y="27" width="12" height="13" rx="2" ' + F + '/>' +
          '<path d="M44 41 h10" stroke-width="4" opacity="0.8"/>');
        case 'dmr': return wrap(
          '<path d="M2 41 l16 -6 2 6 -14 6 z" ' + F + '/>' +
          '<rect x="18" y="31" width="26" height="8" rx="2" ' + F + '/>' +
          '<path d="M44 33 h16 M44 37 h15"/>' +
          '<rect x="25" y="21" width="14" height="6" rx="3" ' + F + '/>' +
          '<path d="M29 39 l1 9 h6 l1 -9 z" ' + F + '/>');
        case 'minigun': return wrap(
          '<rect x="10" y="26" width="14" height="14" rx="3" ' + F + '/>' +
          '<path d="M24 28 h30 M24 33 h30 M24 38 h30" stroke-width="4"/>' +
          '<circle cx="32" cy="33" r="9" fill="none" stroke-width="2.4"/>' +
          '<path d="M12 40 l-6 10 M22 40 l6 10" stroke-width="3"/>' +
          '<path d="M8 24 h10" stroke-width="2.5"/>');
        case 'amr': return wrap(
          '<path d="M2 42 l16 -7 2 7 -14 6 z" ' + F + '/>' +
          '<rect x="18" y="29" width="26" height="10" rx="2" ' + F + '/>' +
          '<path d="M44 31 h18 M44 37 h18" stroke-width="4"/>' +
          '<rect x="24" y="20" width="18" height="6" rx="3" ' + F + '/>' +
          '<rect x="50" y="26" width="9" height="14" rx="2" ' + F + '/>' +
          '<path d="M30 39 l-3 10 M38 39 l3 10" stroke-width="2.4"/>');
        case 'railgun': return wrap(
          '<rect x="16" y="27" width="20" height="12" rx="3" ' + F + '/>' +
          '<path d="M36 29 h20 M36 37 h20" stroke-width="3.5"/>' +
          '<circle cx="42" cy="33" r="3.5" fill="none" stroke-width="2"/>' +
          '<circle cx="50" cy="33" r="3.5" fill="none" stroke-width="2"/>' +
          '<path d="M56 33 l6 -5 v10 z" ' + F + '/>' +
          '<path d="M22 39 l-2 10" stroke-width="3"/>' +
          '<path d="M20 24 l0 -6" stroke-width="2" opacity="0.7"/>');
        case 'crystal': return rod('<path d="M28 30 l6 -6 6 6 -6 6 z" ' + F + '/>');
        case 'dragon': return rod(
          '<path d="M27 31 q5 -7 11 -1 q4 4 -3 7 q-6 3 -8 -6 z" ' + F + '/>');
        case 'astral': return rod(
          '<circle cx="52" cy="10" r="3" ' + F + '/>' +
          '<path d="M44 16 l1.4 3 3 1.4 -3 1.4 -1.4 3 -1.4 -3 -3 -1.4 3 -1.4 z" ' + F + '/>');
        case 'void': return rod(
          '<circle cx="50" cy="14" r="6" fill="none" stroke-width="2.4"/>' +
          '<circle cx="50" cy="14" r="2.4" ' + F + '/>');
        case 'genesis': return rod(
          '<circle cx="52" cy="10" r="4" fill="none" stroke-width="2"/>' +
          '<path d="M52 3 v14 M45 10 h14" stroke-width="1.6" opacity="0.8"/>' +
          '<circle cx="46" cy="18" r="1.8" ' + F + '/>');
        case 'ammo': return wrap(
          '<rect x="10" y="28" width="44" height="24" rx="3" ' + F + '/>' +
          '<path d="M18 28 v-5 h28 v5"/>' +
          '<path d="M20 34 v12 M28 34 v12 M36 34 v12 M44 34 v12" stroke="#00000044" stroke-width="2.6"/>');
        case '海藻': return wrap(
          '<path d="M26 56 Q14 44 24 32 Q34 20 22 8" stroke-width="5"/>' +
          '<path d="M38 56 Q50 42 40 30 Q30 18 42 10" stroke-width="5"/>' +
          '<path d="M32 56 Q28 40 34 26" stroke-width="3.5" opacity="0.7"/>');
        case '贝壳': return wrap(
          '<path d="M10 48 Q32 6 54 48 Q42 56 32 52 Q22 56 10 48 Z" ' + F + '/>' +
          '<path d="M32 52 L20 18 M32 52 L28 12 M32 52 L38 13 M32 52 L44 19" stroke-width="2" opacity="0.65"/>' +
          '<path d="M32 52 v-24" stroke-width="2" opacity="0.4"/>');
        case '旧瓶子': return wrap(
          '<path d="M27 8 h10 v10 l6 7 v25 a6 6 0 0 1 -6 6 h-10 a6 6 0 0 1 -6 -6 v-25 l6 -7 z" ' + F + '/>' +
          '<rect x="25" y="4" width="14" height="6" rx="2" ' + F + '/>' +
          '<path d="M24 32 h16" stroke-width="2" opacity="0.5"/>' +
          '<path d="M29 38 h8" stroke-width="2" opacity="0.4"/>');
        case '珍珠': return wrap(
          '<circle cx="32" cy="32" r="16" fill="' + C + '" stroke="' + C + '"/>' +
          '<path d="M22 24 Q28 17 36 18" stroke="#ffffff" stroke-width="4" opacity="0.85"/>' +
          '<circle cx="32" cy="32" r="22" stroke-width="1.6" opacity="0.4"/>');
        case '鱼饵': return wrap(
          '<path d="M18 18 q10 -8 18 2 q7 9 -3 14 q-11 5 -16 -6" ' + F + '/>' +
          '<path d="M40 34 v14 q0 8 -8 8 q-8 0 -8 -8" stroke-width="2.6"/>' +
          '<path d="M32 48 l-4 8 4 -2 4 2 z" ' + F + '/>' +
          '<circle cx="24" cy="20" r="2.4" fill="#ffffff" stroke="none" opacity="0.85"/>');
        default: return wrap('<rect x="14" y="14" width="36" height="36" rx="4" ' + F + '/>');
      }
    }

    // ===== 子弹图标（5 种造型，按弹药类型区分）— 不需要时整体删除本段 =====
    // 统一竖直子弹：弹头造型 + 专属特效（钢芯/曳光/火焰/能量芯），墨色描边保证在宣纸底上清晰。
    ammoIcon(typeId) {
      const t = window.AMMO_TYPES[typeId] || window.AMMO_TYPES.standard;
      const c = '#' + (t.color & 0xffffff).toString(16).padStart(6, '0');
      const INK = '#2c2a26';
      // 弹壳 + 底缘（所有子弹共用）
      const shell =
        '<path d="M24 30 h16 v18 a2 2 0 0 1 -2 2 h-12 a2 2 0 0 1 -2 -2 z" fill="' + c + '" stroke="' + INK + '" stroke-width="2.2"/>' +
        '<path d="M24 45 h16" stroke="' + INK + '" stroke-width="1.6" opacity="0.55"/>' +
        '<rect x="29" y="48" width="6" height="2.4" rx="1" fill="' + INK + '" opacity="0.7"/>';
      let head = '';
      if (typeId === 'ap') {
        // 穿甲：尖锐长弹头 + 深色钢芯
        head = '<path d="M24 30 L32 7 L40 30 z" fill="' + c + '" stroke="' + INK + '" stroke-width="2.2" stroke-linejoin="round"/>' +
          '<path d="M30 22 L32 9 L34 22 z" fill="' + INK + '" opacity="0.85"/>';
      } else if (typeId === 'tracer') {
        // 曳光：圆弹头 + 底部光迹
        head = '<path d="M24 30 q8 -16 16 0 z" fill="' + c + '" stroke="' + INK + '" stroke-width="2.2" stroke-linejoin="round"/>' +
          '<path d="M28 52 l-2 8 M32 52 l0 9 M36 52 l2 8" stroke="' + c + '" stroke-width="2.2" stroke-linecap="round" opacity="0.85"/>' +
          '<circle cx="32" cy="52" r="2.2" fill="' + c + '"/>';
      } else if (typeId === 'incendiary') {
        // 燃烧：弹头 + 上方火焰（控制在 viewBox 内）
        head = '<path d="M24 30 q8 -14 16 0 z" fill="' + c + '" stroke="' + INK + '" stroke-width="2.2" stroke-linejoin="round"/>' +
          '<path d="M32 16 q-5 -3 -2 -8 q1 3 4 3 q3 -2 2 -7 q5 4 2 10 q-2 3 -6 2 z" fill="#ff8a3d" stroke="' + INK + '" stroke-width="1.4"/>' +
          '<path d="M31 13 q-2 -3 0 -5" stroke="#ffd166" stroke-width="1.6" fill="none" stroke-linecap="round"/>';
      } else if (typeId === 'energy') {
        // 能量：弹头 + 能量芯 + 光环
        head = '<path d="M24 30 q8 -16 16 0 z" fill="' + c + '" stroke="' + INK + '" stroke-width="2.2" stroke-linejoin="round"/>' +
          '<path d="M32 18 l4 5 -4 5 -4 -5 z" fill="#ffffff" opacity="0.9"/>' +
          '<ellipse cx="32" cy="36" rx="13" ry="4" fill="none" stroke="' + c + '" stroke-width="1.6" opacity="0.7"/>';
      } else {
        // 普通：标准圆弹头
        head = '<path d="M24 30 q8 -16 16 0 z" fill="' + c + '" stroke="' + INK + '" stroke-width="2.2" stroke-linejoin="round"/>';
      }
      return '<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">' + head + shell + '</svg>';
    }

    // 换鱼竿后立刻把新竿的外观套上去：竿身颜色、发光、长度、
    // 竿尖光球都要马上变，否则玩家在商店里换了竿，手上还是旧那根。
    applyRodChange(id) {
      if (!this.fishing) return;
      const cfg = window.RODS[id];
      if (!cfg) return;
      this.fishing.rodCfg = cfg;
      if (this.fishing.applyRodLook) this.fishing.applyRodLook();
    }

    // 商店/装备界面渲染
    // ---------- 鱼竿 / 宝箱 / 背包：三个店的通用面板 ----------
    // 三间铺子共用一套 DOM，靠 kind 决定标题、卡片和点击行为。
    chestIcon(tone) {
      const t = tone || '#c8a878';
      return '<svg viewBox="0 0 64 64" fill="none">' +
        '<path d="M10 30 Q10 20 19 20 H45 Q54 20 54 30 V32 H10 Z" fill="' + t + '" stroke="#1a1712" stroke-width="2.4" stroke-linejoin="round"/>' +
        '<rect x="10" y="31" width="44" height="22" rx="2.5" fill="' + t + '" stroke="#1a1712" stroke-width="2.4"/>' +
        '<rect x="10" y="31" width="44" height="4.5" fill="rgba(0,0,0,.26)"/>' +
        '<rect x="27" y="30" width="10" height="9.5" rx="1.6" fill="#e2b64c" stroke="#4a3a14" stroke-width="1.8"/>' +
        '<circle cx="32" cy="35" r="1.5" fill="#4a3a14"/>' +
        '<path d="M18 21 v31 M46 21 v31" stroke="rgba(0,0,0,.24)" stroke-width="2.6"/>' +
        '</svg>';
    }

    bagIcon(tone, flap) {
      const t = tone || '#8a7a5c';
      const f = flap || '#6b5c44';
      return '<svg viewBox="0 0 64 64" fill="none">' +
        '<path d="M19 19 H45 Q50 19 50 25 V49 Q50 54 45 54 H19 Q14 54 14 49 V25 Q14 19 19 19 Z" fill="' + t + '" stroke="#141a22" stroke-width="2.4" stroke-linejoin="round"/>' +
        '<path d="M14 31 Q14 24 20 24 H44 Q50 24 50 31 V37 H14 Z" fill="' + f + '" stroke="#141a22" stroke-width="2.4" stroke-linejoin="round"/>' +
        '<rect x="28" y="33" width="8" height="7" rx="1.4" fill="#c9a24a" stroke="#3a2f12" stroke-width="1.5"/>' +
        '<path d="M22 54 v-9 M42 54 v-9" stroke="rgba(0,0,0,.3)" stroke-width="2.2"/>' +
        '</svg>';
    }

    tradeMsg(text, ok) {
      const el = document.getElementById('tradeMsg');
      if (!el) return;
      el.textContent = text;
      el.className = ok ? 'ok' : 'bad';
    }

    showLoot(list) {
      const box = document.getElementById('tradeLoot');
      if (!box) return;
      box.innerHTML = (list || []).map((r, i) =>
        '<span class="loot-chip" style="border-color:' + r.color + ';color:' + r.color + ';animation-delay:' + (i * 90) + 'ms">' +
        '<b>[' + r.tierName + ']</b> ' + r.text + '</span>'
      ).join('');
    }

    renderTrade(kind) {
      const Eco = window.Economy;
      const grid = document.getElementById('tradeGrid');
      if (!grid || !Eco) return;
      this.tradeKind = kind;
      const title = document.getElementById('tradeTitle');
      const sub = document.getElementById('tradeSub');
      const eyebrow = document.getElementById('tradeEyebrow');
      const loot = document.getElementById('tradeLoot');
      if (loot) loot.innerHTML = '';
      grid.innerHTML = '';
      const bal = '<span class="bal">' + Eco.balance + '</span>';

      if (kind === 'rod') {
        if (eyebrow) eyebrow.textContent = 'ROD SHOP';
        if (title) title.textContent = '鱼竿商店';
        const cur = window.RODS[Eco.rod];
        if (sub) sub.innerHTML = '积分余额 ' + bal + ' · 手上拿着 ' + (cur ? cur.name : '—') +
          ' · <em style="color:#ffb47a;font-style:normal">换更高一档鱼竿会进入新钓季：所有枪械作废，要重新购买</em>';
        Object.keys(window.RODS).forEach((id) => {
          const r = window.RODS[id];
          const unlock = Eco.rodUnlockState(id);
          const on = Eco.rod === id;
          const card = document.createElement('div');
          if (unlock === 'locked') {
            card.className = 'trade-card unknown';
            card.dataset.id = '';
            card.innerHTML =
              '<div class="tc-icon unknown-icon">?</div>' +
              '<div class="tc-name unknown-name">未知</div>' +
              '<div class="tc-desc unknown-desc">先解锁前一级鱼竿</div>' +
              '<div class="tc-tag unknown-tag">？？？</div>';
            grid.appendChild(card);
            return;
          }
          const owned = unlock === 'owned';
          card.className = 'trade-card' + (owned ? '' : ' locked') + (on ? ' cur' : '');
          card.dataset.id = id;
          card.innerHTML =
            '<div class="tc-icon">' + this.iconFor(id) + '</div>' +
            '<div class="tc-name">' + r.name + '</div>' +
            '<div class="tc-desc">' + (r.desc || '') + '</div>' +
            (owned
              ? '<div class="tc-tag">' + (on ? '正在使用' : '已拥有 · 点击装备') + '</div>'
              : '<div class="tc-cost">' + r.price + ' 积分解锁</div>');
          grid.appendChild(card);
        });
        return;
      }

      if (kind === 'chest') {
        if (eyebrow) eyebrow.textContent = 'CHEST SHOP';
        if (title) title.textContent = '宝箱商店';
        if (sub) sub.innerHTML = '积分余额 ' + bal + ' · 开箱必得一物，按稀有度掉落；越贵的箱子件数与稀有率越高';
        const tiers = window.LOOT_TIERS || {};
        const order = ['common', 'fine', 'rare', 'epic', 'legend'];
        Object.keys(window.CHESTS).forEach((id) => {
          const c = window.CHESTS[id];
          let tot = 0;
          order.forEach((k) => { tot += (c.weights[k] || 0); });
          const odds = order.map((k) => {
            const ti = tiers[k] || {};
            const pct = tot > 0 ? (c.weights[k] || 0) / tot * 100 : 0;
            return '<i style="color:' + (ti.color || '#ccc') + '">' + (ti.name || k) + ' ' + pct.toFixed(pct < 10 ? 1 : 0) + '%</i>';
          }).join('');
          const card = document.createElement('div');
          card.className = 'trade-card';
          card.dataset.id = id;
          card.innerHTML =
            '<div class="tc-icon">' + this.chestIcon(c.tone) + '</div>' +
            '<div class="tc-name">' + c.name + '</div>' +
            '<div class="tc-desc">' + c.note + '</div>' +
            '<div class="tc-cap">开出 ' + c.rolls + ' 件</div>' +
            '<div class="trade-odds">' + odds + '</div>' +
            '<div class="tc-cost">' + c.price + ' 积分 / 个</div>';
          grid.appendChild(card);
        });
        return;
      }

      if (kind === 'bag') {
        if (eyebrow) eyebrow.textContent = 'PACK SHOP';
        if (title) title.textContent = '背包商店';
        const bd = Eco.bagDef();
        if (sub) sub.innerHTML = '积分余额 ' + bal + ' · 当前 ' + bd.name +
          '，已用 ' + Eco.usedSpace() + '/' + Eco.bagCapacity + ' 格';
        const tone = {
          cloth: ['#8a7a5c', '#6b5c44'],
          canvas: ['#5f7a52', '#42583a'],
          leather: ['#8a5a34', '#633f22'],
          steel: ['#6c7a84', '#4a565e'],
          abyss: ['#5a4a8a', '#3a2f5c']
        };
        ['cloth', 'canvas', 'leather', 'steel', 'abyss'].forEach((id) => {
          const b = window.BAGS[id];
          if (!b) return;
          const owned = Eco.ownsBag(id);
          const on = Eco.bagId === id;
          const c = tone[id] || tone.cloth;
          const card = document.createElement('div');
          card.className = 'trade-card' + (owned ? '' : ' locked') + (on ? ' cur' : '');
          card.dataset.id = id;
          card.innerHTML =
            '<div class="tc-icon">' + this.bagIcon(c[0], c[1]) + '</div>' +
            '<div class="tc-name">' + b.name + '</div>' +
            '<div class="tc-desc">' + b.desc + '</div>' +
            '<div class="tc-cap">容量 ' + b.cap + ' 格</div>' +
            (owned
              ? '<div class="tc-tag">' + (on ? '正在背着' : '已拥有 · 点击换上') + '</div>'
              : '<div class="tc-cost">' + b.price + ' 积分解锁</div>');
          grid.appendChild(card);
        });
      }
    }

    buyFromTrade(id) {
      const Eco = window.Economy;
      const kind = this.tradeKind;
      if (!Eco || !kind || !id) return;

      if (kind === 'rod') {
        const r = window.RODS[id];
        if (!r) return;
        if (Eco.ownsRod(id)) {
          if (Eco.rod === id) { this.tradeMsg('这根已经拿在手上了', false); return; }
          Eco.equipRod(id);
          this.tradeMsg('换上 ' + r.name, true);
          Sound.play('swap');
        } else if (Eco.buyRod(id)) {
          const reset = Eco.rodPeak === r.tier;
          this.renderTrade('rod');
          this.tradeMsg('买下并装上了 ' + r.name +
            (reset ? ' · 新钓季开始，枪械已全部收回，只留随身手枪' : ''), true);
          Sound.play('catch');
        } else {
          this.tradeMsg('积分不足，还差 ' + (r.price - Eco.balance), false);
        }
      } else if (kind === 'chest') {
        const c = window.CHESTS[id];
        if (!c) return;
        const res = Eco.openChest(id);
        if (!res) return;
        if (res.error === 'poor') {
          this.tradeMsg('积分不足，还差 ' + res.need, false);
          return;
        }
        Sound.play('win');
        this.renderTrade('chest');
        this.showLoot(res.results);
        this.tradeMsg('打开' + c.name + '（-' + res.cost + ' 积分），得到 ' + res.results.length + ' 件东西', true);
        return;
      } else if (kind === 'bag') {
        const b = window.BAGS[id];
        if (!b) return;
        if (Eco.ownsBag(id)) {
          if (Eco.bagId === id) { this.tradeMsg('正背着这只包', false); return; }
          Eco.equipBag(id);
          this.tradeMsg('换上 ' + b.name + '，容量 ' + b.cap + ' 格', true);
          Sound.play('swap');
        } else if (Eco.buyBag(id)) {
          this.tradeMsg('买下 ' + b.name + '，容量提升到 ' + b.cap + ' 格', true);
          Sound.play('catch');
        } else {
          this.tradeMsg('积分不足，还差 ' + (b.price - Eco.balance), false);
        }
      }
      this.renderTrade(kind);
    }

    renderShop() {
      const Eco = window.Economy;
      ['balanceNum', 'balanceNumHome', 'balanceNumShop'].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.textContent = Eco.balance;
      });
      ['ammoStockNum', 'ammoStockNumShop'].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.textContent = Eco.ammoStock;
      });

      // 子弹种类卡片：颜色点 + 名称 + 打鸟经验 + 价格，当前选用类型高亮
      const ammoTypeGrid = document.getElementById('ammoTypeGrid');
      if (ammoTypeGrid) {
        const hex = (n) => '#' + ((n || 0) & 0xffffff).toString(16).padStart(6, '0');
        ammoTypeGrid.innerHTML = '';
        Object.values(window.AMMO_TYPES).forEach((t) => {
          const card = document.createElement('button');
          card.className = 'ammo-type-card' + (Eco.ammoType === t.id ? ' active' : '');
          card.dataset.ammoType = t.id;
          card.innerHTML =
            '<span class="at-icon">' + this.ammoIcon(t.id) + '</span>' +
            '<span class="at-name">' + t.name + '</span>' +
            '<span class="at-exp">体力经验 +' + t.exp + '</span>' +
            '<span class="at-cost">' + t.price + ' 积分</span>';
          ammoTypeGrid.appendChild(card);
        });
      }

      const statNames = ['威力', '射速', '弹匣', '稳定'];
      const statCls = ['dmg', 'rate', '', ''];
      // 未到解锁顺序的装备：隐藏名称/图标/价格，只显示未知
      const unknownCard = (dataAttr) => {
        const card = document.createElement('div');
        card.className = 'gun-card unknown';
        card.dataset[dataAttr] = '';
        card.innerHTML =
          '<div class="g-icon unknown-icon">?</div>' +
          '<div class="g-name unknown-name">未知</div>' +
          '<div class="g-desc unknown-desc">先解锁前一级装备</div>' +
          '<div class="p-tag unknown-tag">？？？</div>';
        return card;
      };
      const gunCard = (g, forBattle) => {
        const unlock = Eco.gunUnlockState(g.id);
        if (unlock === 'locked') return unknownCard('gun');
        const owned = unlock === 'owned';
        const slotIdx = forBattle ? this.loadoutSel.indexOf(g.id) : -1;
        const card = document.createElement('div');
        card.className = 'gun-card' + (owned ? '' : ' locked') + (slotIdx >= 0 ? ' equipped' : '');
        card.dataset.gun = g.id;
        card.innerHTML =
          '<div class="g-icon">' + this.iconFor(g.id) + '</div>' +
          '<div class="g-name">' + g.name + '</div>' +
          '<div class="g-desc">' + g.desc + '</div>' +
          g.stats.map((v, i) =>
            '<div class="stat ' + statCls[i] + '"><span class="k">' + statNames[i] + '</span><span class="bar"><i style="width:' + v + '%"></i></span></div>'
          ).join('') +
          (owned
            ? '<div class="p-tag own">' + (slotIdx >= 0 ? '槽位 ' + (slotIdx + 1) + ' · 点击移出' : (forBattle ? '点击加入背包' : '已拥有')) + '</div>'
            : '<div class="p-tag">' + g.price + ' 积分解锁</div>');
        return card;
      };
      const rodCard = (r) => {
        const unlock = Eco.rodUnlockState(r.id);
        if (unlock === 'locked') return unknownCard('rod');
        const owned = unlock === 'owned';
        const equipped = Eco.rod === r.id;
        const card = document.createElement('div');
        card.className = 'gun-card' + (owned ? '' : ' locked') + (equipped ? ' equipped' : '');
        card.dataset.rod = r.id;
        card.innerHTML =
          '<div class="g-icon">' + this.iconFor(r.id) + '</div>' +
          '<div class="g-name">' + r.name + '</div>' +
          '<div class="g-desc">' + r.desc + '</div>' +
          (owned
            ? '<div class="p-tag own">' + (equipped ? '已装备' : '点击装备') + '</div>'
            : '<div class="p-tag">' + r.price + ' 积分解锁</div>');
        return card;
      };

      const gunGrid = document.getElementById('gunGrid');
      if (gunGrid) {
        gunGrid.innerHTML = '';
        Object.values(window.GUNS).forEach((g) => gunGrid.appendChild(gunCard(g, true)));
      }
      const rodGrid = document.getElementById('rodGrid');
      if (rodGrid) {
        rodGrid.innerHTML = '';
        Object.values(window.RODS).forEach((r) => rodGrid.appendChild(rodCard(r)));
      }
      const shopGunGrid = document.getElementById('shopGunGrid');
      if (shopGunGrid) {
        shopGunGrid.innerHTML = '';
        Object.values(window.GUNS).forEach((g) => shopGunGrid.appendChild(gunCard(g, false)));
      }

      // 背包槽位显示
      const slot0 = document.getElementById('slot0');
      const slot1 = document.getElementById('slot1');
      if (slot0) slot0.innerHTML = '槽位 1<b>' + (window.GUNS[this.loadoutSel[0]] ? '<span class="slot-ic">' + this.iconFor(this.loadoutSel[0]) + '</span>' + window.GUNS[this.loadoutSel[0]].name : '—') + '</b>';
      if (slot1) slot1.innerHTML = '槽位 2<b>' + (window.GUNS[this.loadoutSel[1]] ? '<span class="slot-ic">' + this.iconFor(this.loadoutSel[1]) + '</span>' + window.GUNS[this.loadoutSel[1]].name : '空') + '</b>';
    }

    // 角色伤害倍率（快枪手 +12%）
    charDmgMul() {
      const c = window.CHARACTERS && window.CHARACTERS[window.Economy ? window.Economy.character : 'angler'];
      return (c && c.dmg) || 1;
    }

    // 角色头像：内联 SVG
    charPortrait(id) {
      const head = '<circle cx="40" cy="42" r="18" fill="#f0c19a"/>';
      const eyes = '<circle cx="33" cy="43" r="2.2" fill="#2b3138"/><circle cx="47" cy="43" r="2.2" fill="#2b3138"/>';
      const body = (fill) => '<path d="M15 96 Q17 70 40 66 Q63 70 65 96Z" fill="' + fill + '"/>';
      let inner = '';
      if (id === 'angler') {
        inner =
          '<circle cx="40" cy="44" r="34" fill="#2b4a52"/>' + body('#5c7d4e') + head +
          '<path d="M24 44 Q28 66 40 68 Q52 66 56 44 Q48 58 40 58 Q32 58 24 44Z" fill="#cfd6d8"/>' + eyes +
          '<ellipse cx="40" cy="27" rx="29" ry="7" fill="#d7b56b"/>' +
          '<path d="M24 26 Q26 8 40 8 Q54 8 56 26Z" fill="#e6c47d"/>' +
          '<path d="M23 24 h34" stroke="#8a6a33" stroke-width="3"/>' +
          '<path d="M64 96 L76 18" stroke="#c8a86a" stroke-width="2.4"/>' +
          '<path d="M76 18 q10 10 6 24" stroke="#dfe9ec" stroke-width="1.2"/>' +
          '<circle cx="82" cy="46" r="2.2" fill="#ff6b4a"/>';
      } else if (id === 'gunslinger') {
        inner =
          '<circle cx="40" cy="44" r="34" fill="#4a2f36"/>' + body('#8c3a34') + head +
          '<path d="M22 50 Q40 58 58 50 L58 59 Q40 67 22 59Z" fill="#c0392b"/>' + eyes +
          '<path d="M31 38 l6 2 M49 38 l-6 2" stroke="#2b3138" stroke-width="2"/>' +
          '<ellipse cx="40" cy="27" rx="27" ry="6" fill="#6b4530"/>' +
          '<path d="M22 27 Q24 11 40 11 Q56 11 58 27Z" fill="#7d543c"/>' +
          '<path d="M20 29 h40" stroke="#e3c26a" stroke-width="3"/>' +
          '<path d="M54 84 l25 -9 l4 6 l-24 10z" fill="#8e9aa5"/>' +
          '<path d="M56 90 l-6 8" stroke="#6b4a35" stroke-width="5"/>';
      } else if (id === 'diver') {
        // 追风者：束发头带 + 发髻 + 双飘带，青绿轻身劲装（内部 id 保留 diver）
        inner =
          '<circle cx="40" cy="44" r="34" fill="#24544c"/>' + body('#3a7d72') + head +
          '<path d="M22 50 Q40 58 58 50 L58 59 Q40 67 22 59Z" fill="#4f9e8c"/>' + eyes +
          '<rect x="22" y="27" width="36" height="9" rx="4" fill="#24544c"/>' +
          '<rect x="36" y="25" width="8" height="12" rx="2" fill="#d9c24a"/>' +
          '<circle cx="40" cy="18" r="6" fill="#24544c"/>' +
          '<path d="M57 31 q9 3 7 15" stroke="#4f9e8c" stroke-width="4" stroke-linecap="round"/>' +
          '<path d="M23 31 q-9 3 -7 15" stroke="#4f9e8c" stroke-width="4" stroke-linecap="round"/>';
      } else {
        inner =
          '<circle cx="40" cy="44" r="34" fill="#3b4a2f"/>' + body('#6b8f4e') + head +
          '<path d="M22 41 Q22 19 40 19 Q58 19 58 41 Q52 30 40 30 Q28 30 22 41Z" fill="#e0b25a"/>' + eyes +
          '<path d="M34 50 Q40 56 46 50" stroke="#b4705a" stroke-width="2.4"/>' +
          '<path d="M64 16 l2.4 5 5.2 1.7 -5.2 1.7 -2.4 5 -2.4 -5 -5.2 -1.7 5.2 -1.7z" fill="#ffd166"/>' +
          '<path d="M22 20 l1.6 3.2 3.2 1.1 -3.2 1.1 -1.6 3.2 -1.6 -3.2 -3.2 -1.1 3.2 -1.1z" fill="#ffd166"/>';
      }
      return '<svg viewBox="0 0 80 96" fill="none" stroke="none">' + inner + '</svg>';
    }

    renderChar() {
      const grid = document.getElementById('charGrid');
      if (!grid) return;
      const cur = window.Economy ? window.Economy.character : 'angler';
      grid.innerHTML = Object.values(window.CHARACTERS || {}).map((c) =>
        '<div class="char-card' + (c.id === cur ? ' sel' : '') + '" data-char="' + c.id + '">' +
        '<div class="char-portrait">' + this.charPortrait(c.id) + '</div>' +
        '<div class="char-name">' + c.name + '</div>' +
        '<div class="char-perk">' + c.perk + '</div>' +
        '</div>'
      ).join('');
    }

    // ---------------- 鱼市 ----------------
    // 左半边买鱼饵（四档，整包 10 份），右半边按收购价卖背包里的鱼。
    renderMarket() {
      const Eco = window.Economy;
      const balEl = document.getElementById('balanceNumBait');
      const numEl = document.getElementById('baitNum');
      const hookEl = document.getElementById('baitHooked');
      if (balEl) balEl.textContent = Eco.balance;
      if (numEl) numEl.textContent = Eco.totalBait ? Eco.totalBait() : 0;
      if (hookEl) {
        const b = Eco.baitSel ? window.BAITS[Eco.baitSel] : null;
        hookEl.textContent = b ? (b.name + ' ×' + Eco.baitCount(Eco.baitSel)) : '空钩';
      }

      const row = document.getElementById('baitRow');
      if (row) {
        row.innerHTML = (window.BAIT_ORDER || []).map((id) => {
          const b = window.BAITS[id];
          const owned = Eco.baitCount(id);
          const n = b.pack || 10;
          const cost = b.price * n;
          return '<div class="bait-card' + (Eco.baitSel === id ? ' hooked' : '') + '" data-bait="' + id +
            '" data-n="' + n + '" data-cost="' + cost + '">' +
            '<div class="b-head">' +
            '<span class="b-icon" style="--bc:' + b.color + '">' + this.baitIcon(id, 34) + '</span>' +
            '<div class="b-title">' +
            '<div class="b-name">' + b.name + '<i class="b-tier">' + b.tier + ' 档</i></div>' +
            '<div class="b-cost">' + cost + ' 积分 / ' + n + ' 份</div>' +
            '</div></div>' +
            '<div class="b-desc">' + b.desc + '</div>' +
            '<div class="b-stat">上限 ' + (window.FISH_GRADES && window.FISH_GRADES[b.cap] ? window.FISH_GRADES[b.cap].name : '—') +
            ' · 好鱼 ×' + b.luck.toFixed(1) + '</div>' +
            '<div class="b-own">背包 ' + owned + ' 份' + (Eco.baitSel === id ? ' · 已装钩' : '') + '</div>' +
            '</div>';
        }).join('');
      }

      const list = document.getElementById('sellFishList');
      const sumEl = document.getElementById('sellFishSum');
      const bag = Eco.fishBag || [];
      if (sumEl) {
        let total = 0;
        bag.forEach((f) => { total += Eco.fishPrice(f); });
        sumEl.textContent = bag.length ? ('背包 ' + bag.length + ' 条 · 全卖 +' + total) : '背包空着';
      }
      if (list) {
        list.innerHTML = bag.length ? bag.map((f, i) => {
          const gi = window.FISH_GRADES ? window.FISH_GRADES[f.tier] : null;
          const col = gi ? '#' + gi.color.toString(16).padStart(6, '0') : '#7a7268';
          const price = Eco.fishPrice(f);
          return '<div class="mkt-row">' +
            '<span class="m-ic" style="--pc:' + col + '">' + this.fishIcon(f.name) + '</span>' +
            '<div class="m-body">' +
            '<span class="m-name" style="color:' + col + '">' + f.name + '</span>' +
            '<span class="m-meta">' + (gi ? gi.name : '普通') + ' · ' + f.points + ' 分 · ' + (f.dist || 0) + 'm</span>' +
            '</div>' +
            '<span class="m-price">+' + price + '</span>' +
            '<button class="mkt-sell" data-fish="' + i + '">卖出</button>' +
            '</div>';
        }).join('') : '<div class="bag-empty">背包里还没有鱼。钓到的鱼可以先放湖里养，也可以拿到鱼市换积分。</div>';
      }
      const allBtn = document.getElementById('sellAllFish');
      if (allBtn) allBtn.disabled = !bag.length;

      // 杂物收购区：渲染背包里的珍珠、贝壳、海藻、旧瓶子等，单卖 + 一键全卖
      const itemList = document.getElementById('sellItemList');
      const itemSum = document.getElementById('sellItemSum');
      const junkItems = Eco.items || [];
      let itemTotal = 0;
      junkItems.forEach((it) => { itemTotal += Eco.itemPrice(it.name); });
      if (itemSum) itemSum.textContent = junkItems.length ? (junkItems.length + ' 件 · 全卖 +' + itemTotal) : '没有杂物';
      if (itemList) {
        itemList.innerHTML = junkItems.length ? junkItems.map((it, i) =>
          '<div class="mkt-row">' +
          '<span class="m-ic">' + this.iconFor(it.name) + '</span>' +
          '<div class="m-body">' +
          '<span class="m-name">' + it.name + '</span>' +
          '<span class="m-meta">' + (it.kind || '杂物') + '</span>' +
          '</div>' +
          '<span class="m-price">+' + Eco.itemPrice(it.name) + '</span>' +
          '<button class="mkt-item-sell" data-item="' + i + '">卖出</button>' +
          '</div>'
        ).join('') : '<div class="bag-empty">钓鱼时会捡到珍珠、贝壳、海藻、旧瓶子等杂物，都能在这里卖。</div>';
      }
      const allItemBtn = document.getElementById('sellAllItems');
      if (allItemBtn) allItemBtn.disabled = !junkItems.length;
    }

    // 老名字保留：商店/浮层里还有地方按 renderBait 调用
    renderBait() { this.renderMarket(); }

    // ---------------- 观鱼台：看看湖里养了什么 ----------------
    renderPond() {
      const eco = window.Economy;
      const body = document.getElementById('pondBody');
      const cntEl = document.getElementById('pondCount');
      const rateEl = document.getElementById('pondRate');
      const tipEl = document.getElementById('pondTip');
      const list = eco ? (eco.pondFish || []) : [];
      const stat = eco && eco.pondStat ? eco.pondStat() : { n: 0, rate: 0 };
      // 同种鱼合并成一行：三条小银鱼没必要占三行
      const map = new Map();
      list.forEach((f) => {
        const name = f.name || '未知鱼';
        const cur = map.get(name) || {
          name, n: 0, rate: 0, points: f.points || 20,
          tier: eco && eco.pondGradeOf ? eco.pondGradeOf(f) : 0
        };
        cur.n += 1;
        cur.rate += eco && eco.pondRateFor ? eco.pondRateFor(f) : 0;
        map.set(name, cur);
      });
      const rows = Array.from(map.values()).sort((a, b) => b.rate - a.rate);
      if (cntEl) cntEl.textContent = stat.n;
      if (rateEl) rateEl.textContent = stat.rate.toFixed(1);
      if (body) {
        const totalRate = stat.rate || 1;
        body.innerHTML = rows.length ? rows.map((r) => {
          const gi = window.FISH_GRADES ? window.FISH_GRADES[r.tier] : null;
          const col = gi ? '#' + gi.color.toString(16).padStart(6, '0') : '#7a7268';
          const share = Math.round((r.rate / totalRate) * 100);
          return '<div class="pond-card" style="--pc:' + col + '">' +
            '<div class="pond-icon" style="--pc:' + col + '">' + this.fishIcon(r.name) + '</div>' +
            '<div class="pond-info">' +
            '<div class="pond-name" style="color:' + inkOf(col) + '">' + r.name +
            (r.n > 1 ? '<em>×' + r.n + '</em>' : '') + '</div>' +
            '<div class="pond-grade">' + (gi ? gi.name : '普通') + ' · ' + r.points + ' 分</div>' +
            '<div class="pond-rate">+' + r.rate.toFixed(1) + ' / 秒<span class="pond-share">占总产出 ' + share + '%</span></div>' +
            '</div>' +
            '</div>';
        }).join('')
          : '<div class="bag-empty">湖里还是空的。把背包里的鱼「放入湖中」，它就会在湖里游起来、自己产积分。</div>';
      }
      if (tipEl) {
        tipEl.textContent = rows.length
          ? '湖里一共 ' + rows.length + ' 种 · ' + stat.n + ' 条鱼，每秒自动入账 ' + stat.rate.toFixed(1) + ' 积分'
          : '放养的鱼越多、品质越高，每秒产出的积分就越多';
      }
    }

    baitMsg(text, ok) {
      const el = document.getElementById('baitMsg');
      if (!el) return;
      el.textContent = text;
      el.className = ok ? 'ok' : 'bad';
      clearTimeout(this._baitMsgTimer);
      this._baitMsgTimer = setTimeout(() => { el.textContent = ''; el.className = ''; }, 2500);
    }

    renderStats() {
      const s = window.Economy.stats;
      const eco = window.Economy;
      const pond = eco.pondStat ? eco.pondStat() : { n: 0, rate: 0 };
      const rows = [
        ['对局数', s.games],
        ['总钓获', s.catches + ' 条'],
        ['图鉴收集', (eco.codexCount ? eco.codexCount() : 0) + ' / ' + (eco.codexTotal ? eco.codexTotal() : 0)],
        ['湖中养鱼', pond.n + ' 条'],
        ['养鱼产出', '+' + pond.rate.toFixed(1) + '/秒'],
        ['历史总分', s.totalScore],
        ['单局最高', s.best]
      ];
      const grid = document.getElementById('statsGrid');
      grid.innerHTML = rows.map(([k, v]) =>
        '<div class="stat-card"><div class="s-num">' + v + '</div><div class="s-key">' + k + '</div></div>'
      ).join('');
    }

    // ---------------- 图鉴 ----------------
    // 全部鱼种按「淡水 / 海洋」两栏铺开；没钓到过的只留一个黑色剪影 + 「？？？」，
    // 连名字都不给，只提示该抛多远。钓到过一次之后永久解锁（存在 localStorage 里）。
    renderCodex() {
      const body = document.getElementById('codexBody');
      if (!body) return;
      const eco = window.Economy;
      const T = window.FISH_TABLE || { pond: [], sea: [] };
      const hex = (n) => '#' + ((n || 0) & 0xffffff).toString(16).padStart(6, '0');
      // 卡片底色是米白，品质色（神话金 / 远古绿 / 深渊紫）直接当文字色会发飘，
      // 统一走模块级的 inkOf() 压暗。
      // 三组：淡水 / 海洋 / 远古。远古鱼种虽然也在 sea 表里参与抽取，
      // 但图鉴里单独一组，才看得出「史前巨兽」是另一档东西。
      const ancient = T.ancient || [];
      const ancientNames = ancient.map((f) => f.name);
      const groups = [
        { label: '淡水 · 湖', list: T.pond || [] },
        { label: '海洋', list: (T.sea || []).filter((f) => ancientNames.indexOf(f.name) < 0) },
        { label: '远古 · 史前巨兽', list: ancient, accent: true },
        { label: '血夜 · 月下异种', list: T.blood || [], blood: true },
        { label: '日魇 · 蚀日之影', list: T.daymare || [], day: true }
      ].filter((g) => g.list.length);
      let got = 0, total = 0, html = '';

      groups.forEach((g) => {
        const known = g.list.filter((f) => eco && eco.codex[f.name] > 0).length;
        got += known;
        total += g.list.length;
        html += '<div class="cx-hd' + (g.accent ? ' cx-hd-ancient' : '') + (g.blood ? ' cx-hd-blood' : '') +
          (g.day ? ' cx-hd-day' : '') + '">' + g.label +
          '<em>' + known + ' / ' + g.list.length + '</em></div>';
        html += '<div class="cx-grid">';
        // 已解锁的排前面（收藏区），未知的排后面并按需要的抛投距离由近到远，
        // 相当于一张"接下来该往多远抛"的清单。
        const ordered = g.list.filter((f) => eco && eco.codex[f.name] > 0)
          .concat(g.list.filter((f) => !(eco && eco.codex[f.name] > 0)));
        html += ordered.map((f) => {
          const n = (eco && eco.codex[f.name]) || 0;
          const gd = window.fishGradeOf ? window.fishGradeOf(f.name) : 0;
          const gi = window.FISH_GRADES ? window.FISH_GRADES[gd] : null;
          const col = gi ? hex(gi.color) : '#cfd8dc';
          if (!n) {
            return '<div class="cx-card locked">' +
              '<div class="cx-icon">' + this.iconFor(f.name) + '</div>' +
              '<div class="cx-name">？？？</div>' +
              '<div class="cx-grade">未知 · ' + (f.blood ? '血夜 · 抛到 ' + f.minD + 'm 外'
                : f.daymare ? '日魇 · 抛到 ' + f.minD + 'm 外'
                  : (f.minD > 0 ? '抛到 ' + f.minD + 'm 外' : '岸边就能抛')) + '</div>' +
              '</div>';
          }
          const rate = eco ? eco.pondRateOf(f.points, gd).toFixed(1) : '0.0';
          return '<div class="cx-card" style="--g:' + col + '">' +
            '<div class="cx-icon">' + this.iconFor(f.name) + '</div>' +
            '<div class="cx-name" style="color:' + inkOf(col) + '">' + f.name + '</div>' +
            '<div class="cx-grade">' + (gi ? gi.name : '普通') + ' · ' + f.points + ' 分</div>' +
            '<div class="cx-line">放养 +' + rate + '/秒</div>' +
            '<div class="cx-cnt">已钓 ' + n + '</div>' +
            '</div>';
        }).join('');
        html += '</div>';
      });

      body.innerHTML = html;
      const prog = document.getElementById('codexProg');
      if (prog) prog.textContent = got + ' / ' + total;
      const bar = document.getElementById('codexBar');
      if (bar) bar.style.width = (total ? (got / total) * 100 : 0).toFixed(1) + '%';
      const tip = document.getElementById('codexTip');
      if (tip) {
        tip.textContent = got >= total
          ? '全部 ' + total + ' 种都进图鉴了 —— 你是这片海的老手'
          : '还差 ' + (total - got) + ' 种没露面：未知鱼种只会显示它需要多远的抛投';
      }
    }

    renderBackpack() {
      const p = this.player;
      const slotsEl = document.getElementById('bpSlots');
      const ammoEl = document.getElementById('bpAmmo');
      const curEl = document.getElementById('bpCurrent');

      // 武器槽（1/2 枪械，3 鱼竿，4 拳头）
      const slotNames = ['主武器', '副武器', '鱼竿', '近战'];
      slotsEl.innerHTML = p.slots.map((id, i) => {
        const active = i === p.slot;
        if (!id) {
          return '<div class="bp-slot empty"><div class="bp-icon"></div><div class="s-body"><div class="s-name">空</div><div class="s-sub">' + slotNames[i] + '</div></div></div>';
        }
        const isRod = id === 'rod';
        const rodCfg = isRod ? (window.RODS[window.Economy.rod] || window.RODS.bamboo) : null;
        const gun = id === 'fist' ? { name: '拳头', mag: 0 }
          : isRod ? { name: rodCfg.name, mag: 0 } : GUNS[id];
        const ammo = p.ammoByGun[id] != null ? p.ammoByGun[id] : (id === 'fist' || isRod ? 0 : gun.mag);
        const sub = isRod ? (slotNames[2] + ' · 最远 ' + rodCfg.dist + 'm')
          : slotNames[i] + (id === 'fist' ? '' : ' · ' + ammo + ' 发');
        return '<div class="bp-slot' + (active ? ' active' : '') + '">' +
          '<div class="bp-icon">' + this.iconFor(id) + '</div>' +
          '<div class="s-body">' +
          '<div class="s-name">' + gun.name + '</div>' +
          '<div class="s-sub">' + sub + '</div>' +
          '</div></div>';
      }).join('');

      // 弹药储备
      const ammoRows = [];
      Object.keys(p.ammoByGun).forEach((id) => {
        const gun = GUNS[id];
        if (gun) ammoRows.push([gun.name, p.ammoByGun[id]]);
      });
      if (ammoRows.length === 0) ammoRows.push(['—', 0]);
      ammoEl.innerHTML = ammoRows.map(([name, num]) =>
        '<div class="bp-ammo-item"><span class="a-name"><span class="a-ic">' + this.iconFor('ammo') + '</span>' + name + '</span><span class="a-num">' + num + '</span></div>'
      ).join('');

      // 当前武器
      if (p.isMelee()) {
        curEl.innerHTML = '<div><div class="c-name"><span class="c-icon">' + this.iconFor('fist') + '</span>拳头</div><div class="c-desc">近战攻击，无弹药消耗</div></div><div class="c-ammo">∞</div>';
      } else if (p.isRod()) {
        const rodCfg = window.RODS[window.Economy.rod] || window.RODS.bamboo;
        curEl.innerHTML = '<div><div class="c-name"><span class="c-icon">' + this.iconFor('rod') + '</span>' + rodCfg.name + '</div><div class="c-desc">长按左键蓄力抛竿，抛得越远鱼越好</div></div><div class="c-ammo">' + rodCfg.dist + 'm</div>';
      } else {
        curEl.innerHTML = '<div><div class="c-name"><span class="c-icon">' + this.iconFor(p.gun.id) + '</span>' + p.gun.name + '</div><div class="c-desc">' + p.gun.desc + '</div></div>' +
          '<div class="c-ammo">' + p.ammo + ' / ' + p.reserve + '</div>';
      }

      // 顶部信息条（新背包布局）
      const e0 = window.Economy;
      const topAmmo = document.getElementById('invTopAmmo');
      if (topAmmo) topAmmo.textContent = p.reserve + (e0 ? e0.ammoStock - p.reserve > 0 ? '+' + (e0.ammoStock - p.reserve) : '' : '');
      const topCap = document.getElementById('invTopCap');
      if (topCap) topCap.textContent = (e0 ? e0.usedSpace() : 0) + '/' + (e0 ? e0.bagCapacity : 20) +
        ' · 杂' + (e0 ? e0.items.length : 0);
      const balBag = document.getElementById('balanceNumBag');
      if (balBag) balBag.textContent = e0 ? e0.balance : 0;
      const fc = document.getElementById('bpFishCount');
      if (fc) fc.textContent = e0 ? e0.fishBag.length : 0;
      const ic = document.getElementById('bpItemCount');
      if (ic) ic.textContent = e0 ? e0.items.length : 0;

      // 背包容量与种类
      const used = window.Economy ? window.Economy.usedSpace() : 0;
      const cap = window.Economy ? window.Economy.bagCapacity : 20;
      const eco = window.Economy;
      const junk = eco ? eco.items.length : 0;
      const jcap = eco ? eco.itemCapacity : 12;
      const capEl = document.getElementById('bpCap');
      if (capEl) {
        const pct = Math.min(100, used / Math.max(1, cap) * 100);
        capEl.innerHTML = '<div class="cap-row"><span>背包容量</span><b>' + used + ' / ' + cap +
          ' · 杂物 ' + junk + ' / ' + jcap + '</b></div>' +
          '<div class="cap-track"><i style="width:' + pct.toFixed(0) + '%"></i></div>';
      }
      const kindsEl = document.getElementById('bpKinds');
      if (kindsEl) {
        const fishN = eco ? eco.fishBag.length : 0;
        const itemN = eco ? eco.items.length : 0;
        const baitN = eco && eco.totalBait ? eco.totalBait() : 0;
        const pond = eco ? eco.pondStat() : { n: 0, rate: 0 };
        kindsEl.innerHTML =
          '<span class="kind-chip">渔获 <b>' + fishN + '</b></span>' +
          '<span class="kind-chip">道具/材料 <b>' + itemN + '</b></span>' +
          '<span class="kind-chip">鱼饵 <b>' + baitN + '</b>' +
            (eco && eco.baitSel && window.BAITS[eco.baitSel] ? '（已挂 ' + window.BAITS[eco.baitSel].name + '）' : '（空钩）') +
            '</span>' +
          '<span class="kind-chip">备弹 <b>' + p.reserve + '</b></span>' +
          '<span class="kind-chip">湖中养鱼 <b>' + pond.n + '</b> 条 · 每秒 +' + pond.rate.toFixed(1) + '</span>';
      }

      // 渔获背包：可把鱼放回湖里养，也可以丢到地上
      const bagEl = document.getElementById('bpFish');
      if (!bagEl) return;
      const bag = eco ? eco.fishBag : [];
      bagEl.innerHTML = bag.length
        ? bag.map((f, i) => {
          const gi = window.FISH_GRADES ? window.FISH_GRADES[f.tier] : null;
          const gcol = gi ? '#' + gi.color.toString(16).padStart(6, '0') : '#cfd8dc';
          return '<div class="fish-chip">' +
          '<span class="fc-icon">' + this.fishIcon(f.name) + '</span>' +
          '<div class="fc-body">' +
          '<span class="fc-name" style="color:' + gcol + '">' + f.name +
          '<i class="fc-rate" title="放进湖里养起来后每秒产出的积分">+' + eco.pondRateOf(f.points, f.tier).toFixed(1) + '/秒</i></span>' +
          '<span class="fc-meta">' + (f.sea ? '海鱼' : '湖鱼') + ' · ' + (gi ? gi.name : '普通') + ' · ' + f.dist + 'm</span>' +
          '</div>' +
          '<button class="fc-raise" data-fish="' + i + '">放入湖中</button>' +
          '<button class="fc-drop" data-fish="' + i + '">丢出</button>' +
          '</div>';
        }).join('')
        : '<div class="bag-empty">还没有渔获，去湖边或海边抛竿吧（按 3 切到鱼竿）</div>';

      // 鱼饵：四档都列出来，有货的显示份数 + 装钩，没货的置灰
      const baitEl = document.getElementById('bpBaits');
      if (baitEl) {
        const hooked = eco ? eco.baitSel : null;
        const hookedN = eco && hooked ? eco.baitCount(hooked) : 0;
        baitEl.innerHTML =
          (hooked && window.BAITS[hooked]
            ? '<div class="bait-head"><span>钩上：<b>' + window.BAITS[hooked].name + ' ×' + hookedN +
              '</b> · 每竿消耗一份</span><button class="bait-off">卸下</button></div>'
            : '<div class="bait-head"><span>钩上：<b>空钩</b> · 能钓，但钓不到好鱼</span></div>') +
          (window.BAIT_ORDER || []).map((id) => {
            const b = window.BAITS[id];
            const n = eco ? eco.baitCount(id) : 0;
            const capName = window.FISH_GRADES && window.FISH_GRADES[b.cap] ? window.FISH_GRADES[b.cap].name : '—';
            return '<div class="bait-chip' + (n ? '' : ' empty') + (hooked === id ? ' on' : '') + '">' +
              '<span class="bi" style="--bc:' + b.color + '">' + this.baitIcon(id, 30) + '</span>' +
              '<div class="b-body">' +
              '<span class="b-name">' + b.name + ' <em>×' + n + '</em></span>' +
              '<span class="b-meta">上限 ' + capName + ' · 好鱼 ×' + b.luck.toFixed(1) + '</span>' +
              '</div>' +
              (hooked === id
                ? '<span class="b-on">已装钩</span>'
                : '<button class="bait-use" data-bait="' + id + '"' + (n ? '' : ' disabled') + '>装钩</button>') +
              '</div>';
          }).join('');
      }

      // 道具 / 材料背包
      const itemsEl = document.getElementById('bpItems');
      if (itemsEl) {
        const items = eco ? eco.items : [];
        itemsEl.innerHTML = items.length
          ? items.map((it, i) =>
            '<div class="fish-chip item">' +
            '<span class="fc-icon">' + this.iconFor(it.name) + '</span>' +
            '<div class="fc-body">' +
            '<span class="fc-name">' + it.name + '</span>' +
            '<span class="fc-meta">' + (it.kind || '杂物') + (it.sea ? ' · 海边' : '') + '</span>' +
            '</div>' +
            '<button class="fc-sell" data-item="' + i + '">卖 ' + eco.itemPrice(it.name) + '</button>' +
            '<button class="fc-drop" data-item="' + i + '">丢出</button>' +
            '</div>'
          ).join('')
          : '<div class="bag-empty">钓鱼时会捡到海藻、贝壳、旧瓶子、珍珠等杂物，可以在这里直接卖给鱼市</div>';
      }
    }

    // ---------------- 丢在地上的枪 / 鱼 / 杂物 ----------------
    makeDroppedMesh(spec) {
      const g = new THREE.Group();
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.28, 0.4, 22),
        new THREE.MeshBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.55, side: THREE.DoubleSide })
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = -0.12;
      g.add(ring);

      if (spec.type === 'gun') {
        const bodyMat = new THREE.MeshStandardMaterial({ color: 0x2b3138, roughness: 0.5, metalness: 0.6 });
        const accentMat = new THREE.MeshStandardMaterial({ color: 0xff8a3d, emissive: 0x3a1800, roughness: 0.55, metalness: 0.4 });
        const body = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.09, 0.11), bodyMat);
        g.add(body);
        const grip = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.2, 0.09), bodyMat);
        grip.position.set(-0.18, -0.13, 0);
        grip.rotation.z = 0.24;
        g.add(grip);
        const mag = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.22, 0.08), accentMat);
        mag.position.set(0.02, -0.14, 0);
        mag.rotation.z = 0.16;
        g.add(mag);
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.3, 8), bodyMat);
        barrel.rotation.z = Math.PI / 2;
        barrel.position.set(0.5, 0.015, 0);
        g.add(barrel);
        g.rotation.y = Math.random() * Math.PI * 2;
      } else if (spec.type === 'fish') {
        const model = new window.FishModel(spec.fish.name);
        model.group.scale.setScalar(1.15);
        g.add(model.group);
      } else if (spec.type === 'item') {
        const color = spec.item.color != null ? spec.item.color : 0xbfe3e0;
        const mesh = new THREE.Mesh(
          new THREE.IcosahedronGeometry(0.16, 0),
          new THREE.MeshStandardMaterial({ color, emissive: 0x223a3a, roughness: 0.45, metalness: 0.3 })
        );
        g.add(mesh);
      } else {
        const rod = new THREE.Mesh(
          new THREE.CylinderGeometry(0.02, 0.035, 1.5, 8),
          new THREE.MeshStandardMaterial({ color: 0x8a5c2e, roughness: 0.8 })
        );
        rod.rotation.z = Math.PI / 2;
        g.add(rod);
      }
      return g;
    }

    dropItem(spec) {
      const camPos = this.camera.getWorldPosition(new THREE.Vector3());
      const dir = this.camera.getWorldDirection(new THREE.Vector3());
      const mesh = this.makeDroppedMesh(spec);
      // 站在桌子旁边丢东西：直接摆到桌面上，而不是扔出去
      const table = this.world.nearestTable ? this.world.nearestTable(this.player.pos.x, this.player.pos.z, 2.2) : null;
      if (table) {
        const px = Math.max(table.x - table.hw + 0.28, Math.min(this.player.pos.x, table.x + table.hw - 0.28));
        const pz = Math.max(table.z - table.hd + 0.28, Math.min(this.player.pos.z, table.z + table.hd - 0.28));
        mesh.position.set(px, table.y + 0.16, pz);
        mesh.rotation.set(0, this.player.yaw + Math.PI, 0);
        this.scene.add(mesh);
        this.dropped.push({
          id: ++this.droppedSeq,
          spec,
          mesh,
          vel: new THREE.Vector3(0, 0, 0),
          landed: true,
          t: 0,
          baseY: table.y + 0.16
        });
        this.notice('放到了桌上，按 F 可以拿回来', 'info');
        Sound.play('land');
        return;
      }
      mesh.position.copy(camPos).addScaledVector(dir, 0.55);
      mesh.position.y -= 0.22;
      this.scene.add(mesh);
      this.dropped.push({
        id: ++this.droppedSeq,
        spec,
        mesh,
        vel: new THREE.Vector3(dir.x * 3.4, 2.3, dir.z * 3.4),
        landed: false,
        t: 0,
        baseY: mesh.position.y
      });
    }

    dropCurrentGun() {
      if (this.fishing.busy) {
        this.notice('钓鱼时不能丢枪', 'warn');
        return;
      }
      const p = this.player;
      const i = p.slot;
      const id = p.slots[i];
      if (!id || id === 'rod' || id === 'fist') {
        this.notice('当前手上没有可丢的枪', 'warn');
        return;
      }
      p.ammoByGun[id] = p.ammo;
      p.slots[i] = null;
      const name = window.GUNS[id] ? window.GUNS[id].name : id;
      this.dropItem({ type: 'gun', id, name, slot: i });
      p.selectSlot(p.slots[2] ? 2 : 3);
      this.notice('丢下 ' + name + '，走到旁边按 F 可以捡回来', 'info');
      Sound.play('swap');
    }

    updateDropped(dt) {
      for (let i = 0; i < this.dropped.length; i++) {
        const d = this.dropped[i];
        if (!d.landed) {
          const prevY = d.mesh.position.y;
          const floor = this.world.surfaceHeight(d.mesh.position.x, d.mesh.position.z, prevY, true);
          d.vel.y -= 9.6 * dt;
          d.mesh.position.addScaledVector(d.vel, dt);
          d.mesh.rotation.x += dt * 2.2;
          d.mesh.rotation.z += dt * 1.3;
          if (d.vel.y < 0 && d.mesh.position.y <= floor + 0.16) {
            d.mesh.position.y = floor + 0.16;
            d.baseY = floor + 0.16;
            d.landed = true;
            d.mesh.rotation.x = 0;
            d.mesh.rotation.z = 0;
            Sound.play('land');
          }
        } else {
          d.t += dt;
          d.mesh.position.y = d.baseY + Math.sin(d.t * 1.6 + d.id) * 0.04;
          d.mesh.rotation.y += dt * 0.5;
        }
      }
    }

    nearestDropped(maxDist) {
      let best = null;
      let bestD = maxDist || 3;
      for (let i = 0; i < this.dropped.length; i++) {
        const d = this.dropped[i];
        if (!d.landed) continue;
        const dist = Math.hypot(d.mesh.position.x - this.player.pos.x, d.mesh.position.z - this.player.pos.z);
        if (dist < bestD) {
          best = d;
          bestD = dist;
        }
      }
      return best;
    }

    pickupDropped(d) {
      const spec = d.spec;
      if (spec.type === 'gun') {
        const p = this.player;
        let slot = spec.slot;
        if (slot == null || slot > 1 || p.slots[slot]) {
          slot = p.slots[0] ? (p.slots[1] ? -1 : 1) : 0;
        }
        if (slot < 0) {
          this.notice('两个武器槽都满了，按 G 先丢一把再捡', 'warn');
          return false;
        }
        p.slots[slot] = spec.id;
        if (p.ammoByGun[spec.id] == null) {
          p.ammoByGun[spec.id] = window.GUNS[spec.id] ? window.GUNS[spec.id].mag : 0;
        }
        p.selectSlot(slot);
        this.notice('捡起 ' + (spec.name || spec.id) + '（' + (slot + 1) + ' 号槽）', 'good');
      } else if (spec.type === 'fish') {
        if (window.Economy && !window.Economy.addFish(spec.fish)) {
          this.notice('背包已满，捡不起来', 'warn');
          return false;
        }
        this.notice('捡起 ' + spec.fish.name + '，已放回背包', 'good');
      } else if (spec.type === 'item') {
        if (window.Economy && !window.Economy.addItem(spec.item)) {
          this.notice('背包已满，捡不起来', 'warn');
          return false;
        }
        this.notice('捡起 ' + spec.item.name + '，已放回背包', 'good');
      }
      this.scene.remove(d.mesh);
      const idx = this.dropped.indexOf(d);
      if (idx >= 0) this.dropped.splice(idx, 1);
      Sound.play('swap');
      return true;
    }

    // F 键上下文交互：睡觉中先起床，其次睡觉，再开门/拾取/对战
    interact() {
      if (this.sleeping) {
        this.finishSleep(false);
        return;
      }
      if (this.sitting) {
        this.standUp();
        return;
      }
      // 在船上：F 下船
      if (this.player.riding) {
        this.player.leaveBoat();
        this.notice('已下船', 'info');
        Sound.play('swap');
        return;
      }
      // 靠近小船：F 上船
      if (this.world.boat && !this.fishing.busy) {
        const b = this.world.boat;
        if (Math.hypot(this.player.pos.x - b.x, this.player.pos.z - b.z) < 5.2) {
          if (this.player.boardBoat(b)) {
            this.notice('上船 · W/S 给油，鼠标转舵，A/D 挪位，F 下船', 'good');
            Sound.play('swap');
            return;
          }
        }
      }
      // 岛上五家店：走近按 F 开店。取最近的那一家，避免两间铺子挨着时开错。
      if (!this.fishing.busy) {
        const near = this.nearestShop();
        if (near) {
          Sound.play('swap');
          this.toggleInGameOverlay(near.kind);
          return;
        }
      }
      if (this.world.nearestSeat) {
        const seat = this.world.nearestSeat(this.player.pos.x, this.player.pos.z, 1.6);
        if (seat && !this.fishing.busy) {
          this.sitDown(seat);
          return;
        }
      }
      if (this.world.nearestBed) {
        const bed = this.world.nearestBed(this.player.pos.x, this.player.pos.z, 2.8);
        if (bed && !this.fishing.busy) {
          this.startSleep();
          return;
        }
      }
      if (this.world.nearestDoor) {
        const door = this.world.nearestDoor(this.player.pos.x, this.player.pos.z, 2.9);
        if (door) {
          this.world.toggleDoor(door);
          this.notice(door.open ? '门已打开' : '门已关上', 'info');
          Sound.play('swap');
          return;
        }
      }
      const d = this.nearestDropped(3.0);
      if (d) {
        this.pickupDropped(d);
        return;
      }
    }

    // 五家店：返回离玩家最近且在服务半径内的那一家
    nearestShop() {
      const p = this.player.pos;
      const list = [
        { kind: 'shop', s: this.world.gunShop, r: 4.8, hint: '按 F 进入武器商店（枪械 · 弹药）' },
        { kind: 'bait', s: this.world.baitShop, r: 4.6, hint: '按 F 进鱼市（买饵 · 卖鱼）' },
        { kind: 'pond', s: this.world.pondDeck, r: 3.6, hint: '按 F 上观鱼台，看看湖里养了什么' },
        { kind: 'rod', s: this.world.rodShop, r: 4.6, hint: '按 F 进入鱼竿商店' },
        { kind: 'chest', s: this.world.chestShop, r: 4.6, hint: '按 F 进入宝箱商店' },
        { kind: 'bag', s: this.world.bagShop, r: 4.6, hint: '按 F 进入背包商店' }
      ];
      let best = null, bestD = Infinity;
      for (let i = 0; i < list.length; i++) {
        const it = list[i];
        if (!it.s) continue;
        const d = Math.hypot(p.x - it.s.x, p.z - it.s.z);
        if (d < it.r && d < bestD) { best = it; bestD = d; }
      }
      return best;
    }

    updateInteractHint() {
      if (!this.interactTip) return;
      if (this.state !== 'playing' || !this.locked) {
        this.interactTip.classList.add('hidden');
        return;
      }
      let text = '';
      if (this.sleeping) {
        this.interactTip.textContent = '睡觉中… 按 F 停止睡觉';
        this.interactTip.classList.remove('hidden');
        return;
      }
      if (this.sitting) {
        this.interactTip.textContent = '坐着 · 按 F 起身';
        this.interactTip.classList.remove('hidden');
        return;
      }
      if (this.world.nearestSeat) {
        const seat = this.world.nearestSeat(this.player.pos.x, this.player.pos.z, 1.6);
        if (seat) text = '按 F 坐下';
      }
      if (!this.fishing.busy) {
        const near = this.nearestShop();
        if (near) text = near.hint;
      }
      if (this.world.nearestTable) {
        const table = this.world.nearestTable(this.player.pos.x, this.player.pos.z, 2.2);
        if (table) text += (text ? ' · ' : '') + '按 G 把手上物品放到桌上';
      }
      if (this.world.nearestBed) {
        const bed = this.world.nearestBed(this.player.pos.x, this.player.pos.z, 2.8);
        if (bed) text += (text ? ' · ' : '') + '按 F 睡觉 · 快速到天亮';
      }
      if (this.world.nearestDoor) {
        const door = this.world.nearestDoor(this.player.pos.x, this.player.pos.z, 3.2);
        if (door) text += (text ? ' · ' : '') + (door.open ? '按 F 关门' : '按 F 开门');
      }
      const d = this.nearestDropped(3.2);
      if (d) {
        const nm = d.spec.name || (d.spec.fish && d.spec.fish.name) || (d.spec.item && d.spec.item.name) || '物品';
        text += (text ? ' · ' : '') + '按 F 拾取 ' + nm;
      }
      // 小船：上船后提示油门与下船
      const bt = this.world.boat;
      if (bt) {
        if (this.player.riding) {
          text += (text ? ' · ' : '') + 'W/S 开船 · 鼠标转舵 · 按 F 下船';
        } else if (Math.hypot(this.player.pos.x - bt.x, this.player.pos.z - bt.z) < 5.2) {
          text += (text ? ' · ' : '') + '按 F 上船驾驶';
        }
      }
      this.interactTip.textContent = text;
      this.interactTip.classList.toggle('hidden', !text);
    }

    syncAmmo() {
      if (window.Economy) window.Economy.setAmmoStock(this.player.reserve);
    }

    shopMsg(text, ok) {
      const el = document.getElementById('shopMsg');
      if (!el) return;
      el.textContent = text;
      el.className = ok ? 'ok' : 'bad';
      clearTimeout(this._shopMsgTimer);
      this._shopMsgTimer = setTimeout(() => { el.textContent = ''; }, 2500);
    }

    shopMsg2(text, ok) {
      const el = document.getElementById('shopMsg2');
      if (!el) return;
      el.textContent = text;
      el.className = ok ? 'ok' : 'bad';
      clearTimeout(this._shopMsg2Timer);
      this._shopMsg2Timer = setTimeout(() => { el.textContent = ''; }, 2500);
    }

    bindInput() {
      document.addEventListener('pointerlockchange', () => {
        const locked = document.pointerLockElement === this.canvas;
        this.locked = locked;
        if (locked) {
          if (this.state === 'paused') {
            this.state = 'playing';
            this.ui.pauseOverlay.classList.add('hidden');
          }
        } else {
          if (this.state === 'playing') {
            this.state = 'paused';
            this.ui.pauseOverlay.classList.remove('hidden');
            this.input.fire = false;
            this.input.aim = false;
            this.fishing.cancelCharge();
          }
        }
      });

      document.addEventListener('pointerlockerror', () => {
        this.notice('鼠标锁定失败，请再点击一次画面', 'warn');
      });

      document.addEventListener('mousemove', (e) => {
        if (!this.locked) return;
        // 鼠标控制玩家视角（第一人称 / 越肩第三人称统一走 player.applyLook）
        this.player.applyLook(e.movementX || 0, e.movementY || 0);
      });

      document.addEventListener('mousedown', (e) => {
        if (!this.locked || this.state !== 'playing') return;
        if (e.button === 0) {
          // 手持鱼竿：左键改为蓄力抛竿
          if (this.player.isRod() && !this.player.frozen) {
            this.fishing.startCharge();
          } else {
            this.input.fire = true;
          }
        }
        if (e.button === 2) this.input.aim = true;
      });

      document.addEventListener('mouseup', (e) => {
        if (e.button === 0) {
          this.input.fire = false;
          if (this.fishing.state === 'charge') this.fishing.releaseCharge();
        }
        if (e.button === 2) this.input.aim = false;
      });

      document.addEventListener('contextmenu', (e) => e.preventDefault());

      document.addEventListener('keydown', (e) => {
        if (e.code === 'Space' || e.code === 'Tab' || e.code === 'CapsLock') e.preventDefault();

        // Esc 关闭任何已打开的局内浮层
        if (e.code === 'Escape' && this.state === 'paused' && this.overlaySource === 'game') {
          this.closeInGameOverlay();
          return;
        }

        // Tab = 战绩，Caps = 商店，B = 背包（局内暂停式打开，局外忽略）
        if (e.code === 'Tab') {
          this.toggleInGameOverlay('stats');
          return;
        }
        if (e.code === 'CapsLock') {
          this.toggleInGameOverlay('shop');
          return;
        }
        if (e.code === 'KeyB') {
          if (this.state === 'menu') {
            // 主菜单也能直接看背包：沿用商店/图鉴的菜单浮层模式（隐藏主页、显示背包）
            document.getElementById('bpBackBtn').textContent = '返回主页';
            this.renderBackpack();
            this.ui.startOverlay.classList.add('hidden');
            this.ui.backpackOverlay.classList.remove('hidden');
          } else {
            this.toggleInGameOverlay('backpack');
          }
          return;
        }
        if (e.code === 'KeyJ') {
          this.toggleInGameOverlay('codex');
          return;
        }

        if (e.code === 'KeyR') {
          if (this.state === 'over') {
            this.startRound();
          } else if (this.state === 'playing') {
            if (this.player.reloading <= 0 && !this.player.isMelee() && this.player.ammo < this.player.magSize) {
              this.player.startReload();
              Sound.play('reload');
            }
          }
        }

        if (this.state !== 'playing' || !this.locked) return;

        if (e.code === 'KeyW' || e.code === 'ArrowUp') this.input.forward = true;
        if (e.code === 'KeyS' || e.code === 'ArrowDown') this.input.back = true;
        if (e.code === 'KeyA' || e.code === 'ArrowLeft') this.input.left = true;
        if (e.code === 'KeyD' || e.code === 'ArrowRight') this.input.right = true;
        if (e.code === 'ControlLeft' || e.code === 'ControlRight') this.input.crouch = true;
        if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') this.input.sprint = true;

        // 切武器：1/2/3/4 直选（3=鱼竿 4=拳头），X 轮换
        if (e.code === 'Digit1') { if (this.player.selectSlot(0)) Sound.play('swap'); }
        if (e.code === 'Digit2') { if (this.player.selectSlot(1)) Sound.play('swap'); }
        if (e.code === 'Digit3') { if (this.player.selectSlot(2)) Sound.play('swap'); }
        if (e.code === 'Digit4') { if (this.player.selectSlot(3)) Sound.play('swap'); }
        if (e.code === 'KeyX') { this.player.switchNext(); Sound.play('swap'); }

        // 左右探头（按住生效）
        if (e.code === 'KeyQ') this.player.leanL = true;
        if (e.code === 'KeyE') this.player.leanR = true;

        // 第一/第三人称切换
        if (e.code === 'KeyV') {
          this.player.thirdPerson = !this.player.thirdPerson;
          this.notice(this.player.thirdPerson ? '第三人称视角' : '第一人称视角', 'info');
          Sound.play('swap');
        }

        // 申请对战 / 开门 / 拾取（F 键上下文交互）
        if (e.code === 'KeyF') this.interact();

        // G：持枪时把枪丢到地上；持鱼竿时作为左键蓄力的备用键
        if (e.code === 'KeyG') {
          if (this.player.isRod() || this.player.isMelee()) {
            if (!this.fishing.busy && this.fishing.cooldown <= 0 && this.player.selectSlot(2)) {
              this.fishing.startCharge();
            }
          } else {
            this.dropCurrentGun();
          }
        }

        // 鱼市（靠近时按 T）
        if (e.code === 'KeyT' && this.world.baitShop) {
          const d = Math.hypot(this.player.pos.x - this.world.baitShop.x, this.player.pos.z - this.world.baitShop.z);
          if (d < this.world.baitShop.r + 1.6) this.toggleInGameOverlay('bait');
        }

        if (e.code === 'Space') {
          if (this.fishing.state === 'reel') {
            this.fishing.holdReel(true);
          } else if (this.fishing.state === 'bite') {
            this.fishing.strike();
            // 收杆成功进入拉扯阶段时，空格仍按着，直接开始收线
            this.fishing.holdReel(true);
          } else if (!this.fishing.busy) {
            this.input.jump = true;
          }
        }
      });

      document.addEventListener('keyup', (e) => {
        if (e.code === 'KeyW' || e.code === 'ArrowUp') this.input.forward = false;
        if (e.code === 'KeyS' || e.code === 'ArrowDown') this.input.back = false;
        if (e.code === 'KeyA' || e.code === 'ArrowLeft') this.input.left = false;
        if (e.code === 'KeyD' || e.code === 'ArrowRight') this.input.right = false;
        if (e.code === 'ControlLeft' || e.code === 'ControlRight') this.input.crouch = false;
        if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') this.input.sprint = false;
        if (e.code === 'Space') { this.input.jump = false; this.fishing.holdReel(false); }
        if (e.code === 'KeyQ') this.player.leanL = false;
        if (e.code === 'KeyE') this.player.leanR = false;
      });

      // 狙击开镜时滚轮调倍率
      document.addEventListener('wheel', (e) => {
        if (this.state === 'playing' && this.locked && this.player.scoped) {
          this.player.cycleZoom(e.deltaY > 0 ? 1 : -1);
          Sound.play('swap');
        }
      }, { passive: true });
    }

    // 局内打开战绩/商店（暂停式），再按一次或点返回回到战斗
    toggleInGameOverlay(kind) {
      if (this.state === 'playing') {
        this.overlaySource = 'game';
        this.overlayKind = kind;
        this.state = 'paused';
        if (this.isTouchDevice) this.locked = false;
        this.input.fire = false;
        this.input.aim = false;
        if (document.exitPointerLock) document.exitPointerLock();
        this.ui.pauseOverlay.classList.add('hidden');
        if (kind === 'stats') {
          document.getElementById('statsBackBtn').textContent = '返回战斗';
          this.renderStats();
          this.ui.statsOverlay.classList.remove('hidden');
        } else if (kind === 'backpack') {
          document.getElementById('bpBackBtn').textContent = '返回战斗';
          this.renderBackpack();
          this.ui.backpackOverlay.classList.remove('hidden');
        } else if (kind === 'codex') {
          document.getElementById('codexBackBtn').textContent = '返回战斗';
          this.renderCodex();
          this.ui.codexOverlay.classList.remove('hidden');
        } else if (kind === 'bait') {
          document.getElementById('baitBackBtn').textContent = '返回战斗';
          this.renderMarket();
          this.ui.baitOverlay.classList.remove('hidden');
        } else if (kind === 'pond') {
          document.getElementById('pondBackBtn').textContent = '返回战斗';
          this.renderPond();
          this.ui.pondOverlay.classList.remove('hidden');
        } else if (kind === 'rod' || kind === 'chest' || kind === 'bag') {
          document.getElementById('tradeBackBtn').textContent = '返回战斗';
          this.renderTrade(kind);
          this.ui.tradeOverlay.classList.remove('hidden');
        } else {
          document.getElementById('shopBackBtn').textContent = '返回战斗';
          this.renderShop();
          this.ui.shopOverlay.classList.remove('hidden');
        }
      } else if (this.state === 'paused' && this.overlaySource === 'game' && this.overlayKind === kind) {
        this.closeInGameOverlay();
      }
    }

    closeInGameOverlay() {
      this.ui.statsOverlay.classList.add('hidden');
      if (this.ui.codexOverlay) this.ui.codexOverlay.classList.add('hidden');
      this.ui.shopOverlay.classList.add('hidden');
      this.ui.backpackOverlay.classList.add('hidden');
      this.ui.baitOverlay.classList.add('hidden');
      if (this.ui.pondOverlay) this.ui.pondOverlay.classList.add('hidden');
      this.ui.tradeOverlay.classList.add('hidden');
      this.overlaySource = null;
      this.overlayKind = null;
      this.acquireControl();
    }

    resize() {
      const w = window.innerWidth, h = window.innerHeight;
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      const s = this.resScale || 1;
      // 只按 resScale 缩放，不乘 DPR（理由见构造里 setPixelRatio 的注释）
      this.renderer.setPixelRatio(s);
      this.renderer.setSize(w, h);
      // 后处理链按「缩放后的像素数」走：resScale=0.75 时全屏 pass 少画 44% 像素
      const rw = Math.max(320, Math.round(w * s)), rh = Math.max(240, Math.round(h * s));
      if (this.composer) {
        this.composer.setSize(rw, rh);
        // composer.setSize 会把 bloom 一起设成全分辨率，这里再压回半分辨率
        if (this.bloomPass) {
          this.bloomPass.setSize(Math.max(64, Math.round(rw * 0.5)), Math.max(64, Math.round(rh * 0.5)));
        }
        if (this.fxaaPass) this.fxaaPass.material.uniforms['resolution'].value.set(1 / rw, 1 / rh);
        if (this.gradePass && this.gradePass.material.uniforms.resolution) {
          this.gradePass.material.uniforms.resolution.value.set(rw, rh);
        }
      }
    }

    // 帧率治理：dir=-1 降一档 / +1 升一档，越界直接返回
    stepResolution(dir) {
      const i = this._resLevels.indexOf(this.resScale);
      const j = Math.min(this._resLevels.length - 1, Math.max(0, i + dir));
      if (j === i) return false;
      this.resScale = this._resLevels[j];
      this._resCooldown = 2500;            // 换档后 2.5s 内不再动，防止来回抖
      this._slowN = this._goodN = 0;
      this.resize();
      return true;
    }

    // 每帧喂一次帧时间（毫秒），由主循环调用；只在游玩状态生效
    tickGovernor(dtMs) {
      if (this.state !== 'playing') { this._slowN = this._goodN = 0; return; }
      this._emaDt += (dtMs - this._emaDt) * 0.05;
      if (this._resCooldown > 0) { this._resCooldown -= dtMs; return; }
      // 门槛从 25ms 降到 20ms（50fps）：25ms 意味着只有掉到 40fps 以下才降档，
      // 而 45~50fps 的抖动玩家已经能明显感觉到了
      if (this._emaDt > 20) {
        if (++this._slowN > 45) {
          // 分辨率还能降就降；已经降到底还是慢，说明瓶颈不在像素填充，
          // 继续压分辨率只会糊画面，改为整体降一档（关阴影精度 + 关 bloom）
          if (!this.stepResolution(-1)) this._floorSlower(dtMs);
        }
      } else this._slowN = 0;
      if (this._emaDt < 17) {
        if (++this._goodN > 480) this.stepResolution(1);      // 持续流畅 → 升档（~8s）
      } else this._goodN = 0;
    }

    // 分辨率已降到最低仍持续掉帧：说明瓶颈不是填充率（像素数量），
    // 而是后处理/draw call 这类固定开销。这时候再压分辨率只会更糊，
    // 只有整体降档（低精度阴影 + 关 bloom）才有意义。
    _floorSlower(dtMs) {
      this._floorMs = (this._floorMs || 0) + dtMs;
      if (this._floorMs < 2500 || this.quality === 'low') return;
      this._floorMs = 0;
      this.applyQuality('low', true);
      if (this.notice) this.notice('画面持续掉帧，已自动切到「流畅」画质（设置里可改回）', 'info');
    }

    // 首次进游戏判定一次显卡档位（判错了玩家可以在设置里手动改）
    detectQuality() {
      try {
        const gl = this.renderer.getContext();
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        const raw = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)
          : (gl.getParameter(gl.RENDERER) || ''));
        this._gpuName = raw.replace(/^ANGLE \(|\)$/g, '').slice(0, 58);
        const s = raw.toLowerCase();
        // 软件光栅：浏览器「硬件加速」被关掉了。这种时候再怎么降画质都是 5~10fps，
        // 唯一有效的是让玩家去开硬件加速，所以单独标出来给个提示。
        this._softGL = /swiftshader|llvmpipe|software (rasterizer|adapter)|basic render/.test(s);
        if (this._softGL) return 'low';
        // 核显一律低档：笔记本双显卡时浏览器默认很可能挂在 Intel 核显上，
        // 之前只看 hd/uhd graphics，漏了 Iris Xe 这类，判成 mid 就会卡。
        if (/mali|adreno|powervr|qcom|hummingbird|intel/.test(s) && !/arc /.test(s)) return 'low';
        if (/rtx|gtx|radeon rx|rx \d{3,4}|arc a|apple m\d|apple gpu|geforce|radeon pro/.test(s)) return 'high';
        return 'mid';
      } catch (e) { return 'mid'; }
    }

    // 切档：阴影精度 + bloom 开关 + 起始渲染比例，一次改完并落盘
    applyQuality(name, persist) {
      const key = this._qualityCfg[name] ? name : 'mid';
      const cfg = this._qualityCfg[key];
      this.quality = key;
      this._resLevels = cfg.levels.slice();
      this.resScale = cfg.start;
      this._shadowMs = cfg.shadowMs;
      this._emaDt = 16.7; this._slowN = this._goodN = 0; this._resCooldown = 0;
      // bloom 三态：true=常开 / 'night'=仅夜间 / false=关
      this._bloomMode = cfg.bloom;
      if (this.bloomPass) this.bloomPass.enabled = cfg.bloom === true;
      if (this.world && this.world.setShadowQuality) this.world.setShadowQuality(cfg.shadow);
      this.resize();
      if (persist) {
        try { localStorage.setItem('fishingDuel.quality', key); } catch (e) { /* ignore */ }
      }
      this.refreshQualityUI();
      return key;
    }

    refreshQualityUI() {
      const btns = document.querySelectorAll('.qbtn');
      for (let i = 0; i < btns.length; i++) {
        btns[i].classList.toggle('on', btns[i].dataset.q === this.quality);
      }
      const tip = document.getElementById('qualityTip');
      if (tip) {
        tip.textContent = this.quality === 'high' ? '阴影 4096 · 开泛光 · 100% 分辨率（最高画质）'
          : this.quality === 'low' ? '阴影 1024 · 关泛光 · 70% 分辨率（最流畅）'
            : '阴影 2048 · 夜间泛光 · 90% 分辨率（推荐）';
      }
    }

    updateStats(dtMs) {
      this._fpsN++; this._fpsT += dtMs;
      if (this._fpsT < 250) return;
      const avg = this._fpsT / this._fpsN;
      this._fpsEl.textContent = Math.round(1000 / avg) + ' fps · ' + avg.toFixed(1) + ' ms    画质 '
        + this.quality + ' · 分辨率 ' + Math.round(this.resScale * 100) + '% · '
        + window.innerWidth + '×' + window.innerHeight + '\n' + (this._gpuName || 'GPU 未知');
      this._fpsN = 0; this._fpsT = 0;
    }

    // ================= 设备选择（电脑 / 手机）=================
    bindPlatform() {
      const overlay = document.getElementById('platformOverlay');
      const saved = localStorage.getItem('fishingDuel.device');
      const isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints || 0) > 0;
      // 无手动选择时，触屏设备自动按手机处理，保证触屏按键直接出现
      const device = saved || (isTouch ? 'mobile' : 'pc');
      if (device === 'mobile') document.body.classList.add('mobile');
      if (saved) overlay.classList.add('hidden');
      const choose = (dev) => {
        localStorage.setItem('fishingDuel.device', dev);
        document.body.classList.toggle('mobile', dev === 'mobile');
        overlay.classList.add('hidden');
      };
      document.getElementById('platPC').addEventListener('click', () => choose('pc'));
      document.getElementById('platMobile').addEventListener('click', () => choose('mobile'));
      this.isTouchDevice = device === 'mobile';
      // 触摸按键是纯 CSS 显示 + pointer 事件，由下方 pointerdown 委托统一处理；
      // 这里保留挂钩只为兼容旧调用，避免构造函数因缺方法直接抛错中断启动。
      if (typeof this.bindTouch === 'function') this.bindTouch();
    }

    // 统一的“获取操作权”：PC 走 pointer lock，手机端直接置可操作标志
    acquireControl() {
      if (this.isTouchDevice) {
        this.locked = true;
        if (this.state === 'paused') this.state = 'playing';
        this.ui.pauseOverlay.classList.add('hidden');
        return;
      }
      // PC：请求锁定鼠标。必须在用户手势（点击）的回调里调用，
      // 锁定成功后由 pointerlockchange 负责把 paused 切回 playing。
      if (document.pointerLockElement === this.canvas) return;
      if (this.canvas && this.canvas.requestPointerLock) {
        try { this.canvas.requestPointerLock(); } catch (e) { /* 忽略，等玩家再点一次 */ }
      }
    }

    // 手机端暂停（无 pointer lock 可退出，手动置暂停并弹菜单）
    mobilePause() {
      if (this.state !== 'playing') return;
      this.state = 'paused';
      this.locked = false;
      this.input.fire = false;
      this.input.aim = false;
      this.fishing.cancelCharge();
      this.ui.pauseOverlay.classList.remove('hidden');
    }

    // ================= 手机触屏控制 =================
    bindTouch() {
      const layer = document.getElementById('touchLayer');
      this._touchLayer = layer;
      // 触屏层显隐：仅在对局中出现，菜单/暂停时不拦截界面
      this.updateTouchLayer = () => {
        if (!layer) return;
        const show = !!this.isTouchDevice && this.state === 'playing';
        const want = show ? 'block' : 'none';
        if (layer.style.display !== want) layer.style.display = want;
      };
      if (!layer) return;
      const input = this.input;

      // ---------- 左屏虚拟摇杆 ----------
      const joy = document.getElementById('joystick');
      const knob = joy.querySelector('.knob');
      const JR = 46;
      let joyId = null, jcx = 0, jcy = 0;
      const moveJoy = (t) => {
        let dx = t.clientX - jcx, dy = t.clientY - jcy;
        const len = Math.hypot(dx, dy) || 1;
        const cl = Math.min(len, JR);
        dx = dx / len * cl; dy = dy / len * cl;
        knob.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
        const nx = dx / JR, ny = dy / JR, dead = 0.22;
        input.forward = ny < -dead;
        input.back = ny > dead;
        input.left = nx < -dead;
        input.right = nx > dead;
      };
      joy.addEventListener('touchstart', (e) => {
        e.preventDefault();
        const t = e.changedTouches[0];
        joyId = t.identifier;
        const r = joy.getBoundingClientRect();
        jcx = r.left + r.width / 2; jcy = r.top + r.height / 2;
        joy.classList.add('active');
        moveJoy(t);
      }, { passive: false });
      joy.addEventListener('touchmove', (e) => {
        e.preventDefault();
        for (const t of e.changedTouches) if (t.identifier === joyId) moveJoy(t);
      }, { passive: false });
      const endJoy = (e) => {
        for (const t of e.changedTouches) if (t.identifier === joyId) {
          joyId = null;
          joy.classList.remove('active');
          knob.style.transform = '';
          input.forward = input.back = input.left = input.right = false;
        }
      };
      joy.addEventListener('touchend', endJoy, { passive: false });
      joy.addEventListener('touchcancel', endJoy, { passive: false });

      // ---------- 右屏滑动转视角 ----------
      const lz = layer.querySelector('.look-zone');
      let lookId = null, lx = 0, ly = 0;
      lz.addEventListener('touchstart', (e) => {
        e.preventDefault();
        if (lookId === null) {
          const t = e.changedTouches[0];
          lookId = t.identifier; lx = t.clientX; ly = t.clientY;
        }
      }, { passive: false });
      lz.addEventListener('touchmove', (e) => {
        e.preventDefault();
        for (const t of e.changedTouches) if (t.identifier === lookId) {
          const dx = t.clientX - lx, dy = t.clientY - ly;
          lx = t.clientX; ly = t.clientY;
          if (this.state === 'playing') this.player.applyLook(dx, dy);
        }
      }, { passive: false });
      const endLook = (e) => {
        for (const t of e.changedTouches) if (t.identifier === lookId) lookId = null;
      };
      lz.addEventListener('touchend', endLook, { passive: false });
      lz.addEventListener('touchcancel', endLook, { passive: false });

      // ---------- 按住型按钮 ----------
      const hold = (id, down, up) => {
        const el = document.getElementById(id);
        el.addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); down(); }, { passive: false });
        const rel = (e) => { e.preventDefault(); if (up) up(); };
        el.addEventListener('touchend', rel, { passive: false });
        el.addEventListener('touchcancel', rel, { passive: false });
      };
      // 开火 / 鱼竿蓄力
      hold('btnFire',
        () => {
          if (this.player.isRod() && !this.player.frozen) this.fishing.startCharge();
          else input.fire = true;
        },
        () => {
          if (this.fishing.state === 'charge') this.fishing.releaseCharge();
          input.fire = false;
        });
      hold('btnAim', () => { input.aim = true; }, () => { input.aim = false; });
      hold('btnJump', () => { input.jump = true; }, () => { input.jump = false; });

      // ---------- 点按型按钮 ----------
      const tap = (id, fn) => {
        const el = document.getElementById(id);
        el.addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); fn(); }, { passive: false });
      };
      tap('btnReload', () => {
        if (this.player.reloading <= 0 && !this.player.isMelee() && this.player.ammo < this.player.magSize) {
          this.player.startReload(); Sound.play('reload');
        }
      });
      tap('btnInteract', () => this.interact());
      tap('btnSwap', () => { this.player.switchNext(); Sound.play('swap'); });
      tap('btnBackpack', () => this.toggleInGameOverlay('backpack'));
      tap('btnPause', () => this.mobilePause());
    }

    // ================= 联机垂钓 =================
    bindMultiplayer() {
      const net = this.net;
      net.onStatus = (msg) => {
        const el = document.getElementById('mpStatus');
        if (el) el.textContent = msg;
        this.notice(msg, 'info');
      };
      net.onChat = (name, text) => this.addChatLine(name, text);

      document.getElementById('mpBackBtn').addEventListener('click', () => this.closeMpOverlay());
      document.getElementById('mpCreateBtn').addEventListener('click', () => {
        this.enterRoom(this._readRoom() || this.randomRoom());
      });
      document.getElementById('mpJoinBtn').addEventListener('click', () => {
        const room = this._readRoom();
        if (!room) { this._mpStatus('请先输入要加入的房间号'); return; }
        this.enterRoom(room);
      });
      const chatInput = document.getElementById('chatInput');
      chatInput.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return;
        const text = chatInput.value.trim();
        if (!text) return;
        net.sendChat(text);
        this.addChatLine(net.myName(), text);
        chatInput.value = '';
      });
    }

    openMpOverlay() {
      document.getElementById('mpNameInput').value = this.net.myName();
      document.getElementById('mpHostText').textContent =
        window.NetworkManager.hostUrl() || '公共中继 broker.emqx.io（免账号）';
      document.getElementById('mpStatus').textContent = '';
      document.getElementById('mpOverlay').classList.remove('hidden');
    }

    closeMpOverlay() {
      document.getElementById('mpOverlay').classList.add('hidden');
    }

    enterRoom(room) {
      const name = document.getElementById('mpNameInput').value.trim();
      if (name) this.net.setMyName(name);
      this._mpStatus('正在连接房间 ' + room + ' ...');
      // WebSocket 后台建立，同时走水墨加载流程；玩家落地时连接通常已就绪
      this.net.connect(room, this);
      this.startRound();
      this.closeMpOverlay();
      document.getElementById('chatBox').classList.remove('hidden');
    }

    addChatLine(name, text) {
      const log = document.getElementById('chatLog');
      const line = document.createElement('div');
      line.className = 'chat-line';
      const b = document.createElement('b');
      b.textContent = name + '：';
      const span = document.createElement('span');
      span.textContent = text;
      line.appendChild(b);
      line.appendChild(span);
      log.appendChild(line);
      log.scrollTop = log.scrollHeight;
      while (log.children.length > 30) log.removeChild(log.firstChild);
    }

    // 钓鱼状态机变化 → 把抛竿/咬钩/钓获/收杆同步给房间里的其他玩家
    updateNetEvents() {
      if (!this.net.connected) return;
      const f = this.fishing;
      const st = f.state;
      if (st === this._prevFish) return;
      if (st === 'wait') {
        const b = f.bobberTarget;
        this.net.sendCast([b.x, b.y, b.z]);
      } else if (st === 'bite') {
        this.net.sendBite();
      } else if (st === 'result') {
        if (f.pickedFish) this.net.sendCatch(f.pickedFish.name);
      } else if (st === 'idle') {
        this.net.sendReel();
      }
      this._prevFish = st;
    }

    _readRoom() {
      return document.getElementById('mpRoomInput').value.trim();
    }

    randomRoom() {
      const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
      let s = '';
      for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
      return s;
    }

    _mpStatus(t) {
      document.getElementById('mpStatus').textContent = t;
    }

    // 出战入口：先弹水墨加载界面，让浏览器把界面画出来，再把同步初始化放到下一帧，
    // 避免所有重活挤在点击按钮的同一帧造成卡顿；首帧渲染后再隐藏加载界面。
    startRound(loadout) {
      if (this._loading) return;
      this._loading = true;
      const overlay = this.ui.loadingOverlay;
      if (overlay) overlay.classList.remove('hidden');
      // 双 rAF + 短延时：确保加载界面已经真正绘制到屏幕上，再开始重活
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setTimeout(() => {
            this._startRoundNow(loadout);
            // 再等两帧让场景首帧上屏，然后淡出加载界面
            requestAnimationFrame(() => {
              requestAnimationFrame(() => {
                if (overlay) overlay.classList.add('hidden');
                this._loading = false;
              });
            });
          }, 60);
        });
      });
    }

    _startRoundNow(loadout) {
      // 音频必须在开局这一刻就真正跑起来，否则「第一枪」还要顺带付
      // 一次音频设备启动的代价。
      Sound.init();
      Sound.warm();
      // 背包：两把枪（第二个槽位可空）
      if (Array.isArray(loadout)) {
        this.loadout = loadout.filter(Boolean).slice(0, 2);
      } else if (typeof loadout === 'string') {
        this.loadout = [loadout];
      }
      if (!this.loadout || this.loadout.length === 0) this.loadout = ['pistol'];
      if (window.Economy) {
        this.loadout = this.loadout.filter((id) => window.Economy.ownsGun(id));
        if (this.loadout.length === 0) this.loadout = ['pistol'];
      }
      this.player.setLoadout(this.loadout);
      this.loadoutSel = this.loadout.slice();
      if (window.Economy) window.Economy.setLoadout(this.loadoutSel);

      this.ui.startOverlay.classList.add('hidden');
      this.ui.charOverlay.classList.add('hidden');
      this.ui.baitOverlay.classList.add('hidden');
      this.ui.weaponOverlay.classList.add('hidden');
      this.ui.pauseOverlay.classList.add('hidden');
      this.ui.endOverlay.classList.add('hidden');
      this.ui.hud.classList.add('on');

      this.player.reset();
      if (this.world.resetBoat) this.world.resetBoat();
      this.fishing.reset();
      window.FX.clear();
      this.clearNotices();

      this.state = 'playing';
      this.elapsed = 0;
      this.hour = 17.2;
      this.sleeping = false;
      this.sleepT = 0;
      this.wasNight = false;
      this.setBloodNight(false);
      // 重开一局直接清干净，不走 setDaymare 的「散去」提示
      this.daymare = false;
      this.daymareT = 0;
      this.batMax = 0;
      this.batN = 0;
      this.daymareClimax = false;
      if (this.world.setDaymare) this.world.setDaymare(false);
      if (this.world.setBatCount) this.world.setBatCount(0);
      if (window.Daymare) { window.Daymare.active = false; window.Daymare.climax = false; window.Daymare.bossed = false; }
      document.body.classList.remove('daymare');
      if (this.ui.dayTag) this.ui.dayTag.classList.add('hidden');
      this.sitting = false;
      this.sitSeat = null;
      if (this.ui.sleepOverlay) this.ui.sleepOverlay.classList.add('hidden');
      this.score = 0;
      this.catches = 0;
      this.playerRespawn = 0;
      this.hitstop = 0;
      this.slowmo = 0;
      this.killChain = 0;
      // 湖里的鱼不随回合重置，只清零这局的结算游标
      this.pondAcc = 0;
      this.pondTick = 0;
      this.killChainT = 0;
      this.flashWhite = 0;
      this.damageFlashT = 0;
      this.heartCd = 0;
      this.ui.damageDir.classList.remove('on');
      this.overlaySource = null;
      this.overlayKind = null;

      // 从库存带入备弹
      this.player.reserve = window.Economy ? window.Economy.ammoStock : 60;

      this.input.forward = this.input.back = this.input.left = this.input.right = false;
      this.input.fire = false;
      this.input.aim = false;
      this.input.jump = false;
      this.input.sprint = false;
      this.input.crouch = false;

      this.acquireControl();
      this.updateHud();
      this.notice('自由垂钓中 · 按 3 取出鱼竿 · 长按左键蓄力抛竿 · 按 1/2 切枪打鸟打鱼', 'info');
    }

    // ---------- 坐凳子 ----------
    sitDown(seat) {
      if (this.sitting || this.state !== 'playing' || !this.player.alive) return;
      if (this.sleeping || this.fishing.busy) return;
      this.sitting = true;
      this.sitSeat = seat;
      this.player.frozen = true;
      this.player.seated = true;
      this.player.velocity.set(0, 0, 0);
      this.player.pos.x = seat.x;
      this.player.pos.z = seat.z;
      this.player.yaw = seat.yaw;
      this.player.pitch = -0.18;
      this.input.fire = false;
      this.input.aim = false;
      this.fishing.cancelCharge();
      Sound.play('swap');
      this.notice('坐下了 · 按 F 起身', 'info');
    }

    standUp() {
      if (!this.sitting) return;
      this.sitting = false;
      this.sitSeat = null;
      this.player.seated = false;
      this.player.frozen = false;
      // 起身时贴回地面高度
      this.player.pos.y = this.world.surfaceHeight(
        this.player.pos.x, this.player.pos.z, this.player.pos.y + 0.8, false
      );
      Sound.play('swap');
      this.notice('起身了', 'info');
    }

    // ---------- 昼夜与睡觉 ----------
    updateDayNight(dt) {
      if (this.state !== 'playing') {
        if (this.world.setDayTime) this.world.setDayTime(this.hour);
        return;
      }
      if (this.sleeping) {
        this.sleepT += dt;
        const k = Math.min(1, this.sleepT / 3.2);
        const e = k * k * (3 - 2 * k);
        this.hour = (this.sleepFrom + this.sleepDelta * e) % 24;
        if (k >= 1) this.finishSleep(true);
      } else {
        this.hour = (this.hour + dt * (24 / this.dayLength)) % 24;
      }
      if (this.world.setDayTime) this.world.setDayTime(this.hour);
      this.updateClockHud();
      const isNight = this.hour >= 19 || this.hour < 6;
      // 血夜：只在「入夜那一刻」掷一次骰子，40% 概率整夜变红；
      // 天亮时无条件退掉（血月不会在白天还挂着）
      if (isNight && !this.wasNight) this.setBloodNight(Math.random() < 0.40);
      else if (!isNight && this.wasNight) this.setBloodNight(false);
      // 日魇：天亮那一刻掷骰子，35% 概率；入夜时无条件退掉
      if (!isNight && this.wasNight) this.setDaymare(Math.random() < 0.35);
      else if (isNight && !this.wasNight) this.setDaymare(false);
      this.wasNight = isNight;
      this.updateDaymare(dt);
    }

    // 日魇期间的蝠群密度：从 10 只慢慢涨到 batMax（10~30），
    // 涨满之后进入「高潮」，这时候才有机会撞上首领鱼。
    updateDaymare(dt) {
      if (!this.daymare) return;
      this.daymareT += dt;
      // 心跳：约 1.15 秒一次，越接近高潮越急
      this.hbT = (this.hbT || 0) - dt;
      if (this.hbT <= 0) {
        this.hbT = this.daymareClimax ? 0.78 : 1.15;
        Sound.play('heartbeat');
      }
      const dur = (13 / 24) * this.dayLength;   // 6:00→19:00 的实时秒数
      const p = Math.min(1, this.daymareT / (dur * 0.62));
      const n = Math.round(10 + (this.batMax - 10) * p);
      if (n !== this.batN) {
        this.batN = n;
        if (this.world.setBatCount) this.world.setBatCount(n);
        if (this.ui.dayTag && this.daymare) this.ui.dayTag.textContent = '日魇 · 蝠群 ' + n;
      }
      const climax = n >= this.batMax - 1;
      if (climax && !this.daymareClimax) {
        this.notice('蝠群密到遮住了整片天 —— 水底有巨大的东西正在往上顶', 'bad');
        Sound.play('bite');
      }
      this.daymareClimax = climax;
      if (window.Daymare) {
        window.Daymare.climax = climax;
        window.Daymare.bats = n;
      }
    }

    // 日魇开关：世界天光、HUD 标记、蝠群、钓鱼鱼池四处一起切
    setDaymare(on) {
      on = !!on;
      if (this.daymare === on) return;
      this.daymare = on;
      if (on) {
        this.daymareT = 0;
        this.batMax = 10 + Math.floor(Math.random() * 21);   // 10~30 只
        this.batN = 10;
        window.Daymare.bossed = false;
        window.Daymare.climax = false;
      } else {
        this.batN = 0;
      }
      if (window.Daymare) {
        window.Daymare.active = on;
        window.Daymare.startedAt = on ? Date.now() : 0;
        window.Daymare.bats = this.batN;
        if (!on) window.Daymare.climax = false;
      }
      if (this.world.setDaymare) this.world.setDaymare(on);
      if (this.world.setBatCount) this.world.setBatCount(on ? this.batN : 0);
      document.body.classList.toggle('daymare', on);
      if (this.ui.dayTag) this.ui.dayTag.classList.toggle('hidden', !on);
      if (this.ui.dayTag && on) {
        this.ui.dayTag.textContent = '日魇 · 蝠群 ' + this.batMax;
      }
      if (on) {
        this.notice('日魇 —— 阳光无法驱散它们。当刺眼的白昼被密集的蝠影遮蔽，深渊中的变异鱼类将借着狂潮浮出水面。', 'bad');
        if (Sound.daymare) Sound.daymare(true);
      } else if (this.state === 'playing') {
        this.notice('蝠影散去，阳光重新落在水面上', 'info');
        if (Sound.daymare) Sound.daymare(false);
      }
    }


    // 血夜开关：世界着色、HUD 标记、钓鱼鱼池三处一起切
    setBloodNight(on) {
      on = !!on;
      if (this.bloodNight === on) return;
      this.bloodNight = on;
      if (window.BloodNight) {
        window.BloodNight.active = on;
        window.BloodNight.startedAt = on ? Date.now() : 0;
      }
      if (this.world.setBloodNight) this.world.setBloodNight(on);
      document.body.classList.toggle('blood-night', on);
      if (this.ui.bloodTag) this.ui.bloodTag.classList.toggle('hidden', !on);
      if (on) {
        this.notice('血月升起 —— 水面泛起血色，五种月下异种开始咬钩（挂饵才引得动它们）', 'bad');
        Sound.play('bite');
      } else if (this.state === 'playing') {
        this.notice('血月退去，湖面恢复平静', 'info');
      }
    }

    updateClockHud() {
      if (!this.ui.clock) return;
      const h = Math.floor(this.hour);
      const m = Math.floor((this.hour - h) * 60);
      const pad = (n) => (n < 10 ? '0' + n : '' + n);
      const isNight = this.hour >= 19 || this.hour < 6;
      this.ui.clock.textContent = pad(h) + ':' + pad(m) + ' ' + (isNight ? '夜晚' : '白天');
    }

    startSleep() {
      if (this.sleeping || this.state !== 'playing' || !this.player.alive) return;
      if (this.fishing.busy) return;
      const bed = this.world.nearestBed
        ? this.world.nearestBed(this.player.pos.x, this.player.pos.z, 2.8)
        : null;
      if (!bed) return;
      this.sleeping = true;
      this.sleepT = 0;
      this.sleepFrom = this.hour;
      // 睡到下一个清晨 6:00
      let delta = (6 - this.hour + 24) % 24;
      if (delta < 1.0) delta += 24;
      this.sleepDelta = delta;
      this.player.frozen = true;
      this.input.fire = false;
      this.input.aim = false;
      this.fishing.cancelCharge();
      if (this.ui.sleepOverlay) this.ui.sleepOverlay.classList.remove('hidden');
      Sound.play('swap');
    }

    finishSleep(completed) {
      if (!this.sleeping) return;
      this.sleeping = false;
      this.player.frozen = false;
      if (completed) {
        this.hour = 6.0;
        this.notice('天亮了，你睡醒了', 'info');
      } else {
        this.notice('你停止了睡觉', 'info');
      }
      if (this.world.setDayTime) this.world.setDayTime(this.hour);
      this.updateClockHud();
      if (this.ui.sleepOverlay) this.ui.sleepOverlay.classList.add('hidden');
      Sound.play('swap');
    }

    animate() {
      const dt = Math.min(0.05, this.clock.getDelta());
      this.elapsed += dt;
      this.updateTouchLayer();
      if (this._statsOn) this.updateStats(dt * 1000);

      const inMenu = this.state === 'menu';
      // 菜单只是缓慢环绕的静态背景：跳过鱼群/海鸟/涟漪/船的逐帧模拟，
      // 只推进水面与天空的时间。原来这里每帧跑完整的 world.update，
      // 加上 bloom + FXAA + 色彩分级的全屏后处理，主线程被渲染吃满，
      // 玩家点「单人游戏 / 商店 / 设置」这些按钮，点击和界面刷新都要排队等。
      if (inMenu && this.world.updateAmbient) this.world.updateAmbient(this.elapsed);
      else this.world.update(dt, this.elapsed);

      this.updateDayNight(dt);

      if (inMenu) {
        const t = this.elapsed;
        this.camera.position.set(Math.cos(t * 0.1) * 33, 10 + Math.sin(t * 0.13) * 2.5, Math.sin(t * 0.1) * 33);
        this.camera.lookAt(0, 2.2, 0);
        this.player.weapon.visible = false;
      } else {
        if (this.state === 'playing') {
          this.update(dt);
          this.updatePondIncome(dt);
          this.net.update(dt);
          this.updateNetEvents();
        }
        // 第一人称枪模：第三人称 / 狙击开镜 / 近战（拳）/ 鱼竿时隐藏
        const fpView = !this.player.thirdPerson && !this.player.scoped;
        this.player.weapon.visible = fpView && !this.player.frozen && !this.player.isMelee() && !this.player.isRod() && this.player.alive && this.state === 'playing';
        // 鱼竿：装备鱼竿或正在钓鱼时显示（装备状态单独记录，供收杆后复位）
        this.fishing.rodOwned = this.player.isRod();
        this.fishing.rod.visible = fpView && this.player.alive && this.state === 'playing' &&
          (this.player.isRod() || this.fishing.busy);
      }

      if (this.state !== 'menu') this.updateDropped(dt);

      window.FX.update(dt);
      this.updateHud();
      this.updateInteractHint();

      // 动态 bloom：开火/受击时柔和泛光短暂增强（基线 0.34），hitstop 期间冻结增强
      if (this.bloomPass && !inMenu) {
        const wantBloom = this._bloomMode === true || (this._bloomMode === 'night' && this.wasNight);
        if (this.bloomPass.enabled !== wantBloom) this.bloomPass.enabled = wantBloom;
        if (wantBloom) {
          const targetStrength = 0.34 + Math.min(0.5, this.player.bloom) + (this.hitstop > 0 ? 0.18 : 0);
          this.bloomPass.strength += (targetStrength - this.bloomPass.strength) * Math.min(1, dt * 8);
        }
      }

      // 阴影覆盖区跟随玩家：4096 的阴影图只铺在 68m 见方内，投影才够锐利
      if (this.world.focusShadow && this.player.pos && !inMenu) {
        this.world.focusShadow(this.player.pos.x, this.player.pos.z);
      }

      // 菜单走直渲染：跳过 bloom / FXAA / 色彩分级这条全屏后处理链。
      // 后处理每一帧要 5 级 bloom mip 降采样 + 两次全屏 shader，菜单里纯属浪费，
      // 直接 renderer.render 能立刻把主线程还给点击和 DOM。
      // 同时冻结 4096 阴影贴图：菜单场景与太阳都静止，阴影烘焙一次复用即可，
      // 不必每帧重渲这张大贴图（这是 GPU 侧最大的单笔开销）。
      // 有素材刚加载完成 → 在本帧把它的着色器编掉。
      // 放在渲染之前、且优先在非游戏状态执行：玩家这时多半还在加载/菜单界面，
      // 卡的是菜单而不是走位；真在游戏里也不会漏编，只是多一顿。
      if (this._warmPending) {
        this._warmPending = false;
        this._warmScene();
      }

      if (inMenu) {
        this.renderer.shadowMap.autoUpdate = false;
        this.renderer.render(this.scene, this.camera);
      } else {
        // 太阳落山后阴影对画面没有任何贡献（太阳强度已经≈0），
        // 阴影贴图完全冻结；白天 4096² 重绘也不再逐帧 —— 改成隔帧（~30Hz），
        // 场景里会动的东西（枪、鱼竿、鱼）在阴影里慢半帧肉眼看不出来，
        // 但每帧都把整座岛重画进这张大贴图，是 GPU 侧最大的单笔开销。
        const sunUp = this.world.isSunUp ? this.world.isSunUp() : true;
        if (sunUp) {
          this.renderer.shadowMap.autoUpdate = false;
          // 阴影按「时间」节流，不按帧数 —— 否则 144Hz 屏会比 60Hz 多画 2.4 倍的阴影图。
          // 玩家站着钓鱼时角色不动 → 阴影完全冻结，这一大笔开销直接归零；
          // 走路时按档位限频（高 30Hz / 中 20Hz / 低 10Hz），影子慢几十毫秒看不出来。
          const every = this._shadowMs || 50;
          this._shadowAcc = (this._shadowAcc || 0) + dt * 1000;
          const pp = this.player.pos;
          const dx = pp.x - (this._shX == null ? 1e9 : this._shX);
          const dz = pp.z - (this._shZ == null ? 1e9 : this._shZ);
          const moving = (dx * dx + dz * dz) > 0.02;
          const wait = moving ? every : 600;
          if (this._shadowAcc >= wait) {
            this._shadowAcc = 0;
            this.renderer.shadowMap.needsUpdate = true;
            this._shX = pp.x; this._shZ = pp.z;
          }
          this._shadowLive = true;
        } else if (this._shadowLive) {
          this._shadowLive = false;
          this.renderer.shadowMap.autoUpdate = false;
        }
        // 日魇压饱和：直接复用色彩分级 pass（本来就要跑的全屏 shader），
        // 之前用 CSS filter 会在合成器里额外多一整屏 pass，弱 GPU 上很伤
        if (this.gradePass) {
          const dm = this.world.getDayMix ? this.world.getDayMix() : 0;
          const u = this.gradePass.material.uniforms;
          u.saturation.value = 1.06 - 0.20 * dm;
          u.contrast.value = 1.10 + 0.05 * dm;
        }
        if (this.composer) this.composer.render();
        else this.renderer.render(this.scene, this.camera);
      }
    }

    update(dtRaw) {
      // 帧率治理用原始帧时间（不受击杀顿帧/慢放影响）
      if (this.tickGovernor) this.tickGovernor(dtRaw * 1000);
      let dt = dtRaw;
      // 击杀顿帧：短暂放慢世界节奏，强化命中感
      if (this.hitstop > 0) {
        this.hitstop -= dtRaw;
        dt *= 0.15;
      }
      // 击杀慢放：顿帧之后接一小段慢动作，能看到对手倒下
      if (this.slowmo > 0) {
        this.slowmo -= dtRaw;
        dt *= 0.34;
      }
      this.killChainT = Math.max(0, this.killChainT - dtRaw);
      this.flashWhite = Math.max(0, this.flashWhite - dtRaw * 2.2);
      this.hitConfirm = Math.max(0, this.hitConfirm - dtRaw);
      this.damageFlashT = Math.max(0, this.damageFlashT - dtRaw * 2.6);
      if (this.ui.flash) this.ui.flash.style.opacity = (this.flashWhite * 0.55).toFixed(3);
      if (this.ui.hitVignette) this.ui.hitVignette.style.opacity = (this.damageFlashT * 0.5).toFixed(3);

      // 声音听者：相机位置 + 玩家朝向（3D 音效全靠这个）
      Sound.setListener(this.camera.position, this.player.yaw);

      this.player.setAim(this.input.aim && this.locked && !this.fishing.busy && !this.input.sprint);
      this.player.update(dt, this.input, this.locked);
      this.fishing.update(dt);
      // 掉落物物理统一在 animate() 中更新，暂停打开背包时也会继续落地

      if (this.input.fire && !this.fishing.busy && !this.sleeping && !this.sitting) {
        // 和平模式也可开枪：打人不掉血，可打鸟打鱼
        const shot = this.player.fire();
        if (shot) {
          if (shot.melee) this.handleMelee(shot);
          else this.handlePlayerShot(shot);
        }
        // 弹尽粮绝提示
        this.ammoHintCd -= dt;
        if (!shot && !this.player.isMelee() && this.player.ammo <= 0 && this.player.reserve <= 0 && this.ammoHintCd <= 0) {
          this.ammoHintCd = 2.5;
          this.notice('子弹耗尽！去商店购买弹药，或钓鱼补给', 'warn');
        }
      }

      // 玩家重生
      if (!this.player.alive) {
        this.playerRespawn -= dt;
        if (this.playerRespawn <= 0) {
          this.player.reset();
          this.notice('重返战场！', 'info');
        }
      }

      // 体力见底：心跳与呼吸感（原来挂在血量上，现在没有敌人了，改成体力）
      if (this.player.alive && this.player.stamina < 30) {
        this.heartCd -= dt;
        if (this.heartCd <= 0) {
          this.heartCd = 1.0;
          Sound.play('heartbeat');
        }
      } else {
        this.heartCd = 0;
      }
    }
    handlePlayerShot(shot) {
      const origin = shot.origin;
      const dir = shot.dir;
      const muzzle = this.player.getMuzzleWorld();

      const gunId = this.player.gun.id;
      Sound.play('shot_' + gunId);
      const POWER = { sniper: 1.7, shotgun: 1.5, rifle: 1.1, pistol: 0.8 };
      const power = POWER[gunId] || 1;
      window.FX.muzzleFlash(muzzle, dir, power);
      window.FX.muzzleSmoke(muzzle, dir, power);

      // ---- 抛壳：从机匣右侧飞出，带重力与落地弹跳 ----
      {
        const cam = this.camera;
        cam.updateMatrixWorld(true);
        const q = cam.quaternion;
        const right = new THREE.Vector3(1, 0, 0).applyQuaternion(q);
        const up = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
        const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(q);
        const eject = cam.getWorldPosition(new THREE.Vector3())
          .addScaledVector(right, 0.15)
          .addScaledVector(up, -0.085)
          .addScaledVector(fwd, 0.40);
        const bigShell = gunId === 'sniper' || gunId === 'shotgun';
        window.FX.shell(eject, right, up, fwd, { big: bigShell });
      }

      // 霰弹有多颗弹丸，逐颗独立判定；其他枪只有一条射线
      const dirs = (shot.pellets && shot.pellets.length) ? shot.pellets : [dir];
      for (let i = 0; i < dirs.length; i++) {
        this.traceShot(origin, dirs[i], muzzle, gunId, i);
      }
    }

    // 单条射线的完整判定（鸟鱼 / 世界），霰弹会调用多次
    traceShot(origin, dir, muzzle, gunId, pelletIdx) {
      // 当前子弹类型的弹道颜色
      const atId = window.Economy ? window.Economy.ammoType : 'standard';
      const ammoColor = (window.AMMO_TYPES[atId] || window.AMMO_TYPES.standard).color;
      // 命中世界（掩体或地面）
      const worldHit = this.world.raycast(origin, dir, 120);
      let worldT = worldHit ? worldHit.t : Infinity;
      let groundHit = false;
      if (dir.y < -0.0001) {
        const tGround = (0.02 - origin.y) / dir.y;
        if (tGround > 0 && tGround < worldT) { worldT = tGround; groundHit = true; }
      }

      // 命中海鸟 / 塘鱼
      const prey = this.hitPrey(origin, dir, worldT);
      if (prey) {
        const point = origin.clone().addScaledVector(dir, prey.t);
        if (pelletIdx < 3) window.FX.tracer(muzzle, point, ammoColor);
        window.FX.sparks(point, 0xffe08a, 12);
        window.FX.hitRing(point, 0xffd166);
        window.FX.bloodMist(point, dir, 6);
        if (!pelletIdx) Sound.play('hit_flesh');
        this.showHitmarker();
        prey.kill();
        this.score += prey.points;
        if (window.Economy) window.Economy.addScore(prey.points);
        this.notice(prey.label + ' +' + prey.points + ' 分' +
          (prey.kind === 'bird' ? '，体力经验 +' + this.lastBirdExp +
            (this.lastBirdLevel ? '，体力上限升到 ' + this.lastBirdLevel + ' 级' : '') : ''), 'good');
        return;
      }

      // ---- 落空：打在建筑/木箱/岩石/地面上，留弹孔与碎屑 ----
      const point = worldT < Infinity
        ? origin.clone().addScaledVector(dir, worldT)
        : origin.clone().addScaledVector(dir, 120);

      if (worldT < Infinity) {
        // 表面法线：由 raycast 返回的轴与方向推出
        let normal;
        if (worldHit && worldHit.axis >= 0) {
          const n = [0, 0, 0];
          n[worldHit.axis] = worldHit.sign;
          normal = new THREE.Vector3(n[0], n[1], n[2]);
        } else {
          normal = new THREE.Vector3(0, 1, 0);
        }
        const tag = worldHit && worldHit.collider ? worldHit.collider.tag : null;
        let kind = 'stone';
        if (groundHit) kind = 'ground';
        else if (tag === 'crate' || tag === 'tree') kind = 'wood';
        else if (tag === 'pillar' || tag === 'rock') kind = 'stone';

        // 地面太远（>70m）就不留弹孔，省得满地图小黑点
        if (worldT < 70) window.FX.bulletHole(point, normal, kind);

        const sparkColor = kind === 'wood' ? 0xffb066 : kind === 'ground' ? 0xc9b491 : 0xffd08a;
        window.FX.sparks(point, sparkColor, kind === 'ground' ? 5 : 8);
        window.FX.debris(point, normal, kind === 'wood' ? 0x9a7040 : kind === 'ground' ? 0x8f8265 : 0xb7b2a4, 6);

        if (!pelletIdx) {
          if (kind === 'wood') Sound.playAt('hit_wood', point, { vol: 0.9, falloff: 0.12 });
          else if (kind === 'ground') Sound.playAt('hit_ground', point, { vol: 0.8, falloff: 0.12 });
          else Sound.playAt('hit_metal', point, { vol: 0.5, falloff: 0.14 });
        }
      }
      if (pelletIdx < 3) window.FX.tracer(muzzle, point, ammoColor);
    }

    // 检测海鸟 / 塘鱼命中（取最近者）
    hitPrey(origin, dir, maxT) {
      let best = null;
      this.world.birds.forEach((b) => {
        if (!b.alive) return;
        const p = b.group.position;
        const t = raySphere(origin, dir, p.x, p.y, p.z, 1.0);
        if (t !== null && t < maxT && (!best || t < best.t)) {
          best = {
            t, points: 35, label: '打落海鸥！', kind: 'bird',
            kill: () => {
              b.alive = false; b.group.visible = false; b.respawnT = 9;
              // 打鸟攒体力上限经验：子弹越好 exp 越高，攒满自动升级、提升上限
              const typeId = window.Economy ? window.Economy.ammoType : 'standard';
              const def = window.AMMO_TYPES[typeId] || window.AMMO_TYPES.standard;
              this.lastBirdExp = def.exp;
              this.lastBirdLevel = this.player.addStamExp(def.exp);
            }
          };
        }
      });
      // 塘鱼是玩家自己养在湖里的：打死就真的没了（不会自己刷回来），
      // 那条鱼每秒产出的积分也跟着消失，所以枪口别对着自家鱼塘。
      this.world.fishes.forEach((f) => {
        if (!f.alive) return;
        const p = f.group.position;
        const t = raySphere(origin, dir, p.x, p.y, p.z, 0.75);
        if (t !== null && t < maxT && (!best || t < best.t)) {
          best = {
            t, points: 10, label: '打死湖里的鱼！',
            kill: () => {
              f.alive = false;
              f.deadT = 0;
              if (window.Economy && f.id) window.Economy.dropPondFish(f.id);
              const st = this.world.pondStat ? this.world.pondStat() : { n: 0, rate: 0 };
              const gi = window.FISH_GRADES ? window.FISH_GRADES[f.tier] : null;
              this.notice('打死了湖里的' + f.name + (gi ? '（' + gi.name + '）' : '') +
                ' · 湖中剩 ' + st.n + ' 条 · 每秒 +' + st.rate.toFixed(1) + ' 分', 'warn');
              if (this.pondHudDirty !== undefined) this.pondHudDirty = true;
            }
          };
        }
      });
      return best;
    }

    // 近战：没有敌人了，拳头改成「拍身边的水鸟/岸边的鱼」——
    // 举枪打飞鸟是主玩法，近身那一下留个土办法，别让 4 号槽变成纯摆设。
    handleMelee(shot) {
      Sound.play('punch');
      const prey = this.hitPrey(shot.origin, shot.dir, shot.range);
      if (!prey) return;
      const point = shot.origin.clone().addScaledVector(shot.dir, prey.t);
      window.FX.sparks(point, 0xffd08a, 10);
      window.FX.hitRing(point, 0xff9e3d);
      Sound.play('hit');
      this.showHitmarker();
      prey.kill();
      this.score += prey.points;
      if (window.Economy) window.Economy.addScore(prey.points);
      this.notice(prey.label + ' +' + prey.points + ' 分' +
        (prey.kind === 'bird' ? '，体力经验 +' + this.lastBirdExp +
          (this.lastBirdLevel ? '，体力上限升到 ' + this.lastBirdLevel + ' 级' : '') : ''), 'good');
    }
    finishRound() {
      this.state = 'over';
      this.input.fire = false;
      this.input.aim = false;
      this.player.frozen = true;
      if (this.fishing.busy) this.fishing.cancel(null);
      Sound.play('win');

      if (document.pointerLockElement === this.canvas) {
        document.exitPointerLock();
      }

      // 备弹入库 + 战绩记录
      this.syncAmmo();
      if (window.Economy) {
        window.Economy.recordRound({ score: this.score, catches: this.catches });
      }

      this.ui.pauseOverlay.classList.add('hidden');
      this.ui.endPanel.classList.remove('win', 'lose');
      this.ui.endPanel.classList.add('win');
      this.ui.endTitle.textContent = '本局结束 · ' + this.score + ' 分';
      const pond = this.world.pondStat ? this.world.pondStat() : { n: 0, rate: 0 };
      this.ui.endText.textContent =
        '本局钓获 ' + this.catches + ' 条 · 得分 ' + this.score + ' · 湖中养鱼 ' + pond.n +
        ' 条（每秒 +' + pond.rate.toFixed(1) + '）· 积分余额 ' +
        (window.Economy ? window.Economy.balance : this.score);
      this.ui.endOverlay.classList.remove('hidden');
      this.updateHud();
    }

    // 击倒结算：顿帧 + 慢放 + 冲击特效 + 连杀播报
    showKill(text) {
      const el = this.ui.killBanner;
      el.textContent = text;
      el.classList.remove('show');
      void el.offsetWidth;
      el.classList.add('show');
    }

    // 受击方向指示：箭头指向攻击者
    showDamageDir(from) {
      if (!from) return;
      const dx = from.x - this.player.pos.x;
      const dz = from.z - this.player.pos.z;
      const fx = -Math.sin(this.player.yaw);
      const fz = -Math.cos(this.player.yaw);
      const rx = Math.cos(this.player.yaw);
      const rz = -Math.sin(this.player.yaw);
      const localX = dx * rx + dz * rz;
      const localZ = dx * fx + dz * fz;
      const deg = Math.atan2(localX, localZ) * 180 / Math.PI;
      this.ui.damageDir.style.transform = 'translate(-50%, -50%) rotate(' + deg + 'deg)';
      this.ui.damageDir.classList.add('on');
      clearTimeout(this.damageDirTimer);
      this.damageDirTimer = setTimeout(() => {
        this.ui.damageDir.classList.remove('on');
      }, 900);
    }

    showHitmarker(kind) {
      const el = this.ui.hitmarker;
      el.classList.remove('show', 'hs', 'kill');
      void el.offsetWidth;
      if (kind) el.classList.add(kind);
      el.classList.add('show');
    }

    flashVignette() {
      this.ui.vignette.style.opacity = '0.85';
      clearTimeout(this.vignetteTimer);
      this.vignetteTimer = setTimeout(() => {
        this.ui.vignette.style.opacity = '0';
      }, 90);
    }

    notice(text, kind) {
      const div = document.createElement('div');
      div.className = 'notice ' + (kind || 'info');
      div.textContent = text;
      this.ui.notices.appendChild(div);
      while (this.ui.notices.children.length > 4) {
        this.ui.notices.removeChild(this.ui.notices.firstChild);
      }
      setTimeout(() => {
        div.classList.add('out');
        setTimeout(() => {
          if (div.parentNode) div.parentNode.removeChild(div);
        }, 380);
      }, 2400);
    }

    clearNotices() {
      while (this.ui.notices.firstChild) {
        this.ui.notices.removeChild(this.ui.notices.firstChild);
      }
    }

    // ---------------- 湖中养鱼：每秒产出积分 ----------------
    // 只在 'playing' 状态结算（菜单/暂停/结算界面不产分）。
    // 分数直接进「本局得分 + 积分」，因为存档里两者本来就 1:1。
    updatePondIncome(dt) {
      const st = this.world.pondStat ? this.world.pondStat() : { n: 0, rate: 0 };
      this.pondRate = st.rate;
      this.pondCount = st.n;
      if (st.n <= 0) {
        this.pondAcc = 0;
        this.pondTick = 0;
        return;
      }
      this.pondAcc += st.rate * dt;
      this.pondTick += dt;
      if (this.pondTick < 1) return;
      this.pondTick -= 1;
      const gain = Math.floor(this.pondAcc);
      if (gain <= 0) return;
      this.pondAcc -= gain;
      this.score += gain;
      if (window.Economy) {
        window.Economy.balance += gain;
        // 每秒写一次 localStorage 太频繁，攒几次再落盘（关页面/结算时会再存一次）
        this.pondSaveT = (this.pondSaveT || 0) + 1;
        if (this.pondSaveT >= 4) {
          this.pondSaveT = 0;
          window.Economy.save();
        }
      }
    }

    updateHud() {
      const p = this.player;
      // HUD 左下角的血条改成体力条：冲刺和游泳消耗，站着回，见底就跑不动
      const stRatio = Math.max(0, p.stamina / p.maxStamina);
      this.ui.hpFill.style.width = stRatio * 100 + '%';
      this.ui.hpFill.classList.toggle('low', stRatio < 0.3);
      this.ui.hpNum.textContent = Math.ceil(p.stamina);
      // 体力等级徽章：打鸟攒经验提升 1-10 级，等级越高体力上限越高
      if (this.ui.stamLevelBadge) {
        this.ui.stamLevelBadge.textContent = 'Lv.' + (window.Economy ? window.Economy.stamLevel : 1);
      }

      this.ui.gunName.textContent = p.gun.name;
      // 手上是鱼竿/拳头时，「弹夹」这个标签就不对了；拿竿时这一格改成「钩上挂的饵」
      const ecoHud = window.Economy;
      const baitId = ecoHud ? ecoHud.baitSel : null;
      const baitDef = baitId && window.BAITS ? window.BAITS[baitId] : null;
      if (this.ui.ammoLabel) {
        this.ui.ammoLabel.textContent = p.isRod() ? '鱼饵' : (p.isMelee() ? '空手' : '弹夹');
      }
      this.ui.ammoNum.textContent = p.isRod()
        ? (baitDef ? (baitDef.name + ' ×' + ecoHud.baitCount(baitId)) : '空钩')
        : (p.isMelee() ? '近战' : p.ammo + ' / ' + p.reserve);
      // 拿竿时在数字前面补一个鱼饵图标：HUD 上「蚯蚓 ×14」光有字，
      // 和鱼市/背包里的四档饵对不上号。
      if (this.ui.ammoIcon) {
        const showBait = p.isRod() && baitDef;
        if (showBait) {
          const key = baitId + '|' + (ecoHud.baitCount(baitId));
          if (key !== this._hudBaitKey) {
            this._hudBaitKey = key;
            this.ui.ammoIcon.innerHTML = this.baitIcon(baitId, 24);
          }
        } else if (this._hudBaitKey) {
          this._hudBaitKey = null;
          this.ui.ammoIcon.innerHTML = '';
        }
        this.ui.ammoIcon.classList.toggle('hidden', !showBait);
      }
      this.ui.reloadTag.classList.toggle('hidden', p.reloading <= 0 || p.isMelee() || p.isRod());
      // 原来这里显示「对战中 / 和平钓鱼」，对局删掉后改成当前钓季：
      // 换到更高一档鱼竿就是新的一季，枪械得重新买。
      const rodNow = window.RODS && window.Economy && window.RODS[window.Economy.rod];
      // 拿枪时标签显示「钓季」，拿竿时改显示这根竿的最远抛投距离（比重复竿名有用）
      const shortRod = rodNow ? rodNow.name.replace(/鱼竿$/, '').replace(/竿$/, '') : '';
      this.ui.modeTag.textContent = p.isRod()
        ? (rodNow ? '最远 ' + rodNow.dist + 'm' : '')
        : (rodNow ? (shortRod + ' · 第 ' + (rodNow.tier + 1) + ' 季') : '自由垂钓');
      this.ui.modeTag.classList.remove('duel');

      this.ui.hud.classList.toggle('aiming', p.aimBlend > 0.4);

      // 狙击倍镜：开镜显示镜内视野 UI，隐藏普通准星
      const scoped = p.scoped;
      this.ui.scope.classList.toggle('hidden', !scoped);
      // 手持鱼竿时没有射击瞄准，隐藏准心（狙击开镜也隐藏），只在拿枪时显示
      this.ui.crosshair.style.visibility = (scoped || p.isRod()) ? 'hidden' : 'visible';
      if (scoped) {
        const zl = p.zoomList ? p.zoomList() : null;
        const zNow = zl ? zl[p.zoomIdx] : (p.baseFov / p.currentAimFov());
        this.ui.scopeZoom.textContent = '×' + (zNow >= 10 ? zNow.toFixed(0) : zNow.toFixed(1));
      }

      // 准星随后坐/移动扩散，低血量红色脉冲
      const crossScale = (p.aimBlend > 0.4 ? 0.55 : 1) * (1 + p.bloom * 0.85);
      this.ui.crosshair.style.transform = 'translate(-50%, -50%) scale(' + crossScale.toFixed(3) + ')';
      this.ui.hud.classList.toggle('lowhp', p.alive && p.stamina / p.maxStamina < 0.2);

      this.ui.scoreNum.textContent = this.score;
      this.ui.balanceHud.textContent = window.Economy ? window.Economy.balance : 0;

      // 湖中养鱼：条数 + 每秒产出（没鱼时整条隐藏）
      if (this.ui.pondHud) {
        const st = this.world.pondStat ? this.world.pondStat() : { n: 0, rate: 0 };
        if (st.n > 0) {
          const key = st.n + '|' + st.rate.toFixed(1);
          if (key !== this._pondKey) {
            this._pondKey = key;
            this.ui.pondHud.innerHTML = '湖中养鱼 <b>' + st.n + '</b> 条 · <i>+' + st.rate.toFixed(1) + '/秒</i>';
          }
          this.ui.pondHud.classList.remove('hidden');
          if (this.ui.pondSep) this.ui.pondSep.classList.remove('hidden');
        } else {
          if (this._pondKey !== '0') { this._pondKey = '0'; }
          this.ui.pondHud.textContent = '';
          this.ui.pondHud.classList.add('hidden');
          if (this.ui.pondSep) this.ui.pondSep.classList.add('hidden');
        }
      }

      const playing = this.state === 'playing';
      const spot = this.fishing.nearSpot(p.pos);
      let promptText = null;
      if (playing && this.locked && !this.fishing.busy && this.fishing.cooldown <= 0 &&
          !!spot && p.alive && !p.frozen) {
        promptText = p.isRod()
          ? '长按 左键 蓄力抛竿 · 越远鱼越好'
          : '按 3 切换鱼竿，再长按 左键 抛竿';
      }
      // 鱼市提示（站在摊位前按 T 也能开）
      if (!promptText && playing && this.locked && !this.fishing.busy && this.world.baitShop && p.alive) {
        const dShop = Math.hypot(p.pos.x - this.world.baitShop.x, p.pos.z - this.world.baitShop.z);
        if (dShop < this.world.baitShop.r + 1.6) promptText = '按 T 打开鱼市';
      }
      const promptEl = this.ui.prompt;
      if (promptText) {
        promptEl.textContent = promptText;
        promptEl.classList.remove('hidden');
      } else {
        promptEl.classList.add('hidden');
      }
    }
  }

  window.addEventListener('DOMContentLoaded', () => {
    window.game = new Game();
  });
})();
