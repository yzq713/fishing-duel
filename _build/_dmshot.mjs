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
// 站在岸边，抬头看天，让蝠群进画面
await p.evaluate(()=>{
  const g=window.game; g.state='playing';
  g.hour=10; g.wasNight=false; g.setDaymare(true); g.batMax=30; g.batN=30;
  if(g.world.setBatCount) g.world.setBatCount(30);
  g.player.noGravity=true; g.player.pos.set(26,3.2,30);
  g.player.yaw=Math.atan2(-26,-30); g.player.pitch=0.28;
});
await p.waitForFunction('window.game.world.getDayMix() > 0.9',{timeout:25000, polling:200});
await new Promise(r=>setTimeout(r,1200));
await p.screenshot({path:OUT+'daymare_sky.png'});
const info = await p.evaluate(()=>{
  const g=window.game; const cam=g.camera; cam.updateMatrixWorld(true);
  let onScreen=0; const pts=[];
  for(let i=0;i<window.game.world.getBatCount();i++){
    const b=g.world.__bats? g.world.__bats[i]:null;
  }
  // 直接从场景里找 InstancedMesh 反推屏幕位置
  const inst=[]; g.scene.traverse(o=>{ if(o.isInstancedMesh && o.name.indexOf('daymareBat')===0) inst.push(o); });
  const v=new THREE.Vector3();
  if(inst[0]){ for(let i=0;i<inst[0].count;i++){ const m=new THREE.Matrix4(); inst[0].getMatrixAt(i,m);
    v.setFromMatrixPosition(m).project(cam); if(Math.abs(v.x)<1&&Math.abs(v.y)<1&&v.z<1) onScreen++;
    if(i<3) pts.push([+v.x.toFixed(2),+v.y.toFixed(2),+v.z.toFixed(2)]); } }
  let camPos=[0,0,0]; cam.getWorldPosition(v); camPos=[+v.x.toFixed(0),+v.y.toFixed(0),+v.z.toFixed(0)];
  return {mix:+g.world.getDayMix().toFixed(2), bats:g.world.getBatCount(), sun:+g.world.isSunUp(),
    instCount: inst.length, firstCount: inst[0]? inst[0].count : -1, onScreen, pts, camPos};
});
console.log(JSON.stringify(info),'errs',errs.length,errs[0]||'');
await b.close();
