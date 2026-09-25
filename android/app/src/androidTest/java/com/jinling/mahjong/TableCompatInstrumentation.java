package com.jinling.mahjong;

import android.app.Activity;
import android.app.Instrumentation;
import android.content.Intent;
import android.os.Bundle;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebView;
import android.webkit.WebChromeClient;
import android.webkit.ConsoleMessage;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

/** Framework-only runner can test an already-shrunk signed production APK.
 * AndroidX runners expect unshrunk Kotlin classes in the target debug app. */
public final class TableCompatInstrumentation extends Instrumentation {
 private Bundle arguments;
 @Override public void onCreate(Bundle args){arguments=args;start();}
 private WebView find(View view){if(view instanceof WebView)return (WebView)view;if(view instanceof ViewGroup){ViewGroup group=(ViewGroup)view;for(int i=0;i<group.getChildCount();i++){WebView found=find(group.getChildAt(i));if(found!=null)return found;}}return null;}
 private String evaluate(WebView web,String script)throws Exception{AtomicReference<String> value=new AtomicReference<>();CountDownLatch done=new CountDownLatch(1);runOnMainSync(()->web.evaluateJavascript(script,result->{value.set(result);done.countDown();}));if(!done.await(5,TimeUnit.SECONDS))throw new Exception("JS callback timed out");return value.get();}
 private void waitingLayout(WebView web,Bundle result)throws Exception{
  String html;
  try(java.io.InputStream input=getContext().getAssets().open(arguments.getString("waitingFixture"));java.io.ByteArrayOutputStream bytes=new java.io.ByteArrayOutputStream()){
   byte[] buffer=new byte[8192];int read;while((read=input.read(buffer))!=-1)bytes.write(buffer,0,read);html=new String(bytes.toByteArray(),java.nio.charset.StandardCharsets.UTF_8);
  }
  int zoom=Integer.parseInt(arguments.getString("textZoom","100"));
  runOnMainSync(()->{web.getSettings().setTextZoom(zoom);web.loadDataWithBaseURL("https://localhost/",html,"text/html","UTF-8",null);});Thread.sleep(1800);
  String geometry=evaluate(web,"JSON.stringify((function(){function box(s){var r=document.querySelector(s).getBoundingClientRect();return {top:r.top,bottom:r.bottom,height:r.height};}return {height:innerHeight,header:box('.page-heading'),code:box('.room-code'),seats:box('.waiting-seats'),footer:box('.waiting-footer')};})())");
  org.json.JSONObject g=new org.json.JSONObject((String)new org.json.JSONTokener(geometry).nextValue());
  boolean fits=g.getJSONObject("header").getDouble("bottom")+2<=g.getJSONObject("seats").getDouble("top")&&g.getJSONObject("code").getDouble("bottom")+2<=g.getJSONObject("seats").getDouble("top")&&g.getJSONObject("seats").getDouble("bottom")+2<=g.getJSONObject("footer").getDouble("top");
  result.putString("geometry",geometry);result.putInt("textZoom",zoom);result.putString("webView",WebView.getCurrentWebViewPackage().versionName);
  if(!fits)throw new Exception("Waiting sections overlap: "+geometry);
  evaluate(web,"document.querySelector('.waiting-room').scrollTop=10000;true");Thread.sleep(200);
  String bottom=evaluate(web,"document.querySelector('.waiting-actions .primary').getBoundingClientRect().bottom<=innerHeight");if(!"true".equals(bottom))throw new Exception("Footer cannot be reached");
  evaluate(web,"document.querySelector('.waiting-room').scrollTop=0;true");Thread.sleep(200);
  android.graphics.Bitmap image=getUiAutomation().takeScreenshot();if(image!=null){java.io.File shot=new java.io.File(getTargetContext().getExternalFilesDir(null),"waiting-compat-"+zoom+".png");try(java.io.FileOutputStream out=new java.io.FileOutputStream(shot)){image.compress(android.graphics.Bitmap.CompressFormat.PNG,100,out);}result.putString("screenshot",shot.getAbsolutePath());}
 }
 @Override public void onStart(){Bundle result=new Bundle();try{
  String version=getTargetContext().getPackageManager().getPackageInfo("com.jinling.mahjong",0).versionName;
  if(!version.equals(arguments.getString("expectedVersion","0.8.0")))throw new Exception("Wrong APK "+version);
  Intent intent=getTargetContext().getPackageManager().getLaunchIntentForPackage("com.jinling.mahjong");intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK|Intent.FLAG_ACTIVITY_CLEAR_TASK);
  Activity activity=startActivitySync(intent);AtomicReference<WebView> target=new AtomicReference<>();runOnMainSync(()->target.set(find(activity.getWindow().getDecorView())));WebView web=target.get();if(web==null)throw new Exception("Missing WebView");
  if(arguments.containsKey("waitingFixture")){waitingLayout(web,result);result.putString("result","PASS");finish(Activity.RESULT_OK,result);return;}
  java.util.List<String> errors=new java.util.concurrent.CopyOnWriteArrayList<>();
  runOnMainSync(()->{WebChromeClient original=web.getWebChromeClient();web.setWebChromeClient(new WebChromeClient(){@Override public boolean onConsoleMessage(ConsoleMessage message){if(errors.size()<16)errors.add(message.messageLevel()+": "+message.message());return original!=null&&original.onConsoleMessage(message);}});});
  Thread.sleep(5000);result.putString("mainPage",evaluate(web,"JSON.stringify({url:location.href,body:document.body.innerText.slice(0,500)})"));
  runOnMainSync(()->web.loadUrl("https://localhost/cocos-table/index.html"));
  String ready="false";long deadline=System.currentTimeMillis()+35000;
  while(System.currentTimeMillis()<deadline){Thread.sleep(500);ready=evaluate(web,"Boolean(window.__JINLING_TABLE_READY__)");if("true".equals(ready))break;}
  result.putString("installedVersion",version);result.putString("webView",WebView.getCurrentWebViewPackage().versionName);result.putString("roundRect",evaluate(web,"typeof CanvasRenderingContext2D.prototype.roundRect"));result.putString("ready",ready);
  result.putString("console",errors.toString());result.putString("page",evaluate(web,"JSON.stringify({url:location.href,body:document.body.innerText.slice(0,500),system:typeof window.System})"));
  result.putString("models",evaluate(web,"JSON.stringify(window.__JINLING_TABLE_3D__ && {enabled:window.__JINLING_TABLE_3D__.enabled,tiles:window.__JINLING_TABLE_3D__.meshTiles})"));
  if("true".equals(ready)&&!version.equals("0.8.0")){
   result.putString("diagnosticCapability",evaluate(web,"JSON.stringify({platform:window.Capacitor.getPlatform(),supported:window.Capacitor.isPluginAvailable('AppDiagnostics')})"));
   evaluate(web,"window.__nativeDiagnosticResult=null;window.Capacitor.nativePromise('AppDiagnostics','getInfo',{}).then(function(v){window.__nativeDiagnosticResult=v;}).catch(function(e){window.__nativeDiagnosticResult={error:String(e)};});true");
   Thread.sleep(1500);String metadata=evaluate(web,"JSON.stringify(window.__nativeDiagnosticResult)");result.putString("nativeDiagnostics",metadata);if(metadata==null||!metadata.contains("webViewVersion"))throw new Exception("Native diagnostics unavailable: "+metadata);
  }
  if(!ready.equals(arguments.getString("expectedReady","true")))throw new Exception("Readiness mismatch: "+ready);
  android.graphics.Bitmap screenshot=getUiAutomation().takeScreenshot();
  if(screenshot!=null){java.io.File file=new java.io.File(getTargetContext().getExternalFilesDir(null),"table-compat-"+version+".png");try(java.io.FileOutputStream out=new java.io.FileOutputStream(file)){screenshot.compress(android.graphics.Bitmap.CompressFormat.PNG,100,out);}result.putString("screenshot",file.getAbsolutePath());}
  result.putString("result","PASS");finish(Activity.RESULT_OK,result);
 }catch(Throwable error){result.putString("result","FAIL");result.putString("error",android.util.Log.getStackTraceString(error));finish(Activity.RESULT_CANCELED,result);}}
}
