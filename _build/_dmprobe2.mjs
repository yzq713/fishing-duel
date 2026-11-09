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
await p.evaluate(()=>{
  const g=window.game; g.state='playing'; g.hour=10; g.wasNight=false;
  g.setDaymare(true); g.batMax=30; g.batN=30; g.daymareT=420; g.world.setBatCount(30);
  g.player.noGravity=true;
  g.player.pos.set(30,1.2,34);
  g.player.yaw=Math.atan2(30,34); g.player.pitch=0.30;
});
await p.waitForFunction('window.game.world.getDayMix() > 0.9',{timeout:25000, polling:200});
await new Promise(r=>setTimeout(r,900));
const info = await p.evaluate(()=>{
  const g=window.game; const cam=g.camera; cam.updateMatrixWorld(true);
  const cp=new THREE.Vector3(); cam.getWorldPosition(cp);
  let body=null; g.scene.traverse(o=>{ if(o.isInstancedMesh&&o.name==='daymareBats') body=o; });
  const m=new THREE.Matrix4(); const v=new THREE.Vector3(); let on=0;
  for(let i=0;i<body.count;i++){ body.getMatrixAt(i,m); v.setFromMatrixPosition(m).project(cam);
    if(Math.abs(v.x)<1&&Math.abs(v.y)<1&&v.z<1) on++; }
  const dir=new THREE.Vector3(); cam.getWorldDirection(dir);
  return { cam:[+cp.x.toFixed(1),+cp.y.toFixed(1),+cp.z.toFixed(1)], dir:[+dir.x.toFixed(2),+dir.y.toFixed(2),+dir.z.toFixed(2)],
    batsOnScreen:on, count:body.count, visible:body.visible, yaw:+g.player.yaw.toFixed(2), pitch:+g.player.pitch.toFixed(2) };
});
await p.screenshot({path:OUT+'daymare_bats2.png'});
console.log(JSON.stringify(info),'errs',errs.length,errs[0]||'');
await b.close();
