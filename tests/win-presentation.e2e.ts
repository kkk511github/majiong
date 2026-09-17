import { test, expect } from "./browser-fixtures";
import { completedRound } from "./fixtures/completed-round";
import { viewFor } from "../shared/engine";
import { mkdirSync } from "node:fs";
const cases = [
  {width:568,me:0,from:undefined,winners:[0]},
  {width:1280,me:0,from:undefined,winners:[2]},
  {width:568,me:0,from:0,winners:[1]},
  {width:1280,me:0,from:0,winners:[2]},
  {width:568,me:0,from:0,winners:[3]},
  {width:1280,me:0,from:3,winners:[0,1,2]},
  {width:568,me:2,from:3,winners:[1]},
  {width:1280,me:3,from:1,winners:[0,2]},
] as const;
const specialCases = [
  {width:568,me:0,from:undefined,winners:[1],pattern:"全球独钓",expected:"全球独钓"},
  {width:1280,me:0,from:undefined,winners:[2],pattern:"大杠开花",expected:"杠上开花"},
  {width:568,me:0,from:0,winners:[3],pattern:"超豪华双七对",expected:"超豪华双七对"},
] as const;
for(const c of [...cases,...specialCases]) {
  const {width,me,from,winners}=c;
  const pattern="pattern" in c?c.pattern:undefined;
  const expected="expected" in c?c.expected:(from===undefined?"自摸":"胡");
  const selfDraw=from===undefined;
  const label=`${width}-me${me}-${selfDraw?'self':`from${from}`}-win${winners.join('')}-${pattern??"ordinary"}`;
  test(`胡牌和点炮特效跟随各自座位，重连不重播 ${label}`,async({page})=>{
    const height=width===568?320:590;
    await page.setViewportSize({width,height});
    const game=completedRound();game.code='528613';
    const result=structuredClone(game.result!);result.winners=[...winners];result.from=from;
    result.details=Object.fromEntries(winners.map(seat=>[seat,{total:20,kinds:[],items:[{label:pattern??"成牌",value:20}]}]));
    const names=game.players.map(p=>p!.name);
    game.result=undefined;game.phase='playing';game.deadline=Date.now()+600000;
    let socket:any;
    const push=()=>socket.send(JSON.stringify({type:'state',state:viewFor(game,me),serverNow:Date.now()}));
    await page.routeWebSocket('**/ws',ws=>{
      socket=ws;const server=ws.connectToServer();ws.onMessage(m=>server.send(m));
      server.onMessage(raw=>{const m=JSON.parse(String(raw));if(m.type==='session'){ws.send(JSON.stringify({...m,roomCode:game.code}));push();}else ws.send(raw);});
    });
    await page.goto('/');
    await expect(page.locator('#cocos-table-board')).toBeVisible();
    await expect.poll(()=>page.frames().find(f=>f.url().includes('/cocos-table/index.html'))?.evaluate(()=>!!(window as any).__JINLING_TABLE_READY__)).toBe(true);
    await page.evaluate(async()=>{
      const {gameAudio}=await import('/src/audio.ts' as string);
      const say=gameAudio.sayTile.bind(gameAudio);
      (window as any).__winVoice=[];
      gameAudio.sayTile=(key:string,phrase:number|string)=>{(window as any).__winVoice.push(phrase);say(key,phrase);};
    });
    game.phase='ended';game.result=result;game.history.at(-1)!.result=result;game.history.at(-1)!.at=Date.now();game.revision++;push();
    const effect=page.getByRole('status',{name:'胡牌结果'});
    await expect(effect).toBeVisible();
    await expect(effect.locator('.winner')).toHaveCount(winners.length);
    await expect(effect.locator('.seat-discarder')).toHaveCount(selfDraw?0:1);
    if(from!==undefined){
      const marker=effect.getByLabel(`${names[from]}点炮`,{exact:true});
      await expect(marker).toHaveText('点炮');
      await expect(marker).toHaveAttribute('data-seat',String(from));
      await expect(marker).toBeInViewport();
      const badge=(await marker.boundingBox())!;
      const h=height,offset=(from-me+4)%4;
      await expect(marker).toHaveAttribute('data-relative-seat',String(offset));
      if(offset===0){expect(badge.x).toBeGreaterThan(width*.75);expect(badge.y).toBeGreaterThan(h*.7);}
      if(offset===1){expect(badge.x).toBeGreaterThan(width*.75);expect(badge.y).toBeLessThan(h*.65);}
      if(offset===2){expect(badge.x).toBeGreaterThan(width*.6);expect(badge.y).toBeLessThan(h*.35);}
      if(offset===3){expect(badge.x+badge.width).toBeLessThan(width*.25);expect(badge.y).toBeLessThan(h*.65);}
    }
    await expect.poll(()=>page.evaluate(()=>(window as any).__winVoice)).toEqual(['胡了']);
    await expect(effect).toContainText(`${selfDraw?"":`${names[from!]}点炮 → `}${result.winners.map(s=>`${names[s]}${expected}`).join('、')}`);
    await expect(effect.locator('.win-callout')).toHaveCount(winners.length);
    await expect(effect.locator('.win-call-art')).toHaveCount(winners.length);
    const boxes=[];
    for(const seat of winners){
      const callout=effect.locator(`.win-callout[data-seat="${seat}"]`),offset=(seat-me+4)%4;
      await expect(callout).toHaveAttribute('data-relative-seat',String(offset));
      await expect(callout.getByRole('img',{name:expected,exact:true})).toBeVisible();
      const textBounds=(await callout.locator('.win-call-art').boundingBox())!;
      const containerBounds=(await callout.boundingBox())!;
      expect(textBounds.x).toBeGreaterThanOrEqual(containerBounds.x);
      expect(textBounds.x+textBounds.width).toBeLessThanOrEqual(containerBounds.x+containerBounds.width+1);
      await expect(callout.locator('.winner')).toHaveText(names[seat]);
      await expect(callout).toBeInViewport({ratio:1});
      const box=(await callout.boundingBox())!;boxes.push(box);
      if(offset===0){expect(box.y).toBeGreaterThan(height*.6);expect(box.x).toBeGreaterThan(width*.35);}
      if(offset===1){expect(box.x).toBeGreaterThan(width*.75);expect(box.y).toBeLessThan(height*.7);}
      if(offset===2){expect(box.y+box.height).toBeLessThan(height*.4);expect(box.x+box.width/2).toBeGreaterThan(width*.35);expect(box.x+box.width/2).toBeLessThan(width*.65);}
      if(offset===3){expect(box.x+box.width).toBeLessThan(width*.25);expect(box.y).toBeLessThan(height*.7);}
    }
    for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++){
      const a=boxes[i],b=boxes[j];
      expect(a.x+a.width<=b.x||b.x+b.width<=a.x||a.y+a.height<=b.y||b.y+b.height<=a.y).toBe(true);
    }
    await expect(page.getByRole('dialog')).not.toBeVisible();
    mkdirSync('test-results/screenshots',{recursive:true});
    await expect.poll(()=>effect.locator('.win-callout').first().evaluate(el=>getComputedStyle(el).opacity)).toBe('1');
    await page.screenshot({path:`test-results/screenshots/win-presentation-${label}.png`});
    await expect(effect).not.toBeVisible({timeout:6000});
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.locator('.result-call-label')).toHaveText(expected);
    game.revision++;push();await expect(effect).not.toBeVisible();
    expect(await page.evaluate(()=>(window as any).__winVoice)).toEqual(['胡了']);
    await page.reload();await expect(page.getByRole('dialog')).toBeVisible();await expect(effect).not.toBeVisible();
  });
}
