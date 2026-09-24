import { test, expect } from '@playwright/test';
test('real Cocos meshes render and side rivers rotate with their owner, not the screen', async ({ page }) => {
  const errors: string[]=[];
  page.on('pageerror', e=>{errors.push(e.message);console.log('PAGE ERROR',e.message);});
  page.on('console', m=>{if(m.type()==='error')console.log('BROWSER ERROR',m.text());});
  page.on('response', r=>{if(r.status()>=400)console.log('HTTP ERROR',r.status(),r.url());});
  await page.goto('/tests/previews/table-3d.html');
  const iframe=page.frameLocator('iframe');
  await expect(page.locator('[role="status"]')).toHaveText('牌面方向跟随所属玩家', { timeout: 20000 });
  for(let me=0;me<4;me++) {
    await page.getByLabel('玩家视角').selectOption(String(me));
    await expect.poll(async()=>iframe.locator('body').evaluate(()=> (window as any).__JINLING_3D_STUDY__?.me)).toBe(me);
    const result=await iframe.locator('body').evaluate(()=> (window as any).__JINLING_3D_STUDY__);
    expect(result.realCocos).toBe(true); expect(result.meshTiles).toBeGreaterThanOrEqual(40);
    for(const tile of result.tiles.filter((t:any)=>t.area==='river')) {
      const offset=(tile.seat-me+4)%4;
      const angle=(offset===2?0:offset)*Math.PI/2+tile.alignmentAngle;
      expect(tile.yaw).toBeCloseTo(angle*180/Math.PI);
      expect(tile.top[0]).toBeCloseTo(-Math.sin(angle));expect(tile.top[1]).toBeCloseTo(-Math.cos(angle));
    }
  }
  for(const mode of ['pung','kong','stack','busy','flowers','dense-flowers']) {
    if(mode==='dense-flowers')await page.getByLabel('玩家视角').selectOption('0');
    await page.getByLabel('场景').selectOption(mode);
    await page.screenshot({path:`output/qa/real-cocos-3d-${mode}.png`});
    const result=await iframe.locator('body').evaluate(()=> (window as any).__JINLING_3D_STUDY__);
    expect(result.meshTiles).toBeGreaterThan(30);
    expect(result.standingHands).toBe('individual-rectangular-tiles');
    expect(result.handModels).toHaveLength(result.hands.filter((t:any)=>t.offset%2===1).length);
    for(const hand of result.handModels){
      expect(hand.height/hand.width).toBeGreaterThan(1.3);expect(hand.depth).toBeLessThan(hand.width);hand.up.forEach((v:number,i:number)=>expect(v).toBeCloseTo(i===1?1:0,8));
      const row=result.handModels.filter((t:any)=>t.seat===hand.seat);expect(hand.yaw).toBe(row[0].yaw);expect(hand.width).toBe(row[0].width);
      for(const tile of result.tiles.filter((t:any)=>t.seat===hand.seat&&(t.area==='river'||t.area==='flower')))expect(tile.yaw).toBeCloseTo(hand.yaw,8);
    }
    for(const hand of result.hands)expect(hand.rotation,hand.id).toBe(0);
    for(const offset of [0,2]){
      const row=result.hands.filter((t:any)=>t.offset===offset);
      for(const hand of row){expect(hand.bottom).toBe(row[0].bottom);expect(hand.height).toBe(row[0].height);}
    }
    if(mode==='flowers') {
      const flowers=result.tiles.filter((t:any)=>t.area==='flower');expect(flowers).toHaveLength(20);
      for(const flower of flowers){expect(flower.width).toBe(.37);expect(flower.length).toBe(.51);expect(flower.thickness).toBeCloseTo(.16);}
    }
    if(mode==='stack') for(const tile of result.tiles.filter((t:any)=>t.stack)) {
      const middle=result.tiles.find((t:any)=>t.id===tile.id.replace(/-3$/,'-1'));
      expect(tile.x).toBe(middle.x);expect(tile.z).toBe(middle.z);expect(tile.height).toBeGreaterThan(0);
    }
    if(mode==='stack')for(let me=0;me<4;me++){
      await page.getByLabel('玩家视角').selectOption(String(me));
      await expect.poll(async()=>iframe.locator('body').evaluate(()=> (window as any).__JINLING_3D_STUDY__?.me)).toBe(me);
      const stackView=await iframe.locator('body').evaluate(()=> (window as any).__JINLING_3D_STUDY__);
      const stacks=stackView.tiles.filter((t:any)=>t.stack);expect(stacks).toHaveLength(8);
      for(const tile of stacks){
        const target=stackView.tiles.find((t:any)=>t.id===tile.id.replace(/-3$/,'-1'));
        expect(tile.x).toBe(target.x);expect(tile.z).toBe(target.z);expect(tile.height).toBe(target.thickness);expect(tile.yaw).toBe(target.yaw);
      }
      await page.screenshot({path:`output/qa/real-cocos-3d-stack-view-${me}.png`});
    }
  }
  await page.getByLabel('场景').selectOption('busy');
  await page.getByLabel('玩家视角').selectOption('0');
  await page.screenshot({path:'output/qa/real-cocos-3d-upright-hands.png'});
  await page.getByLabel('场景').selectOption('reference');
  await page.getByLabel('玩家视角').selectOption('0');
  await page.screenshot({ path: 'output/qa/real-cocos-3d.png' });
  await page.getByLabel('场景').selectOption('flowers');
  await page.screenshot({ path: 'output/qa/real-cocos-3d-flowers.png' });
  await page.getByRole('button', {name:'正在看3D · 切回原版'}).click();
  await expect(page.getByRole('button', {name:'正在看原版 · 切到3D'})).toBeVisible();
  expect(errors).toEqual([]);
});
