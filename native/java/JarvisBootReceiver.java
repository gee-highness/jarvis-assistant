package com.jarvis.assistant;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Restarts the always-on service after a reboot or app update (only if the user enabled it). */
public class JarvisBootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context c, Intent i) {
        if (!JarvisCoreService.enabled(c)) return;
        try { JarvisCoreService.start(c); } catch (Exception ignored) { }
    }
}
