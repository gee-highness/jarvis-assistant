package com.jarvis.assistant;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(JarvisDevicePlugin.class);
        registerPlugin(JarvisLlmPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
