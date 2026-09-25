package com.jinling.mahjong;

import android.content.pm.PackageInfo;
import android.os.Build;
import android.webkit.WebView;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** App/device capability metadata only. No system log, identifier or storage permissions. */
@CapacitorPlugin(name="AppDiagnostics")
public final class AppDiagnosticsPlugin extends Plugin {
    @PluginMethod public void getInfo(PluginCall call) {
        getActivity().runOnUiThread(()->{
            try {
                PackageInfo app=getContext().getPackageManager().getPackageInfo(getContext().getPackageName(),0);
                JSObject info=new JSObject();info.put("appVersion",app.versionName);
                info.put("build",String.valueOf(Build.VERSION.SDK_INT>=28?app.getLongVersionCode():app.versionCode));
                info.put("android",Build.VERSION.RELEASE);info.put("api",Build.VERSION.SDK_INT);
                info.put("manufacturer",Build.MANUFACTURER);info.put("model",Build.MODEL);
                if(Build.VERSION.SDK_INT>=26){PackageInfo web=WebView.getCurrentWebViewPackage();if(web!=null){info.put("webViewPackage",web.packageName);info.put("webViewVersion",web.versionName);}}
                else {
                    Matcher matcher=Pattern.compile("Chrome/([0-9.]+)").matcher(getBridge().getWebView().getSettings().getUserAgentString());
                    if(matcher.find())info.put("webViewVersion",matcher.group(1));
                }
                call.resolve(info);
            }catch(Exception error){call.reject("无法读取设备诊断信息",error);}
        });
    }
}
