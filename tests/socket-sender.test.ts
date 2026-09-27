import {it,expect,vi} from 'vitest';
import {createSocketSender} from '../server/socket-sender';
it('coalesces snapshots but flushes the latest state before a reliable acknowledgment',()=>{
 const sender=createSocketSender(()=>100),sent:any[]=[];
 const ws={readyState:1,bufferedAmount:200000,send:(s:string)=>sent.push(JSON.parse(s)),close:vi.fn()};
 sender.send(ws,{type:'tables',tables:[]});sender.send(ws,{type:'tables',tables:[]});
 expect(sent).toHaveLength(0);expect(sender.queued()).toBe(1);
 sender.send(ws,{type:'ack',requestId:'one'});
 expect(sent.map(x=>x.type)).toEqual(['tables','ack']);expect(sender.queued()).toBe(0);sender.close();
});
it('bounded slow peers disconnect explicitly, and transport errors never crash publication',()=>{
 const sender=createSocketSender();const ws={readyState:1,bufferedAmount:2e6,send:vi.fn(),close:vi.fn()};
 sender.send(ws,{type:'ack',requestId:'one'});expect(ws.send).not.toHaveBeenCalled();expect(ws.close).toHaveBeenCalledWith(1013,expect.any(String));
 ws.bufferedAmount=0;ws.send.mockImplementation(()=>{throw Error('closed')});expect(()=>sender.send(ws,{type:'ack',requestId:'two'})).not.toThrow();sender.close();
});
it('drains on recovery and closes stalled queues without extending age on updates',()=>{
 vi.useFakeTimers();let at=0;const sender=createSocketSender(()=>at),sent:any[]=[];
 const ws={readyState:1,bufferedAmount:200000,send:(x:string)=>sent.push(x),close:vi.fn()};
 try{sender.send(ws,{type:'tables',tables:[]});ws.bufferedAmount=0;vi.advanceTimersByTime(100);expect(sent).toHaveLength(1);
 ws.bufferedAmount=200000;sender.send(ws,{type:'tables',tables:[]});at=5001;sender.send(ws,{type:'tables',tables:[]});vi.advanceTimersByTime(100);expect(ws.close).toHaveBeenCalled();}
 finally{sender.close();vi.useRealTimers();}
});
