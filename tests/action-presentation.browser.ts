import {test,expect,type Page} from '@playwright/test';
import {mkdirSync,writeFileSync} from 'node:fs';
const out='output/qa/action-jade-v2';mkdirSync(out,{recursive:true});
test('confirmed direct kong turns the supplier end on the real 3D table',async({page},info)=>{
 await ready(page);
 for(const seat of [0,1,2,3]){
  await page.getByLabel('动作玩家',{exact:true}).selectOption(String(seat));await page.getByRole('button',{name:'播放明杠',exact:true}).click();
  const kong=()=>frame(page).evaluate(async()=>{const cc=await(window as any).System.import('cc'),c=cc.director.getScene().getChildByName('Canvas').getComponent('TableScene');return [...c.tileLayout.values()].filter((t:any)=>t.area==='meld').map((t:any)=>({id:t.id,pose:t.pose,stack:!!t.stack}));});
  await expect.poll(async()=>(await kong()).filter((t:any)=>t.id.startsWith(`meld-${seat}-0-`))).toHaveLength(4);
  const tiles=await kong();expect(tiles.filter((t:any)=>t.pose.includes('cross')).map((t:any)=>t.id)).toEqual([`meld-${seat}-0-0`]);
  expect(tiles.some((t:any)=>t.stack)).toBe(false);
  await page.waitForTimeout(1550);await page.screenshot({path:`${out}/${info.project.name}-direct-kong-${seat}.png`});
 }
});
test('only confirmed winners lay down; losing opponents stay concealed at finish',async({page},info)=>{
 await ready(page);
 for(const seat of [0,1,2,3]){
  await page.getByLabel('动作玩家',{exact:true}).selectOption(String(seat));await page.getByRole('button',{name:'播放胡',exact:true}).click();
  await expect.poll(()=>frame(page).evaluate(async()=>{const cc=await(window as any).System.import('cc'),c=cc.director.getScene().getChildByName('Canvas').getComponent('TableScene');return c.state.revealedWinners;})).toEqual([seat]);
  const state=await frame(page).evaluate(async()=>{const cc=await(window as any).System.import('cc'),c=cc.director.getScene().getChildByName('Canvas').getComponent('TableScene');return {hands:c.state.players.map((p:any)=>({seat:p.seat,shown:p.hand.length})),models:(window as any).__JINLING_TABLE_3D__.tiles.filter((t:any)=>t.area==='hand').map((t:any)=>t.seat),laid:[...c.tileLayout.values()].filter((t:any)=>t.area==='hand'&&t.laidDown).map((t:any)=>t.seat)};});
  expect(new Set(state.models)).toEqual(new Set([seat]));expect(new Set(state.laid)).toEqual(new Set([seat]));
  expect(state.hands.filter((p:any)=>p.seat!==0&&p.seat!==seat).every((p:any)=>p.shown===0)).toBe(true);
  await page.waitForTimeout(1300);await page.screenshot({path:`${out}/${info.project.name}-winner-only-${seat}.png`});
 }
 await page.getByRole('button',{name:'多家胡牌',exact:true}).click();
 await expect.poll(()=>frame(page).evaluate(async()=>{const cc=await(window as any).System.import('cc'),c=cc.director.getScene().getChildByName('Canvas').getComponent('TableScene');return c.state.revealedWinners;})).toEqual([0,1]);
 await page.waitForTimeout(1300);await page.screenshot({path:`${out}/${info.project.name}-winner-only-multi.png`});
});
const frame=(p:Page)=>p.frames().find(f=>f.url().includes('/cocos-table/index.html'))!;
async function ready(page:Page){await page.goto('/?actionStudio=1');await expect.poll(()=>frame(page)?.evaluate(()=>!!(window as any).__JINLING_TABLE_READY__)).toBe(true);await expect(page.getByRole('group',{name:'碰杠胡操作'}).getByRole('button')).toHaveCount(4);}
async function active(page:Page){return frame(page).evaluate(async()=>{const cc=await(window as any).System.import('cc'),scene=cc.director.getScene().getChildByName('Canvas').getComponent('TableScene');return [...scene.actionFx.slots.entries()].filter(([,s]:any)=>s.root.active).map(([seat,s]:any)=>({seat,key:s.cue.key,type:s.kind,name:s.name.string,tag:s.tag.string,ms:s.progress.ms,rect:s.rect}));});}
test('button default/pressed/pending/disabled and rejected/pass requests never announce success',async({page},info)=>{
 const sockets:string[]=[];page.on('websocket',ws=>{if(!ws.url().includes('vite'))sockets.push(ws.url());});await ready(page);
 const controls=page.getByRole('group',{name:'碰杠胡操作'}),pung=controls.getByRole('button',{name:'碰',exact:true});
 await page.screenshot({path:`${out}/${info.project.name}-buttons.png`});
 await page.getByRole('checkbox',{name:'模拟拒绝'}).check();
 const box=(await pung.boundingBox())!;await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();
 await expect(pung).toHaveAttribute('data-state','pressed');await page.screenshot({path:`${out}/${info.project.name}-pressed.png`});await page.mouse.up();
 await expect(pung).toHaveAttribute('data-state','pending');expect(await active(page)).toHaveLength(0);await page.screenshot({path:`${out}/${info.project.name}-pending.png`});
 await expect(page.locator('footer output')).toContainText('模拟请求失败');await expect(pung).toBeEnabled();expect(await active(page)).toHaveLength(0);
 await page.getByRole('button',{name:'切换禁用',exact:true}).click();for(const b of await controls.getByRole('button').all())await expect(b).toBeDisabled();await page.screenshot({path:`${out}/${info.project.name}-disabled.png`});await page.getByRole('button',{name:'切换禁用',exact:true}).click();
 await page.getByRole('checkbox',{name:'模拟拒绝'}).uncheck();await controls.getByRole('button',{name:'过',exact:true}).click();await page.waitForTimeout(850);expect(await active(page)).toHaveLength(0);
 expect(sockets.filter(url=>/\/ws(?:\?|$)/.test(url))).toEqual([]);
});
test('four seats have distinct confirmed pungs, kongs and wins; bounded nodes and correct player labels',async({page},info)=>{
 await ready(page);
 for(const seat of [0,1,2,3])for(const [button,type]of [['播放碰','pung'],['播放明杠','kong'],['播放胡','hu']] as const){
  await page.getByLabel('动作玩家',{exact:true}).selectOption(String(seat));await page.getByRole('button',{name:button,exact:true}).click();
  await expect.poll(async()=>(await active(page)).some(e=>e.seat===seat&&e.type===type),{intervals:[30,50,80]}).toBe(true);
  const cues=await active(page);expect(cues.length).toBeLessThanOrEqual(4);expect(cues.find(e=>e.seat===seat)?.name).toContain(['本家','下家','对家','上家'][seat]);
  await page.waitForTimeout(type==='hu'?300:180);await page.screenshot({path:`${out}/${info.project.name}-${seat}-${type}.png`});
  await expect.poll(()=>active(page),{timeout:2200}).toEqual([]);
 }
});
test('added/concealed kong contact, multi-winner ownership, duplicates, reconnect and rapid replacement',async({page},info)=>{
 await ready(page);await page.getByLabel('动作玩家',{exact:true}).selectOption('2');
 await page.getByRole('button',{name:'碰后补杠',exact:true}).click();await expect.poll(async()=>(await active(page)).find(e=>e.seat===2)?.tag,{intervals:[30,50,80]}).toBe('补杠');
 await page.waitForTimeout(250);await page.screenshot({path:`${out}/${info.project.name}-added.png`});
 const stack=await frame(page).evaluate(async()=>{const cc=await(window as any).System.import('cc'),scene=cc.director.getScene(),c=scene.getChildByName('Canvas').getComponent('TableScene'),tiles=[...c.tileLayout.values()] as any[],upper=tiles.find(t=>t.seat===2&&t.stack),base=upper&&tiles.find(t=>t.id===upper.id.replace(/-3$/,'-1')),model=upper&&scene.getChildByName('Table 3D models').getChildByName(upper.id),shadow=model?.getChildByName('Stack contact on middle tile');return{sameX:upper?.groundX===base?.groundX,sameZ:upper?.groundZ===base?.groundZ,flights:c.tileFlights.size,heightError:Math.abs(model.position.y-upper.modelThickness),xError:Math.abs(model.position.x-base.groundX),zError:Math.abs(model.position.z-base.groundZ),shadowHeight:shadow.position.y};});
 expect(stack.sameX).toBe(true);expect(stack.sameZ).toBe(true);expect(stack.heightError).toBeLessThan(.0001);expect(stack.xError).toBeLessThan(.0001);expect(stack.zError).toBeLessThan(.0001);expect(stack.shadowHeight).toBeCloseTo(.002,4);
 await expect.poll(()=>active(page)).toEqual([]);await page.getByRole('button',{name:'重复事件',exact:true}).click();await page.waitForTimeout(180);expect(await active(page)).toHaveLength(0);
 await page.getByRole('button',{name:'播放暗杠',exact:true}).click();await expect.poll(async()=>(await active(page)).find(e=>e.seat===2)?.tag).toBe('暗杠');await page.screenshot({path:`${out}/${info.project.name}-concealed.png`});
 const faces=await frame(page).evaluate(async()=>{const cc=await(window as any).System.import('cc'),c=cc.director.getScene().getChildByName('Canvas').getComponent('TableScene');return [...c.tileLayout.values()].filter((t:any)=>t.seat===2&&t.area==='meld').map((t:any)=>t.tile);});expect(faces.filter(t=>t!==undefined&&t!==null).length).toBeLessThanOrEqual(1);
 await page.getByRole('button',{name:'多家胡牌',exact:true}).click();await expect.poll(async()=>(await active(page)).filter(e=>e.type==='hu').map(e=>e.seat).sort()).toEqual([0,1]);await page.waitForTimeout(350);await page.screenshot({path:`${out}/${info.project.name}-multi-hu.png`});
 await page.getByRole('button',{name:'断线重连',exact:true}).click();await expect.poll(()=>active(page)).toEqual([]);await expect(page.locator('footer output')).toContainText('重连恢复');expect(await active(page)).toHaveLength(0);
 await page.getByRole('button',{name:'连续触发',exact:true}).click();await page.waitForTimeout(900);expect((await active(page)).length).toBeLessThanOrEqual(1);await expect.poll(()=>active(page),{timeout:2500}).toEqual([]);
});
for(const [width,height]of [[568,320],[844,390],[1280,590]])test(`legal controls fit landscape ${width}x${height} and simplified cues retain ownership`,async({page},info)=>{
 await page.setViewportSize({width,height});await ready(page);const controls=page.getByRole('group',{name:'碰杠胡操作'}),boxes=await controls.getByRole('button').evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height};}));
 for(const b of boxes){expect(b.w).toBeGreaterThanOrEqual(44);expect(b.h).toBeGreaterThanOrEqual(44);expect(b.x).toBeGreaterThanOrEqual(0);expect(b.x+b.w).toBeLessThanOrEqual(width);}
 for(let i=0;i<boxes.length-1;i++)expect(boxes[i+1].x-boxes[i].x-boxes[i].w).toBeGreaterThanOrEqual(7);
 await page.screenshot({path:`${out}/${info.project.name}-${width}-layout.png`});await page.getByRole('checkbox',{name:'简化特效'}).check();await page.getByRole('button',{name:'播放碰',exact:true}).click();await expect.poll(()=>active(page)).toHaveLength(1);
 const opacity=await frame(page).evaluate(async()=>{const cc=await(window as any).System.import('cc'),s=cc.director.getScene().getChildByName('Canvas').getComponent('TableScene').actionFx.slots.get(0);return s.ink.getComponent(cc.UIOpacity).opacity;});expect(opacity).toBe(0);
});
test('retained draw inserts once, lands on layout coordinates, and sound requests originate at impact',async({page},info)=>{
 await page.addInitScript(()=>{(window as any).__impactAudit=[];window.addEventListener('message',e=>{if(e.data?.scope==='jinling-table-v1'&&e.data?.type==='action-impact')(window as any).__impactAudit.push({key:e.data.key,type:e.data.action,at:performance.now()});});});
 await ready(page);await page.getByRole('button',{name:'摸牌插入',exact:true}).click();
 const flights=()=>frame(page).evaluate(async()=>{const cc=await(window as any).System.import('cc'),c=cc.director.getScene().getChildByName('Canvas').getComponent('TableScene');return [...c.tileFlights.values()].map((f:any)=>({kind:f.kind,t:f.progress.t,tile:f.identity}));});
 await expect.poll(flights,{intervals:[20,30,50]}).toEqual(expect.arrayContaining([expect.objectContaining({kind:'insert',tile:0})]));
 await page.screenshot({path:`${out}/${info.project.name}-insertion.png`});await expect.poll(flights).toEqual([]);
 const exact=await frame(page).evaluate(async()=>{const cc=await(window as any).System.import('cc'),c=cc.director.getScene().getChildByName('Canvas').getComponent('TableScene'),tiles=[...c.tileLayout.values()].filter((t:any)=>t.area==='hand'&&t.seat===0) as any[];return{ids:tiles.map(t=>t.tile),maximumError:Math.max(...tiles.map(t=>{const n=c.nodes.get(t.id);return Math.abs(n.position.x+640-t.x)+Math.abs(295-n.position.y-t.y);} ))};});
 expect(exact.ids.filter(t=>t===0)).toHaveLength(1);expect(exact.maximumError).toBeLessThan(.01);
 await page.getByRole('button',{name:'播放碰',exact:true}).click();await expect.poll(()=>active(page),{intervals:[20,30,50]}).toHaveLength(1);
 await expect.poll(()=>page.evaluate(()=>(window as any).__impactAudit.length),{intervals:[20,30,50]}).toBe(1);
 const phase=await active(page);expect(phase[0].ms).toBeGreaterThanOrEqual(155);expect(phase[0].ms).toBeLessThan(330);
 await page.getByRole('button',{name:'重复事件',exact:true}).click();await page.waitForTimeout(700);expect(await page.evaluate(()=>(window as any).__impactAudit.length)).toBe(1);
});
test('production sound envelopes are short, distinct and silent when muted or hidden',async({page},info)=>{
 await ready(page);
 const rendered=await page.evaluate(async()=>{const {GameAudio}=await import('/src/audio.ts' as string);const results=[];
  for(const cue of ['pung','kong','hu'])for(const mode of ['normal','muted','disabled','hidden']){const context=new OfflineAudioContext(1,44100,44100);Object.defineProperty(context,'state',{get:()=> 'running'});const game=new GameAudio() as any;game.context=context;game.effectsGain=context.createGain();game.effectsGain.connect(context.destination);game.preferences.soundVolume=mode==='muted'?0:1;game.preferences.sound=mode!=='disabled';game.visible=mode!=='hidden';game.play(cue);const buffer=await context.startRendering(),samples=Array.from(buffer.getChannelData(0));results.push({cue,silent:mode!=='normal',samples,peak:Math.max(...samples.map(Math.abs)),energy:samples.reduce((s,v)=>s+v*v,0)});}
  return results;
 });
 for(const r of rendered){if(r.silent){expect(r.energy).toBe(0);continue;}expect(r.peak).toBeGreaterThan(.015);expect(r.peak).toBeLessThan(.5);expect(r.samples.slice(30000).every(v=>Math.abs(v)<.0001)).toBe(true);
  const wav=Buffer.alloc(44+r.samples.length*2);wav.write('RIFF',0);wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(44100,24);wav.writeUInt32LE(88200,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(r.samples.length*2,40);r.samples.forEach((v,i)=>wav.writeInt16LE(Math.round(Math.max(-1,Math.min(1,v))*32767),44+i*2));writeFileSync(`${out}/${info.project.name}-${r.cue}-sound.wav`,wav);
 }
 expect(new Set(rendered.filter(r=>!r.silent).map(r=>r.energy.toFixed(4))).size).toBe(3);
});
