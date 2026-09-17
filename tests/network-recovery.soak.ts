import { test, expect, legacyRoom } from './browser-fixtures';
import { mkdirSync, writeFileSync } from 'node:fs';

// Application-message fault injection, not TCP packet-loss or radio simulation.
test('延迟链路反复半开连接恢复与20秒消息中断', async ({page}, info) => {
  const samples:number[]=[];
  let connections=0,blocked=-1,outage=false;
  const sent:{id:number;type:string}[]=[];
  const timers=new Set<ReturnType<typeof setTimeout>>();
  await page.routeWebSocket('**/ws',ws=>{
    const id=++connections,server=ws.connectToServer();
    let closed=false;
    const forward=(fn:()=>void)=>{
      const timer=setTimeout(()=>{timers.delete(timer);if(!closed && id!==blocked && !outage)fn();},250);
      timers.add(timer);
    };
    ws.onClose(()=>{closed=true;server.close();});
    server.onClose(()=>{closed=true;ws.close();});
    ws.onMessage(raw=>{const m=JSON.parse(String(raw));sent.push({id,type:m.type});forward(()=>server.send(raw));});
    server.onMessage(raw=>forward(()=>ws.send(raw)));
  });
  const state=()=>page.evaluate(async()=>{
    const {client}=await import('/src/game-client.ts' as string);
    return {connected:client.state.connected,phase:client.state.network.phase,code:client.state.view?.code,account:client.state.account?.id};
  });
  const foreground=()=>page.evaluate(async()=>{
    const {client}=await import('/src/game-client.ts' as string);
    client.setNetworkVisible(false);client.setNetworkVisible(true);
  });
  try {
    await page.goto('/');await legacyRoom(page);
    const original=await state();
    for(let i=0;i<15;i++){
      blocked=connections;
      const started=Date.now();await foreground();
      await expect.poll(state,{timeout:8000,intervals:[50,100]}).toEqual(original);
      expect(connections).toBeGreaterThan(blocked);
      samples.push(Date.now()-started);
    }
    outage=true;blocked=-1;
    await foreground();
    await expect.poll(async()=>(await state()).connected).toBe(false);
    const previousCommands=sent.filter(m=>['action','ready','join','create'].includes(m.type)).length;
    await page.evaluate(async()=>{const{client}=await import('/src/game-client.ts' as string);client.ready();});
    // Real wall-clock interruption. Do not advance fake browser clocks here.
    await page.waitForTimeout(20000);
    expect((await state()).connected).toBe(false);
    expect(sent.filter(m=>['action','ready','join','create'].includes(m.type))).toHaveLength(previousCommands);
    outage=false;
    const resumedAt=Date.now();
    await expect.poll(state,{timeout:25000,intervals:[100,250]}).toEqual(original);
    const outageRecoveryMs=Date.now()-resumedAt;
    expect(sent.filter(m=>m.type==='create')).toHaveLength(1);
    expect(sent.filter(m=>['action','ready','join'].includes(m.type))).toHaveLength(0);
    const sorted=[...samples].sort((a,b)=>a-b),quantile=(q:number)=>sorted[Math.ceil(sorted.length*q)-1];
    const report={at:new Date().toISOString(),browser:info.project.name,samples:15,successful:15,successRate:1,oneWayMessageDelayMs:250,
      recoveryMs:{p50:quantile(.5),p95:quantile(.95),max:sorted.at(-1)},outageDurationMs:20000,outageRecoveryMs,
      targets:{successRate:1,halfOpenP95Ms:8000,afterOutageMs:25000},
      limitations:'Waiting-room restoration only. Local real server and browser; WS application messages delayed/dropped. Not mobile Wi-Fi/cellular, TLS/DNS failure, TCP loss or five-minute OS suspension. Percentiles use only 15 samples.'};
    mkdirSync('docs/research/network-recovery',{recursive:true});
    writeFileSync(`docs/research/network-recovery/${info.project.name}.json`,JSON.stringify(report,null,2)+'\n');
  }finally{for(const timer of timers)clearTimeout(timer);}
});

test('实战出牌确认丢失后中断两分钟，恢复最新手牌且不重复出牌',async({page},info)=>{
  let outage=false,allowedFirstDiscard=false,latestServer:any,accepted=false,discarded=-1,initialRevision=0;
  const sent:any[]=[];
  await page.routeWebSocket('**/ws',ws=>{
    const server=ws.connectToServer();
    ws.onMessage(raw=>{
      const m=JSON.parse(String(raw));sent.push(m);
      if(!outage)server.send(raw);
      else if(m.type==='action' && !allowedFirstDiscard){allowedFirstDiscard=true;server.send(raw);}
    });
    server.onMessage(raw=>{
      const m=JSON.parse(String(raw));
      if(m.type==='state'){
        latestServer=m.state;
        if(outage && m.state.revision>initialRevision && !m.state.players[m.state.me].hand.includes(discarded))accepted=true;
      }
      if(!outage)ws.send(raw);
    });
  });
  await page.goto('/');await legacyRoom(page);
  for(let count=2;count<=4;count++){
    await page.evaluate(async()=>{const{client}=await import('/src/game-client.ts' as string);(client as any).send({type:'addBot'});});
    await expect.poll(()=>page.evaluate(async()=>{const{client}=await import('/src/game-client.ts' as string);return !client.state.submitting && client.state.view?.players.filter(Boolean).length;})).toBe(count);
  }
  await page.evaluate(async()=>{const{client}=await import('/src/game-client.ts' as string);client.ready();});
  await expect.poll(()=>page.evaluate(async()=>{const{client}=await import('/src/game-client.ts' as string);return !client.state.submitting && client.state.view?.canDiscard;})).toBe(true);
  const original=await page.evaluate(async()=>{const{client}=await import('/src/game-client.ts' as string);return {view:client.state.view!,account:client.state.account!.id};});
  discarded=original.view.players[original.view.me]!.hand[0];initialRevision=original.view.revision;
  const originalWrites=sent.filter(m=>['create','join','ready','addBot'].includes(m.type)).length;
  outage=true;const started=Date.now();
  await page.evaluate(async tile=>{const{client}=await import('/src/game-client.ts' as string);client.action({type:'discard',tile});},discarded);
  await expect.poll(()=>accepted).toBe(true);
  await expect.poll(()=>page.evaluate(async()=>{const{client}=await import('/src/game-client.ts' as string);return client.state.connected;}),{timeout:12000}).toBe(false);
  console.log(`${info.project.name}: server accepted discard; confirmation lost; keeping interruption for 120 seconds`);
  await page.evaluate(async tile=>{const{client}=await import('/src/game-client.ts' as string);client.action({type:'discard',tile});},discarded);
  await page.waitForTimeout(Math.max(0,120000-(Date.now()-started)));
  expect(sent.filter(m=>m.type==='action')).toHaveLength(1);
  expect(sent.filter(m=>['create','join','ready','addBot'].includes(m.type))).toHaveLength(originalWrites);
  outage=false;const restoredAt=Date.now();
  await expect.poll(()=>page.evaluate(async()=>{const{client}=await import('/src/game-client.ts' as string);return {connected:client.state.connected,account:client.state.account?.id,code:client.state.view?.code};}),{timeout:25000,intervals:[100,250]}).toEqual({connected:true,account:original.account,code:original.view.code});
  await expect.poll(async()=>{
    const v=await page.evaluate(async()=>{const{client}=await import('/src/game-client.ts' as string);return client.state.view!;});
    return v.revision===latestServer.revision && JSON.stringify(v.players[v.me]!.hand)===JSON.stringify(latestServer.players[latestServer.me].hand);
  }).toBe(true);
  const recoveryMs=Date.now()-restoredAt;
  const restored=await page.evaluate(async()=>{const{client}=await import('/src/game-client.ts' as string);return client.state.view!;});
  expect(restored.revision).toBeGreaterThan(initialRevision);
  expect(sent.filter(m=>m.type==='action')).toHaveLength(1);
  expect(sent.filter(m=>['create','join','ready','addBot'].includes(m.type))).toHaveLength(originalWrites);
  mkdirSync('docs/research/network-recovery',{recursive:true});
  writeFileSync(`docs/research/network-recovery/live-${info.project.name}.json`,JSON.stringify({at:new Date().toISOString(),browser:info.project.name,outageMs:120000,recoveryMs,serverAcceptedBeforeOutage:accepted,clientActionRequests:1,sameAccountAndRoom:true,handMatchesLatestServer:true,initialRound:original.view.round,restoredRound:restored.round,restoredPhase:restored.phase,limitations:'Real local game with three bots and an authenticated browser. Application messages dropped; not OS process death or mobile radio switching.'},null,2)+'\n');
});
