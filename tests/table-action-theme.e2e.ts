import {test,expect} from '@playwright/test';
for(const [width,height]of [[568,320],[844,390],[1280,590],[680,843]])test(`winning tile stays padded inside its hint frame at ${width}x${height}`,async({page})=>{
 await page.setViewportSize({width,height});await page.goto('/tests/previews/room-communication.html?actions=all');
 const panel=page.locator('.win-hint-panel.can-win');await expect(panel).toBeVisible();
 await expect.poll(async()=>panel.evaluate(el=>{const outer=el.getBoundingClientRect(),tile=el.querySelector('.winning-tile-art > .tile-art')!.getBoundingClientRect();return Math.min(tile.top-outer.top,outer.bottom-tile.bottom,tile.left-outer.left,outer.right-tile.right);})).toBeGreaterThanOrEqual(4);
});
test('new action discs have no captions, preserve clicks and respect reduced motion',async({page})=>{
 await page.setViewportSize({width:1280,height:590});
 await page.goto('/tests/previews/room-communication.html?actions=all');
 const actions=page.getByRole('group',{name:'碰杠胡操作'});
 await expect(actions.getByRole('button')).toHaveCount(4);await expect(actions.locator('small')).toHaveCount(0);
 expect(await page.locator('.win-hint-panel').evaluate(el=>getComputedStyle(el).backgroundColor)).toContain('16, 56, 75');
 expect(await page.locator('.table-claim-source').evaluate(el=>getComputedStyle(el).backgroundColor)).toContain('16, 56, 75');
 for(const label of ['碰','杠','胡','过']){
  const button=actions.getByRole('button',{name:label,exact:true});
  expect(await button.evaluate(el=>{const r=el.getBoundingClientRect();return el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));})).toBe(true);
  const animation=await button.evaluate(el=>getComputedStyle(el,'::after').animationName);
  expect(animation).toBe(label==='过'?'claim-pass-glow':'claim-ready-glow');
  await expect(button).not.toHaveAttribute('title');
  expect(await button.evaluate(el=>getComputedStyle(el).backgroundColor)).toBe('rgba(0, 0, 0, 0)');
  await button.hover();
  expect(await button.evaluate(el=>getComputedStyle(el).backgroundImage)).toBe('none');
  await button.focus();
  expect(await button.evaluate(el=>getComputedStyle(el).backgroundImage)).toBe('none');
 }
 await page.screenshot({path:'output/qa/action-discs-animated.png'});
 await page.emulateMedia({reducedMotion:'reduce'});
 for(const button of await actions.getByRole('button').all())expect(await button.evaluate(el=>getComputedStyle(el,'::after').animationName)).toBe('none');
});

test('all four score and flower rows retain full-opacity text without painted backing',async({page})=>{
 await page.goto('/tests/previews/room-communication.html?actions=all');
 await expect(page.getByRole('group',{name:'碰杠胡操作'})).toBeVisible();
 const frame=page.frames().find(f=>f.url().includes('/cocos-table/index.html'))!;
 const info=await frame.evaluate(async()=>{const cc=await(window as any).System.import('cc'),c=cc.director.getScene().getChildByName('Canvas').getComponent('TableScene');return c.state.players.map((p:any)=>{const badge=c.hud.getChildByName(`player-flower-count-box-${p.seat}`),score=c.hud.getChildByName(`player-score-${p.seat}`).getComponent(cc.Label),flowers=c.hud.getChildByName(`player-flower-count-${p.seat}`).getComponent(cc.Label);return {hasBounds:!!badge,painted:!!badge?.getComponent(cc.Graphics),score:score.string,expectedScore:String(p.score),scoreAlpha:score.color.a,flowers:flowers.string,expectedFlowers:`✿ ×${p.flowers.length}`,flowerAlpha:flowers.color.a};});});
 expect(info).toHaveLength(4);
 for(const p of info){expect(p.hasBounds).toBe(true);expect(p.painted).toBe(false);expect(p.score).toBe(p.expectedScore);expect(p.flowers).toBe(p.expectedFlowers);expect(p.scoreAlpha).toBe(255);expect(p.flowerAlpha).toBe(255);}
 await page.screenshot({path:'output/qa/transparent-score-flowers-blue-prompt.png'});
});

test('confirmed pung shows one short cue above the hand rather than on its faces',async({page})=>{
 await page.setViewportSize({width:1280,height:720});
 await page.goto('/tests/previews/table-motion-v2.html?scene=response');
 const button=page.getByRole('group',{name:'碰杠胡操作'}).getByRole('button',{name:'碰',exact:true});
 await expect(button).toBeEnabled();
 const frame=()=>page.frames().find(f=>f.url().includes('/cocos-table/index.html'))!;
 const cue=()=>frame().evaluate(async()=>{const cc=await(window as any).System.import('cc'),c=cc.director.getScene().getChildByName('Canvas').getComponent('TableScene');const n=c.effectsRoot.children.find((n:any)=>n.name==='motion-action-0');return n?{text:n.getChildByName('table-action-value')?.getComponent(cc.Label)?.string,halo:!!n.getChildByName('action-confirm-halo'),bottom:295-n.position.y+27,handTop:Math.min(...Array.from(c.tileLayout.values()).filter((t:any)=>t.area==='hand'&&t.seat===0).map((t:any)=>t.y-t.h/2))}:null;});
 await button.click();await expect.poll(cue).not.toBeNull();
 const shown=await cue();expect(shown?.text).toBe('碰');expect(shown?.halo).toBe(true);expect(shown!.bottom).toBeLessThan(shown!.handTop);
 await page.screenshot({path:'output/qa/action-confirmed-pung.png'});
 await expect.poll(cue,{timeout:4000}).toBeNull();
});
