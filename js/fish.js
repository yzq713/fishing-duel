/* 鱼的 3D 实体模型
 * 朝向约定：头朝 +X，尾朝 -X，背鳍朝上 +Y，两侧体侧朝 ±Z
 *
 * 这一版彻底换掉了"所有鱼 = 一个拉伸球 + 换颜色"的做法：
 *   1. 体形用「控制点轮廓」放样成网格，尾/腹/头各段的粗细可以单独描述，
 *      所以带状、箭形、圆球、扁盘这些完全不同的剪影是几何本身的差异；
 *   2. 背腹配色改用顶点色渐变，不再用两个半透明球叠在一起；
 *   3. 每种鱼可挂不同器官：王冠、弯角、触须、背甲、翼、宝石、环绕光点、
 *      多眼、獠牙、背冠、短足、发光环……
 *   4. 十级分級（普通 → 神域）决定体表自发光与光晕强度。
 */
(function () {
  const THREE = window.THREE;

  // ---------- 十级分級 ----------
  // idx 越大越稀有；color 用于 UI 文字与描边，glow 用于体表自发光强度
  const GRADES = [
    { id: 'common',  name: '普通', color: 0xc2ccd2, glow: 0.00, ring: null },
    { id: 'fine',    name: '优良', color: 0x8ed36a, glow: 0.06, ring: null },
    { id: 'refined', name: '精良', color: 0x5fb8f0, glow: 0.12, ring: null },
    { id: 'rare',    name: '稀有', color: 0xa87ef0, glow: 0.20, ring: null },
    { id: 'epic',    name: '史诗', color: 0xe070e8, glow: 0.30, ring: 0xe070e8 },
    { id: 'legend',  name: '传说', color: 0xffae3a, glow: 0.42, ring: 0xffae3a },
    { id: 'myth',    name: '神话', color: 0xffd84a, glow: 0.55, ring: 0xffd84a },
    { id: 'ancient', name: '远古', color: 0x45e0b0, glow: 0.65, ring: 0x45e0b0 },
    { id: 'abyss',   name: '深渊', color: 0xff4a6a, glow: 0.80, ring: 0xff4a6a },
    { id: 'divine',  name: '神域', color: 0x8affff, glow: 1.00, ring: 0x8affff }
  ];

  // ---------- 体形轮廓 ----------
  // 每条 [t, 高度系数, 宽度系数]：t=0 尾端、t=1 头端，中间线性插值。
  // 这是"鱼长得不一样"的核心——剪影差异来自这里，不是换颜色。
  const PROF = {
    // 标准鱼雷形：尾柄细、中段最饱满、头端收钝
    torpedo: [[0, 0.05, 0.06], [0.16, 0.52, 0.52], [0.42, 1.00, 0.94], [0.72, 0.92, 0.86], [1, 0.30, 0.34]],
    // 修长（鳟、鲑）
    slim:    [[0, 0.04, 0.05], [0.20, 0.48, 0.42], [0.46, 0.90, 0.76], [0.76, 0.84, 0.68], [1, 0.26, 0.26]],
    // 圆胖（鲤、河豚）
    plump:   [[0, 0.06, 0.07], [0.15, 0.74, 0.72], [0.44, 1.14, 1.08], [0.70, 1.00, 0.96], [1, 0.36, 0.40]],
    // 圆盘（鲫、鲳）：高而薄
    disc:    [[0, 0.05, 0.05], [0.14, 0.82, 0.26], [0.40, 1.26, 0.34], [0.68, 1.08, 0.30], [1, 0.30, 0.20]],
    // 鳗形：细长带状，尾端极细
    eel:     [[0, 0.03, 0.04], [0.24, 0.38, 0.34], [0.55, 0.60, 0.50], [0.82, 0.54, 0.44], [1, 0.22, 0.20]],
    // 海带/带鱼形：极高、极薄，像一条竖起来的丝带
    ribbon:  [[0, 0.10, 0.06], [0.20, 0.86, 0.09], [0.50, 1.06, 0.10], [0.78, 0.90, 0.08], [1, 0.26, 0.05]],
    // 圆球（泡泡鱼、水母鱼）
    blob:    [[0, 0.08, 0.10], [0.13, 0.80, 0.84], [0.42, 1.12, 1.16], [0.66, 1.02, 1.04], [1, 0.44, 0.48]],
    // 箭形：头端收成锐尖，像一支飞出去的矛
    arrow:   [[0, 0.04, 0.05], [0.18, 0.60, 0.56], [0.44, 1.00, 0.90], [0.74, 0.76, 0.66], [1, 0.09, 0.09]],
    // 蝠鲼形：宽扁，翼在前
    bat:     [[0, 0.06, 0.06], [0.20, 0.68, 0.58], [0.46, 1.04, 0.92], [0.72, 0.84, 0.78], [1, 0.34, 0.40]],
    // 长薄（绯鲤、皇带鱼）
    longflat:[[0, 0.06, 0.04], [0.22, 0.60, 0.17], [0.50, 0.92, 0.21], [0.78, 0.78, 0.19], [1, 0.24, 0.10]],
    // 沧龙：尾端收成细柄、中段最厚、颈后略收，吻部另外接一段长颚
    // 头端不是「鱼头」而是一段长吻：0.80 之后线性收细，下颌正好贴在这段斜面上
    mosasaur:[[0, 0.03, 0.04], [0.10, 0.30, 0.32], [0.28, 0.78, 0.74], [0.46, 1.00, 0.94], [0.68, 0.92, 0.84], [0.80, 0.76, 0.70], [1, 0.28, 0.22]],
    // 恐龙（兽脚类）：后段腰腿最厚、颈前收一档，大颚另外接
    dino:    [[0, 0.04, 0.04], [0.12, 0.34, 0.34], [0.32, 0.82, 0.78], [0.50, 1.02, 0.92], [0.70, 0.88, 0.82], [0.80, 0.82, 0.74], [1, 0.34, 0.28]]
  };

  // ---------- 鱼类配置表 ----------
  // 字段说明：
  //   grade  0..9 分級索引
  //   prof   体形轮廓 key
  //   len/h/w 体长/体高/体宽（米）
  //   back/belly/fin  背色/腹色/鳍色
  //   tail   fork|round|fan|veil|lance|ribbon
  //   其余为可选器官，见 build() 里的注释
  const FISH_TYPES = {
    // ================= 池塘 / 淡水 =================
    '小银鱼': {
      grade: 0, prof: 'slim', len: 0.42, h: 0.10, w: 0.05,
      back: 0x9fb2bd, belly: 0xeef6fa, fin: 0xc3d2da, eye: 0x11151a, tail: 'fork', bigEye: true
    },
    '青鱼': {
      grade: 0, prof: 'torpedo', len: 0.72, h: 0.20, w: 0.09,
      back: 0x46645a, belly: 0xc6d4c8, fin: 0x3a554b, eye: 0x141414, tail: 'fork'
    },
    '肥鲤鱼': {
      grade: 1, prof: 'plump', len: 0.66, h: 0.26, w: 0.14,
      back: 0xd9762f, belly: 0xffdcb0, fin: 0xd0561f, eye: 0x161616, tail: 'round',
      spots: { n: 7, color: 0x8f3f14, r: 0.34 }
    },
    '苔背龟鱼': {
      grade: 1, prof: 'blob', len: 0.58, h: 0.28, w: 0.24,
      back: 0x5d6a3e, belly: 0xcfd2a8, fin: 0x47522f, eye: 0x1a1a0e, tail: 'round',
      shell: { color: 0x6f7448, plate: 0x4d5230, n: 6 },
      legs: { n: 4, color: 0x6b6a45, len: 0.10 },
      grumpy: true
    },
    '彩虹鳟': {
      grade: 2, prof: 'slim', len: 0.60, h: 0.16, w: 0.07,
      back: 0x5fa8d8, belly: 0xf0f8ff, fin: 0x4a8ec4, eye: 0x141616, tail: 'fork',
      stripe: { color: 0xff7ea8, n: 5 }, shimmer: true
    },
    '泡泡小丑鱼': {
      grade: 2, prof: 'plump', len: 0.46, h: 0.20, w: 0.13,
      back: 0xff8f3a, belly: 0xffe6c4, fin: 0xff6a20, eye: 0x141414, tail: 'round',
      rings: { n: 2, color: 0xfdf6e6 }, bubbles: 8
    },
    '花冠金鱼': {
      grade: 2, prof: 'disc', len: 0.46, h: 0.28, w: 0.10,
      back: 0xffc44a, belly: 0xfff3cf, fin: 0xff9a2a, eye: 0x201a10, tail: 'veil',
      crown: { color: 0xff5a8a, leaf: 0xffd84a, n: 6, r: 0.055 },
      whisker: true
    },
    '月光水灯鱼': {
      grade: 3, prof: 'slim', len: 0.48, h: 0.13, w: 0.06,
      back: 0x93c8e4, belly: 0xeaf6ff, fin: 0x7ab8e8, eye: 0x14304a, tail: 'veil',
      ghost: 0.82, emissive: 0x2a5a80, antenna: { len: 1.5, color: 0xbff0ff }
    },
    '三眼蟾鱼': {
      grade: 3, prof: 'blob', len: 0.52, h: 0.24, w: 0.21,
      back: 0x7a6a3a, belly: 0xd8c894, fin: 0x5c4f28, eye: 0xd8e04a, tail: 'round',
      eyes: 3, warts: { n: 14, color: 0x5a4d26 }, grumpy: true
    },
    '神秘鲈鱼': {
      grade: 3, prof: 'torpedo', len: 0.66, h: 0.23, w: 0.10,
      back: 0x5fa86a, belly: 0xd6f0c8, fin: 0x4a8a58, eye: 0x101810, tail: 'round',
      spots: { n: 8, color: 0x1f4a24, r: 0.30 }, dorsalTall: 1.7, grumpy: true
    },
    '锦鲤': {
      grade: 4, prof: 'plump', len: 0.68, h: 0.24, w: 0.13,
      back: 0xf4efe4, belly: 0xfffaf2, fin: 0xe0603a, eye: 0x1c1410, tail: 'veil',
      spots: { n: 6, color: 0xe05a30, r: 0.42 }, whisker: true, emissive: 0x2a1a10
    },
    '黄金鲫鱼': {
      grade: 4, prof: 'disc', len: 0.58, h: 0.30, w: 0.10,
      back: 0xf0c02a, belly: 0xfff2b0, fin: 0xffa820, eye: 0x1a1408, tail: 'fan',
      emissive: 0x7a5200, shimmer: true
    },
    '水晶锦鲤': {
      grade: 5, prof: 'plump', len: 0.72, h: 0.27, w: 0.15,
      back: 0x9ef0d8, belly: 0xe6fff6, fin: 0x66d8b8, eye: 0x0f3a34, tail: 'veil',
      ghost: 0.80, whisker: true, emissive: 0x2f9a80, cracks: 0x9affea,
      gem: { color: 0x6fffe0, r: 0.05, y: 0.62 }
    },
    '鲟鱼': {
      grade: 5, prof: 'longflat', len: 0.94, h: 0.20, w: 0.09,
      back: 0x7d7a60, belly: 0xdcd6bc, fin: 0x625e48, eye: 0x141414, tail: 'lance',
      snout: true, scutes: { n: 7, color: 0x4a4736 }
    },
    '纸月鳐': {
      grade: 4, prof: 'bat', len: 0.60, h: 0.10, w: 0.44,
      back: 0xe8e0f4, belly: 0xfff8ff, fin: 0xc8bce0, eye: 0x2a2038, tail: 'ribbon',
      wing: { span: 0.52, color: 0xf0e8ff }, ghost: 0.76, emissive: 0x3a2a4a
    },
    '星图鲶': {
      grade: 6, prof: 'eel', len: 0.80, h: 0.16, w: 0.10,
      back: 0x22324e, belly: 0x4a5f80, fin: 0x1a2640, eye: 0xffe27a, tail: 'fan',
      tentacles: { n: 4, len: 0.30, color: 0x3a4a6a }, constellation: { n: 9, color: 0xfff0c0 },
      emissive: 0x101c30
    },
    '九尾锦鲤': {
      grade: 6, prof: 'plump', len: 0.76, h: 0.28, w: 0.15,
      back: 0xfff6ec, belly: 0xffffff, fin: 0xff4a6a, eye: 0x2a1a1a, tail: 'veil',
      spots: { n: 5, color: 0xff4a6a, r: 0.40 }, whisker: true, multiTail: 5,
      emissive: 0x4a1a24, orbit: { n: 5, color: 0xff8aa8, r: 0.34 }
    },
    '时之鲤': {
      grade: 8, prof: 'disc', len: 0.70, h: 0.34, w: 0.12,
      back: 0xb08a2a, belly: 0xf4e2a0, fin: 0xd8a63a, eye: 0x101820, tail: 'fan',
      gears: { n: 3, color: 0xc9a94a }, emissive: 0x6a4a10,
      orbit: { n: 8, color: 0xffe08a, r: 0.40 }, gem: { color: 0xfff0a0, r: 0.055, y: 0.55 }
    },
    '太初龙鲤': {
      grade: 9, prof: 'eel', len: 1.05, h: 0.24, w: 0.13,
      back: 0x2a6a8a, belly: 0xbfe8f0, fin: 0x1e4f6a, eye: 0xfff0a0, tail: 'ribbon',
      crown: { color: 0x8affff, leaf: 0xe0ffff, n: 5, r: 0.075 },
      horns: { n: 2, len: 0.26, color: 0xd8f4ff }, whisker: true, multiTail: 3,
      scales: { n: 22, color: 0x9fdcf0 }, emissive: 0x1e6a8a,
      orbit: { n: 10, color: 0x8affff, r: 0.46 }, glowRing: 0x8affff
    },

    // ================= 海洋 =================
    '海带鱼': {
      grade: 0, prof: 'ribbon', len: 1.05, h: 0.20, w: 0.035,
      back: 0x4a7f62, belly: 0x9fc4a8, fin: 0x3a6350, eye: 0x141414, tail: 'fork'
    },
    '银鲳鱼': {
      grade: 0, prof: 'disc', len: 0.50, h: 0.28, w: 0.07,
      back: 0xa8b4be, belly: 0xf2f6fa, fin: 0x9aa6b0, eye: 0x141414, tail: 'fork'
    },
    '石斑鱼': {
      grade: 1, prof: 'plump', len: 0.66, h: 0.24, w: 0.14,
      back: 0x7a6a4a, belly: 0xcabf94, fin: 0x5c4f36, eye: 0x161410, tail: 'round',
      spots: { n: 10, color: 0x40331f, r: 0.26 }, grumpy: true
    },
    '大眼鲷': {
      grade: 1, prof: 'plump', len: 0.58, h: 0.24, w: 0.13,
      back: 0xcc5a5a, belly: 0xffcbb0, fin: 0xa83c3c, eye: 0xf2e6a8, tail: 'fork',
      bigEye: true
    },
    '骨刺鲷': {
      grade: 2, prof: 'disc', len: 0.56, h: 0.30, w: 0.08,
      back: 0xd8d2c0, belly: 0xfffaf0, fin: 0xb8b09a, eye: 0x1a1a16, tail: 'fork',
      spines: 7, spineColor: 0x6a6450
    },
    '金枪鱼': {
      grade: 2, prof: 'torpedo', len: 0.92, h: 0.26, w: 0.13,
      back: 0x2f4f6a, belly: 0xc4d8e8, fin: 0x2a3f5a, eye: 0x141414, tail: 'lance',
      finlets: true
    },
    '星辉鳐': {
      grade: 3, prof: 'bat', len: 0.78, h: 0.11, w: 0.56,
      back: 0x243f6a, belly: 0x6a9ad8, fin: 0x1a2f52, eye: 0x0a1020, tail: 'ribbon',
      wing: { span: 0.66, color: 0x2e4a7a }, constellation: { n: 12, color: 0xbfe4ff },
      emissive: 0x101c38, bubbles: 9
    },
    '熔岩鳗': {
      grade: 4, prof: 'eel', len: 1.10, h: 0.17, w: 0.09,
      back: 0x2a1512, belly: 0x5e2a1c, fin: 0x3a1a12, eye: 0xff6020, tail: 'fan',
      emissive: 0x6a1a08, cracks: 0xff5a1a, spines: 5, spineColor: 0x8a3418
    },
    '灯笼鮟鱇': {
      grade: 3, prof: 'blob', len: 0.72, h: 0.32, w: 0.26,
      back: 0x2e2a3a, belly: 0x6a5e78, fin: 0x241f30, eye: 0xf0d87a, tail: 'round',
      antenna: { len: 1.1, color: 0xffd070, fwd: true }, teeth: 7, grumpy: true,
      emissive: 0x201828
    },
    '帝王鲑': {
      grade: 4, prof: 'slim', len: 0.94, h: 0.24, w: 0.11,
      back: 0xc45a2c, belly: 0xffd8b0, fin: 0xa8461e, eye: 0x161410, tail: 'fork',
      stripe: { color: 0xffd8a8, n: 6 }
    },
    '玻璃水母鱼': {
      grade: 5, prof: 'blob', len: 0.62, h: 0.30, w: 0.28,
      back: 0xbfe8f4, belly: 0xf6feff, fin: 0x8ad0e4, eye: 0x2a5a6a, tail: 'ribbon',
      ghost: 0.55, tentacles: { n: 7, len: 0.46, color: 0xd8f4ff }, emissive: 0x2a7a92,
      bubbles: 6
    },
    '机械银鲭': {
      grade: 5, prof: 'torpedo', len: 0.78, h: 0.22, w: 0.12,
      back: 0x8e9caa, belly: 0xd0dae4, fin: 0x67727e, eye: 0xff2a2a, tail: 'lance',
      armor: { color: 0x8492a0, n: 5 }, spines: 4, spineColor: 0x4a5560,
      emissive: 0x101820
    },
    '蓝鳍金枪鱼': {
      grade: 5, prof: 'torpedo', len: 1.15, h: 0.32, w: 0.17,
      back: 0x1a3358, belly: 0xd0e0ec, fin: 0x12274a, eye: 0x0a0a0a, tail: 'lance',
      finlets: true, emissive: 0x0a1830
    },
    '幽灵灯笼鱼': {
      grade: 6, prof: 'plump', len: 0.80, h: 0.30, w: 0.18,
      back: 0x3a2a5a, belly: 0x7a58a0, fin: 0x2a1a44, eye: 0xc0f0ff, tail: 'fan',
      ghost: 0.72, grumpy: true, emissive: 0x2a1040,
      antenna: { len: 1.9, color: 0x9affd0 }, teeth: 6
    },
    '深海皇带鱼': {
      grade: 6, prof: 'ribbon', len: 1.9, h: 0.34, w: 0.05,
      back: 0xb89ae0, belly: 0xe8dcff, fin: 0x9a7ad0, eye: 0x141020, tail: 'ribbon',
      crest: { color: 0xff6a9a, h: 0.24 }, emissive: 0x2a1a3a
    },
    '锤头骨鲨': {
      grade: 7, prof: 'torpedo', len: 1.5, h: 0.34, w: 0.22,
      back: 0x5c6b72, belly: 0xd8e0e4, fin: 0x46525a, eye: 0x101418, tail: 'lance',
      hammer: { span: 0.34, color: 0x5c6b72 }, teeth: 9, spines: 3, spineColor: 0x39434a
    },
    '深渊王冠鱼': {
      grade: 7, prof: 'plump', len: 0.98, h: 0.36, w: 0.22,
      back: 0x2a1030, belly: 0x5a2a5a, fin: 0x1e0820, eye: 0xff4a6a, tail: 'fan',
      crown: { color: 0xff3a6a, leaf: 0xffd0e0, n: 7, r: 0.085 },
      tentacles: { n: 6, len: 0.40, color: 0x8a2a5a }, teeth: 8,
      emissive: 0x4a0a24, orbit: { n: 6, color: 0xff5a8a, r: 0.42 }
    },
    '幽光鲸鲨': {
      grade: 8, prof: 'torpedo', len: 2.1, h: 0.46, w: 0.34,
      back: 0x18222e, belly: 0x8ea8b8, fin: 0x121a24, eye: 0xbfe8ff, tail: 'lance',
      constellation: { n: 26, color: 0xa8e0ff }, finlets: true,
      emissive: 0x0c1a26, glowRing: 0x6fd0ff
    },
    '星界鳐': {
      grade: 9, prof: 'bat', len: 1.15, h: 0.13, w: 0.85,
      back: 0x3a2a6a, belly: 0x8a6ae0, fin: 0x2a1a52, eye: 0x8affff, tail: 'ribbon',
      wing: { span: 0.98, color: 0x4a3a86 }, constellation: { n: 24, color: 0xd8c8ff },
      crown: { color: 0x8affff, leaf: 0xd0ffff, n: 5, r: 0.05 },
      emissive: 0x2a1a5a, orbit: { n: 12, color: 0xbff4ff, r: 0.72 }, glowRing: 0x8affff
    },

    // ================= 远古 · 史前巨兽 =================
    // 这两条不是「鱼」，是把整副骨架搬进水里的史前兽：
    // 沧龙 = 长吻 + 四只桨鳍 + 背帆；恐龙 = 巨颚 + 背脊棘 + 后肢 + 小前肢。
    // 体长按 3m 上下给，是池塘里唯一一眼就能看出「这不是鱼」的东西。
    '苍龙': {
      grade: 7, prof: 'mosasaur', len: 3.15, h: 0.38, w: 0.33,
      back: 0x1b3a4a, belly: 0xdcebe2, fin: 0x2a5566, eye: 0xffd15a, tail: 'fluke', tailScale: 0.58,
      pattern: 'band', bare: true,
      jaw: { len: 0.16, teeth: 15, open: 0.07, root: 0.74, tooth: 0.21, toothR: 0.032 },
      sail: { h: 0.30, color: 0x3a7382, rod: 0x1b3640, n: 8, from: -0.24, to: 0.26 },
      flippers: { len: 0.26, color: 0x27596a },
      reptileEye: true,
      emissive: 0x0a2630
    },
    '恐龙': {
      grade: 7, prof: 'dino', len: 2.95, h: 0.52, w: 0.36,
      back: 0x6b4a2b, belly: 0xd8c49c, fin: 0x8a6034, eye: 0xffc24a, tail: 'fluke', tailScale: 0.52,
      pattern: 'hide', bare: true,
      jaw: { len: 0.16, teeth: 15, open: 0.10, root: 0.74, big: true, wide: 0.82, tooth: 0.20, toothR: 0.030 },
      ridge: { n: 14, color: 0x7d5730 },
      hindLegs: { len: 0.16, color: 0x6b4a2b, claw: 0x2a1a10 },
      foreArms: { len: 0.10, color: 0x7a5a34, claw: 0x2a1a10 },
      emissive: 0x2a1508,
      reptileEye: true,
      eyePos: [0.28, 0.32, 0.90]
    },

    // ================= 血夜 · 月下异种 =================
    // 血夜（血月升起的那一夜）才会进入鱼池的五种东西。
    // 共同点：黑红配色 + 自发光（血月下光源只有月光，暗色身体必须自带一点光才看得见）。
    '赤鳍影': {
      grade: 6, prof: 'slim', len: 0.94, h: 0.20, w: 0.09,
      back: 0x0a0a12, belly: 0x2a2533, fin: 0x9a0c18, eye: 0xff3a2a, tail: 'veil', tailScale: 0.66,
      pattern: 'lateral', mark: 0x1a1722, shimmer: true,
      finGlow: 0xd8201f, emissive: 0x1a0206, blood: true
    },
    '夜魇石斑': {
      grade: 7, prof: 'plump', len: 1.15, h: 0.42, w: 0.30,
      back: 0x190a22, belly: 0x4a2a52, fin: 0x2a0a30, eye: 0xff4a3a, tail: 'round',
      pattern: 'spots', mark: 0x090310, grumpy: true,
      gills: { n: 4, color: 0xff2a3a },
      warts: { n: 10, color: 0x2a1036 },
      emissive: 0x24040a, blood: true
    },
    '血月鳗': {
      grade: 7, prof: 'eel', len: 1.62, h: 0.34, w: 0.19,
      back: 0x3a0508, belly: 0x8a1a18, fin: 0x5a0a0e, eye: 0xff2a1a, tail: 'ribbon',
      pattern: 'band', teeth: 12, grumpy: true,
      spines: 9, spineColor: 0xff3a2a,
      emissive: 0x3a0406, blood: true
    },
    '绯红潮蛇': {
      grade: 8, prof: 'eel', len: 2.55, h: 0.44, w: 0.26,
      back: 0x5a0913, belly: 0xd83a3a, fin: 0xa01224, eye: 0xffe0b0, tail: 'ribbon',
      pattern: 'scale', ghost: 0.78, shimmer: true,
      constellation: { n: 36, color: 0xff5a6a },
      crest: { color: 0xff2a3a, h: 0.22 },
      glowRing: 0xff2a4a,
      emissive: 0x4a0410, blood: true
    },
    '朱红裂口': {
      grade: 9, prof: 'plump', len: 1.35, h: 0.50, w: 0.34,
      back: 0x2a0508, belly: 0x6a1018, fin: 0x8a0a14, eye: 0xffd84a, tail: 'fan', tailScale: 0.70,
      pattern: 'marble', mark: 0x4a0a10,
      maw: { color: 0xd8322a, glow: 0xff3a20, teeth: 16 },
      emissive: 0x3a0306, blood: true
    },

    // ---------- 日魇 · 蚀日之影（白天事件鱼，日间才会出现） ----------
    // 「阳光无法驱散它们」：这一组统一走苍白/焦黑两个极端色，
    // 白天变暗后对比强烈，水里一眼能认出来。
    '白夜蚀翼': {
      grade: 4, prof: 'disc', len: 1.05, h: 0.30, w: 0.44,
      back: 0xa9bcc9, belly: 0xdbe7ee, fin: 0xc6d6e0, eye: 0x1e242a, tail: 'fan', tailScale: 0.5,
      pattern: 'marble', mark: 0x7f939f, ghost: 0.66,
      batWings: { span: 0.98, chord: 0.58, color: 0xd7e6f2, edge: 0xffffff, glow: 0xbfd9ee, opacity: 0.74 },
      finGlow: 0xf4faff, emissive: 0x8fa4b6, daymare: true
    },
    '逆光之群': {
      grade: 3, prof: 'torpedo', len: 0.44, h: 0.14, w: 0.10,
      back: 0x08080a, belly: 0x121216, fin: 0x0c0c10, eye: 0xffd25e, tail: 'fork', tailScale: 0.85,
      pattern: 'scale', mark: 0xffcf5a, shimmer: true, school: 6,
      emissive: 0x1a1206, daymare: true
    },
    '苍白灾厄': {
      grade: 5, prof: 'plump', len: 1.55, h: 0.54, w: 0.40,
      back: 0xd6cfc4, belly: 0xf4eee4, fin: 0xcbc2b4, eye: 0xb9b0a6, tail: 'fan', tailScale: 0.78,
      pattern: 'marble', mark: 0x9a8f82, eyeless: true,
      maw: { color: 0xbfb5a8, glow: 0xffe6c8, teeth: 18 },
      spines: 12, spineColor: 0xf6efe3,
      emissive: 0x2a231c, daymare: true
    },
    '盲光狂潮': {
      grade: 4, prof: 'torpedo', len: 1.45, h: 0.36, w: 0.22,
      back: 0xc9d1cd, belly: 0xeef2ee, fin: 0xd8dfda, eye: 0xf8fbff, tail: 'fork', tailScale: 0.9,
      pattern: 'band', mark: 0xa2aca6, blind: 0xf2f7fa, grumpy: true, teeth: 10,
      emissive: 0x1e2622, daymare: true
    },
    '烈日蝠影': {
      grade: 5, prof: 'plump', len: 1.22, h: 0.42, w: 0.28,
      back: 0x330b07, belly: 0x6a2410, fin: 0x240604, eye: 0xffb03a, tail: 'fan', tailScale: 0.58,
      pattern: 'marble', mark: 0x180604, bubbles: true,
      batWings: { span: 0.88, chord: 0.46, color: 0x2a0806, edge: 0x8a2410, glow: 0xff5a2a, opacity: 0.82, tattered: true },
      spines: 8, spineColor: 0x120404,
      emissive: 0x3a0a04, daymare: true
    },
    '日魇之核': {
      grade: 6, prof: 'plump', len: 2.6, h: 0.88, w: 0.62,
      back: 0x1a0d10, belly: 0x4c1a1c, fin: 0x2a1013, eye: 0xff3a2a, tail: 'fan', tailScale: 0.72,
      pattern: 'marble', mark: 0x0a0406, grumpy: true,
      maw: { color: 0x8a1c18, glow: 0xff6a2a, teeth: 20 },
      batWings: { span: 0.95, chord: 0.78, color: 0x3a1014, edge: 0x9a2c22, glow: 0xff5a3a, opacity: 0.86 },
      spines: 10, spineColor: 0x120507,
      emissive: 0x2a0507, daymare: true
    }

  };

  // ---------- 工具函数 ----------
  // 沿 X 轴放样体形：按控制点插值出每一环的高度/宽度系数
  // 字符串哈希（体表花纹的随机种子）
  function hashStr(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = (h * 16777619) >>> 0;
    }
    return h % 9973;
  }
  function hash2(x, y, seed) {
    let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
    h = (h ^ (h >>> 13)) * 1274126177 | 0;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  // 体形 → 默认花纹：即使鱼表里没写 pattern，同体形的鱼也会因为
  // 体长/体高/鱼名哈希不同而长出不一样的皮肤
  function patternFor(prof) {
    return ({
      torpedo: 'scale', slim: 'lateral', plump: 'scale', disc: 'band',
      eel: 'stripe', ribbon: 'band', blob: 'spots', arrow: 'stripe',
      bat: 'spots', longflat: 'band', mosasaur: 'band', dino: 'stripe'
    })[prof] || 'marble';
  }

  // 取放样轮廓在参数 t 处的截面（半高/半宽系数）。背帆、背棘、颌骨要「贴着身体」
  // 挂上去时都得知道这一处的实际粗细，否则就会出现一根根悬空的刺。
  function profAt(prof, t) {
    let i = 0;
    while (i < prof.length - 2 && prof[i + 1][0] < t) i++;
    const a = prof[i], b = prof[i + 1];
    const k = Math.max(0, Math.min(1, (t - a[0]) / Math.max(1e-6, b[0] - a[0])));
    return [a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
  }

  function makeBodyGeo(prof, len, hh, ww, segs, rings) {
    const pos = [], uv = [], idx = [];
    const sample = (t) => profAt(prof, t);
    for (let i = 0; i <= rings; i++) {
      const t = i / rings;
      const s = sample(t);
      const x = (t - 0.5) * len;
      for (let j = 0; j < segs; j++) {
        const ang = (j / segs) * Math.PI * 2;
        pos.push(x, Math.sin(ang) * hh * s[0], Math.cos(ang) * ww * s[1]);
        uv.push(t, j / segs);
      }
    }
    for (let i = 0; i < rings; i++) {
      for (let j = 0; j < segs; j++) {
        const a = i * segs + j;
        const b = i * segs + (j + 1) % segs;
        const c = (i + 1) * segs + j;
        const d = (i + 1) * segs + (j + 1) % segs;
        idx.push(a, c, b, b, c, d);
      }
    }
    // 首尾封口：放样出来的是一根开口圆筒，大鱼（沧龙/恐龙）张嘴或从正面看
    // 会直接看到身体内部的黑洞，所以两端各补一圈三角扇。
    const capRing = (i, dir) => {
      const base = pos.length / 3;
      const x = (i / rings - 0.5) * len;
      pos.push(x, 0, 0);
      uv.push(i / rings, 0.5);
      for (let j = 0; j < segs; j++) {
        const a = i * segs + j;
        if (dir > 0) idx.push(base, (i * segs) + (j + 1) % segs, a);
        else idx.push(base, a, (i * segs) + (j + 1) % segs);
      }
    };
    capRing(0, -1);
    capRing(rings, 1);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    return geo;
  }

  // 尾鳍：从 X=0 向 -X 展开的薄片
  function makeTailGeo(type, s) {
    const shape = new THREE.Shape();
    if (type === 'fork') {
      shape.moveTo(0, 0);
      shape.lineTo(-s * 0.95, s * 1.0);
      shape.quadraticCurveTo(-s * 0.55, s * 0.30, -s * 0.62, 0);
      shape.quadraticCurveTo(-s * 0.55, -s * 0.30, -s * 0.95, -s * 1.0);
      shape.lineTo(0, 0);
    } else if (type === 'lance') {
      // 新月形（金枪鱼）：两片尖长的月牙
      shape.moveTo(0, 0);
      shape.quadraticCurveTo(-s * 1.15, s * 0.55, -s * 1.25, s * 1.05);
      shape.quadraticCurveTo(-s * 0.75, s * 0.35, -s * 0.55, 0);
      shape.quadraticCurveTo(-s * 0.75, -s * 0.35, -s * 1.25, -s * 1.05);
      shape.quadraticCurveTo(-s * 1.15, -s * 0.55, 0, 0);
    } else if (type === 'fan') {
      shape.moveTo(0, 0);
      shape.quadraticCurveTo(-s * 0.6, s * 1.1, -s * 1.0, s * 0.7);
      shape.quadraticCurveTo(-s * 1.2, 0, -s * 1.0, -s * 0.7);
      shape.quadraticCurveTo(-s * 0.6, -s * 1.1, 0, 0);
    } else if (type === 'veil') {
      shape.moveTo(0, 0);
      shape.quadraticCurveTo(-s * 0.9, s * 0.8, -s * 1.55, s * 0.5);
      shape.quadraticCurveTo(-s * 1.7, s * 0.12, -s * 1.3, 0);
      shape.quadraticCurveTo(-s * 1.7, -s * 0.12, -s * 1.55, -s * 0.5);
      shape.quadraticCurveTo(-s * 0.9, -s * 0.8, 0, 0);
    } else if (type === 'ribbon') {
      shape.moveTo(0, 0);
      shape.quadraticCurveTo(-s * 1.4, s * 0.35, -s * 2.2, s * 0.10);
      shape.quadraticCurveTo(-s * 1.6, 0, -s * 2.2, -s * 0.10);
      shape.quadraticCurveTo(-s * 1.4, -s * 0.35, 0, 0);
    } else if (type === 'fluke') {
      // 歪尾（沧龙/恐龙）：上叶短而宽、下叶长而重，整片往下压
      shape.moveTo(0, 0);
      shape.quadraticCurveTo(-s * 0.55, s * 0.36, -s * 0.95, s * 0.86);
      shape.quadraticCurveTo(-s * 0.50, s * 0.24, -s * 0.58, 0);
      shape.quadraticCurveTo(-s * 0.78, -s * 0.52, -s * 1.18, -s * 1.02);
      shape.quadraticCurveTo(-s * 0.62, -s * 0.26, 0, 0);
    } else {
      shape.moveTo(0, 0);
      shape.quadraticCurveTo(-s * 0.8, s * 0.85, -s * 1.0, 0);
      shape.quadraticCurveTo(-s * 0.8, -s * 0.85, 0, 0);
    }
    const geo = new THREE.ExtrudeGeometry(shape, { depth: s * 0.10, bevelEnabled: false });
    geo.translate(0, 0, -s * 0.05);
    return geo;
  }

  // 薄片鳍（背鳍/腹鳍/胸鳍）
  function makeFinGeo(width, height, thickness, sweep) {
    const shape = new THREE.Shape();
    const sw = sweep || 0;
    shape.moveTo(0, 0);
    shape.quadraticCurveTo(width * 0.35, height * 0.75, width - sw, height);
    shape.quadraticCurveTo(width * 0.45, height * 0.55, width * 0.9, 0);
    shape.lineTo(0, 0);
    const geo = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false });
    geo.translate(0, 0, -thickness / 2);
    return geo;
  }

  // 桨鳍：从根部（0,0）向 -X 张开的圆头叶片，沧龙的四只鳍都用它
  function makePaddleGeo(len, wid, thick) {
    const sh = new THREE.Shape();
    sh.moveTo(0, wid * 0.52);
    sh.quadraticCurveTo(-len * 0.42, wid * 0.96, -len * 0.92, wid * 0.40);
    sh.quadraticCurveTo(-len * 1.04, 0, -len * 0.92, -wid * 0.42);
    sh.quadraticCurveTo(-len * 0.40, -wid * 0.92, 0, -wid * 0.52);
    sh.quadraticCurveTo(len * 0.05, 0, 0, wid * 0.52);
    const geo = new THREE.ExtrudeGeometry(sh, { depth: thick, bevelEnabled: false, curveSegments: 7 });
    geo.translate(0, 0, -thick * 0.5);
    return geo;
  }

  // 锥台方块：下颌、吻部、颅骨都靠它。圆柱做出来的嘴是「管状」的，
  // 换成前后两头尺寸不同的方块，才有咬合面和棱角。
  function makeTaperBox(len, h0, h1, w0, w1) {
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const t = p.getX(i) + 0.5;          // 0 = 靠头的一端, 1 = 吻端
      p.setY(i, p.getY(i) * (h0 + (h1 - h0) * t));
      p.setZ(i, p.getZ(i) * (w0 + (w1 - w0) * t));
      p.setX(i, p.getX(i) * len);
    }
    geo.computeVertexNormals();
    return geo;
  }

  function lerpHex(a, b, k) {
    const ca = new THREE.Color(a), cb = new THREE.Color(b);
    return ca.lerp(cb, k);
  }

  // ---------- 体表贴图（程序化 Canvas）----------
  // 顶点色做花纹的问题：鱼身只有 18×16 个顶点，花纹在插值里会被糊成一片，
  // 远看还是"一块塑料"。这里按每条鱼生成一张 192×96 的贴图，
  // 条纹/斑点/鳞片都能画到像素级，UV 直接用放样时的 (t, 环向)。
  //
  // UV 约定：u = t（0 尾 → 1 头），v = 环向角度 / 2π
  //   v=0 右侧体侧 · v=0.25 背部 · v=0.5 左侧体侧 · v=0.75 腹部
  // 所以 sin(v*2π) 正好是「归一化体高」：+1 背、-1 腹。
  const TEX_CACHE = {};
  function hexToRgb(hex) {
    return [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
  }
  function mixRgb(a, b, k) {
    return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
  }
  function makeFishTex(cfg, name) {
    const key = name || ('c' + cfg.back + '_' + cfg.prof);
    if (TEX_CACHE[key]) return TEX_CACHE[key];
    const W = 192, H = 96;
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d');
    const img = ctx.createImageData(W, H);
    const back = hexToRgb(cfg.back);
    const belly = hexToRgb(cfg.belly || cfg.back);
    const fin = hexToRgb(cfg.fin || cfg.back);
    const backLum = (back[0] * 0.299 + back[1] * 0.587 + back[2] * 0.114) / 255;
    // 花纹色：亮鱼用深斑，暗鱼用亮斑，保证在两种底色上都读得出来
    const mark = backLum > 0.40
      ? [back[0] * 0.36, back[1] * 0.36, back[2] * 0.36]
      : mixRgb(belly, back, 0.16).map((v) => Math.min(255, v * 1.16));
    const seed = hashStr(name || ('anon' + cfg.back));
    const dens = 1 + ((seed % 7) / 7) * 0.7;
    const pat = cfg.pattern || patternFor(cfg.prof);
    const alpha = cfg.ghost || 0;

    for (let py = 0; py < H; py++) {
      const v = py / (H - 1);
      const hy = Math.sin(v * Math.PI * 2);   // +1 背 · -1 腹
      // 背腹渐变：背部浓、腹部白，中间过渡带偏窄
      const kk = Math.pow(Math.max(0, Math.min(1, hy * 0.9 + 0.45)), 0.78);
      for (let px = 0; px < W; px++) {
        const t = px / (W - 1);
        let c = mixRgb(belly, back, kk);
        let m = 0;

        if (pat === 'stripe') {
          // 竖向环带：沿体轴等距，越靠背越浓
          const s2 = Math.sin((t * 6.2 * dens + seed * 0.07) * Math.PI * 2);
          m = Math.pow(Math.max(0, s2), 2.3) * (0.30 + Math.max(0, hy) * 0.66);
        } else if (pat === 'band') {
          // 纵向长带：沿体侧水平走，通常 2 条
          const b = Math.abs(Math.sin((hy * 2.1 + v * 6.2) * Math.PI));
          m = Math.pow(Math.max(0, 1 - b * 3.0), 2) * 0.50;
        } else if (pat === 'spots') {
          // 斑点：抖动网格，圆斑大小不一
          const gx = Math.floor(t * 13 * dens + seed * 0.02);
          const gy = Math.floor((v * 9));
          const hv = hash2(gx, gy, seed);
          if (hv > 0.72) {
            const jx = (hash2(gx, gy + 31, seed) - 0.5) * 0.6;
            const jy = (hash2(gx + 17, gy, seed) - 0.5) * 0.6;
            const dx = (t * 13 * dens) % 1 - 0.5 - jx;
            const dy = (v * 9) % 1 - 0.5 - jy;
            const r = 0.30 + hash2(gx, gy, seed + 7) * 0.22;
            if (dx * dx + dy * dy < r * r) m = 0.72 * (0.55 + Math.max(0, hy) * 0.45);
          }
        } else if (pat === 'scale') {
          // 鳞片：交错排列的菱形网格（相邻两行错半格）
          const row = Math.floor(v * 11);
          const off = (row % 2) * 0.5;
          const cx2 = ((t * 19 * dens + off) % 1) - 0.5;
          const cy2 = ((v * 11) % 1) - 0.5;
          const d = Math.abs(cx2) * 1.35 + Math.abs(cy2);
          m = d < 0.30 ? 0.19 : 0;
        } else if (pat === 'marble') {
          // 大理石：两层不同频率的正弦互相扰动
          const n1 = Math.sin(t * 11 + Math.sin(hy * 4.2 + seed) * 2.2);
          const n2 = Math.sin(hy * 7.5 + Math.sin(t * 7 - seed) * 2.6);
          m = Math.max(0, (n1 + n2) * 0.5) * 0.52;
        } else if (pat === 'hide') {
          // 爬行动物皮：大块不规则暗斑 + 细颗粒。原来的竖条纹等距排一圈，
          // 远看像一只木桶，完全没有「活的史前兽」的感觉。
          const gx = Math.floor(t * 7 * dens + seed * 0.03);
          const gy = Math.floor(v * 6);
          const hv = hash2(gx, gy, seed + 3);
          if (hv > 0.28) {
            const r = 0.34 + hash2(gx, gy, seed + 11) * 0.30;
            const dx = t * 7 * dens - gx - (0.20 + hash2(gx, gy + 5, seed) * 0.60);
            const dy = v * 6 - gy - (0.20 + hash2(gx + 9, gy, seed) * 0.60);
            const d = Math.sqrt(dx * dx + dy * dy);
            if (d < r) m = (1 - d / r) * 0.44 * (0.55 + Math.max(0, hy) * 0.60);
          }
          if (hash2(Math.floor(t * 64), Math.floor(v * 28), seed + 21) > 0.87) {
            m = Math.max(m, 0.22);
          }
        } else if (pat === 'lateral') {
          // 侧线：体侧中线一条亮带 + 细碎斑点
          m = Math.exp(-Math.pow(hy * 14, 2)) * 0.5;
          c = mixRgb(c, [250, 250, 245], 0.20);
        }

        if (m > 0.002) c = mixRgb(c, mark, Math.min(0.92, m));
        // 体侧中线的高光（所有鱼都有，很细）：让圆筒形的身体"有结构"
        const lat = Math.exp(-Math.pow((Math.abs(hy) - 0.02) * 17, 2));
        c = mixRgb(c, [255, 255, 250], lat * 0.09);
        // 沿体轴的微弱明暗（头部略亮、尾柄略暗）
        const shade = 0.90 + 0.14 * Math.sin(t * Math.PI);
        const idx = (py * W + px) * 4;
        img.data[idx] = Math.min(255, c[0] * shade);
        img.data[idx + 1] = Math.min(255, c[1] * shade);
        img.data[idx + 2] = Math.min(255, c[2] * shade);
        img.data[idx + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    const tex = new THREE.CanvasTexture(cv);
    // CanvasTexture 默认 flipY=true：canvas 第一行会被贴到 v=1，
    // 而鱼身的 v=0.25 才是背脊。结果整张贴图上下颠倒 —— 深背浅腹的鱼
    // 在水里全都变成「白背灰腹」的一块塑料。关掉 flipY 才对得上。
    tex.flipY = false;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    tex.needsUpdate = true;
    TEX_CACHE[key] = tex;
    return tex;
  }

  // ---------- FishModel ----------
  class FishModel {
    constructor(typeOrColor) {
      this.group = new THREE.Group();
      let cfg;
      if (typeof typeOrColor === 'string' && FISH_TYPES[typeOrColor]) {
        cfg = FISH_TYPES[typeOrColor];
        this.fishName = typeOrColor;
      } else {
        const c = typeof typeOrColor === 'number' ? typeOrColor : 0xffb454;
        cfg = { grade: 0, prof: 'torpedo', len: 0.55, h: 0.16, w: 0.08, back: c, belly: c, fin: c, eye: 0x1a1a1a, tail: 'fork' };
        this.fishName = null;
      }
      this.cfg = cfg;
      this.grade = cfg.grade || 0;
      this.gradeInfo = GRADES[Math.min(GRADES.length - 1, this.grade)];
      this.build(cfg);
      this.t = Math.random() * 10;
    }

    build(cfg) {
      const g = this.group;
      const L = cfg.len || 0.6;
      const H = cfg.h || 0.2;
      const W = cfg.w || 0.1;
      const s = L * 0.5;                      // 鳍尺度参照
      const prof = PROF[cfg.prof] || PROF.torpedo;
      const gi = this.gradeInfo;
      const glowK = gi ? gi.glow : 0;

      // ---- 体色材质 ----
      const baseEmissive = cfg.emissive || (glowK > 0.1 ? cfg.fin : 0x000000);
      const bodyTex = makeFishTex(cfg, this.fishName);
      const bodyMat = new THREE.MeshStandardMaterial({
        // 花纹与背腹渐变全部烘进贴图：顶点色在 18 环的网格上会被插值糊平，
        // 这也是"看起来像一块单色塑料"的真正原因。
        map: bodyTex,
        vertexColors: false,
        roughness: cfg.shimmer ? 0.28 : 0.46,
        metalness: cfg.shimmer ? 0.42 : 0.14,
        emissive: baseEmissive,
        emissiveIntensity: cfg.emissive ? 0.7 : glowK * 0.5,
        transparent: !!cfg.ghost,
        opacity: cfg.ghost ? cfg.ghost : 1,
        flatShading: false
      });
      const finMat = new THREE.MeshStandardMaterial({
        color: cfg.fin, roughness: 0.5, metalness: 0.08,
        side: THREE.DoubleSide,
        transparent: !!cfg.ghost,
        opacity: cfg.ghost ? Math.min(1, cfg.ghost + 0.12) : 1,
        emissive: cfg.emissive || 0x000000,
        emissiveIntensity: cfg.emissive ? 0.5 : glowK * 0.35
      });
      // 血夜鱼：鳍膜自己发光。黑身红鳍在只有月光的暗水里，
      // 鳍不亮就是一团黑，根本看不出「赤鳍」。
      if (cfg.finGlow) {
        finMat.color.set(cfg.finGlow);
        finMat.emissive = new THREE.Color(cfg.finGlow);
        finMat.emissiveIntensity = 0.85;
      }

      // ---- 鱼身 ----
      const SEGS = cfg.prof === 'ribbon' || cfg.prof === 'disc' ? 18 : 16;
      const RINGS = cfg.prof === 'eel' || cfg.prof === 'ribbon' ? 22 : 18;
      const bodyGeo = makeBodyGeo(prof, L, H, W, SEGS, RINGS);
      // 顶点色：背深腹浅渐变 + 程序化体表花纹。
      // 光有渐变的话，三十多条鱼在游戏里看起来就是"同一块塑料换了颜色"，
      // 所以这里按鱼名哈希出一套花纹（条纹/斑点/鳞片/大理石/纵带），
      // 全部烘进顶点色，不增加一个三角面，但每条鱼的皮肤都不一样。
      {
        const pos = bodyGeo.attributes.position;
        const colors = [];
        const cBack = new THREE.Color(cfg.back);
        const cBelly = new THREE.Color(cfg.belly);
        const cFin = new THREE.Color(cfg.fin || cfg.back);
        const c = new THREE.Color();
        const seed = hashStr(this.fishName || ('anon' + Math.round(L * 1000)));
        const pat = cfg.pattern || patternFor(cfg.prof);
        // 花纹密度：同体形的鱼靠这个再拉开一档
        const dens = 1 + ((seed % 7) / 7) * 0.8;
        // 花纹颜色：按背色的明度决定用「深斑」还是「亮斑」。
        // 原来固定用鳍色压暗，而多数鱼的鳍色和背色只差一点点，花纹等于没画。
        const backLum = cBack.r * 0.299 + cBack.g * 0.587 + cBack.b * 0.114;
        const markCol = cfg.mark ? new THREE.Color(cfg.mark)
          : (backLum > 0.40
            ? cBack.clone().multiplyScalar(0.40)
            : cBelly.clone().lerp(cBack, 0.22).multiplyScalar(1.10));
        for (let i = 0; i < pos.count; i++) {
          const px = pos.getX(i), py = pos.getY(i), pz = pos.getZ(i);
          const ny = py / Math.max(0.0001, H);
          // -1 腹 → +1 背，中间快速过渡，做出"分界线"
          const k = Math.max(0, Math.min(1, ny * 0.9 + 0.45));
          const kk = Math.pow(k, 0.75);
          c.copy(cBelly).lerp(cBack, kk);

          // 体表坐标：t 沿体轴 0..1，ang 绕身一圈 -1..1
          const t = px / Math.max(0.0001, L) + 0.5;
          const ang = Math.atan2(pz, py) / Math.PI;
          let m = 0;
          if (pat === 'stripe') {
            // 竖向环带（鲈鱼、鲷鱼那种）：沿体轴等距，越靠背越明显
            m = Math.pow(Math.max(0, Math.sin((t * 7.5 * dens + seed * 0.11) * Math.PI * 2)), 3);
            m *= 0.30 + Math.max(0, ny) * 0.55;
          } else if (pat === 'band') {
            // 纵向长带（雀鳝、带鱼）：沿体侧一条或多条水平暗带
            const b = Math.abs(Math.sin((ang * 3.0 + ny * 1.6) * Math.PI));
            m = Math.pow(Math.max(0, 1 - b * 3.2), 2) * 0.55;
          } else if (pat === 'spots') {
            // 斑点：网格哈希，大小随体长
            const gx = Math.floor(t * 7 * dens + seed * 0.03);
            const gy = Math.floor((ang + 1) * 4.5);
            const hv = hash2(gx, gy, seed);
            m = hv > 0.78 ? 0.55 * (0.55 + ny * 0.45) : 0;
          } else if (pat === 'scale') {
            // 鳞片：t 与 ang 的双频网格，正片叠底出菱形鳞
            // 环数 18、周向 16 段，频率必须压到采样率以下（<9 / <8），
            // 否则一条条鳞片会退化成随机噪点。
            const sx = Math.sin(t * 17 * dens + seed * 0.2);
            const sy = Math.sin((ang + 1) * 6.5 + t * 3);
            m = (sx * sy > 0.10 ? 0.30 : 0) + 0.07;
          } else if (pat === 'marble') {
            // 大理石纹：两层不同频率的伪噪声
            const n1 = Math.sin(t * 13 + Math.sin(ang * 5 + seed) * 2.4);
            const n2 = Math.sin(ang * 7 + Math.sin(t * 9 - seed) * 3.1);
            m = Math.max(0, (n1 + n2) * 0.5) * 0.45;
          } else if (pat === 'lateral') {
            // 侧线：体侧中线一条亮线 + 少量碎斑
            const line = Math.exp(-Math.pow((ny - 0.02) * 7.5, 2));
            m = line * 0.30;
          }
          if (m > 0.001) c.lerp(markCol, Math.min(0.88, m * 1.15));

          // 侧线高光：所有鱼都有一条，很细，但让体侧"有结构"
          const lat = Math.exp(-Math.pow((ny - 0.04) * 16, 2));
          c.offsetHSL(0, 0, lat * 0.035);

          colors.push(c.r, c.g, c.b);
        }
        bodyGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
      }
      const body = new THREE.Mesh(bodyGeo, bodyMat);
      body.castShadow = true;
      body.receiveShadow = true;
      g.add(body);
      this.body = body;

      // ---- 尾鳍 ----
      const tailGeo = makeTailGeo(cfg.tail || 'fork', s * 1.05);
      const tail = new THREE.Mesh(tailGeo, finMat);
      tail.position.set(-L * 0.48, 0, 0);
      // 史前巨兽的尾鳍要收小：沧龙的尾是「竖鳍 + 细柄」，不是金枪鱼那种大月牙
      if (cfg.tailScale) tail.scale.setScalar(cfg.tailScale);
      tail.castShadow = true;
      g.add(tail);
      this.tail = tail;

      // ---- 背鳍 ----
      if (!cfg.bare) {
        const dorsalH = (cfg.dorsalTall || 1) * H * 0.62;
        const dorsal = new THREE.Mesh(makeFinGeo(s * 0.75, dorsalH, s * 0.05, s * 0.16), finMat);
        dorsal.position.set(L * 0.08, H * 0.86, 0);
        dorsal.rotation.z = -0.22;
        dorsal.castShadow = true;
        g.add(dorsal);

        // ---- 腹鳍 + 臀鳍 ----
        const ventral = new THREE.Mesh(makeFinGeo(s * 0.42, H * 0.40, s * 0.04, s * 0.1), finMat);
        ventral.position.set(L * 0.12, -H * 0.85, 0);
        ventral.rotation.z = Math.PI + 0.28;
        g.add(ventral);
        const anal = new THREE.Mesh(makeFinGeo(s * 0.30, H * 0.42, s * 0.035, s * 0.06), finMat);
        anal.position.set(-L * 0.16, -H * 0.86, 0);
        anal.rotation.z = Math.PI + 0.34;
        g.add(anal);

        // ---- 胸鳍（可摆动） ----
        const pecGeo = makeFinGeo(s * 0.55, s * 0.32, s * 0.025, s * 0.1);
        const pecL = new THREE.Mesh(pecGeo, finMat);
        pecL.position.set(L * 0.26, -H * 0.12, W * 0.78);
        pecL.rotation.set(0.35, 0.75, -0.18);
        pecL.castShadow = true;
        g.add(pecL);
        this.pecL = pecL;
        const pecR = pecL.clone();
        pecR.position.z = -W * 0.78;
        pecR.rotation.set(0.35, -0.75, 0.18);
        g.add(pecR);
        this.pecR = pecR;
      }

      // ---- 眼睛 ----
      // 眼睛不能按「可爱卡通」的比例来：原来 eyeR = 0.20H（bigEye 0.34H），
      // 直径接近体高的 2/3，四条鱼摆一起像一排毛绒玩具。
      // 真实鱼眼直径大约是体高的 1/8~1/6。
      const eyeScale = cfg.bigEye ? 1.55 : 1;
      const eyeN = cfg.eyes || 2;
      // 爬行类（沧龙/恐龙）不用大白眼球：眼白会变成一颗乒乓球，
      // 直接用瞳孔色当眼球，再压一条黑竖瞳。
      const eyeWhiteMat = new THREE.MeshStandardMaterial({
        color: cfg.reptileEye ? cfg.eye : 0xfdfdf8, roughness: cfg.reptileEye ? 0.3 : 0.22
      });
      const pupilMat = new THREE.MeshStandardMaterial({
        color: cfg.eye, roughness: 0.12, metalness: 0.1,
        emissive: cfg.eye, emissiveIntensity: glowK > 0.4 ? 1.3 : 0.0
      });
      const eyeR = H * 0.115 * eyeScale;
      const addEye = (x, y, z, sc) => {
        const grp = new THREE.Group();
        const w = new THREE.Mesh(new THREE.SphereGeometry(eyeR, 10, 8), eyeWhiteMat);
        w.scale.set(1, 1, 0.46);
        grp.add(w);
        const p = new THREE.Mesh(new THREE.SphereGeometry(eyeR * (cfg.reptileEye ? 0.40 : 0.60), cfg.reptileEye ? 6 : 8, 6), pupilMat);
        if (cfg.reptileEye) p.scale.set(1, 1.9, 1);
        // 瞳孔必须朝着身体外侧：原来固定 +z，左眼的瞳孔等于埋进眼白里，
        // 从左边看过去就是一只没有眼珠的白球。
        p.position.z = (z >= 0 ? 1 : -1) * eyeR * 0.26;
        grp.add(p);
        grp.position.set(x, y, z);
        grp.scale.setScalar(sc || 1);
        g.add(grp);
      };
      const ex = L * (cfg.eyePos ? cfg.eyePos[0] : 0.40);
      const ey = H * (cfg.eyePos ? cfg.eyePos[1] : 0.20);
      const ez = W * (cfg.eyePos ? cfg.eyePos[2] : 0.80);
      // 盲鱼：整只眼睛都不长，只留一块凹陷的疤 —— 苍白灾厄靠这个抬头率
      if (cfg.eyeless) {
        const scarMat = new THREE.MeshStandardMaterial({ color: cfg.back, roughness: 0.92 });
        for (let s = -1; s <= 1; s += 2) {
          const scar = new THREE.Mesh(new THREE.SphereGeometry(eyeR * 0.72, 8, 6), scarMat);
          scar.position.set(ex, ey, s * ez * 0.97);
          scar.scale.set(1, 0.7, 0.34);
          g.add(scar);
        }
      } else {
        if (eyeN >= 2) {
          addEye(ex, ey, ez);
          addEye(ex, ey, -ez);
        }
        if (eyeN >= 3) addEye(ex * 0.90, H * 0.52, 0, 0.85);
        if (eyeN >= 4) { addEye(ex * 0.72, ey, ez * 0.92, 0.8); addEye(ex * 0.72, ey, -ez * 0.92, 0.8); }
      }
      // 盲光狂潮：眼球还在，但被一层厚厚的白膜糊住了（迎着光看是一层死白）
      if (cfg.blind) {
        const filmMat = new THREE.MeshStandardMaterial({
          color: cfg.blind, roughness: 0.94, transparent: true, opacity: 0.92,
          emissive: cfg.blind, emissiveIntensity: 0.16
        });
        for (let s = -1; s <= 1; s += 2) {
          const film = new THREE.Mesh(new THREE.SphereGeometry(eyeR * 1.06, 10, 8), filmMat);
          film.position.set(ex, ey, s * ez);
          film.scale.set(1, 1, 0.5);
          g.add(film);
        }
      }

      // ---- 嘴 ----
      const mouthMat = new THREE.MeshStandardMaterial({ color: 0x6e2222, roughness: 0.65 });
      const mouth = new THREE.Mesh(new THREE.SphereGeometry(H * 0.085, 8, 6), mouthMat);
      mouth.scale.set(cfg.grumpy ? 1.0 : 0.8, cfg.grumpy ? 0.55 : 0.40, cfg.grumpy ? 1.3 : 1.0);
      mouth.position.set(L * 0.475, -H * 0.10, 0);
      g.add(mouth);

      // ---- 獠牙（鮟鱇、骨鲨、深渊鱼） ----
      if (cfg.teeth) {
        const toothMat = new THREE.MeshStandardMaterial({ color: 0xf6f2e4, roughness: 0.35 });
        for (let i = 0; i < cfg.teeth; i++) {
          const a = (i / (cfg.teeth - 1) - 0.5) * 1.7;
          const t = new THREE.Mesh(new THREE.ConeGeometry(H * 0.035, H * 0.16, 4), toothMat);
          t.position.set(L * 0.47 - Math.abs(a) * L * 0.05, -H * 0.14 + Math.cos(a) * H * 0.12, Math.sin(a) * W * 0.42);
          t.rotation.x = Math.PI;
          t.rotation.z = -0.25;
          g.add(t);
        }
      }

      // ---- 鲟鱼的长吻 ----
      if (cfg.snout) {
        const snout = new THREE.Mesh(new THREE.ConeGeometry(H * 0.34, L * 0.30, 8), bodyMat);
        snout.rotation.z = -Math.PI / 2;
        snout.position.set(L * 0.60, -H * 0.12, 0);
        snout.castShadow = true;
        g.add(snout);
      }

      // ---- 胡须（鲤、鲶） ----
      if (cfg.whisker) {
        for (let k = -1; k <= 1; k += 2) {
          const w = new THREE.Mesh(
            new THREE.CylinderGeometry(H * 0.045, H * 0.02, L * 0.34, 5), finMat
          );
          w.position.set(L * 0.47, -H * 0.28, k * W * 0.24);
          w.rotation.z = Math.PI / 2 - 0.55;
          w.rotation.y = k * 0.3;
          g.add(w);
        }
      }

      // ---- 斑点 ----
      if (cfg.spots) {
        const sp = cfg.spots;
        const mat = new THREE.MeshStandardMaterial({ color: sp.color, roughness: 0.55 });
        for (let i = 0; i < sp.n; i++) {
          const t = -0.36 + (i / sp.n) * 0.72;
          const rr = H * (sp.r || 0.3) * (0.5 + Math.random() * 0.6);
          const spot = new THREE.Mesh(new THREE.CircleGeometry(rr, 7), mat);
          const ang = Math.random() * TAU;
          spot.position.set(
            t * L,
            Math.sin(ang) * H * 0.55,
            (W * 0.96) * Math.cos(ang) * 0.4 + W * 0.58
          );
          spot.rotation.y = Math.PI / 2;
          spot.rotation.x = ang * 0.4;
          g.add(spot);
          const sp2 = spot.clone();
          sp2.position.z = -spot.position.z;
          sp2.rotation.y = -Math.PI / 2;
          g.add(sp2);
        }
      }

      // ---- 条纹 ----
      if (cfg.stripe) {
        const mat = new THREE.MeshStandardMaterial({
          color: cfg.stripe.color, roughness: 0.5, transparent: true, opacity: 0.62
        });
        for (let i = 0; i < cfg.stripe.n; i++) {
          const x = -L * 0.28 + i * (L * 0.62 / cfg.stripe.n);
          const st = new THREE.Mesh(new THREE.PlaneGeometry(L * 0.045, H * 1.25), mat);
          st.position.set(x, 0, W * 0.90);
          g.add(st);
          const st2 = st.clone();
          st2.position.z = -W * 0.90;
          st2.rotation.y = Math.PI;
          g.add(st2);
        }
      }

      // ---- 环带（小丑鱼） ----
      if (cfg.rings) {
        const mat = new THREE.MeshStandardMaterial({ color: cfg.rings.color, roughness: 0.55 });
        for (let i = 0; i < cfg.rings.n; i++) {
          const t = (i + 0.9) / (cfg.rings.n + 0.8);
          const x = L * (0.34 - t * 0.72);
          const k = Math.max(0.25, 1 - Math.pow(x / (L * 0.5), 2) * 0.55);
          const ring = new THREE.Mesh(new THREE.TorusGeometry(H * k * 0.98, H * 0.055, 6, 18), mat);
          ring.position.set(x, H * 0.04, 0);
          ring.rotation.y = Math.PI / 2;
          ring.scale.set(1, (H / W) * 0.68, 1);
          ring.castShadow = true;
          g.add(ring);
        }
      }

      // ---- 气泡 ----
      if (cfg.bubbles) {
        const mat = new THREE.MeshStandardMaterial({
          color: 0xdff4ff, roughness: 0.06, metalness: 0.05,
          transparent: true, opacity: 0.52,
          emissive: 0x88ccff, emissiveIntensity: 0.5
        });
        for (let i = 0; i < cfg.bubbles; i++) {
          const b = new THREE.Mesh(
            new THREE.SphereGeometry(H * (0.09 + Math.random() * 0.1), 8, 6), mat
          );
          const ang = Math.random() * TAU;
          b.position.set(
            (Math.random() - 0.5) * L * 0.9,
            Math.sin(ang) * H * 0.72,
            Math.cos(ang) * W * 0.95
          );
          g.add(b);
        }
      }

      // ---- 发光裂缝 ----
      if (cfg.cracks) {
        const mat = new THREE.MeshBasicMaterial({
          color: cfg.cracks, transparent: true, opacity: 0.85,
          blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide
        });
        for (let i = 0; i < 9; i++) {
          const cw = L * (0.03 + Math.random() * 0.06);
          const ch = H * (0.4 + Math.random() * 0.7);
          const cr = new THREE.Mesh(new THREE.PlaneGeometry(cw, ch), mat);
          cr.position.set(
            (Math.random() - 0.5) * L * 0.85,
            (Math.random() - 0.35) * H * 0.9,
            W * 0.94
          );
          cr.rotation.z = Math.random() * 0.5 - 0.25;
          g.add(cr);
          const c2 = cr.clone();
          c2.position.z = -W * 0.94;
          c2.rotation.y = Math.PI;
          g.add(c2);
        }
      }

      // ---- 分节装甲（机械银鲭） ----
      if (cfg.armor) {
        const mat = new THREE.MeshStandardMaterial({
          color: cfg.armor.color, roughness: 0.42, metalness: 0.62
        });
        for (let i = 0; i < cfg.armor.n; i++) {
          const t = (i + 1) / (cfg.armor.n + 1);
          const x = L * (0.36 - t * 0.78);
          const k = Math.max(0.35, 1 - Math.pow(x / (L * 0.5), 2) * 0.5);
          const ring = new THREE.Mesh(
            new THREE.TorusGeometry(H * k * 1.0, H * 0.09, 4, 14), mat
          );
          ring.position.set(x, H * 0.02, 0);
          ring.rotation.y = Math.PI / 2;
          ring.scale.set(1, (H / W) * 0.85, 1);
          ring.castShadow = true;
          g.add(ring);
        }
      }

      // ---- 背刺 ----
      if (cfg.spines) {
        const mat = new THREE.MeshStandardMaterial({
          color: cfg.spineColor || cfg.fin, roughness: 0.4, metalness: 0.35
        });
        for (let i = 0; i < cfg.spines; i++) {
          const x = L * (0.30 - i * (0.62 / cfg.spines));
          const sp = new THREE.Mesh(new THREE.ConeGeometry(H * 0.10, H * 0.55, 5), mat);
          sp.position.set(x, H * 0.94, 0);
          sp.rotation.z = 0.20;
          sp.castShadow = true;
          g.add(sp);
        }
      }

      // ---- 鳞片行（背侧一道金属光） ----
      if (cfg.scales) {
        const mat = new THREE.MeshStandardMaterial({
          color: cfg.scales.color, roughness: 0.3, metalness: 0.55,
          transparent: true, opacity: 0.8
        });
        for (let i = 0; i < cfg.scales.n; i++) {
          const t = -0.34 + (i / cfg.scales.n) * 0.7;
          const sc = new THREE.Mesh(new THREE.CircleGeometry(H * 0.11, 6), mat);
          sc.position.set(t * L, H * 0.42, W * 0.66);
          sc.rotation.y = Math.PI / 2.6;
          g.add(sc);
          const sc2 = sc.clone();
          sc2.position.z = -W * 0.66;
          sc2.rotation.y = -Math.PI / 2.6;
          g.add(sc2);
        }
      }

      // ---- 多尾（九尾锦鲤、龙鲤） ----
      if (cfg.multiTail) {
        for (let i = 1; i < cfg.multiTail; i++) {
          const spread = (i / (cfg.multiTail - 1) - 0.5) * 2;
          const t2 = new THREE.Mesh(tailGeo, finMat);
          t2.position.set(-L * 0.45, spread * H * 0.45, spread * W * 0.75);
          t2.rotation.x = spread * 0.85;
          t2.rotation.y = spread * 0.45;
          t2.scale.setScalar(1.0 - Math.abs(spread) * 0.22);
          t2.castShadow = true;
          g.add(t2);
        }
      }

      // ---- 头顶发光须（水灯鱼、灯笼鱼） ----
      if (cfg.antenna) {
        const ant = new THREE.Group();
        const rodLen = L * cfg.antenna.len;
        const rod = new THREE.Mesh(
          new THREE.CylinderGeometry(H * 0.035, H * 0.06, rodLen, 5), finMat
        );
        const dir = cfg.antenna.fwd ? 1 : -1;
        rod.position.set(dir * rodLen * 0.18, rodLen * 0.44, 0);
        rod.rotation.z = dir * 0.30;
        ant.add(rod);
        const col = cfg.antenna.color || 0xbff0ff;
        const ballMat = new THREE.MeshStandardMaterial({
          color: col, emissive: col, emissiveIntensity: 3.0, roughness: 0.3
        });
        const ball = new THREE.Mesh(new THREE.SphereGeometry(H * 0.16, 12, 10), ballMat);
        ball.position.set(dir * rodLen * 0.34, rodLen * 0.82, 0);
        ant.add(ball);
        const halo = new THREE.Mesh(
          new THREE.SphereGeometry(H * 0.40, 12, 10),
          new THREE.MeshBasicMaterial({
            color: col, transparent: true, opacity: 0.20,
            depthWrite: false, blending: THREE.AdditiveBlending
          })
        );
        halo.position.copy(ball.position);
        ant.add(halo);
        ant.position.set(L * 0.16, H * 0.74, 0);
        g.add(ant);
      }

      // ---- 头顶王冠（花冠、深渊、龙鲤、星界鳐） ----
      if (cfg.crown) {
        const cr = cfg.crown;
        const base = new THREE.Mesh(
          new THREE.TorusGeometry(H * (cr.r || 0.06) * 1.35, H * 0.035, 6, 16),
          new THREE.MeshStandardMaterial({ color: cr.color, roughness: 0.3, metalness: 0.6, emissive: cr.color, emissiveIntensity: 0.45 })
        );
        base.rotation.x = Math.PI / 2;
        base.position.set(L * 0.14, H * 0.88, 0);
        g.add(base);
        for (let i = 0; i < (cr.n || 5); i++) {
          const a = (i / (cr.n || 5)) * TAU;
          const spike = new THREE.Mesh(
            new THREE.ConeGeometry(H * 0.055, H * (0.32 + (i % 2) * 0.14), 5),
            new THREE.MeshStandardMaterial({ color: cr.leaf || cr.color, roughness: 0.35, metalness: 0.45, emissive: cr.color, emissiveIntensity: 0.3 })
          );
          spike.position.set(
            L * 0.14 + Math.cos(a) * H * (cr.r || 0.06) * 1.2,
            H * 0.98,
            Math.sin(a) * H * (cr.r || 0.06) * 1.2
          );
          spike.rotation.z = Math.cos(a) * 0.3;
          spike.rotation.x = -Math.sin(a) * 0.3;
          g.add(spike);
        }
      }

      // ---- 弯角 ----
      if (cfg.horns) {
        const mat = new THREE.MeshStandardMaterial({
          color: cfg.horns.color, roughness: 0.4, metalness: 0.3, emissive: cfg.horns.color, emissiveIntensity: 0.2
        });
        for (let k = -1; k <= 1; k += 2) {
          for (let i = 0; i < (cfg.horns.n || 1); i++) {
            const horn = new THREE.Mesh(
              new THREE.CylinderGeometry(H * 0.03, H * 0.075, L * cfg.horns.len, 6), mat
            );
            horn.position.set(L * (0.30 - i * 0.12), H * 0.95, k * W * 0.34);
            horn.rotation.set(k * 0.35, 0, -0.35);
            g.add(horn);
          }
        }
      }

      // ---- 口部触须（鲶、鮟鱇、水母鱼、深渊鱼） ----
      if (cfg.tentacles) {
        const mat = new THREE.MeshStandardMaterial({
          color: cfg.tentacles.color, roughness: 0.6, transparent: true, opacity: 0.85,
          emissive: cfg.tentacles.color, emissiveIntensity: glowK * 0.4
        });
        for (let i = 0; i < cfg.tentacles.n; i++) {
          const a = (i / cfg.tentacles.n) * TAU;
          const tl = L * cfg.tentacles.len;
          const tnt = new THREE.Mesh(new THREE.CylinderGeometry(H * 0.022, H * 0.045, tl, 5), mat);
          tnt.position.set(
            L * 0.44,
            -H * 0.18 + Math.sin(a) * H * 0.24,
            Math.cos(a) * W * 0.55
          );
          tnt.rotation.set(0, 0, Math.PI / 2 + 0.55);
          tnt.rotation.y = a * 0.4;
          g.add(tnt);
        }
      }

      // ---- 背甲（龟鱼） ----
      if (cfg.shell) {
        const sh = cfg.shell;
        const dome = new THREE.Mesh(
          new THREE.SphereGeometry(1, 14, 10, 0, TAU, 0, Math.PI * 0.55),
          new THREE.MeshStandardMaterial({ color: sh.color, roughness: 0.7, metalness: 0.1 })
        );
        dome.scale.set(L * 0.46, H * 0.86, W * 0.95);
        dome.position.set(-L * 0.02, H * 0.18, 0);
        dome.castShadow = true;
        g.add(dome);
        const plateMat = new THREE.MeshStandardMaterial({ color: sh.plate, roughness: 0.8 });
        for (let i = 0; i < sh.n; i++) {
          const a = (i / sh.n) * TAU;
          const pl = new THREE.Mesh(new THREE.CircleGeometry(H * 0.16, 6), plateMat);
          pl.position.set(
            -L * 0.02 + Math.cos(a) * L * 0.26,
            H * 0.62,
            Math.sin(a) * W * 0.55
          );
          pl.rotation.x = -Math.PI / 2;
          g.add(pl);
        }
      }

      // ---- 短足 ----
      if (cfg.legs) {
        const mat = new THREE.MeshStandardMaterial({ color: cfg.legs.color, roughness: 0.85 });
        for (let k = -1; k <= 1; k += 2) {
          for (let i = 0; i < 2; i++) {
            const leg = new THREE.Mesh(
              new THREE.CylinderGeometry(H * 0.055, H * 0.045, L * cfg.legs.len, 6), mat
            );
            leg.position.set(L * (0.22 - i * 0.40), -H * 0.72, k * W * 0.62);
            leg.rotation.z = k * 0.30;
            g.add(leg);
          }
        }
      }

      // ---- 翼（鳐类、星界鳐） ----
      if (cfg.wing) {
        const span = L * cfg.wing.span;
        const ws = new THREE.Shape();
        ws.moveTo(L * 0.30, 0);
        ws.quadraticCurveTo(L * 0.05, -span, -L * 0.42, -span * 0.86);
        ws.quadraticCurveTo(-L * 0.72, -span * 0.44, -L * 0.30, 0);
        ws.quadraticCurveTo(-L * 0.72, span * 0.44, -L * 0.42, span * 0.86);
        ws.quadraticCurveTo(L * 0.05, span, L * 0.30, 0);
        const wg = new THREE.Mesh(
          new THREE.ExtrudeGeometry(ws, { depth: H * 0.22, bevelEnabled: false }),
          new THREE.MeshStandardMaterial({
            color: cfg.wing.color, roughness: 0.5, metalness: 0.1,
            side: THREE.DoubleSide, transparent: !!cfg.ghost,
            opacity: cfg.ghost ? Math.min(1, cfg.ghost + 0.1) : 1,
            emissive: cfg.emissive || 0x000000, emissiveIntensity: cfg.emissive ? 0.5 : glowK * 0.3
          })
        );
        wg.rotation.x = -Math.PI / 2;
        wg.position.y = -H * 0.12;
        wg.castShadow = true;
        g.add(wg);
        this.wing = wg;
        // 鞭状尾
        const whip = new THREE.Mesh(new THREE.CylinderGeometry(H * 0.06, H * 0.20, L * 0.95, 5), bodyMat);
        whip.rotation.z = Math.PI / 2;
        whip.position.set(-L * 0.72, 0, 0);
        g.add(whip);
      }

      // ---- 锤头（锤头骨鲨） ----
      if (cfg.hammer) {
        const hm = new THREE.Mesh(new THREE.BoxGeometry(L * 0.10, H * 0.42, W * cfg.hammer.span), bodyMat);
        hm.position.set(L * 0.46, H * 0.06, 0);
        hm.castShadow = true;
        g.add(hm);
        for (let k = -1; k <= 1; k += 2) {
          const eye = new THREE.Mesh(
            new THREE.SphereGeometry(H * 0.10, 8, 6),
            new THREE.MeshStandardMaterial({ color: 0x0a0e12, roughness: 0.1 })
          );
          eye.position.set(L * 0.47, H * 0.08, k * W * cfg.hammer.span * 0.5);
          g.add(eye);
        }
      }

      // ---- 额头宝石 ----
      if (cfg.gem) {
        const gm = new THREE.Mesh(
          new THREE.OctahedronGeometry(H * cfg.gem.r / 0.05, 0),
          new THREE.MeshStandardMaterial({
            color: cfg.gem.color, emissive: cfg.gem.color, emissiveIntensity: 2.2,
            roughness: 0.1, metalness: 0.3, transparent: true, opacity: 0.9
          })
        );
        gm.position.set(L * 0.30, H * 0.72, 0);
        gm.rotation.set(0.4, 0.6, 0);
        g.add(gm);
      }

      // ---- 环绕光点 ----
      if (cfg.orbit) {
        const ob = cfg.orbit;
        const mat = new THREE.MeshBasicMaterial({
          color: ob.color, transparent: true, opacity: 0.9,
          blending: THREE.AdditiveBlending, depthWrite: false
        });
        this.orbiters = [];
        for (let i = 0; i < ob.n; i++) {
          const dot = new THREE.Mesh(new THREE.SphereGeometry(H * 0.075, 6, 5), mat);
          g.add(dot);
          this.orbiters.push({ mesh: dot, a: (i / ob.n) * TAU, r: H * ob.r / 0.06 * 0.06, yb: (Math.random() - 0.5) * H * 0.8 });
        }
        this.orbitR = L * ob.r;
      }

      // ---- 星图斑点（星座光点） ----
      if (cfg.constellation) {
        const mat = new THREE.MeshBasicMaterial({
          color: cfg.constellation.color, transparent: true, opacity: 0.95,
          blending: THREE.AdditiveBlending, depthWrite: false
        });
        for (let i = 0; i < cfg.constellation.n; i++) {
          const a = Math.random() * TAU;
          const dot = new THREE.Mesh(new THREE.SphereGeometry(H * 0.045, 5, 4), mat);
          dot.position.set(
            (Math.random() - 0.5) * L * 0.86,
            Math.sin(a) * H * 0.72,
            Math.cos(a) * W * 0.94
          );
          g.add(dot);
        }
      }

      // ---- 疣粒 ----
      if (cfg.warts) {
        const mat = new THREE.MeshStandardMaterial({ color: cfg.warts.color, roughness: 0.9 });
        for (let i = 0; i < cfg.warts.n; i++) {
          const a = Math.random() * TAU;
          const w = new THREE.Mesh(new THREE.SphereGeometry(H * 0.055, 5, 4), mat);
          w.position.set(
            (Math.random() - 0.5) * L * 0.8,
            Math.sin(a) * H * 0.8,
            Math.cos(a) * W * 0.9
          );
          g.add(w);
        }
      }

      // ---- 背冠（皇带鱼） ----
      if (cfg.crest) {
        const mat = new THREE.MeshStandardMaterial({
          color: cfg.crest.color, roughness: 0.6, side: THREE.DoubleSide,
          emissive: cfg.crest.color, emissiveIntensity: 0.35, transparent: true, opacity: 0.9
        });
        for (let i = 0; i < 7; i++) {
          const t = i / 6;
          const hgt = H * cfg.crest.h / 0.24 * (0.5 + Math.sin(t * Math.PI) * 0.9);
          const c = new THREE.Mesh(new THREE.PlaneGeometry(L * 0.055, hgt), mat);
          c.position.set(L * (0.32 - t * 0.62), H * 0.95 + hgt * 0.4, 0);
          c.rotation.z = 0.25 - t * 0.1;
          g.add(c);
        }
      }

      // ---- 离鳍（金枪鱼小鳍） ----
      if (cfg.finlets) {
        for (let k = -1; k <= 1; k += 2) {
          for (let i = 0; i < 5; i++) {
            const f = new THREE.Mesh(new THREE.ConeGeometry(H * 0.06, H * 0.20, 4), finMat);
            f.position.set(L * (0.02 - i * 0.09), H * 0.10, k * W * 0.85);
            f.rotation.z = 0.9;
            f.rotation.x = k * 0.5;
            g.add(f);
          }
        }
      }

      // ---- 齿轮（时之鲤） ----
      if (cfg.gears) {
        const mat = new THREE.MeshStandardMaterial({
          color: cfg.gears.color, roughness: 0.3, metalness: 0.85,
          emissive: 0x5a3a08, emissiveIntensity: 0.4
        });
        for (let i = 0; i < cfg.gears.n; i++) {
          const gr = new THREE.Group();
          const ring = new THREE.Mesh(new THREE.TorusGeometry(H * (0.24 - i * 0.05), H * 0.055, 5, 10), mat);
          gr.add(ring);
          for (let j = 0; j < 8; j++) {
            const a = (j / 8) * TAU;
            const tooth = new THREE.Mesh(new THREE.BoxGeometry(H * 0.07, H * 0.07, H * 0.07), mat);
            tooth.position.set(
              Math.cos(a) * H * (0.26 - i * 0.05),
              Math.sin(a) * H * (0.26 - i * 0.05),
              0
            );
            tooth.rotation.z = a;
            gr.add(tooth);
          }
          gr.position.set(L * (0.10 - i * 0.22), H * 0.10, W * 0.92);
          gr.rotation.y = Math.PI / 2;
          if (!this.gears) this.gears = [];
          g.add(gr);
          this.gears.push(gr);
        }
      }

      // ---- 分級光晕（史诗以上） ----
      if (gi && gi.ring && glowK > 0.25) {
        const halo = new THREE.Mesh(
          new THREE.SphereGeometry(1, 14, 10),
          new THREE.MeshBasicMaterial({
            color: gi.ring, transparent: true, opacity: 0.06 + glowK * 0.10,
            blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.BackSide
          })
        );
        halo.scale.set(L * 0.78, H * 1.9, W * 2.6);
        g.add(halo);
        this.halo = halo;
      }
      if (cfg.glowRing) {
        const rg = new THREE.Mesh(
          new THREE.TorusGeometry(L * 0.44, H * 0.035, 5, 26),
          new THREE.MeshBasicMaterial({
            color: cfg.glowRing, transparent: true, opacity: 0.6,
            blending: THREE.AdditiveBlending, depthWrite: false
          })
        );
        rg.rotation.y = Math.PI / 2;
        g.add(rg);
        this.glowRing = rg;
      }

      // ---- 蝠翼（日魇组）：胸鳍长成一片带指状凹口的膜翼 ----
      // 真实蝙蝠翼的辨识点不在「大」，而在后缘那三道扇形凹口 ——
      // 边缘做成平滑曲线就只是一块灰布，所以每个缺口都用二次曲线咬进去。
      if (cfg.batWings) {
        const bw = cfg.batWings;
        const span = (bw.span || 1.2) * L;
        const chord = (bw.chord || 0.5) * L;
        const wingMat = new THREE.MeshStandardMaterial({
          color: bw.color != null ? bw.color : 0xdfe8f0,
          emissive: bw.glow != null ? bw.glow : 0xffffff,
          emissiveIntensity: bw.tattered ? 0.10 : 0.20,
          roughness: 0.66, metalness: 0.02,
          transparent: true, opacity: bw.opacity != null ? bw.opacity : 0.72,
          // 膜翼是单层薄片，开 depthWrite 才能让近侧那片正确遮住远侧和鱼身，
          // 否则半透明叠加看起来像一片悬空的玻璃
          side: THREE.DoubleSide, depthWrite: true
        });
        // 边缘那圈亮线用同一片几何放大一点点叠上去 —— 比单独摆圆柱稳定，
        // 也不会因为展向算错而横穿鱼身
        const rimMat = new THREE.MeshBasicMaterial({
          color: bw.edge != null ? bw.edge : 0xffffff,
          transparent: true, opacity: bw.tattered ? 0.30 : 0.55,
          blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide
        });
        // Shape 在 XY 平面：x = 弦向（沿鱼身前后），y = 展向（向外）
        const s = new THREE.Shape();
        s.moveTo(chord * 0.34, 0);
        s.quadraticCurveTo(chord * 0.46, span * 0.5, chord * 0.30, span);        // 前缘
        s.lineTo(chord * 0.06, span * 0.90);                                    // 翼尖折回
        if (bw.tattered) {
          // 焦烂版：后缘被烧出五个参差缺口
          s.lineTo(chord * 0.02, span * 0.74);
          s.lineTo(-chord * 0.16, span * 0.66);
          s.lineTo(-chord * 0.04, span * 0.52);
          s.lineTo(-chord * 0.26, span * 0.44);
          s.lineTo(-chord * 0.08, span * 0.30);
          s.lineTo(-chord * 0.34, span * 0.20);
          s.lineTo(-chord * 0.12, span * 0.08);
        } else {
          // 标准版：三道扇形凹口
          s.quadraticCurveTo(-chord * 0.02, span * 0.80, -chord * 0.10, span * 0.70);
          s.quadraticCurveTo(chord * 0.02, span * 0.62, -chord * 0.16, span * 0.50);
          s.quadraticCurveTo(chord * 0.02, span * 0.40, -chord * 0.22, span * 0.28);
          s.quadraticCurveTo(-chord * 0.02, span * 0.18, -chord * 0.30, span * 0.06);
        }
        s.lineTo(-chord * 0.20, 0);
        s.closePath();
        const baseGeo = new THREE.ShapeGeometry(s, 14);
        // rotateX(-90°) 之后展向落到 -Z，再平移回 0..span，方向就统一成 +Z
        baseGeo.rotateX(-Math.PI / 2);
        baseGeo.translate(0, 0, span);
        const rimGeo = baseGeo.clone();
        rimGeo.scale(1.0, 1.0, 1.02);
        // 左右两片用各自镜像的几何：靠 group.scale.z=-1 翻转的话，
        // 后面调 rotation.x 的正负号会跟着一起翻，很难对；
        // 直接镜像几何，两侧就能用对称的角度表达。
        const leftGeo = baseGeo.clone();
        leftGeo.scale(1, 1, -1);
        const wings = [];
        for (let sd = 1; sd >= -1; sd -= 2) {
          const grp = new THREE.Group();
          const mesh = new THREE.Mesh(sd > 0 ? baseGeo : leftGeo, wingMat);
          mesh.castShadow = false;
          grp.add(mesh);
          const rim = new THREE.Mesh(sd > 0 ? rimGeo : leftGeo, rimMat);
          grp.add(rim);
          grp.position.set(-L * 0.03, H * 0.10, sd * W * 0.42);
          // 上反角 30°：翼面不是平摊，而是像受惊的蝙蝠那样向上张开，
          // 这样从侧面/斜前方都能看到完整的翼型轮廓。
          grp.rotation.x = -sd * 0.52;
          g.add(grp);
          wings.push({ grp, sd });
        }
        this.batWings = wings;
      }

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

      // ---- 四只桨鳍（沧龙）----
      // 每只桨鳍挂在一个关节 group 上：group 负责「往外张开 + 上扬」，
      // 里面的叶片自己转成水平面，这样从侧面看是薄薄一片，不是一块竖着的叶子。
      if (cfg.flippers) {
        const fl = cfg.flippers;
        const fMat = new THREE.MeshStandardMaterial({
          color: fl.color, roughness: 0.58, metalness: 0.06, side: THREE.DoubleSide,
          emissive: cfg.emissive || 0x000000, emissiveIntensity: 0.3
        });
        const f1 = L * (fl.len || 0.30);
        const f2 = f1 * 0.68;
        const pads = [];
        const mk = (px, py, pz, len, side, sweep) => {
          const joint = new THREE.Group();
          joint.position.set(px, py, pz);
          joint.rotation.y = side * sweep;
          joint.rotation.z = 0.34;             // 两侧同号=都是「往后下方扫」，镜像才不会一边朝上
          const blade = new THREE.Mesh(makePaddleGeo(len, len * 0.44, L * 0.010), fMat);
          blade.rotation.x = -Math.PI / 2;
          blade.rotation.z = 0.10;
          blade.castShadow = true;
          joint.add(blade);
          g.add(joint);
          pads.push(joint);
          return joint;
        };
        mk(L * 0.24, -H * 0.10, W * 1.02, f1, 1, 0.40);
        mk(L * 0.24, -H * 0.10, -W * 1.02, f1, -1, 0.40);
        mk(-L * 0.16, -H * 0.06, W * 0.92, f2, 1, 0.26);
        mk(-L * 0.16, -H * 0.06, -W * 0.92, f2, -1, 0.26);
        this.paddles = pads;
      }

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
        const d0 = -rootY * (jw.big ? 0.52 : 0.40);
        const d1 = d0 * 0.52;
        const w0 = wideAt(t0) * 2 * (jw.wide || 0.86);

        const lowMat = new THREE.MeshStandardMaterial({
          color: new THREE.Color(cfg.belly).lerp(new THREE.Color(cfg.back), 0.62),
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

        // 下颌用放样而不是方块：方块那张平顶在正面看是一块发亮的白板，
        // 圆截面的管子才像「贴在嘴下的一条肉」。
        const lowProf = [[0, 1.00, 1.00], [0.45, 0.96, 0.88], [1, 0.46, 0.34]];
        const low = new THREE.Mesh(makeBodyGeo(lowProf, jawLen, d0 * 0.58, w0 * 0.42, 12, 6), lowMat);
        low.position.set(jawLen * 0.5, -d0 * 0.42, 0);
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
            upT.position.set((t - 0.5) * L, underAt(t) * 0.94 - tH * k * 0.34, sg * halfWi);
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

      // ---- 背脊棘（恐龙：从颈后一路排到尾巴）----
      // 每根刺的根部都要按「那一处的背脊实际高度」落位，用固定 y 会让刺悬空。
      if (cfg.ridge) {
        const rg = cfg.ridge;
        const rMat = new THREE.MeshStandardMaterial({
          color: rg.color, roughness: 0.72, metalness: 0.04,
          emissive: cfg.emissive || 0x000000, emissiveIntensity: 0.22
        });
        const n = rg.n || 10;
        for (let i = 0; i < n; i++) {
          const t = i / (n - 1);
          const x = L * (0.34 - t * 0.68);
          const pt = Math.max(0, Math.min(1, x / L + 0.5));
          const backY = H * profAt(prof, pt)[0];
          const hh = H * (0.13 + 0.30 * Math.sin((0.12 + t * 0.86) * Math.PI));
          const spk = new THREE.Mesh(new THREE.ConeGeometry(H * 0.052, hh, 5), rMat);
          spk.position.set(x, backY + hh * 0.34, 0);
          spk.rotation.z = -0.34;
          spk.castShadow = true;
          g.add(spk);
        }
      }

      // ---- 后肢（恐龙：髋 → 大腿 → 膝 → 小腿 → 蹼足，整条链挂在一起）----
      if (cfg.hindLegs) {
        const hl = cfg.hindLegs;
        const lMat = new THREE.MeshStandardMaterial({ color: hl.color, roughness: 0.82, metalness: 0.03 });
        const clawMat = new THREE.MeshStandardMaterial({ color: hl.claw || 0x2a1a10, roughness: 0.46 });
        this.legs = [];
        const l1 = L * (hl.len || 0.15);
        const l2 = l1 * 0.86;
        for (let k = -1; k <= 1; k += 2) {
          const hip = new THREE.Group();
          hip.position.set(-L * 0.06, -H * 0.56, k * W * 0.52);
          hip.rotation.z = 0.55;               // 整条腿朝后下方伸
          hip.rotation.y = k * 0.10;
          g.add(hip);
          const thigh = new THREE.Mesh(new THREE.CylinderGeometry(H * 0.22, H * 0.15, l1, 7), lMat);
          thigh.position.y = -l1 * 0.5;
          thigh.castShadow = true;
          hip.add(thigh);
          const knee = new THREE.Group();
          knee.position.y = -l1;
          knee.rotation.z = -0.85;             // 膝盖回折，像水鸟收腿
          hip.add(knee);
          const shin = new THREE.Mesh(new THREE.CylinderGeometry(H * 0.12, H * 0.085, l2, 6), lMat);
          shin.position.y = -l2 * 0.5;
          shin.castShadow = true;
          knee.add(shin);
          const foot = new THREE.Mesh(makePaddleGeo(l2 * 0.76, l2 * 0.46, L * 0.008), clawMat);
          foot.rotation.x = -Math.PI / 2;
          foot.position.set(-l2 * 0.10, -l2 * 0.99, 0);
          knee.add(foot);
          this.legs.push({ g: hip, base: hip.rotation.z });
        }
      }

      // ---- 小前肢（恐龙：两条几乎没用的短手臂，但一眼认得出是谁）----
      if (cfg.foreArms) {
        const fa = cfg.foreArms;
        const aMat = new THREE.MeshStandardMaterial({ color: fa.color, roughness: 0.80 });
        const clawMat = new THREE.MeshStandardMaterial({ color: fa.claw || 0x2a1a10, roughness: 0.42 });
        this.arms = [];
        const a1 = L * (fa.len || 0.10);
        for (let k = -1; k <= 1; k += 2) {
          const arm = new THREE.Group();
          arm.position.set(L * 0.30, -H * 0.40, k * W * 0.66);
          arm.rotation.z = 1.15;               // 往前下方伸
          arm.rotation.y = k * 0.20;
          g.add(arm);
          const upper = new THREE.Mesh(new THREE.CylinderGeometry(H * 0.080, H * 0.062, a1, 6), aMat);
          upper.position.y = -a1 * 0.5;
          arm.add(upper);
          const elbow = new THREE.Group();
          elbow.position.y = -a1;
          elbow.rotation.z = -1.45;
          arm.add(elbow);
          const fore = new THREE.Mesh(new THREE.CylinderGeometry(H * 0.058, H * 0.044, a1 * 0.8, 6), aMat);
          fore.position.y = -a1 * 0.4;
          elbow.add(fore);
          const claw = new THREE.Mesh(new THREE.ConeGeometry(H * 0.030, a1 * 0.55, 4), clawMat);
          claw.position.y = -a1 * 0.92;
          claw.rotation.x = Math.PI;
          elbow.add(claw);
          this.arms.push(arm);
        }
      }

      // ---- 脊背骨板（沧龙：沿背中线的一排小圆板，接在帆的两侧）----
      if (cfg.scutes) {
        const sc = cfg.scutes;
        const scMat = new THREE.MeshStandardMaterial({
          color: sc.color, roughness: 0.42, metalness: 0.22,
          emissive: sc.color, emissiveIntensity: 0.35
        });
        const n = sc.n || 9;
        for (let i = 0; i < n; i++) {
          const t = i / (n - 1);
          const x = L * (0.40 - t * 0.86);
          const plate = new THREE.Mesh(new THREE.SphereGeometry(H * 0.075, 6, 4), scMat);
          plate.scale.set(1, 0.5, 1.15);
          plate.position.set(x, H * 0.90, 0);
          g.add(plate);
        }
      }

      // ---- 鳃裂（夜魇石斑）：侧头几道会透光的红弧 ----
      if (cfg.gills) {
        const gm = cfg.gills;
        const gillMat = new THREE.MeshBasicMaterial({
          color: gm.color, transparent: true, opacity: 0.95,
          blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide
        });
        const n = gm.n || 4;
        for (let side = -1; side <= 1; side += 2) {
          for (let i = 0; i < n; i++) {
            // 弧再放大、往外侧掰一点：原来贴着体侧，正对镜头时只剩一条竖线
            const arc = new THREE.Mesh(new THREE.TorusGeometry(H * 0.40, H * 0.028, 6, 16, Math.PI * 0.95), gillMat);
            arc.position.set(L * (0.34 - i * 0.06), -H * 0.02, side * W * 0.92);
            arc.rotation.set(0.18 * side, side * Math.PI / 2, Math.PI * 0.12);
            arc.scale.set(1, 1.3, 1);
            g.add(arc);
          }
        }
      }

      // ---- 巨颚裂口（朱红裂口）：整颗头就是一张张开的嘴 ----
      // 一个前端开口的深红腔体 + 喉部亮斑 + 增厚的唇缘 + 两排内弯针牙。
      if (cfg.maw) {
        const m = cfg.maw;
        // 口腔做成一个向前的漏斗：前端开口大、往后收窄到喉咙。
        // 之前是一个整球 + 一圈厚唇环，正面看就是一块红圆盘，牙全被挡在后面。
        const frontX = L * 0.40;
        const cavMat = new THREE.MeshStandardMaterial({
          color: 0x1c0204, roughness: 0.86, side: THREE.DoubleSide,
          emissive: 0x5c0a08, emissiveIntensity: 0.22
        });
        const cavLen = L * 0.30;
        const cav = new THREE.Mesh(
          new THREE.CylinderGeometry(H * 0.50, H * 0.17, cavLen, 22, 1, true), cavMat
        );
        cav.rotation.z = -Math.PI / 2;                 // 圆柱轴向 → +X
        cav.position.set(frontX - cavLen / 2, 0, 0);
        cav.castShadow = true;
        g.add(cav);

        // 喉部：深处一团发亮的红，是整张嘴唯一的高光
        const throatMat = new THREE.MeshBasicMaterial({
          color: m.glow, transparent: true, opacity: 0.85,
          blending: THREE.AdditiveBlending, depthWrite: false
        });
        const throat = new THREE.Mesh(new THREE.SphereGeometry(H * 0.27, 12, 10), throatMat);
        throat.position.set(frontX - cavLen * 0.46, -H * 0.01, 0);
        g.add(throat);
        this.mawGlow = throat;

        // 唇缘：细一圈的软唇，只勾边不挡洞
        const lipMat = new THREE.MeshStandardMaterial({
          color: m.color, roughness: 0.55, metalness: 0.05,
          emissive: m.color, emissiveIntensity: 0.22
        });
        const lip = new THREE.Mesh(new THREE.TorusGeometry(H * 0.505, H * 0.050, 8, 26), lipMat);
        lip.rotation.y = Math.PI / 2;
        lip.position.set(frontX, 0, 0);
        g.add(lip);

        // 针牙：沿唇缘一圈，牙尖朝口腔内侧倒钩；牙根在唇上，所以正面能看见一圈白刺
        const needleMat = new THREE.MeshStandardMaterial({ color: 0xf4ecdc, roughness: 0.30 });
        const up = new THREE.Vector3(0, 1, 0);
        const dir = new THREE.Vector3();
        const q = new THREE.Quaternion();
        const tGeo = new THREE.ConeGeometry(H * 0.023, H * 0.26, 4);
        tGeo.translate(0, H * 0.13, 0);
        for (let i = 0; i < m.teeth; i++) {
          const a = (i / m.teeth) * TAU + 0.12;
          const ry = Math.sin(a) * H * 0.47;
          const rz = Math.cos(a) * H * 0.47;
          const tooth = new THREE.Mesh(tGeo, needleMat);
          // 牙根落在唇缘外面一点，牙尖朝圆心：正面看就是一圈向内的白刺
          tooth.position.set(frontX + H * 0.055, ry, rz);
          dir.set(0.06, -ry, -rz).normalize();
          q.setFromUnitVectors(up, dir);
          tooth.quaternion.copy(q);
          g.add(tooth);
        }
      }

      // ---- 鱼群（逆光之群）：一条鱼咬钩，但整群都跟着上来了 ----
      // 只钓上来一条，模型却是一小群 —— 这就是「鱼群咬钩」的观感来源。
      if (cfg.school && cfg.school > 1) {
        const mates = [];
        const mateMat = bodyMat.clone();
        for (let i = 1; i < cfg.school; i++) {
          const a = (i / (cfg.school - 1)) * TAU;
          const r = L * (0.9 + (i % 3) * 0.5);
          const mate = new THREE.Mesh(new THREE.SphereGeometry(H * 0.62, 8, 6), mateMat);
          mate.scale.set(2.2, 1.0, 0.7);
          mate.position.set(Math.cos(a) * r - L * 0.7, Math.sin(a * 1.7) * H * 0.9, Math.sin(a) * r * 0.8);
          mate.rotation.y = a * 0.4;
          g.add(mate);
          mates.push({ mesh: mate, a, r, ph: i * 1.37 });
        }
        this.schoolMates = mates;
      }

      // ---- 气泡（烈日蝠影：焦热的水会冒泡） ----
      if (cfg.bubbles) {
        const bubTex = (() => {
          const c = document.createElement('canvas');
          c.width = c.height = 32;
          const cx = c.getContext('2d');
          const gr = cx.createRadialGradient(16, 16, 2, 16, 16, 15);
          gr.addColorStop(0, 'rgba(255,255,255,0.95)');
          gr.addColorStop(0.55, 'rgba(255,220,190,0.30)');
          gr.addColorStop(1, 'rgba(255,180,140,0)');
          cx.fillStyle = gr;
          cx.beginPath(); cx.arc(16, 16, 15, 0, Math.PI * 2); cx.fill();
          const t = new THREE.CanvasTexture(c);
          t.needsUpdate = true;
          return t;
        })();
        const bubs = [];
        for (let i = 0; i < 10; i++) {
          const sp = new THREE.Sprite(new THREE.SpriteMaterial({
            map: bubTex, transparent: true, opacity: 0.55,
            blending: THREE.AdditiveBlending, depthWrite: false
          }));
          const s = H * (0.6 + Math.random() * 0.8);
          sp.scale.set(s, s, 1);
          sp.position.set((Math.random() - 0.5) * L * 1.4, (Math.random() - 0.5) * H * 1.6, (Math.random() - 0.5) * W * 2.4);
          g.add(sp);
          bubs.push({ sp, y0: sp.position.y, v: 0.35 + Math.random() * 0.5, ph: Math.random() * 6.28 });
        }
        this.bubbles = bubs;
      }

      this.len = L;
      this.hgt = H;
    }

    // 游动动画：摆尾 + 胸鳍 + 整体轻微起伏
    animate(dt, speed) {
      this.t += dt * (speed || 1);
      const wag = Math.sin(this.t * 7) * 0.55;
      if (this.tail) this.tail.rotation.y = wag;
      if (this.pecL) this.pecL.rotation.z = -0.18 + Math.sin(this.t * 5.5) * 0.30;
      if (this.pecR) this.pecR.rotation.z = 0.18 - Math.sin(this.t * 5.5) * 0.30;
      if (this.wing) this.wing.rotation.x = -Math.PI / 2 + Math.sin(this.t * 2.6) * 0.30;
      if (this.body) {
        // 身体中段随摆尾轻微侧扭
        this.body.rotation.y = Math.sin(this.t * 7 + 0.7) * 0.06;
      }
      if (this.orbiters) {
        const r = this.orbitR || 0.2;
        this.orbiters.forEach((o, i) => {
          o.a += dt * (1.2 + i * 0.05);
          o.mesh.position.set(
            Math.cos(o.a) * r * 0.5,
            Math.sin(o.a * 1.7) * 0.06 + o.yb * 0.5,
            Math.sin(o.a) * r
          );
        });
      }
      if (this.gears) {
        this.gears.forEach((gr, i) => { gr.rotation.z += dt * (i % 2 ? -1.6 : 2.2); });
      }
      if (this.glowRing) this.glowRing.rotation.x += dt * 0.8;
      // 蝠翼：以 30° 上反角为基准上下扇（两侧反相，看起来才像在拍）
      if (this.batWings) {
        this.batWings.forEach((w) => {
          w.grp.rotation.x = -w.sd * (0.52 + Math.sin(this.t * 3.4) * 0.34);
        });
      }
      // 鱼群：每条小鱼绕主体做小幅散聚，看起来像一整群在动
      if (this.schoolMates) {
        this.schoolMates.forEach((m) => {
          const k = 0.86 + Math.sin(this.t * 1.7 + m.ph) * 0.14;
          m.mesh.position.set(
            Math.cos(m.a + this.t * 0.25) * m.r * k - this.len * 0.7,
            Math.sin(m.a * 1.7 + this.t * 1.1) * (this.hgt || 0.1) * 0.9,
            Math.sin(m.a + this.t * 0.25) * m.r * 0.8 * k
          );
          m.mesh.rotation.y = m.a + this.t * 0.25;
        });
      }
      // 气泡：慢慢上浮，到顶就回到底部
      if (this.bubbles) {
        const top = (this.hgt || 0.3) * 0.9;
        this.bubbles.forEach((b) => {
          b.sp.position.y += b.v * dt;
          if (b.sp.position.y > top) b.sp.position.y = -top;
          b.sp.material.opacity = 0.30 + Math.sin(this.t * 2 + b.ph) * 0.16;
        });
      }
      // 桨鳍：四只错相位划水，像真的在「飞」而不是摆着不动
      if (this.paddles) {
        this.paddles.forEach((p, i) => {
          const ph = this.t * 3.6 + i * 1.9;
          p.rotation.x = Math.sin(ph) * 0.30;
        });
      }
      // 后肢：慢半拍地蹬水（基准角存在 base 里，不然每帧都会被拍平）
      if (this.legs) {
        this.legs.forEach((lg, i) => {
          if (lg && lg.g) lg.g.rotation.z = lg.base + Math.sin(this.t * 3.4 + i * Math.PI) * 0.16;
        });
      }
      if (this.arms) {
        this.arms.forEach((a, i) => { a.rotation.z = 1.15 + Math.sin(this.t * 2.1 + i * 1.7) * 0.07; });
      }
      // 裂口：喉部像呼吸一样一明一暗
      if (this.mawGlow) {
        this.mawGlow.material.opacity = 0.58 + Math.sin(this.t * 3.1) * 0.28;
        this.mawGlow.scale.setScalar(1 + Math.sin(this.t * 3.1) * 0.06);
      }
      // 大颚：每隔几秒张合一次
      if (this.jaw) {
        const jb = this.jawBase != null ? this.jawBase : -0.10;
        this.jaw.rotation.z = jb - (Math.sin(this.t * 0.9) * 0.5 + 0.5) * 0.11;
      }
    }

    // 上钩翻滚
    tumble(dt) {
      this.t += dt;
      if (this.tail) this.tail.rotation.y = Math.sin(this.t * 18) * 0.9;
      this.group.rotation.z += dt * 5;
    }

    dispose() {
      this.group.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) {
          if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
          else o.material.dispose();
        }
      });
    }
  }

  const TAU = Math.PI * 2;

  // 所有鱼的花纹贴图提前烘出来。每张 192×96 是一条几毫秒的逐像素循环，
  // 不预热的话"第一次钓到某个鱼种"会现场生成 canvas 纹理，卡一下。
  window.FishWarm = function () {
    const names = Object.keys(FISH_TYPES);
    for (let i = 0; i < names.length; i++) {
      const cfg = FISH_TYPES[names[i]];
      if (!cfg) continue;
      try { makeFishTex(cfg, names[i]); } catch (e) { /* ignore */ }
    }
  };

  window.FishModel = FishModel;
  window.FISH_TYPES = FISH_TYPES;
  window.FISH_GRADES = GRADES;
  window.fishGradeOf = (name) => {
    const t = FISH_TYPES[name];
    return t ? (t.grade || 0) : 0;
  };
})();
