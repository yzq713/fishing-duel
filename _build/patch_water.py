# -*- coding: utf-8 -*-
"""把湖水着色器换成卡通手绘风格（参考 Fab「Polystuff Park」的水面）"""
import io

P = 'js/world.js'
s = io.open(P, encoding='utf-8').read()

START = '    const waterMat = new THREE.ShaderMaterial({'
END = '    root.add(water);\n'

i = s.index(START)
j = s.index(END, i) + len(END)

NEW = '''    // 湖水：卡通手绘风格（亮青蓝平涂 + 白沫色块 + 涟漪）
    // 参考 Fab「Polystuff Park」的水面：不靠反射，靠"大片平涂的青色 + 边缘
    // 清晰的浅色水片和白沫"。做法是把两层低频噪声叠起来，再用较窄的阈值切一刀
    // ——噪声是连续的，切完就变成一块块边界明确、形状不规则的色斑，正是手绘的味。
    const waterMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      uniforms: Object.assign({
        time: { value: 0 },
        sunDir: { value: new THREE.Vector3(24, 34, 18).normalize() },
        sunColor: { value: new THREE.Color(0xfff0d4) },
        waterColor: { value: new THREE.Color(0x2f96c4) },   // 湖心深色
        waterColor2: { value: new THREE.Color(0x8ad6ef) },  // 近岸浅色
        skyColor: { value: new THREE.Color(0xc4e8f4) },     // 天光
        foamColor: { value: new THREE.Color(0xf2fbfe) },    // 白沫
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
        'float fbm(vec2 p){ float v=0.0, a=0.5; for(int i=0;i<4;i++){ v+=a*noise(p); p=p*2.07+5.3; a*=0.5; } return v; }',
        // 与 JS 端 pondRadiusAt 完全一致，用来算离岸距离
        'float pondRAt(float a){ return pondR * (1.0 + 0.26*sin(a*2.0+0.7) + 0.17*sin(a*3.0+2.1) + 0.09*cos(a*5.0+1.3)); }',
        // 大尺度风浪
        'float wave(vec2 p){',
        '  return sin(p.x*2.0 + time*1.6)*0.5 + sin(p.y*2.6 - time*1.2)*0.4',
        '       + sin((p.x+p.y)*1.3 + time*2.1)*0.25;',
        '}',
        // 涟漪高度（多个扩散波包叠加）
        'float rippleH(vec2 p){',
        '  float hR = 0.0;',
        ripCode,
        '  return hR;',
        '}',
        'void main(){',
        '  vec2 p = vWorld.xz;',
        // 涟漪频率高，梯度要用更细的采样间距，否则细纹会被采没了
        '  float h0 = wave(p) + rippleH(p) * 0.055;',
        '  float hx = wave(p + vec2(0.13, 0.0)) + rippleH(p + vec2(0.035, 0.0)) * 0.055;',
        '  float hz = wave(p + vec2(0.0, 0.13)) + rippleH(p + vec2(0.0, 0.035)) * 0.055;',
        '  vec3 n = normalize(vec3(-(hx-h0)*1.35, 1.0, -(hz-h0)*1.35));',
        '  vec3 view = normalize(cameraPosition - vWorld);',
        // 离岸距离（>0 表示在水里）：近岸浅、湖心深
        '  float ang = atan(p.y, p.x);',
        '  float shoreD = pondRAt(ang) - length(p);',
        '  float deepF = smoothstep(0.0, 8.5, shoreD);',
        // 手绘色块：两层低频噪声叠加后做窄带阈值切分，切出硬边的色斑
        '  float nA = fbm(p * 0.33 + vec2(time * 0.020, -time * 0.015));',
        '  float nB = fbm(p * 0.95 - vec2(time * 0.030, time * 0.022));',
        '  float painted = nA * 0.66 + nB * 0.34;',
        '  float lightPat = smoothstep(0.44, 0.56, painted);',
        '  float foamPat = smoothstep(0.575, 0.635, painted);',
        // 贴岸一圈白沫
        '  float shoreFoam = smoothstep(1.6, 0.10, shoreD);',
        // 鱼游动激起的涟漪峰顶也算白沫
        '  float crest = clamp(rippleH(p) * 5.5, 0.0, 1.0);',
        '  vec3 col = mix(waterColor2, waterColor, deepF);',
        '  col = mix(col, waterColor2 * 1.08, lightPat * 0.5);',
        '  col = mix(col, skyColor, pow(1.0 - clamp(dot(view, n), 0.0, 1.0), 3.0) * 0.30);',
        '  vec3 hv = normalize(view + normalize(sunDir));',
        '  col += sunColor * pow(max(dot(n, hv), 0.0), 90.0) * 0.5;',
        '  float foam = clamp(foamPat * 0.80 + shoreFoam * 0.85 + crest * 0.75, 0.0, 1.0);',
        '  col = mix(col, foamColor, foam);',
        // 近岸透一点（能看到岸边鱼影），湖心接近不透明
        '  float alpha = mix(0.74, 0.92, deepF);',
        '  alpha = max(alpha, foam * 0.98);',
        '  gl_FragColor = vec4(col, alpha);',
        '}'
      ].join('\\n')
    });
    const water = new THREE.Mesh(new THREE.ShapeGeometry(new THREE.Shape(pondPoints(1.0))), waterMat);
    water.rotation.x = -Math.PI / 2;
    water.position.y = POND_TOP;
    water.renderOrder = 2;
    root.add(water);
'''

s = s[:i] + NEW + s[j:]
io.open(P, 'w', encoding='utf-8', newline='').write(s)
print('water shader replaced')
