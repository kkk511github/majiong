import {afterEach,expect,it,vi} from 'vitest';
import {Capacitor} from '@capacitor/core';
import {App} from '@capacitor/app';
import {GameClient} from '../src/game-client';

vi.mock('@capacitor/app',()=>({App:{getInfo:vi.fn()}}));
let client:GameClient|undefined;
afterEach(()=>{client?.disconnect();vi.restoreAllMocks();vi.unstubAllGlobals();});

it.each(['ios','android','web'])('hello reports %s without inferring a native app from a mobile browser UA',async platform=>{
 vi.spyOn(Capacitor,'getPlatform').mockReturnValue(platform);
 vi.spyOn(Capacitor,'isNativePlatform').mockReturnValue(platform!=='web');
 vi.mocked(App.getInfo).mockResolvedValue({name:'test',id:'test.app',version:'0.9.1',build:'93'});
 vi.stubGlobal('location',{protocol:'http:',host:'localhost:5173'});
 vi.stubGlobal('navigator',{onLine:true,userAgent:'iPhone Android mobile browser'});
 let socket:Socket|undefined;
 class Socket{
  static OPEN=1;static CLOSING=2;static CLOSED=3;
  readyState=1;sent:Record<string,unknown>[]=[];onopen?:()=>Promise<void>;
  constructor(){socket=this;}
  send(raw:string){this.sent.push(JSON.parse(raw));}
  close(){this.readyState=3;}
 }
 vi.stubGlobal('WebSocket',Socket);
 client=new GameClient();client.connect('平台测试');await socket!.onopen!();
 expect(socket!.sent.find(m=>m.type==='hello')).toMatchObject({clientPlatform:platform});
});
