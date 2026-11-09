# -*- coding: utf-8 -*-
"""把 FPS 的对战结构拆掉：删敌人 / 删申请对战 / 战绩改钓鱼口径。"""
import io, os, re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
P = os.path.join(ROOT, 'js', 'game.js')
s = io.open(P, encoding='utf-8').read()


def drop_method(src, name):
    m = re.search(r'\n(\s+)' + name + r'\(([^)]*)\) \{', src)
    assert m, '找不到方法 ' + name
    i = m.start() + 1
    j = src.index('{', m.end() - 1)
    depth = 0
    k = j
    while k < len(src):
        if src[k] == '{':
            depth += 1
        elif src[k] == '}':
            depth -= 1
            if depth == 0:
                k += 1
                break
        k += 1
    while k < len(src) and src[k] in '\r\n':
        k += 1
    return src[:i] + src[k:]


R = []

# ---------------- 构造函数 ----------------
R.append(("""    constructor() {
      this.canvas = document.getElementById('game');""",
          """    constructor() {
      // 老存档里可能还留着已经删掉的枪（左轮/冲锋枪/双管/精确射手/轻机枪/反器材），
      // 这里先清一遍再读 loadout，否则背包槽位会指到不存在的枪上。
      if (window.Economy && window.Economy.sanitize) window.Economy.sanitize();
      this.canvas = document.getElementById('game');"""))

R.append(("""      this.camera.add(this.viewLight);
      this.enemy = new window.Enemy(this.scene, this.world);

      this.fishing = new window.Fishing""",
          """      this.camera.add(this.viewLight);
      // 敌人已经整体移除（这一版正式改成钓鱼游戏），场景里只剩玩家、鱼和鸟。

      this.fishing = new window.Fishing"""))

R.append(("""      this.score = 0;
      this.kills = 0;
      // 湖中养鱼的每秒结算状态
      this.pondSaveT = 0;
      this.pondCount = 0;
      this.pondRate = 0;
      this.catches = 0;
      this.headshots = 0;
      this.enemyRespawn = 0;
      this.playerRespawn = 0;""",
          """      this.score = 0;
      // 湖中养鱼的每秒结算状态
      this.pondSaveT = 0;
      this.pondCount = 0;
      this.pondRate = 0;
      this.catches = 0;
      this.playerRespawn = 0;"""))

R.append(("""      this.duel = false;
      this.loadout = ['rifle'];
      // 武器槽从存档恢复，不再每次进游戏都回到只有步枪
      this.loadoutSel = (window.Economy && window.Economy.loadout && window.Economy.loadout.length)
        ? window.Economy.loadout.slice(0, 2) : ['rifle'];""",
          """      this.loadout = ['pistol'];
      // 武器槽从存档恢复；开局只有手枪，其余枪要在武器商店重新买
      this.loadoutSel = (window.Economy && window.Economy.loadout && window.Economy.loadout.length)
        ? window.Economy.loadout.slice(0, 2) : ['pistol'];
      // 换更高一档鱼竿 → 枪械全部作废（economy 里重置），这里负责弹提示
      if (window.Economy) {
        window.Economy.onGunsReset = (tier) => {
          this.loadout = ['pistol'];
          this.loadoutSel = ['pistol'];
          this.player.setLoadout(['pistol']);
          const rod = window.RODS && window.RODS[window.Economy.rod];
          this.notice('换上了' + (rod ? rod.name : '新鱼竿') + '：所有枪械已重新收回，只留随身手枪', 'warn');
        };
      }"""))

R.append(("""      this.damageFlashT = 0;
      this.enemyStepT = 0;
      this.heartCd = 0;""",
          """      this.damageFlashT = 0;
      this.heartCd = 0;"""))

R.append(("""        enemyTag: document.getElementById('enemyTag'),
""", ""))
# ---------------- 申请对战 ----------------
R.append(("""    // 申请对战：和平钓鱼 → 枪战模式
    requestDuel() {
      if (this.duel || this.state !== 'playing') return;
      this.duel = true;
      this.enemy.docile = false;
      this.notice('对战开始！击倒对手 +100 分', 'good');
      Sound.play('bite');
    }

""", ""))

R.append(("""      const d = this.nearestDropped(3.0);
      if (d) {
        this.pickupDropped(d);
        return;
      }
      this.requestDuel();
    }""",
          """      const d = this.nearestDropped(3.0);
      if (d) {
        this.pickupDropped(d);
        return;
      }
    }"""))

# ---------------- 开局重置 ----------------
R.append(("""      this.player.reset();
      if (this.world.resetBoat) this.world.resetBoat();
      this.enemy.reset();
      this.fishing.reset();""",
          """      this.player.reset();
      if (this.world.resetBoat) this.world.resetBoat();
      this.fishing.reset();"""))

R.append(("""      this.score = 0;
      this.kills = 0;
      this.catches = 0;
      this.headshots = 0;
      this.enemyRespawn = 0;
      this.playerRespawn = 0;""",
          """      this.score = 0;
      this.catches = 0;
      this.playerRespawn = 0;"""))

R.append(("""      this.ui.damageDir.classList.remove('on');
      // 默认和平钓鱼，按 F 申请对战
      this.duel = false;
      this.enemy.docile = true;
      this.overlaySource = null;""",
          """      this.ui.damageDir.classList.remove('on');
      this.overlaySource = null;"""))

R.append(("""      this.notice('和平钓鱼中 · 按 3 取出鱼竿 · 长按左键蓄力抛竿 · 按 F 申请对战', 'info');""",
          """      this.notice('自由垂钓中 · 按 3 取出鱼竿 · 长按左键蓄力抛竿 · 按 1/2 切枪打鸟打鱼', 'info');"""))

R.append(("""        if (this.loadout.length === 0) this.loadout = ['rifle'];""",
          """        if (this.loadout.length === 0) this.loadout = ['pistol'];"""))

# ---------------- 主循环 ----------------
R.append(("""        if (this.state === 'playing') {
          this.update(dt);
          this.updatePondIncome(dt);
        } else if (this.state === 'over') {
          this.enemy.update(dt, this.player, this.elapsed, null);
        }""",
          """        if (this.state === 'playing') {
          this.update(dt);
          this.updatePondIncome(dt);
        }"""))

R.append(("""      // 敌人脚步：8m 内能听见，靠左右声道判断他从哪边来
      if (this.enemy.alive && this.state === 'playing') {
        const esp = Math.hypot(this.enemy.velocity.x, this.enemy.velocity.z);
        const ed = this.enemy.pos.distanceTo(this.player.pos);
        if (esp > 0.8 && ed < 13) {
          this.enemyStepT -= dtRaw * (0.5 + esp * 0.5);
          if (this.enemyStepT <= 0) {
            this.enemyStepT = 0.52;
            Sound.playAt('step_enemy', this.enemy.pos, { vol: 0.9, falloff: 0.2, maxDist: 14 });
          }
        } else {
          this.enemyStepT = 0;
        }
      }
      this.player.setAim(this.input.aim && this.locked && !this.fishing.busy && !this.input.sprint);
      this.peaceTipCd = Math.max(0, this.peaceTipCd - dt);
      this.player.update(dt, this.input, this.locked);""",
          """      this.player.setAim(this.input.aim && this.locked && !this.fishing.busy && !this.input.sprint);
      this.player.update(dt, this.input, this.locked);"""))

R.append(("""      // 钓鱼时敌方不会开火
      this.enemy.update(dt, this.player, this.elapsed,
        (this.fishing.busy || this.sleeping || this.sitting) ? null : (data) => this.handleEnemyShot(data));

      // 敌人重生
      if (!this.enemy.alive) {
        this.enemyRespawn -= dt;
        if (this.enemyRespawn <= 0) this.respawnEnemy();
      }

      // 玩家重生""",
          """      // 玩家重生"""))

R.append(("""      // 低血量心跳与呼吸感
      if (this.player.alive && this.player.health < 32) {""",
          """      // 体力见底：心跳与呼吸感（原来挂在血量上，现在没有敌人了，改成体力）
      if (this.player.alive && this.player.stamina < 30) {"""))

# ---------------- traceShot：删敌人命中段 ----------------
R.append(("""    // 单条射线的完整判定（敌人 / 鸟鱼 / 世界），霰弹会调用多次""",
          """    // 单条射线的完整判定（鸟鱼 / 世界），霰弹会调用多次"""))

R.append(("""      // 命中敌人
      let enemyT = Infinity;
      let headshot = false;
      if (this.enemy.alive) {
        const bodyT = raySphere(origin, dir, this.enemy.pos.x, 1.0, this.enemy.pos.z, 0.52);
        const legT = raySphere(origin, dir, this.enemy.pos.x, 0.5, this.enemy.pos.z, 0.4);
        const headT = raySphere(origin, dir, this.enemy.pos.x, 1.62, this.enemy.pos.z, 0.29);
        if (bodyT !== null) enemyT = bodyT;
        if (legT !== null && legT < enemyT) enemyT = legT;
        if (headT !== null && headT < enemyT) {
          enemyT = headT;
          headshot = true;
        }
      }

      if (enemyT < worldT) {
        const point = origin.clone().addScaledVector(dir, enemyT);
        if (pelletIdx < 3) window.FX.tracer(muzzle, point);
        window.FX.sparks(point, headshot ? 0xffd166 : 0xff7a5a, headshot ? 16 : 10);
        window.FX.hitRing(point, headshot ? 0xffd166 : 0xff6a5a);
        // 血雾朝子弹前进方向喷出，爆头更浓
        window.FX.bloodMist(point, dir, headshot ? 13 : 7);
        // 命中音分层：爆头加一声金属脆响，普通命中是闷响
        if (!pelletIdx) Sound.play('hit_flesh');
        if (headshot) {
          Sound.play('hit_metal');
          Sound.play('headshot');
        }
        this.showHitmarker(headshot ? 'hs' : null);
        this.hitConfirm = 0.16;

        if (!this.duel) {
          // 和平模式：打人不掉血
          if (this.peaceTipCd <= 0) {
            this.peaceTipCd = 3;
            this.notice('和平模式 · 对手不掉血，按 F 申请对战', 'warn');
          }
          return;
        }

        const damage = (headshot ? this.player.gun.head : this.player.gun.body) * this.charDmgMul();
        const died = this.enemy.takeDamage(damage);
        if (headshot) this.headshots += 1;
        this.damageFlashT = 0.5;

        if (died) {
          this.onKill(point, headshot);
        }
        return;
      }

      // 命中海鸟 / 塘鱼""",
          """      // 命中海鸟 / 塘鱼"""))

# ---------------- 近战改成打身边的鸟鱼 ----------------
R.append(("""    // 近战出拳判定：距离 + 朝向
    handleMelee(shot) {
      Sound.play('punch');
      if (!this.enemy.alive) return;
      const toEnemy = this.enemy.pos.clone().sub(this.player.pos);
      toEnemy.y = 0;
      const dist = toEnemy.length();
      if (dist > shot.range) return;
      toEnemy.normalize();
      const facing = shot.dir.x * toEnemy.x + shot.dir.z * toEnemy.z;
      if (facing < 0.4) return;

      const hitPoint = this.enemy.pos.clone().add(new THREE.Vector3(0, 1.2, 0));
      window.FX.sparks(hitPoint, 0xffd08a, 12);
      window.FX.hitRing(hitPoint, 0xff9e3d);
      Sound.play('hit');
      this.showHitmarker();

      if (!this.duel) {
        // 和平模式：打人不掉血
        if (this.peaceTipCd <= 0) {
          this.peaceTipCd = 3;
          this.notice('和平模式 · 对手不掉血，按 F 申请对战', 'warn');
        }
        return;
      }

      const died = this.enemy.takeDamage(shot.damage * this.charDmgMul());
      if (died) {
        this.onKill(hitPoint, false);
      }
    }

""",
          """    // 近战：没有敌人了，拳头改成「拍身边的水鸟/岸边的鱼」——
    // 举枪打飞鸟是主玩法，近身那一下留个土办法，别让 4 号槽变成纯摆设。
    handleMelee(shot) {
      Sound.play('punch');
      const prey = this.hitPrey(shot.origin, shot.dir, shot.range);
      if (!prey) {
        // 空挥：给一点轻微的空气感，不震屏
        Sound.play('whiff');
        return;
      }
      const point = shot.origin.clone().addScaledVector(shot.dir, prey.t);
      window.FX.sparks(point, 0xffd08a, 10);
      window.FX.hitRing(point, 0xff9e3d);
      Sound.play('hit');
      this.showHitmarker();
      prey.kill();
      this.score += prey.points;
      if (window.Economy) window.Economy.addScore(prey.points);
      this.notice(prey.label + ' +' + prey.points + ' 分', 'good');
    }

"""))

# ---------------- 结算 ----------------
R.append(("""      this.syncAmmo();
      if (window.Economy) {
        window.Economy.recordRound({
          score: this.score, kills: this.kills, catches: this.catches, headshots: this.headshots
        });
      }""",
          """      this.syncAmmo();
      if (window.Economy) {
        window.Economy.recordRound({ score: this.score, catches: this.catches });
      }"""))

R.append(("""      this.ui.endText.textContent =
        '击倒对手 ' + this.kills + ' 次（+' + this.kills * 100 + '）· 钓获 ' + this.catches + ' 条（+' +
        (this.score - this.kills * 100) + '）· 爆头 ' + this.headshots + ' 次 · 积分余额 ' +
        (window.Economy ? window.Economy.balance : this.score);""",
          """      const pond = this.world.pondStat ? this.world.pondStat() : { n: 0, rate: 0 };
      this.ui.endText.textContent =
        '本局钓获 ' + this.catches + ' 条 · 得分 ' + this.score + ' · 湖中养鱼 ' + pond.n +
        ' 条（每秒 +' + pond.rate.toFixed(1) + '）· 积分余额 ' +
        (window.Economy ? window.Economy.balance : this.score);"""))

# ---------------- HUD ----------------
R.append(("""      const hpRatio = Math.max(0, p.health / p.maxHealth);      this.ui.hpFill.style.width = hpRatio * 100 + '%';
      this.ui.hpFill.classList.toggle('low', hpRatio < 0.35);
      this.ui.hpNum.textContent = Math.ceil(p.health);""",
          """      // HUD 左下角的血条改成体力条：冲刺和游泳消耗，站着回，见底就跑不动
      const stRatio = Math.max(0, p.stamina / p.maxStamina);
      this.ui.hpFill.style.width = stRatio * 100 + '%';
      this.ui.hpFill.classList.toggle('low', stRatio < 0.3);
      this.ui.hpNum.textContent = Math.ceil(p.stamina);"""))

R.append(("""      this.ui.modeTag.textContent = this.duel ? '对战中' : '和平钓鱼';
      this.ui.modeTag.classList.toggle('duel', this.duel);""",
          """      // 原来这里显示「对战中 / 和平钓鱼」，对局删掉后改成当前钓季：
      // 换到更高一档鱼竿就是新的一季，枪械得重新买。
      const rodNow = window.RODS && window.Economy && window.RODS[window.Economy.rod];
      this.ui.modeTag.textContent = rodNow ? (rodNow.name + ' · 第 ' + (rodNow.tier + 1) + ' 季') : '自由垂钓';
      this.ui.modeTag.classList.remove('duel');"""))

R.append(("""      this.ui.hud.classList.toggle('lowhp', p.alive && p.health / p.maxHealth < 0.32);

      // 不显示敌人位置与距离：靠枪声、脚步和弹道判断方位
      if (this.ui.enemyTag) this.ui.enemyTag.classList.add('hidden');
""",
          """      this.ui.hud.classList.toggle('lowhp', p.alive && p.stamina / p.maxStamina < 0.2);
"""))

# ---------------- 战绩面板 ----------------
R.append(("""      const rows = [
        ['对局数', s.games],
        ['总击杀', s.kills],
        ['爆头数', s.headshots],
        ['总钓获', s.catches + ' 条'],
        ['历史总分', s.totalScore],
        ['单局最高', s.best]
      ];""",
          """      const eco = window.Economy;
      const pond = eco.pondStat ? eco.pondStat() : { n: 0, rate: 0 };
      const rows = [
        ['对局数', s.games],
        ['总钓获', s.catches + ' 条'],
        ['图鉴收集', (eco.codexCount ? eco.codexCount() : 0) + ' / ' + (eco.codexTotal ? eco.codexTotal() : 0)],
        ['湖中养鱼', pond.n + ' 条'],
        ['养鱼产出', '+' + pond.rate.toFixed(1) + '/秒'],
        ['历史总分', s.totalScore],
        ['单局最高', s.best]
      ];"""))

# ---------------- 开火手感表 ----------------
R.append(("""      const POWER = { sniper: 1.7, amr: 2.1, railgun: 2.0, shotgun: 1.5, db: 1.6, lmg: 1.2, minigun: 0.8, pistol: 0.8, revolver: 1.1, dmr: 1.2 };""",
          """      const POWER = { sniper: 1.7, railgun: 2.0, shotgun: 1.5, rifle: 1.1, minigun: 0.8, pistol: 0.8 };"""))

R.append(("""        const bigShell = gunId === 'sniper' || gunId === 'amr' || gunId === 'shotgun' || gunId === 'db';""",
          """        const bigShell = gunId === 'sniper' || gunId === 'shotgun';"""))

R.append(("""        window.FX.shell(eject, right, up, fwd, { big: bigShell, steel: gunId === 'smg' || gunId === 'minigun' });""",
          """        window.FX.shell(eject, right, up, fwd, { big: bigShell, steel: gunId === 'minigun' });"""))

# ---------------- 图标配色表 ----------------
R.append(("""        rifle: '#ff8a3d', smg: '#56e0ff', sniper: '#b78cff',
        shotgun: '#ffd166', lmg: '#9be15d', fist: '#d9a679',""",
          """        rifle: '#ff8a3d', sniper: '#b78cff',
        shotgun: '#ffd166', minigun: '#ff9a6a', railgun: '#8affff', fist: '#d9a679',"""))

for a, b in R:
    assert s.count(a) == 1, ('MISS', a[:60], s.count(a))
    s = s.replace(a, b)

for name in ('respawnEnemy', 'handleEnemyShot', 'onKill'):
    s = drop_method(s, name)

io.open(P, 'w', encoding='utf-8').write(s)
print('OK game.js', len(s))
