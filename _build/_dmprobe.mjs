import puppeteer from 'puppeteer-core';
const OUT='D:/下载/fishprobe/';
const b = await puppeteer.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: 'new', args: ['--no-sandbox','--use-angle=d3d11','--enable-unsafe-swiftshader','--allow-file-access-from-files','--window-size=1280,760'] });
const p = await b.newPage();
await p.setViewport({ width: 1280, height: 760, deviceScaleFactor: 1.5 });
const errs=[]; p.on('pageerror',e=>errs.push(String(e).slice(0,240)));
await p.goto('file:///C:/Users/ASUS/Documents/Trae-CN/temp_20261108_01/fishing-duel/index.html?v='+Date.now(),{waitUntil:'load',timeout:120000});
await p.waitForFunction('window.game && window.game.world',{timeout:90000});
await new Promise(r=>setTimeout(r,2400));
await p.evaluate(()=>document.getElementById('soloBtn').click());
await new Promise(r=>setTimeout(r,400));
await p.evaluate(()=>document.getElementById('charNextBtn').click());
await new Promise(r=>setTimeout(r,300));
await p.evaluate(()=>document.getElementById('fightBtn').click());
await new Promise(r=>setTimeout(r,2500));
const info = await p.evaluate(()=>{
  const g=window.game;
  g.state='playing'; g.hour=10; g.wasNight=false; g.setDaymare(true);
  g.batMax=30; g.batN=30; g.world.setBatCount(30);
  g.player.noGravity=true; g.player.pos.set(24,3.4,28);   // 岛心上方，蝠群绕着这里
  // 找蝙蝠 0 的世界坐标
  let body=null; g.scene.traverse(o=>{ if(o.isInstancedMesh&&o.name==='daymareBats') body=o; });
  const m=new THREE.Matrix4(); body.getMatrixAt(0,m);
  const v=new THREE.Vector3().setFromMatrixPosition(m);
  const cam=g.camera; cam.updateMatrixWorld(true);
  const cp=new THREE.Vector3(); cam.getWorldPosition(cp);
  const dx=v.x-cp.x, dy=v.y-cp.y, dz=v.z-cp.z;
  const dist=Math.hypot(dx,dy,dz);
  g.player.yaw = Math.atan2(-dx,-dz);
  g.player.pitch = Math.atan2(dy, Math.hypot(dx,dz));
  return {bat0:[+v.x.toFixed(1),+v.y.toFixed(1),+v.z.toFixed(1)], cam:[+cp.x.toFixed(1),+cp.y.toFixed(1),+cp.z.toFixed(1)],
    dist:+dist.toFixed(1), yaw:+g.player.yaw.toFixed(2), pitch:+g.player.pitch.toFixed(2)};
});
await p.waitForFunction('window.game.world.getDayMix() > 0.9',{timeout:25000, polling:200});
await new Promise(r=>setTimeout(r,1500));
// 再摆一次（蝠群在动）
const info2 = await p.evaluate(()=>{
  const g=window.game;
  let body=null; g.scene.traverse(o=>{ if(o.isInstancedMesh&&o.name==='daymareBats') body=o; });
  const m=new THREE.Matrix4(); body.getMatrixAt(0,m);
  const v=new THREE.Vector3().setFromMatrixPosition(m);
  const cam=g.camera; cam.updateMatrixWorld(true);
  const cp=new THREE.Vector3(); cam.getWorldPosition(cp);
  const dx=v.x-cp.x, dy=v.y-cp.y, dz=v.z-cp.z;
  g.player.yaw = Math.atan2(-dx,-dz);
  g.player.pitch = Math.max(-0.2, Math.min(0.9, Math.atan2(dy, Math.hypot(dx,dz)) * 0.55));
  const v2=v.clone().project(cam);
  return { bat0:[+v.x.toFixed(1),+v.y.toFixed(1),+v.z.toFixed(1)], ndc:[+v2.x.toFixed(2),+v2.y.toFixed(2),+v2.z.toFixed(3)] };
});
await new Promise(r=>setTimeout(r,600));
await p.screenshot({path:OUT+'daymare_bats.png'});
console.log(JSON.stringify({info,info2}),'errs',errs.length,errs[0]||'');
await b.close();
