package com.jarvis.assistant;

import android.content.Intent;
import android.net.Uri;
import android.provider.Settings;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "JarvisPet")
public class JarvisPetPlugin extends Plugin {
    @PluginMethod
    public void update(PluginCall call) {
        JarvisPetWidget.save(getContext(), call.getString("idle"), call.getString("happy"), call.getString("line"), call.getString("status"), call.getString("reactions"), call.getString("sleep"), call.getString("walk"), call.getString("walk2"));
        call.resolve();
    }

    @PluginMethod
    public void takeTaps(PluginCall call) {
        JSObject o = new JSObject();
        o.put("taps", JarvisPetWidget.takeTaps(getContext()));
        call.resolve(o);
    }

    // ------------------------------------------------------------ the roaming pup (see JarvisPetOverlayService)
    @PluginMethod
    public void overlayStatus(PluginCall call) {
        JSObject o = new JSObject();
        o.put("granted", JarvisPetOverlayService.canDraw(getContext()));
        o.put("running", JarvisPetOverlayService.running);
        o.put("enabled", JarvisPetOverlayService.enabled(getContext()));
        o.put("usageAccess", JarvisPetOverlayService.hasUsage(getContext()));
        call.resolve(o);
    }

    @PluginMethod
    public void requestOverlayPermission(PluginCall call) {
        try {
            Intent i = new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:" + getContext().getPackageName()));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
            call.resolve();
        } catch (Exception e) { call.reject("Could not open the permission screen"); }
    }

    @PluginMethod
    public void overlayStart(PluginCall call) {
        if (!JarvisPetOverlayService.canDraw(getContext())) { call.reject("Display over other apps is not allowed yet"); return; }
        JarvisPetOverlayService.configure(getContext(), call.getString("where", "home"), call.getInt("size", 88), call.getString("lines", ""), call.getString("name", "Pup"));
        JarvisPetOverlayService.setEnabled(getContext(), true);
        try { JarvisPetOverlayService.start(getContext()); call.resolve(); } catch (Exception e) { call.reject("Could not start: " + e.getMessage()); }
    }

    @PluginMethod
    public void overlayConfig(PluginCall call) {
        JarvisPetOverlayService.configure(getContext(), call.getString("where", "home"), call.getInt("size", 88), call.getString("lines", ""), call.getString("name", "Pup"));
        JarvisPetOverlayService.refresh(getContext());
        call.resolve();
    }

    @PluginMethod
    public void overlayStop(PluginCall call) {
        JarvisPetOverlayService.setEnabled(getContext(), false);
        JarvisPetOverlayService.stop(getContext());
        call.resolve();
    }
}
