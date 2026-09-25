package com.jinling.mahjong;

import com.getcapacitor.BridgeActivity;
import android.os.Bundle;

public class MainActivity extends BridgeActivity {
    @Override public void onCreate(Bundle savedInstanceState) {
        registerPlugin(AppUpdatePlugin.class);
        registerPlugin(AppDiagnosticsPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
