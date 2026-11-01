package com.jarvis.assistant;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Restarts the always-on service after a reboot or app update (only if the user enabled it). */
public class JarvisBootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context c, Intent i) {
        if (JarvisCoreService.enabled(c)) { try { JarvisCoreService.start(c); } catch (Exception ignored) { } }
        if (JarvisPetOverlayService.enabled(c) && JarvisPetOverlayService.canDraw(c)) { try { JarvisPetOverlayService.start(c); } catch (Exception ignored) { } }
    }
}
