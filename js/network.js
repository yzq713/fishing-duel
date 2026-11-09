/* 联机网络层：WebSocket 房间连接、本地状态上报、远程玩家 3D 同步与插值 */
(function () {
  const THREE = window.THREE;

  // ---------------- 中继配置 ----------------
  // 默认走公共 MQTT 服务器（EMQX 官方免费公共 broker，无账号 / 无信用卡 / 国内可直连）：
  // 一个房间 = 一个 topic，消息只转发不落库。缺点是公共服务器，拿到房号的人理论上
  // 也能订阅同一 topic，只适合和朋友玩；要做私有房间就把 DEFAULT_HOST 填成自建
  // WebSocket 服务器（例如 Cloudflare Worker），或者用 ?host= 临时指定。
  const MQTT_URL = 'wss://broker.emqx.io:8084/mqtt';
  const TOPIC_ROOT = 'fishing-duel/v1/';
  const DEFAULT_HOST = '';
  const STATE_HZ = 12;          // 本地状态上报频率
  const POS_LERP = 12;          // 远程位置插值速度
  const YAW_LERP = 14;          // 远程朝向插值速度

  function hostUrl() {
    try {
      const q = new URLSearchParams(window.location.search).get('host');
      if (q) return q;
      const ls = localStorage.getItem('fishingDuel.host');
      if (ls) return ls;
    } catch (e) {}
    return DEFAULT_HOST;
  }

  function scheme(host) {
    return /^(localhost|127\.|0\.0\.0\.|.*\.(local))/i.test(host) ? 'ws://' : 'wss://';
  }

  // 中继地址可以被 URL 参数覆盖：?relay=wss://自己的服务器/mqtt
  // （接入自建 broker 时用，平时不用管）
  function relayUrl() {
    try {
      const q = new URLSearchParams(window.location.search).get('relay');
      if (q) return q;
    } catch (e) {}
    return MQTT_URL;
  }

  // 头顶名字 / 提示：Canvas 贴图 Sprite，始终面向相机
  function makeTextSprite(text, opts) {
    opts = opts || {};
    const c = document.createElement('canvas');
    const pad = 16;
    const font = 'bold 40px "Ma Shan Zheng", "Microsoft YaHei", sans-serif';
    c.width = 512; c.height = 128;
    let ctx = c.getContext('2d');
    ctx.font = font;
    const w = Math.min(ctx.measureText(text).width + pad * 2, c.width - 8);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false });
    const sp = new THREE.Sprite(mat);
    const worldH = opts.height || 0.55;
    sp.scale.set(worldH * (w / 128), worldH, 1);
    sp.userData._font = font;
    sp.userData._pad = pad;
    redrawSprite(sp, text, opts);
    return sp;
  }

  function redrawSprite(sp, text, opts) {
    opts = opts || {};
    const c = sp.material.map.image;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.font = sp.userData._font;
    const tw = ctx.measureText(text).width;
    const x = (c.width - tw) / 2;
    const y = 78;
    if (opts.bg) {
      ctx.fillStyle = opts.bg;
      const r = 18;
      const bx = x - sp.userData._pad, by = y - 44, bw = tw + sp.userData._pad * 2, bh = 58;
      ctx.beginPath();
      ctx.moveTo(bx + r, by);
      ctx.arcTo(bx + bw, by, bx + bw, by + bh, r);
      ctx.arcTo(bx + bw, by + bh, bx, by + bh, r);
      ctx.arcTo(bx, by + bh, bx, by, r);
      ctx.arcTo(bx, by, bx + bw, by, r);
      ctx.fill();
    }
    ctx.fillStyle = opts.color || '#2c2a26';
    ctx.fillText(text, x, y);
    sp.material.map.needsUpdate = true;
  }

  // ---------------- 远程玩家 ----------------
  class RemotePlayer {
    constructor(id, scene) {
      this.id = id;
      this.scene = scene;
      this.group = new THREE.Group();
      this.group.visible = false;
      scene.add(this.group);

      this.cur = new THREE.Vector3();
      this.target = new THREE.Vector3();
      this.havePos = false;
      this.curYaw = 0;
      this.targetYaw = 0;
      this.mov = 'idle';
      this.char = 'angler';
      this.slot = 0;
      this.name = '渔夫';

      this.avatar = null;
      this.mixer = null;
      this.clips = null;
      this.clipName = null;
      this.action = null;
      this._box = false;

      this.nameTag = makeTextSprite(this.name, { color: '#2c2a26' });
      this.nameTag.position.set(0, 2.35, 0);
      this.group.add(this.nameTag);

      this.toast = makeTextSprite('', { bg: 'rgba(244,237,219,0.92)', color: '#b8402e' });
      this.toast.position.set(0, 2.95, 0);
      this.toast.visible = false;
      this.group.add(this.toast);
      this.toastT = 0;

      // 远程浮标 + 简化鱼线
      this.bobber = new THREE.Mesh(
        new THREE.SphereGeometry(0.12, 10, 8),
        new THREE.MeshStandardMaterial({ color: 0xff5a4a, roughness: 0.4, emissive: 0x551100 })
      );
      this.bobber.visible = false;
      scene.add(this.bobber);
      this.bobberBase = 0;
      this.bobberT = 0;
      this.biting = false;

      this.lineGeo = new THREE.BufferGeometry();
      this.linePts = new Float32Array(9);
      this.lineGeo.setAttribute('position', new THREE.BufferAttribute(this.linePts, 3));
      this.line = new THREE.Line(this.lineGeo,
        new THREE.LineBasicMaterial({ color: 0xd9e6ee, transparent: true, opacity: 0.6, depthWrite: false }));
      this.line.visible = false;
      this.line.frustumCulled = false;
      scene.add(this.line);

      this.buildAvatar(this.char);
    }

    buildAvatar(charId) {
      if (this.avatar) this.group.remove(this.avatar);
      if (this.mixer) { this.mixer.stopAllAction(); this.mixer = null; }
      this.clips = null; this.clipName = null; this.action = null;
      const RM = window.RobotModel;
      const gltf = RM && RM.ready();
      if (!gltf) {
        // 模型还没就绪：先放方块，加载完再重建
        this.buildBox();
        if (RM) RM.load(() => { if (this.char === charId) this.buildAvatar(this.char); });
        return;
      }
      this._box = false;
      const model = THREE.skeletonClone(gltf.scene);
      model.rotation.y = Math.PI;
      model.scale.setScalar(1.02);
      const pal = RM.paletteTexture(charId);
      model.traverse((o) => {
        if (!o.isMesh) return;
        o.castShadow = true;
        o.frustumCulled = false;
        o.material = Array.isArray(o.material) ? o.material.map((m) => m.clone()) : o.material.clone();
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) if (m.map) { m.map = pal; m.needsUpdate = true; }
      });
      this.avatar = model;
      this.group.add(model);
      this.clips = {};
      for (const c of gltf.animations) this.clips[c.name] = c;
      this.mixer = new THREE.AnimationMixer(model);
      this.setClip('Idle-loop', 0);
    }

    buildBox() {
      this._box = true;
      const g = new THREE.Group();
      const mat = (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.8 });
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.9, 0.35), mat(0x639e84));
      body.position.y = 1.05;
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.42), mat(0xe7dcc3));
      head.position.y = 1.78;
      g.add(body, head);
      this.avatar = g;
      this.group.add(g);
    }

    setClip(name, fade) {
      if (!this.mixer || !this.clips) return;
      const clip = this.clips[name];
      if (!clip || this.clipName === name) return;
      const next = this.mixer.clipAction(clip);
      const prev = this.action;
      next.reset(); next.setEffectiveWeight(1); next.setEffectiveTimeScale(1); next.play();
      if (prev && prev !== next) { prev.fadeOut(fade || 0.2); next.fadeIn(fade || 0.2); }
      this.action = next; this.clipName = name;
    }

    setProfile(p) {
      if (p.name) {
        this.name = p.name;
        redrawSprite(this.nameTag, this.name, { color: '#2c2a26' });
      }
      if (p.char && p.char !== this.char) { this.char = p.char; this.buildAvatar(this.char); }
      if (p.slot !== undefined) this.slot = p.slot;
    }

    applyState(s) {
      if (s.p && s.p.length === 3) {
        this.target.set(s.p[0], s.p[1], s.p[2]);
        if (!this.havePos) { this.cur.copy(this.target); this.havePos = true; }
      }
      if (s.body !== undefined) this.targetYaw = s.body;
      if (s.mov) this.mov = s.mov;
      if (s.char && s.char !== this.char) { this.char = s.char; this.buildAvatar(this.char); }
      if (s.slot !== undefined) this.slot = s.slot;
    }

    showToast(text, t) {
      redrawSprite(this.toast, text, { bg: 'rgba(244,237,219,0.92)', color: '#b8402e' });
      this.toast.visible = true;
      this.toastT = t || 2.6;
    }

    castBobber(at) {
      this.bobber.position.set(at[0], at[1], at[2]);
      this.bobberBase = at[1];
      this.bobber.visible = true;
      this.biting = false;
      this.line.visible = true;
    }

    setBite() { this.biting = true; }

    clearBobber() {
      this.bobber.visible = false;
      this.line.visible = false;
      this.biting = false;
    }

    update(dt) {
      if (!this.havePos) return;
      // 位置 / 朝向平滑
      const k = 1 - Math.exp(-POS_LERP * dt);
      this.cur.lerp(this.target, k);
      let diff = this.targetYaw - this.curYaw;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      this.curYaw += diff * (1 - Math.exp(-YAW_LERP * dt));

      this.group.position.copy(this.cur);
      this.group.rotation.y = this.curYaw;
      this.group.visible = true;

      // 动画：按同步的移动状态切换
      if (this.mixer) {
        let clip = 'Idle-loop';
        if (this.mov === 'air') clip = 'Fall-loop';
        else if (this.mov === 'sprint') clip = 'Sprint-loop';
        else if (this.mov === 'run') clip = 'Run-loop';
        this.setClip(clip);
        this.mixer.update(dt);
      }

      // 浮标：咬钩时上下抖动，否则轻微起伏
      if (this.bobber.visible) {
        this.bobberT += dt;
        const dy = this.biting
          ? Math.sin(this.bobberT * 16) * 0.12 - 0.06
          : Math.sin(this.bobberT * 2.2) * 0.03;
        this.bobber.position.y = this.bobberBase + dy;
        // 简化鱼线：从角色手部到浮标，中间一点轻微下垂
        const sx = this.cur.x, sy = this.cur.y + 1.5, sz = this.cur.z;
        const bx = this.bobber.position.x, by = this.bobber.position.y, bz = this.bobber.position.z;
        this.linePts[0] = sx; this.linePts[1] = sy; this.linePts[2] = sz;
        this.linePts[3] = (sx + bx) / 2; this.linePts[4] = (sy + by) / 2 - 0.18; this.linePts[5] = (sz + bz) / 2;
        this.linePts[6] = bx; this.linePts[7] = by; this.linePts[8] = bz;
        this.lineGeo.attributes.position.needsUpdate = true;
      }

      // 头顶提示倒计时
      if (this.toast.visible) {
        this.toastT -= dt;
        if (this.toastT <= 0) this.toast.visible = false;
      }
    }

    dispose() {
      this.clearBobber();
      this.scene.remove(this.group, this.bobber, this.line);
      this.bobber.geometry.dispose(); this.bobber.material.dispose();
      this.lineGeo.dispose(); this.line.material.dispose();
      [this.nameTag, this.toast].forEach((sp) => {
        sp.material.map.dispose(); sp.material.dispose();
      });
    }
  }

  // ---------------- 网络管理器 ----------------
  class NetworkManager {
    constructor() {
      this.ws = null;
      this.mqttClient = null;
      this.topic = null;
      this.myId = null;
      this.room = null;
      this.connected = false;
      this.remotes = new Map();
      this.sendAcc = 0;
      this.onStatus = null;
      this._closed = false;
    }

    get active() { return this.connected; }

    connect(room, game) {
      this.game = game;
      this.room = room;
      this._closed = false;
      const host = hostUrl();
      if (host) this._connectWs(host);
      else this._connectMqtt();
    }

    _makeId() {
      return 'fd' + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-3);
    }

    // —— 模式 A：自建 WebSocket 服务器（Cloudflare Worker / 自己的 Node 服务） ——
    _connectWs(host) {
      const url = scheme(host) + host + '/parties/main/' + encodeURIComponent(this.room);
      this.ws = new WebSocket(url);
      this.ws.onopen = () => {
        this.connected = true;
        this._emit('已连接到房间 ' + this.room);
        // 进房先把自己的资料（名字/外观/装备）发出去
        this.send(this._profileMsg());
      };
      this.ws.onmessage = (ev) => this._onMessage(ev.data);
      this.ws.onclose = () => {
        this.connected = false;
        this._clearRemotes();
        if (!this._closed) this._emit('与房间断开');
      };
      this.ws.onerror = () => this._emit('连接出错，检查网络或服务器地址');
    }

    // —— 模式 B：公共 MQTT 中继（默认，免账号） ——
    _connectMqtt() {
      const mqtt = window.mqtt;
      if (!mqtt) { this._emit('联机组件没加载成功，请刷新页面'); return; }
      if (!this.myId) this.myId = this._makeId();
      const topic = TOPIC_ROOT + encodeURIComponent(this.room);
      this.topic = topic;
      this._emit('正在连接联机中继…');

      const client = mqtt.connect(relayUrl(), {
        clientId: this.myId,
        clean: true,
        keepalive: 30,
        connectTimeout: 12000,
        reconnectPeriod: 4000,
        protocolVersion: 4,
        // 意外掉线（关标签页 / 断网）时由服务器代发「离开」，其他玩家的画面里
        // 我们的角色会立刻消失，不用等超时
        will: {
          topic: topic,
          payload: JSON.stringify({ t: 'leave', id: this.myId }),
          qos: 0,
          retain: false
        }
      });
      this.mqttClient = client;

      client.on('connect', () => {
        client.subscribe(topic, { qos: 0 }, (err) => {
          if (err) { this._emit('加入房间失败：' + err.message); return; }
          this.connected = true;
          this._emit('已连接到房间 ' + this.room);
          // 打招呼：房间里已有的人会回 helloack，我们就能把他们建出来
          this.send({ t: 'hello' });
          this.send(this._profileMsg());
        });
      });
      client.on('message', (t, payload) => {
        if (t !== topic) return;
        this._onMessage(payload.toString());
      });
      client.on('reconnect', () => this._emit('正在重新连接联机中继…'));
      client.on('close', () => {
        if (!this.connected) return;
        this.connected = false;
        this._clearRemotes();
        if (!this._closed) this._emit('与房间断开（正在自动重连）');
      });
      client.on('error', (e) => {
        this._emit('中继连接出错：' + (e && e.message ? e.message : e));
      });
    }

    _onMessage(raw) {
      let m;
      try { m = JSON.parse(raw); } catch (e) { return; }
      // MQTT 模式下自己订阅的 topic 也会收到自己发的消息，先滤掉
      if (m.id && m.id === this.myId && m.t !== 'welcome') return;

      // 免服务器版的握手：进房的人喊 hello，房里的人回 helloack 并把自己的资料带上
      if (m.t === 'hello') {
        this._ensure(m.id);
        this.send({ t: 'helloack' });
        this.send(this._profileMsg());
        return;
      }
      if (m.t === 'helloack') { this._ensure(m.id); return; }
      if (m.t === 'leave') { this._remove(m.id); return; }

      if (m.t === 'welcome') {
        this.myId = m.id;
        for (const pid of (m.peers || [])) this._ensure(pid);
        this._emit('你已进入房间，房间号 ' + this.room);
        return;
      }
      if (m.t === 'join') { this._ensure(m.id); return; }
      if (m.t === 'leave') { this._remove(m.id); return; }

      const r = this.remotes.get(m.id);
      if (!r) {
        // 消息可能早于 join 到达，先建再处理
        if (m.id) this._ensure(m.id);
      }
      const rp = this.remotes.get(m.id);
      if (!rp) return;

      switch (m.t) {
        case 'profile': rp.setProfile(m); break;
        case 'state': rp.applyState(m); break;
        case 'cast': rp.castBobber(m.at); break;
        case 'bite': rp.setBite(); break;
        case 'reel': rp.clearBobber(); break;
        case 'catch':
          rp.showToast('钓到 ' + m.fish);
          break;
        case 'chat':
          if (this.onChat) this.onChat(rp.name, m.text);
          break;
      }
    }

    _ensure(id) {
      if (this.remotes.has(id)) return this.remotes.get(id);
      const rp = new RemotePlayer(id, this.game.scene);
      this.remotes.set(id, rp);
      return rp;
    }

    _remove(id) {
      const rp = this.remotes.get(id);
      if (rp) { rp.dispose(); this.remotes.delete(id); }
    }

    _clearRemotes() {
      for (const rp of this.remotes.values()) rp.dispose();
      this.remotes.clear();
    }

    send(obj) {
      if (!this.connected) return;
      obj.id = this.myId;
      const s = JSON.stringify(obj);
      if (this.mqttClient) {
        this.mqttClient.publish(this.topic, s, { qos: 0 });
      } else if (this.ws && this.ws.readyState === 1) {
        this.ws.send(s);
      }
    }

    _profileMsg() {
      const g = this.game;
      const p = g.player;
      return {
        t: 'profile',
        name: this.myName(),
        char: (window.Economy && window.Economy.character) || 'angler',
        slot: p.slot
      };
    }

    myName() {
      let n = localStorage.getItem('fishingDuel.name');
      if (!n) {
        n = '渔夫' + Math.floor(Math.random() * 900 + 100);
        localStorage.setItem('fishingDuel.name', n);
      }
      return n;
    }

    setMyName(n) { localStorage.setItem('fishingDuel.name', n); }

    // 聊天 / 钓鱼事件
    sendChat(text) { this.send({ t: 'chat', text }); }
    sendCast(at) { this.send({ t: 'cast', at }); }
    sendBite() { this.send({ t: 'bite' }); }
    sendReel() { this.send({ t: 'reel' }); }
    sendCatch(fish) { this.send({ t: 'catch', fish }); }

    update(dt) {
      if (!this.connected || !this.game) return;
      // 远程玩家插值
      for (const rp of this.remotes.values()) rp.update(dt);
      // 定时上报本地状态
      this.sendAcc += dt;
      const interval = 1 / STATE_HZ;
      if (this.sendAcc < interval) return;
      this.sendAcc = 0;
      const p = this.game.player;
      const spd = Math.hypot(p.velocity.x, p.velocity.z);
      let mov = 'idle';
      if (p.airborne) mov = 'air';
      else if (spd > p.walkSpeed * 1.3) mov = 'sprint';
      else if (spd > 0.5) mov = 'run';
      this.send({
        t: 'state',
        p: [round(p.pos.x), round(p.pos.y), round(p.pos.z)],
        body: p.bodyYaw !== undefined ? p.bodyYaw : p.yaw,
        mov,
        char: (window.Economy && window.Economy.character) || 'angler',
        slot: p.slot
      });
    }

    leave() {
      this._closed = true;
      this._clearRemotes();
      const c = this.mqttClient;
      this.mqttClient = null;
      if (c) {
        try {
          // 主动退出时 MQTT 不会触发 will，得自己喊一声「我走了」。
          // 注意不能 publish 完立刻 end()：强制关闭会把还没发出去的包一起冲掉，
          // 结果房间里的其他人一直挂着我们的角色。
          if (this.connected) {
            c.publish(this.topic, JSON.stringify({ t: 'leave', id: this.myId }), { qos: 0 }, () => {
              setTimeout(() => { try { c.end(true); } catch (e) {} }, 150);
            });
          } else {
            c.end(true);
          }
        } catch (e) {}
      }
      if (this.ws) {
        try { this.ws.close(); } catch (e) {}
        this.ws = null;
      }
      this.connected = false;
    }

    _emit(msg) { if (this.onStatus) this.onStatus(msg); }
  }

  function round(v) { return Math.round(v * 100) / 100; }

  window.NetworkManager = NetworkManager;
  window.NetworkManager.hostUrl = hostUrl;
  window.RemotePlayer = RemotePlayer;
})();
