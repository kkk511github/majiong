import { test, expect } from '@playwright/test';

test('取消托管单击生效，按下和抬起之间更新倒计时也不丢点击', async ({page})=>{
 await page.setViewportSize({width:1280,height:590});
 await page.goto('/cocos-table/index.html');
 await page.waitForFunction(()=>!!(window as any).__JINLING_TABLE_READY__);
 await page.evaluate(async()=>{
  const cc=await (window as any).System.import('cc');
  const c=cc.director.getScene().getChildByName('Canvas').getComponent('TableScene');
  c.state.players[0].trustee=true;c.draw();
  (window as any).commands=[];
  const emit=c.emit.bind(c);c.emit=(command:any)=>{(window as any).commands.push(command);emit(command);};
 });
 await page.mouse.move(1107,88);await page.mouse.down();
 await page.evaluate(async()=>{
  const cc=await (window as any).System.import('cc');
  const c=cc.director.getScene().getChildByName('Canvas').getComponent('TableScene');
  (window as any).pressedButton=c.trusteeButton;
  for(const time of ['09','08','07']){c.state.countdown=time;c.draw();}
 });
 await page.waitForTimeout(80); // Let Cocos process deferred HUD destruction.
 await page.mouse.up();
 await expect.poll(()=>page.evaluate(()=>(window as any).commands)).toEqual([{type:'trustee',enabled:false}]);
 const result=await page.evaluate(async()=>{
  const cc=await (window as any).System.import('cc'),c=cc.director.getScene().getChildByName('Canvas').getComponent('TableScene');
  return {same:c.trusteeButton===(window as any).pressedButton,trustee:c.state.players[0].trustee,label:c.trusteeLabel.string};
 });
 expect(result).toEqual({same:true,trustee:false,label:'托管'});
});
