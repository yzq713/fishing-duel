import puppeteer from 'puppeteer-core';
const NAMES = ['赤鳍影','夜魇石斑','血月鳗','绯红潮蛇','朱红裂口'];
const b = await puppeteer.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: 'new', args: ['--no-sandbox','--use-angle=d3d11','--enable-unsafe-swiftshader','--allow-file-access-from-files','--window-size=1200,800'] });
const p = await b.newPage();
await p.setViewport({ width: 1200, height: 800 });
const errs=[]; p.on('pageerror',e=>errs.push(String(e).slice(0,200)));
await p.goto('file:///C:/Users/ASUS/Documents/Trae-CN/temp_20261108_01/fishing-duel/index.html?v='+Date.now(),{waitUntil:'load',timeout:120000});
await p.waitForFunction('window.game && window.game.world',{timeout:90000});
await new Promise(r=>setTimeout(r,2400));
await p.evaluate(()=>document.getElementById('soloBtn').click());
await new Promise(r=>setTimeout(r,400));
await p.evaluate(()=>document.getElementById('charNextBtn').click());
await new Promise(r=>setTimeout(r,300));
await p.evaluate(()=>document.getElementById('fightBtn').click());
await new Promise(r=>setTimeout(r,2000));
await p.evaluate(()=>{const g=window.game;g.state='playing';g.player.noGravity=true;g.player.pos.set(0,30,0);g.player.yaw=0;g.player.pitch=0;g.scene.traverse(o=>{if(o.isMesh||o.isSprite||o.isPoints)o.visible=false;});g.scene.background=new THREE.Color(0x0b0407);g.scene.fog=null;
 g.scene.add(new THREE.HemisphereLight(0xffffff,0x111111,2));const dl=new THREE.DirectionalLight(0xffffff,2); dl.position.set(0,2,4); g.scene.add(dl);});
await new Promise(r=>setTimeout(r,500));
const rows=[];
for (const n of NAMES){
  const r = await p.evaluate((name)=>{
    const g=window.game;
    if(window._t) g.scene.remove(window._t.group);
    const cam=g.camera; cam.updateMatrixWorld(true);
    const dir=new THREE.Vector3(); cam.getWorldDirection(dir);
    const m=new window.FishModel(name);
    if(m.halo&&m.halo.parent) m.halo.parent.remove(m.halo);
    g.scene.add(m.group);
    m.group.traverse(o=>{if(o.isMesh||o.isSprite||o.isPoints)o.visible=true;});
    m.group.position.copy(cam.position.clone().addScaledVector(dir,3.0));
    m.group.updateMatrixWorld(true);
    const box=new THREE.Box3().setFromObject(m.group); const sz=new THREE.Vector3(); box.getSize(sz);
    const maxDim=Math.max(sz.x,sz.y,sz.z)||1;
    m.group.scale.setScalar(2.2/maxDim); m.group.updateMatrixWorld(true);
    window._t=m;
    // 主身体网格
    let body=null, bodyCount=0;
    m.group.traverse(o=>{ if(o.isMesh&&o.geometry&&o.geometry.type==='SphereGeometry'){bodyCount++; if(!body)body=o;} });
    const wp=new THREE.Vector3(); m.group.getWorldPosition(wp);
    const sp=wp.clone().project(cam);
    const bwp=new THREE.Vector3(); if(body) body.getWorldPosition(bwp);
    const bsp=bwp.clone().project(cam);
    return {name, group:[+sp.x.toFixed(2),+sp.y.toFixed(2),+sp.z.toFixed(3)],
      body: body? [+bsp.x.toFixed(2),+bsp.y.toFixed(2),+bsp.z.toFixed(3)] : null,
      sizes:[+sz.x.toFixed(2),+sz.y.toFixed(2),+sz.z.toFixed(2)],
      kids: m.group.children.length, bodyCount,
      scale:+m.group.scale.x.toFixed(2),
      hasHalo: !!m.halo};
  }, n);
  rows.push(r);
}
console.log(JSON.stringify(rows,null,1),'errs',errs.length,errs[0]||'');
await b.close();
