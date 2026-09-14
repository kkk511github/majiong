import {expect,test} from './browser-fixtures';
import type {Game} from '../shared/types';
import {writeFileSync} from 'node:fs';

test('真实计时连续完成四局：托管、补花、碰杠、结算、续局和战绩',async({page},info)=>{
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 await page.setViewportSize({width:874,height:402});
 await page.goto('/');await page.getByRole('button',{name:/单人练习/}).click();
 await page.getByRole('button',{name:'托管',exact:true}).click();
 const started=Date.now(),completed:number[]=[],samples:{seconds:number,round:number,revision:number,tiles:number,nodes:number}[]=[];
 let lastProgress=Date.now(),revision=-1,lastLog=0;
 while(Date.now()-started<680000){
  const g=await page.evaluate<Game>(()=>JSON.parse(localStorage.getItem('jinling:practice')!));
  expect(errors).toEqual([]);await expect(page.locator('.error-banner')).toHaveCount(0);
  if(g.revision!==revision){lastProgress=Date.now();revision=g.revision;}
  expect(Date.now()-lastProgress,'牌局超过 30 秒未推进').toBeLessThan(30000);
  if(g.result){
    expect(g.result.deltas.reduce((a,b)=>a+b,0)).toBe(0);
    expect(g.result.transfers).toBeDefined();
    for(let seat=0;seat<4;seat++){
      const balance=g.result.transfers!.reduce((n,t)=>n+(t.to===seat?t.amount:0)-(t.from===seat?t.amount:0),0);
      expect(balance).toBe(g.result.deltas[seat]);
    }
    completed.push(g.round);
    console.log(`Completed round ${g.round}, ${g.result.reason}, ${Math.round((Date.now()-started)/1000)} seconds`);
    if(g.phase==='finished') break;
    await page.getByRole('button',{name:'再来一局',exact:true}).click();
  }
  const geometry=await page.locator('.hand > .tile').evaluateAll(els=>({tiles:els.length, nodes:document.querySelectorAll('*').length,gaps:els.slice(1).map((el,i)=>el.getBoundingClientRect().left-els[i].getBoundingClientRect().right),clipped:els.some(el=>{const r=el.getBoundingClientRect();return r.left<0||r.right>innerWidth||r.top<0||r.bottom>innerHeight;})}));
  expect(geometry.clipped).toBe(false);
  if(geometry.gaps.length){expect(Math.max(...geometry.gaps)-Math.min(...geometry.gaps)).toBeLessThan(.8);expect(Math.max(...geometry.gaps)).toBeLessThanOrEqual(4);}
  samples.push({seconds:Math.round((Date.now()-started)/1000),round:g.round,revision:g.revision,tiles:geometry.tiles,nodes:geometry.nodes});
  if(Date.now()-lastLog>30000){console.log(JSON.stringify(samples.at(-1)));lastLog=Date.now();}
  await page.waitForTimeout(5000);
 }
 expect(completed).toEqual([1,2,3,4]);
 await page.getByRole('button',{name:'返回大厅',exact:true}).click();
 await page.getByRole('navigation').getByRole('button',{name:'战绩',exact:true}).click();
 await page.getByRole('navigation',{name:'战绩范围'}).getByRole('button',{name:'单人练习',exact:true}).click();
 await expect(page.locator('.record-card')).toHaveCount(4);
 const report={started:new Date(started).toISOString(),durationSeconds:Math.round((Date.now()-started)/1000),completedRounds:completed,errors,samples,scope:'真实时间浏览器连续练习与界面/账本一致性；不证明微乐计分一致性或 iOS 原生触摸验收'};
 writeFileSync(info.outputPath('soak-report.json'),JSON.stringify(report,null,2));
 await page.screenshot({path:info.outputPath('history-after-four-rounds.png')});
});
