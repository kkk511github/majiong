package com.jinling.mahjong;

import static org.junit.Assert.*;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import com.getcapacitor.JSObject;
import com.getcapacitor.PluginCall;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import org.json.JSONException;
import org.junit.Test;
import org.junit.runner.RunWith;

/** Executes with Android's real org.json and the installed Capacitor classes. */
@RunWith(AndroidJUnit4.class)
public final class AppUpdatePluginTest {
    private static final String URL = "https://212.189.31.46/download/247db54dd42a67ad48643ed5.apk";
    private static final String SHA = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

    private static PluginCall call(String json) throws JSONException {
        return new PluginCall(null, "AppUpdate", "qa", "install", new JSObject(json));
    }

    @Test public void actualJsonIntegerReproducesOldFailureAndNowPasses() throws Exception {
        PluginCall call = call("{\"size\":121874939}");
        assertTrue(call.getData().opt("size") instanceof Integer);
        assertNull("Capacitor getLong misses Android JSONObject Integer", call.getLong("size"));
        assertEquals(Long.valueOf(121874939L), AppUpdatePlugin.readUpdateSize(call));
    }

    @Test public void numericIntegersKeepOneGiBLimitAcrossRepresentations() throws Exception {
        String[] json = {"1", "121874939", "121874939.0", "1e2", "1073741824"};
        long[] expected = {1, 121874939L, 121874939L, 100, 1073741824L};
        for (int i = 0; i < json.length; i++)
            assertEquals(json[i], Long.valueOf(expected[i]), AppUpdatePlugin.readUpdateSize(call("{\"size\":" + json[i] + "}")));
        JSObject nativeLong = new JSObject(); nativeLong.put("size", 121874939L);
        assertEquals(Long.valueOf(121874939L), AppUpdatePlugin.readUpdateSize(new PluginCall(null, "AppUpdate", "qa", "install", nativeLong)));
    }

    @Test public void missingCoercedFractionalNonfiniteAndOversizeValuesAreRejected() throws Exception {
        assertNull(AppUpdatePlugin.readUpdateSize(call("{}")));
        for (String value : new String[]{"null", "\"121874939\"", "true", "false", "[]", "{}", "0", "-0.0", "-1", "1.5", "1073741823.5", "1073741825", "2147483648", "9223372036854775807", "1e309", "NaN"}) {
            try { assertNull(value, AppUpdatePlugin.readUpdateSize(call("{\"size\":" + value + "}"))); }
            catch (JSONException rejectedByJsonParser) { /* Non-finite input may be rejected before the bridge. */ }
        }
    }

    private static void rejectMetadata(String url, String sha, Long size, String build, String expected) throws Exception {
        AppUpdatePlugin plugin = new AppUpdatePlugin();
        Method validate = AppUpdatePlugin.class.getDeclaredMethod("validate", String.class, String.class, Long.class, String.class);
        validate.setAccessible(true);
        try {
            validate.invoke(plugin, url, sha, size, build);
            fail("Untrusted metadata was accepted");
        } catch (InvocationTargetException rejection) {
            assertEquals(expected, rejection.getCause().getMessage());
        } finally { plugin.handleOnDestroy(); }
    }

    @Test public void trustedAddressAndMetadataGuardsRemainStrict() throws Exception {
        for (String address : new String[]{
            URL.replace("https:", "http:"), URL.replace("212.189.31.46", "example.com"),
            URL.replace("212.189.31.46", "212.189.31.46:444"),
            URL.replace("212.189.31.46", "user:password@212.189.31.46"),
            URL + "?changed=1", URL + "#fragment", URL.replace(".apk", ".ipa")
        }) rejectMetadata(address, SHA, 121874939L, "66", "更新地址不受信任");
        for (String sha : new String[]{"", SHA.substring(1), SHA.toUpperCase(java.util.Locale.ROOT), SHA.substring(0, 63) + "g"})
            rejectMetadata(URL, sha, 121874939L, "66", "安装包校验信息无效，请重新检查版本");
        for (Long size : new Long[]{null, 0L, -1L, 1073741825L})
            rejectMetadata(URL, SHA, size, "66", "安装包校验信息无效，请重新检查版本");
        for (String build : new String[]{"", "66.0", "-1", "1e2", " 66"})
            rejectMetadata(URL, SHA, 121874939L, build, "安装包校验信息无效，请重新检查版本");
    }
}
