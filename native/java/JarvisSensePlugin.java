package com.jarvis.assistant;

import android.Manifest;
import android.app.AppOpsManager;
import android.app.usage.UsageStats;
import android.app.usage.UsageStatsManager;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Process;
import android.provider.Settings;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Calendar;
import java.util.Collections;
import java.util.List;
import java.util.Map;

/** Bridge for the always-on senses: service control, permissions and the daily signal log. */
@CapacitorPlugin(
    name = "JarvisSense",
    permissions = { @Permission(alias = "activity", strings = { "android.permission.ACTIVITY_RECOGNITION" }) }
)
public class JarvisSensePlugin extends Plugin {

    @PluginMethod
    public void start(PluginCall call) {
        try { JarvisCoreService.start(getContext()); call.resolve(status()); } catch (Exception e) { call.reject(e.getMessage()); }
    }

    @PluginMethod
    public void stop(PluginCall call) { JarvisCoreService.stop(getContext()); call.resolve(status()); }

    @PluginMethod
    public void getStatus(PluginCall call) { call.resolve(status()); }

    private JSObject status() {
        JSObject o = new JSObject();
        Context c = getContext();
        o.put("available", true);
        o.put("running", JarvisCoreService.enabled(c));
        o.put("usageAccess", hasUsage());
        o.put("activity", Build.VERSION.SDK_INT < 29 || getPermissionState("activity") == PermissionState.GRANTED);
        return o;
    }

    @PluginMethod
    public void requestActivity(PluginCall call) {
        if (Build.VERSION.SDK_INT < 29 || getPermissionState("activity") == PermissionState.GRANTED) { call.resolve(status()); return; }
        requestPermissionForAlias("activity", call, "activityCallback");
    }

    @PermissionCallback
    private void activityCallback(PluginCall call) {
        if (JarvisCoreService.enabled(getContext())) { JarvisCoreService.stop(getContext()); JarvisCoreService.start(getContext()); }
        call.resolve(status());
    }

    @PluginMethod
    public void openUsageAccess(PluginCall call) {
        Intent i = new Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try { getContext().startActivity(i); call.resolve(); } catch (Exception e) { call.reject(e.getMessage()); }
    }

    @PluginMethod
    public void getDays(PluginCall call) {
        int n = Math.max(1, Math.min(120, call.getInt("days", 7)));
        JSArray arr = new JSArray();
        Calendar cal = Calendar.getInstance();
        for (int i = 0; i < n; i++) {
            JSONObject d = SenseStore.snapshot(getContext(), SenseStore.day(cal.getTimeInMillis()));
            arr.put(d);
            cal.add(Calendar.DAY_OF_YEAR, -1);
        }
        JSObject o = new JSObject();
        o.put("days", arr);
        call.resolve(o);
    }

    /** Top apps by foreground time for a day offset (0 = today). Needs usage access. */
    @PluginMethod
    public void getUsage(PluginCall call) {
        if (!hasUsage()) { call.reject("Usage access not granted"); return; }
        int offset = call.getInt("dayOffset", 0);
        Calendar from = Calendar.getInstance();
        from.add(Calendar.DAY_OF_YEAR, -offset);
        from.set(Calendar.HOUR_OF_DAY, 0); from.set(Calendar.MINUTE, 0); from.set(Calendar.SECOND, 0);
        long start = from.getTimeInMillis();
        long end = offset == 0 ? System.currentTimeMillis() : start + 86_400_000L;
        UsageStatsManager um = (UsageStatsManager) getContext().getSystemService(Context.USAGE_STATS_SERVICE);
        Map<String, UsageStats> stats = um.queryAndAggregateUsageStats(start, end);
        List<UsageStats> list = new ArrayList<>(stats.values());
        Collections.sort(list, (a, b) -> Long.compare(b.getTotalTimeInForeground(), a.getTotalTimeInForeground()));
        PackageManager pm = getContext().getPackageManager();
        JSArray arr = new JSArray();
        long total = 0;
        for (UsageStats u : list) {
            long ms = u.getTotalTimeInForeground();
            if (ms < 60_000) continue;
            total += ms;
            if (arr.length() >= 12) continue;
            String label = u.getPackageName();
            try { ApplicationInfo ai = pm.getApplicationInfo(label, 0); label = String.valueOf(pm.getApplicationLabel(ai)); } catch (Exception ignored) { }
            JSObject a = new JSObject();
            a.put("app", label);
            a.put("pkg", u.getPackageName());
            a.put("minutes", Math.round(ms / 60_000.0));
            arr.put(a);
        }
        JSObject o = new JSObject();
        o.put("apps", arr);
        o.put("totalMinutes", Math.round(total / 60_000.0));
        call.resolve(o);
    }

    @PluginMethod
    public void clear(PluginCall call) { SenseStore.clear(getContext()); call.resolve(); }

    private boolean hasUsage() {
        AppOpsManager ops = (AppOpsManager) getContext().getSystemService(Context.APP_OPS_SERVICE);
        int mode = Build.VERSION.SDK_INT >= 29
            ? ops.unsafeCheckOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), getContext().getPackageName())
            : ops.checkOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), getContext().getPackageName());
        return mode == AppOpsManager.MODE_ALLOWED;
    }

}
