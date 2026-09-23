import {test,expect} from './browser-fixtures';
import {createGame,newPlayer,seats,startRound,viewFor} from '../shared/engine';
import {newGameRules} from '../shared/nanjing-rules';
import {DEFAULT_TABLE_SETTINGS} from '../shared/table-settings';
import {seededRandom} from '../shared/tiles';

for(const failure of ['timeout','resources'] as const)test(`牌桌${failure}分类与重试保留同一局`,async({page})=>{
 // The local practice entry was retired. Exercise the supported managed-table
 // entrance and its real client protocol while holding gameplay behind the
 // opening gate until the replacement renderer can finish its entrance.
 const waiting=createGame('824602',`loading-${failure}`,newGameRules({turnSeconds:0,rounds:8}));
 waiting.players=seats.map(seat=>({...newPlayer(`loading-${seat}`,`牌友${seat+1}`,seat!==0),ready:true}));
 waiting.ownerId=waiting.players[0]!.id;
 waiting.table={creatorId:waiting.ownerId,groupId:'loading-regression',number:1,createdAt:Date.now(),settings:{...DEFAULT_TABLE_SETTINGS,autoRenew:false}};
 const game=startRound(waiting,Date.now(),seededRandom(42));
 game.openingGate={round:1,waiting:[0],expiresAt:Date.now()+30000};game.deadline=0;
 const confirmations:unknown[]=[];
 await page.routeWebSocket('**/ws',ws=>{
  const server=ws.connectToServer();
  const push=()=>ws.send(JSON.stringify({type:'state',state:viewFor(game,0),serverNow:Date.now()}));
  ws.onMessage(raw=>{
   const message=JSON.parse(String(raw));
   if(message.type==='openingComplete'&&message.game===game.id&&message.round===game.round){
    confirmations.push(message);
    if(game.openingGate){delete game.openingGate;game.revision++;push();}
   }else server.send(raw);
  });
  server.onMessage(raw=>{
   const message=JSON.parse(String(raw));
   if(message.type==='session'){
    ws.send(JSON.stringify({...message,roomCode:game.code}));push();
   }else ws.send(raw);
  });
 });
 let first=true;
 await page.route('**/cocos-table/index.html?*',async route=>{
  if(!first)return route.continue();first=false;
  const channel=new URL(route.request().url()).searchParams.get('channel');
  await route.fulfill({contentType:'text/html',body:failure==='timeout'?'<html><body>loading</body></html>':`<html><script>parent.postMessage({scope:'jinling-table-v1',channel:${JSON.stringify(channel)},type:'error'},location.origin)</script></html>`});
 });
 await page.goto('/');
 const frame=page.locator('#cocos-table-board iframe');await expect(frame).toBeVisible();
 const oldUrl=await frame.getAttribute('src');
 if(failure==='timeout')await expect(page.getByText('牌桌加载超时',{exact:true})).toBeVisible({timeout:25000});
 else await expect(page.getByText('牌桌资源加载失败',{exact:true})).toBeVisible();
 await expect(page.getByText('可以重新加载牌桌，当前对局进度会保留。',{exact:true})).toBeVisible();
 expect(confirmations).toHaveLength(0);
 await page.getByRole('button',{name:'重新加载',exact:true}).click();
 await expect(frame).not.toHaveAttribute('src',oldUrl!);
 await expect(page.getByRole('navigation',{name:'牌桌工具'})).toBeVisible({timeout:20000});
 await expect(page.locator('.table-opening')).toHaveCount(0,{timeout:10000});
 await expect.poll(()=>confirmations.length).toBe(1);
 expect(await page.evaluate(async()=>{const {client}=await import('/src/game-client.ts' as string);return client.state.view!.id;})).toBe(game.id);
});
