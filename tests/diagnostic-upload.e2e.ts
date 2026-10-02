import {test,expect} from '@playwright/test';
import {browserAccount} from './browser-fixtures';

for(const platform of ['ios','android'])test(`${platform} 我的帮助上传日志，经真实接口落库并可由后台拉取`,async({page,context})=>{
 const account=await browserAccount(context,'日志测试会员',false,'member');
 await context.addInitScript(platform=>{
  const win=window as any;win.CapacitorCustomPlatform={name:platform};
  win.Capacitor={PluginHeaders:[{name:'AppDiagnostics',methods:[{name:'getInfo',rtype:'promise'}]}],nativePromise:async()=>({appVersion:'0.8.2',model:platform==='ios'?'iPhone10,1':'Android Test',ios:platform==='ios'?'15.3':'',android:platform==='android'?'11':'',webViewPackage:platform==='ios'?'WKWebView':'com.android.webview',token:'must-not-upload'})};
  delete (CanvasRenderingContext2D.prototype as any).roundRect;
 },platform);
 await page.setViewportSize({width:667,height:375});await page.goto('/');
 await page.getByRole('button',{name:'我的',exact:true}).click();
 await page.getByRole('button',{name:'帮助与反馈',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'帮助与反馈'}),upload=dialog.getByRole('button',{name:'上传日志',exact:true});
 await expect(upload).toBeEnabled();
 const request=page.waitForResponse(r=>r.url().endsWith('/api/diagnostics'));
 await upload.click();const response=await request;expect(response.status()).toBe(200);
 await expect(dialog.getByRole('status')).toContainText('日志上传成功');
 const receipt=await response.json();
 const adminContext=await context.browser()!.newContext();const admin=await browserAccount(adminContext,'诊断后台管理员');
 const logs=await context.request.get(`/api/control/members/${account.account.id}/diagnostics`,{headers:{Authorization:`Bearer ${admin.token}`}});
 expect(logs.status()).toBe(200);const data=await logs.json();expect(data.requests[0]).toMatchObject({id:receipt.id,source:'user',report:{version:2,platform,environment:{roundRect:false},coverage:{retentionHours:24}}});expect(JSON.stringify(data)).not.toContain('must-not-upload');
 const refused=await context.request.get(`/api/control/members/${account.account.id}/diagnostics`,{headers:{Authorization:`Bearer ${account.token}`}});expect(refused.status()).toBe(403);
 await page.screenshot({path:`output/qa/diagnostics-upload-${platform}.png`});
 expect(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
 await upload.click();await expect(dialog.getByRole('alert')).toContainText('一分钟');
 await adminContext.close();
});

test('网页旧客户端清楚显示日志功能不可用，仍保留文字反馈',async({page,context})=>{
 await browserAccount(context,'普通网页用户');await page.goto('/');await page.getByRole('button',{name:'我的',exact:true}).click();await page.getByRole('button',{name:'帮助与反馈',exact:true}).click();
 await expect(page.getByRole('button',{name:'上传日志',exact:true})).toBeDisabled();await expect(page.getByRole('button',{name:'提交反馈',exact:true})).toBeEnabled();
});

test('旧服务拒绝v2格式时用同一上传编号降级，不要求用户再次点击',async({page,context})=>{
 await browserAccount(context,'日志兼容会员',false,'member');
 await context.addInitScript(()=>{
  const win=window as any;win.CapacitorCustomPlatform={name:'ios'};
  win.Capacitor={PluginHeaders:[{name:'AppDiagnostics',methods:[{name:'getInfo',rtype:'promise'}]}],nativePromise:async()=>({appVersion:'0.9.2',model:'test'})};
 });
 const sent:{id:string;report:{version:number}}[]=[];
 await page.route('**/api/diagnostics',route=>{
  const payload=route.request().postDataJSON();sent.push(payload);
  if(payload.report.version===2)return route.fulfill({status:400,json:{error:'日志格式不正确或内容过长'}});
  return route.continue();
 });
 await page.goto('/');await page.getByRole('button',{name:'我的',exact:true}).click();await page.getByRole('button',{name:'帮助与反馈',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'帮助与反馈'});await dialog.getByRole('button',{name:'上传日志',exact:true}).click();
 await expect(dialog.getByRole('status')).toContainText('日志上传成功');
 expect(sent.map(s=>s.report.version)).toEqual([2,1]);expect(sent[0].id).toBe(sent[1].id);
});
