import {afterEach,beforeEach,it,expect,vi} from 'vitest';
const mock=vi.hoisted(()=>({platform:'android',getInfo:vi.fn()}));
vi.mock('@capacitor/core',()=>({Capacitor:{getPlatform:()=>mock.platform,isPluginAvailable:()=>true},registerPlugin:()=>({getInfo:()=>mock.getInfo()})}));
beforeEach(()=>{
 vi.resetModules();mock.platform='android';mock.getInfo.mockReset().mockResolvedValue({appVersion:'0.8.1',webViewVersion:'83',token:'private'});
 const data=new Map<string,string>();vi.stubGlobal('localStorage',{getItem:(key:string)=>data.get(key)??null,setItem:(key:string,v:string)=>data.set(key,v),removeItem:(key:string)=>data.delete(key)});
 vi.stubGlobal('window',{addEventListener:vi.fn(),removeEventListener:vi.fn()});vi.stubGlobal('CanvasRenderingContext2D',{prototype:{}});
});
afterEach(()=>vi.unstubAllGlobals());
it('Android queues an admin request behind automatic error upload, strips secrets and never sends hand data',async()=>{
 const {androidDiagnostics:d}=await import('../src/android-diagnostics');const dispose=d.install(),send=vi.fn(()=>true);
 d.session('account-a',true,send);d.context({code:'123456',round:1,phase:'playing'});
 d.tableError({stage:'3d-models',name:'TypeError',message:'roundRect missing token=private'});
 d.request('00000000-0000-4000-8000-000000000001',Date.now()+60000);
 await vi.waitFor(()=>expect(send).toHaveBeenCalledTimes(2));
 const report=send.mock.calls[0] as unknown as [string,any];expect(report[0]).toBe('auto');expect(report[1].environment).toMatchObject({appVersion:'0.8.1',roundRect:false,stage:'3d-models'});expect(JSON.stringify(report)).not.toContain('private');
 d.ack('auto',true);d.disconnect();dispose();
});
it.each(['web'])('does not collect, persist or upload on %s',async platform=>{
 mock.platform=platform;const {androidDiagnostics:d}=await import('../src/android-diagnostics'),send=vi.fn(()=>true);
 d.install();d.session('account',true,send);d.tableError({message:'failure'});d.request('00000000-0000-4000-8000-000000000001',Date.now()+60000);
 expect(d.enabled()).toBe(false);expect(send).not.toHaveBeenCalled();expect(mock.getInfo).not.toHaveBeenCalled();expect(localStorage.getItem('jinling:android-diagnostics-v1')).toBeNull();
});
it('iOS supports manual reports without a game WebSocket and automatic/admin collection',async()=>{
 mock.platform='ios';mock.getInfo.mockResolvedValue({ios:'15.3',model:'iPhone10,1',appVersion:'0.8.2',webViewPackage:'WKWebView'});
 const {appDiagnostics:d}=await import('../src/app-diagnostics');d.install();
 d.session('ios-player',false,()=>false);d.tableError({stage:'3d-models',message:'test error'});
 const manual=await d.manualReport('ios-player');expect(manual.platform).toBe('ios');expect(manual.environment.ios).toBe('15.3');expect(manual.events.some(e=>e.code==='table-error')).toBe(true);
 const send=vi.fn(()=>true);d.session('ios-player',true,send);await vi.waitFor(()=>expect(send).toHaveBeenCalled());d.ack('auto',true);
 d.request('00000000-0000-4000-8000-000000000002',Date.now()+60000);await vi.waitFor(()=>expect(send).toHaveBeenCalledTimes(2));
 const switched=await d.manualReport('different-account');expect(switched.events).toEqual([]);expect(switched.environment.stage).toBeUndefined();d.logout();
});
it('requires server capability and clears the previous account before collecting for a new one',async()=>{
 const {androidDiagnostics:d}=await import('../src/android-diagnostics');d.install();const send=vi.fn(()=>true);d.session('first',false,send);d.tableError({message:'first-account-failure'});expect(send).not.toHaveBeenCalled();
 d.session('second',true,send);d.request('00000000-0000-4000-8000-000000000001',Date.now()+60000);await vi.waitFor(()=>expect(send).toHaveBeenCalledOnce());
 expect(JSON.stringify(send.mock.calls)).not.toContain('first-account-failure');d.logout();expect(localStorage.getItem('jinling:android-diagnostics-v1')).toBeNull();
});
it('does not renew the age of stale logs when the app restarts',async()=>{
 localStorage.setItem('jinling:android-diagnostics-v1',JSON.stringify({account:'a',events:[{at:Date.now()-2*86400000,code:'table-error',message:'expired-error'}]}));
 const {appDiagnostics:d}=await import('../src/app-diagnostics');d.install();const report=await d.manualReport('a');expect(JSON.stringify(report)).not.toContain('expired-error');d.logout();
});
