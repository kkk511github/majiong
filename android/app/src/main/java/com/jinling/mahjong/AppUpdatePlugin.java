package com.jinling.mahjong;

import android.content.ClipData;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.URL;
import javax.net.ssl.HttpsURLConnection;
import java.security.MessageDigest;
import java.util.Arrays;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

/** Explicit user-initiated updates; neither downloading nor installing is automatic. */
@CapacitorPlugin(name = "AppUpdate")
public final class AppUpdatePlugin extends Plugin {
    private static final String HOST = "212.189.31.46", PACKAGE = "com.jinling.mahjong";
    private static final long MAX_UPDATE_BYTES = 1024L * 1024 * 1024;
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private final AtomicBoolean busy = new AtomicBoolean(false);
    private volatile boolean cancelled, foreground = true, destroyed;
    private volatile HttpsURLConnection connection;
    private volatile JSObject progress = event("idle", 0, 0, "");
    private volatile PluginCall pendingCall;
    private volatile File prepared;

    private static JSObject event(String status, long received, long total, String message) {
        JSObject data = new JSObject(); data.put("status", status); data.put("received", received); data.put("total", total);
        data.put("percent", total > 0 ? Math.min(100, Math.max(0, received * 100.0 / total)) : 0); data.put("message", message); return data;
    }
    private void report(String status, long received, long total, String message) {
        progress = event(status, received, total, message);
        JSObject update = progress;
        if (!destroyed) getActivity().runOnUiThread(() -> { if (!destroyed) notifyListeners("progress", update); });
    }
    private File directory() throws Exception {
        File dir = new File(getContext().getFilesDir(), "updates");
        if (!dir.isDirectory() && !dir.mkdirs()) throw new Exception("无法创建更新目录");
        return dir;
    }
    private SharedPreferences preferences() { return getContext().getSharedPreferences("app-update", 0); }
    private PackageInfo installed() throws Exception {
        return getContext().getPackageManager().getPackageInfo(getContext().getPackageName(), Build.VERSION.SDK_INT >= 28 ? PackageManager.GET_SIGNING_CERTIFICATES : PackageManager.GET_SIGNATURES);
    }
    private static long buildNumber(PackageInfo info) { return Build.VERSION.SDK_INT >= 28 ? info.getLongVersionCode() : info.versionCode; }
    @PluginMethod public void getInfo(PluginCall call) {
        try { PackageInfo info = installed(); JSObject data = new JSObject(); data.put("version", info.versionName); data.put("build", Long.toString(buildNumber(info))); data.put("packageName", info.packageName); data.put("osVersion", Build.VERSION.RELEASE); call.resolve(data); }
        catch (Exception error) { call.reject("无法读取当前应用版本", error); }
    }
    @PluginMethod public void getProgress(PluginCall call) { call.resolve(progress); }
    @PluginMethod public void openInstallPage(PluginCall call) {
        getActivity().runOnUiThread(() -> { try { getActivity().startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse("https://" + HOST + "/app/jinling-mahjong?platform=android"))); JSObject result = new JSObject(); result.put("status", "page-opened"); call.resolve(result); } catch (Exception error) { call.reject("无法打开安装页面", error); } });
    }
    @PluginMethod public void cancel(PluginCall call) {
        cancelled = true; HttpsURLConnection current = connection; if (current != null) current.disconnect();
        getActivity().runOnUiThread(() -> { preferences().edit().clear().apply(); if (prepared != null) prepared.delete(); prepared = null;
            if (pendingCall != null) { pendingCall.reject("已取消更新"); pendingCall = null; }
            report("cancelled", 0, 0, "已取消更新"); call.resolve(); });
    }
    @PluginMethod public void install(PluginCall call) {
        final String address = call.getString("url", ""), sha = call.getString("sha256", ""), build = call.getString("build", "");
        final Long sizeValue = readUpdateSize(call);
        try { validate(address, sha, sizeValue, build); }
        catch (Exception error) { call.reject(error.getMessage(), error); return; }
        if (pendingCall != null || !busy.compareAndSet(false, true)) { call.reject("更新正在处理中，请稍候"); return; }
        cancelled = false; prepared = null;
        preferences().edit().putBoolean("awaitPermission", false).apply();
        getActivity().runOnUiThread(() -> pendingCall = call);
        worker.execute(() -> {
            File part = null;
            try {
                File dir = directory(), target = new File(dir, sha + ".apk");
                for (File old : dir.listFiles() == null ? new File[0] : dir.listFiles()) if (!old.getName().equals(target.getName())) old.delete();
                if (!target.isFile()) {
                    part = new File(dir, sha + ".part"); part.delete();
                    download(address, part, sha, sizeValue);
                    verify(part, sha, sizeValue, build);
                    if (cancelled) throw new InterruptedException("已取消更新");
                    if (!part.renameTo(target)) throw new Exception("无法保存已校验的安装包");
                } else verify(target, sha, sizeValue, build);
                if (cancelled) throw new InterruptedException("已取消更新");
                preferences().edit().putString("sha", sha).putLong("size", sizeValue).putString("build", build).putBoolean("awaitPermission", false).apply();
                prepared = target;
                report("verifying", sizeValue, sizeValue, "安装包已校验，返回应用后由系统确认安装");
                getActivity().runOnUiThread(() -> { if (foreground && !cancelled && !destroyed) offerInstaller(); });
            } catch (Exception error) { fail(error); }
            finally { if (part != null) part.delete(); HttpsURLConnection current = connection; if (current != null) current.disconnect(); connection = null; busy.set(false); }
        });
    }
    // JSON integers below 2^31 arrive as Integer; Capacitor getLong only accepts
    // a boxed Long. Accept a numeric integer without coercing strings or truncating.
    static Long readUpdateSize(PluginCall call) {
        Object raw = call.getData().opt("size");
        if (!(raw instanceof Number)) return null;
        double bytes = ((Number) raw).doubleValue();
        if (Double.isNaN(bytes) || Double.isInfinite(bytes) || bytes <= 0 || bytes > MAX_UPDATE_BYTES || bytes != Math.rint(bytes)) return null;
        return (long) bytes;
    }
    private void validate(String address, String sha, Long size, String build) throws Exception {
        URL url = new URL(address);
        if (!"https".equals(url.getProtocol()) || !HOST.equals(url.getHost()) || url.getPort() != -1 && url.getPort() != 443 || url.getUserInfo() != null || url.getQuery() != null || url.getRef() != null || !url.getPath().matches("/download/[a-f0-9]{24}\\.apk")) throw new Exception("更新地址不受信任");
        if (!sha.matches("[a-f0-9]{64}") || size == null || size <= 0 || size > MAX_UPDATE_BYTES || !build.matches("[0-9]+")) throw new Exception("安装包校验信息无效，请重新检查版本");
        if (Long.parseLong(build) <= buildNumber(installed())) throw new Exception("该安装包不是更新版本");
    }
    private void download(String address, File target, String sha, long expectedSize) throws Exception {
        HttpsURLConnection request = (HttpsURLConnection) new URL(address).openConnection(); connection = request;
        // Use normal system certificate validation and the app's existing host pins.
        request.setInstanceFollowRedirects(false); request.setConnectTimeout(15000); request.setReadTimeout(30000); request.setRequestProperty("Accept-Encoding", "identity");
        if (request.getResponseCode() != 200) throw new Exception("下载失败或地址发生跳转，请重新检查版本");
        long announced = request.getContentLengthLong(); if (announced > 0 && announced != expectedSize) throw new Exception("安装包已变更，请重新检查版本");
        report("downloading", 0, expectedSize, "正在下载安装包"); long count = 0, lastUpdate = 0;
        try (InputStream input = request.getInputStream(); FileOutputStream output = new FileOutputStream(target)) {
            byte[] buffer = new byte[65536]; int length;
            while ((length = input.read(buffer)) != -1) {
                if (cancelled || Thread.currentThread().isInterrupted()) throw new InterruptedException("已取消更新");
                count += length; if (count > expectedSize) throw new Exception("安装包大小校验失败"); output.write(buffer, 0, length);
                long now = System.currentTimeMillis(); if (now - lastUpdate >= 140) { report("downloading", count, expectedSize, "正在下载安装包"); lastUpdate = now; }
            }
            output.getFD().sync();
        } finally { request.disconnect(); }
        if (count != expectedSize) throw new Exception("下载不完整，请重试");
    }
    private void verify(File file, String expectedSha, long expectedSize, String build) throws Exception {
        report("verifying", file.length(), expectedSize, "正在校验安装包和应用签名");
        if (file.length() != expectedSize) throw new Exception("安装包大小校验失败");
        MessageDigest hash = MessageDigest.getInstance("SHA-256");
        try (InputStream input = new FileInputStream(file)) { byte[] buffer = new byte[65536]; int count; while ((count = input.read(buffer)) != -1) { if (cancelled) throw new InterruptedException("已取消更新"); hash.update(buffer, 0, count); } }
        if (!expectedSha.equals(hex(hash.digest()))) throw new Exception("安装包校验失败，请重新下载");
        PackageManager manager = getContext().getPackageManager();
        PackageInfo candidate = manager.getPackageArchiveInfo(file.getAbsolutePath(), Build.VERSION.SDK_INT >= 28 ? PackageManager.GET_SIGNING_CERTIFICATES : PackageManager.GET_SIGNATURES);
        PackageInfo current = installed();
        if (candidate == null || !PACKAGE.equals(candidate.packageName) || !current.packageName.equals(candidate.packageName)) throw new Exception("安装包应用标识不匹配");
        if (candidate.applicationInfo == null || candidate.applicationInfo.minSdkVersion > Build.VERSION.SDK_INT) throw new Exception("当前Android系统版本不支持此安装包");
        if (buildNumber(candidate) != Long.parseLong(build) || buildNumber(candidate) <= buildNumber(current)) throw new Exception("安装包构建号不匹配或不是更新版本");
        String[] oldSigners = signerDigests(current), newSigners = signerDigests(candidate);
        if (oldSigners.length == 0 || !Arrays.equals(oldSigners, newSigners)) throw new Exception("新安装包签名与当前应用不一致，不能覆盖更新，请联系管理员");
    }
    private static String[] signerDigests(PackageInfo info) throws Exception {
        Signature[] signatures = Build.VERSION.SDK_INT >= 28 ? info.signingInfo == null ? null : info.signingInfo.getApkContentsSigners() : info.signatures;
        if (signatures == null) return new String[0]; String[] values = new String[signatures.length];
        for (int i = 0; i < signatures.length; i++) values[i] = hex(MessageDigest.getInstance("SHA-256").digest(signatures[i].toByteArray()));
        Arrays.sort(values); return values;
    }
    private static String hex(byte[] bytes) { StringBuilder value = new StringBuilder(); for (byte b : bytes) value.append(String.format(java.util.Locale.ROOT, "%02x", b & 255)); return value.toString(); }
    private void offerInstaller() {
        if (cancelled || prepared == null || !prepared.isFile()) return;
        try {
            if (Build.VERSION.SDK_INT >= 26 && !getContext().getPackageManager().canRequestPackageInstalls()) {
                preferences().edit().putBoolean("awaitPermission", true).apply();
                report("permission-required", prepared.length(), prepared.length(), "请允许此应用安装更新，然后返回应用继续");
                getActivity().startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getContext().getPackageName())));
                resolvePending("permission-required"); return;
            }
            preferences().edit().putBoolean("awaitPermission", false).apply();
            Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", prepared);
            Intent intent = new Intent(Intent.ACTION_VIEW).setDataAndType(uri, "application/vnd.android.package-archive");
            intent.setClipData(ClipData.newRawUri("应用更新", uri)); intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            getActivity().startActivity(intent);
            report("installer-opened", prepared.length(), prepared.length(), "系统安装界面已打开，请确认安装；尚未确认安装完成");
            resolvePending("installer-opened"); prepared = null;
        } catch (Exception error) { fail(error); }
    }
    private void resolvePending(String status) { if (pendingCall != null) { JSObject result = new JSObject(); result.put("status", status); pendingCall.resolve(result); pendingCall = null; } }
    private void fail(Exception error) {
        if (cancelled) { report("cancelled", 0, 0, "已取消更新"); }
        else report("error", 0, 0, error.getMessage() == null ? "更新失败，请重试" : error.getMessage());
        if (!destroyed) getActivity().runOnUiThread(() -> { if (pendingCall != null) { pendingCall.reject(cancelled ? "已取消更新" : error.getMessage() == null ? "更新失败，请重试" : error.getMessage(), error); pendingCall = null; } });
    }
    @Override protected void handleOnPause() { foreground = false; }
    @Override protected void handleOnResume() {
        foreground = true;
        if (prepared != null && pendingCall != null) { offerInstaller(); return; }
        if (!preferences().getBoolean("awaitPermission", false) || busy.get()) return;
        preferences().edit().putBoolean("awaitPermission", false).apply();
        if (Build.VERSION.SDK_INT >= 26 && !getContext().getPackageManager().canRequestPackageInstalls()) { report("permission-required", 0, 0, "尚未获得安装权限，可再次点击更新继续"); return; }
        String sha = preferences().getString("sha", ""), build = preferences().getString("build", ""); long size = preferences().getLong("size", 0);
        if (!sha.matches("[a-f0-9]{64}") || !busy.compareAndSet(false, true)) return;
        cancelled = false;
        worker.execute(() -> { try { File file = new File(directory(), sha + ".apk"); verify(file, sha, size, build); prepared = file; getActivity().runOnUiThread(() -> { if (foreground && !cancelled) offerInstaller(); }); } catch (Exception error) { fail(error); } finally { busy.set(false); } });
    }
    @Override protected void handleOnDestroy() { destroyed = true; cancelled = true; HttpsURLConnection request = connection; if (request != null) request.disconnect(); worker.shutdownNow(); }
}
