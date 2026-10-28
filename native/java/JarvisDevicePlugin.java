package com.jarvis.assistant;

import android.app.ActivityManager;
import android.appwidget.AppWidgetManager;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.ComponentName;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.hardware.camera2.CameraCharacteristics;
import android.hardware.camera2.CameraManager;
import android.net.Uri;
import android.os.BatteryManager;
import android.os.Build;
import android.os.Environment;
import android.os.StatFs;
import android.provider.AlarmClock;
import android.provider.CalendarContract;
import android.provider.MediaStore;
import android.provider.Settings;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.speech.tts.Voice;
import android.view.WindowManager;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

@CapacitorPlugin(
    name = "JarvisDevice",
    permissions = { @Permission(alias = "termux", strings = { "com.termux.permission.RUN_COMMAND" }) }
)
public class JarvisDevicePlugin extends Plugin {

    public static final String EXTRA_ACTION = "jarvis_action";
    private static String pendingAction = null;

    // ---------------- TTS state ----------------
    private final Map<String, TextToSpeech> engines = new HashMap<>();
    private final Map<String, Boolean> ready = new HashMap<>();
    private final Map<String, List<Runnable>> waiting = new HashMap<>();
    private final Map<String, PluginCall> speakCalls = new HashMap<>();
    private String defaultEngine = null;
    private boolean torchOn = false;

    @Override
    public void load() {
        captureAction(getActivity().getIntent());
    }

    @Override
    protected void handleOnNewIntent(Intent intent) {
        super.handleOnNewIntent(intent);
        String action = parseAction(intent);
        if (action != null) {
            JSObject o = new JSObject();
            o.put("action", action);
            notifyListeners("launchAction", o, true);
        }
    }

    @Override
    protected void handleOnDestroy() {
        for (TextToSpeech t : engines.values()) { try { t.stop(); t.shutdown(); } catch (Exception ignored) { } }
        engines.clear();
        super.handleOnDestroy();
    }

    private static String parseAction(Intent intent) {
        if (intent == null) return null;
        String a = intent.getStringExtra(EXTRA_ACTION);
        if (a != null) return a;
        Uri data = intent.getData();
        if (data != null && "jarvis".equals(data.getScheme())) return data.getHost();
        return null;
    }

    private void captureAction(Intent intent) {
        String a = parseAction(intent);
        if (a != null) pendingAction = a;
    }

    @PluginMethod
    public void getLaunchAction(PluginCall call) {
        JSObject o = new JSObject();
        o.put("action", pendingAction);
        pendingAction = null;
        call.resolve(o);
    }

    // =====================================================================
    // TEXT TO SPEECH
    // =====================================================================
    private void withEngine(String name, Runnable then, PluginCall call) {
        final String key = name == null || name.isEmpty() ? "__default" : name;
        if (Boolean.TRUE.equals(ready.get(key))) { then.run(); return; }
        List<Runnable> q = waiting.get(key);
        if (q == null) { q = new ArrayList<>(); waiting.put(key, q); }
        q.add(then);
        if (engines.containsKey(key)) return;
        TextToSpeech.OnInitListener listener = status -> {
            List<Runnable> pending = waiting.remove(key);
            if (status == TextToSpeech.SUCCESS) {
                ready.put(key, true);
                TextToSpeech t = engines.get(key);
                if (t != null) {
                    if (defaultEngine == null) defaultEngine = t.getDefaultEngine();
                    t.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                        @Override public void onStart(String id) { }
                        @Override public void onDone(String id) { finish(id, true); }
                        @Override public void onError(String id) { finish(id, false); }
                        @Override public void onStop(String id, boolean interrupted) { finish(id, false); }
                    });
                }
                if (pending != null) for (Runnable r : pending) r.run();
            } else {
                engines.remove(key);
                if (call != null) call.reject("Text-to-speech engine failed to start (" + key + ")");
            }
        };
        TextToSpeech tts = "__default".equals(key)
            ? new TextToSpeech(getContext(), listener)
            : new TextToSpeech(getContext(), listener, key);
        engines.put(key, tts);
    }

    private void finish(String id, boolean done) {
        PluginCall c = speakCalls.remove(id);
        if (c != null) { JSObject o = new JSObject(); o.put("done", done); c.resolve(o); }
    }

    private TextToSpeech engine(String name) {
        return engines.get(name == null || name.isEmpty() ? "__default" : name);
    }

    @PluginMethod
    public void speak(PluginCall call) {
        final String text = call.getString("text", "");
        final String engineName = call.getString("engine");
        final String voiceId = call.getString("voiceId");
        final String language = call.getString("language");
        final float pitch = call.getFloat("pitch", 1f);
        final float rate = call.getFloat("rate", 1f);
        call.setKeepAlive(true);
        withEngine(engineName, () -> {
            TextToSpeech t = engine(engineName);
            if (t == null) { call.reject("No TTS engine"); return; }
            boolean voiceSet = false;
            if (voiceId != null && !voiceId.isEmpty()) {
                Set<Voice> vs = null;
                try { vs = t.getVoices(); } catch (Exception ignored) { }
                if (vs != null) for (Voice v : vs) if (v.getName().equals(voiceId)) { t.setVoice(v); voiceSet = true; break; }
            }
            if (!voiceSet && language != null && !language.isEmpty()) t.setLanguage(Locale.forLanguageTag(language.replace('_', '-')));
            t.setPitch(pitch);
            t.setSpeechRate(rate);
            String id = UUID.randomUUID().toString();
            speakCalls.put(id, call);
            int r = t.speak(text, TextToSpeech.QUEUE_FLUSH, null, id);
            if (r != TextToSpeech.SUCCESS) { speakCalls.remove(id); call.reject("Speech failed"); }
        }, call);
    }

    @PluginMethod
    public void stopSpeaking(PluginCall call) {
        for (TextToSpeech t : engines.values()) { try { t.stop(); } catch (Exception ignored) { } }
        for (PluginCall c : new ArrayList<>(speakCalls.values())) { JSObject o = new JSObject(); o.put("done", false); c.resolve(o); }
        speakCalls.clear();
        call.resolve();
    }

    @PluginMethod
    public void getEngines(PluginCall call) {
        withEngine(null, () -> {
            TextToSpeech t = engine(null);
            JSArray arr = new JSArray();
            for (TextToSpeech.EngineInfo e : t.getEngines()) {
                JSObject o = new JSObject();
                o.put("name", e.name);
                o.put("label", e.label);
                arr.put(o);
            }
            JSObject res = new JSObject();
            res.put("engines", arr);
            res.put("current", t.getDefaultEngine());
            call.resolve(res);
        }, call);
    }

    @PluginMethod
    public void getVoices(PluginCall call) {
        final String engineName = call.getString("engine");
        withEngine(engineName, () -> {
            TextToSpeech t = engine(engineName);
            JSArray arr = new JSArray();
            Set<Voice> vs = null;
            try { vs = t.getVoices(); } catch (Exception ignored) { }
            String eng = engineName != null && !engineName.isEmpty() ? engineName : t.getDefaultEngine();
            if (vs != null) {
                List<Voice> list = new ArrayList<>(vs);
                Collections.sort(list, (a, b) -> a.getName().compareTo(b.getName()));
                for (Voice v : list) {
                    Locale l = v.getLocale();
                    JSObject o = new JSObject();
                    o.put("id", v.getName());
                    o.put("name", prettyName(v));
                    o.put("locale", l.toLanguageTag());
                    o.put("language", l.getLanguage());
                    o.put("country", l.getCountry());
                    o.put("quality", v.getQuality());
                    o.put("latency", v.getLatency());
                    o.put("networkRequired", v.isNetworkConnectionRequired());
                    Set<String> f = v.getFeatures();
                    o.put("installed", f == null || !f.contains(TextToSpeech.Engine.KEY_FEATURE_NOT_INSTALLED));
                    o.put("engine", eng);
                    arr.put(o);
                }
            }
            JSObject res = new JSObject();
            res.put("voices", arr);
            res.put("engine", eng);
            call.resolve(res);
        }, call);
    }

    private String prettyName(Voice v) {
        Locale l = v.getLocale();
        String n = v.getName();
        String region = l.getDisplayCountry();
        String lang = l.getDisplayLanguage();
        String tag = n.contains("-x-") ? n.substring(n.indexOf("-x-") + 3) : n;
        return lang + (region.isEmpty() ? "" : " (" + region + ")") + " · " + tag;
    }

    @PluginMethod
    public void installVoiceData(PluginCall call) {
        Intent i = new Intent(TextToSpeech.Engine.ACTION_INSTALL_TTS_DATA);
        String eng = call.getString("engine");
        if (eng != null && !eng.isEmpty()) i.setPackage(eng);
        startSafely(i, call);
    }

    @PluginMethod
    public void openTtsSettings(PluginCall call) {
        startSafely(new Intent("com.android.settings.TTS_SETTINGS"), call);
    }

    // =====================================================================
    // DEVICE
    // =====================================================================
    private void startSafely(Intent i, PluginCall call) {
        try {
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
            call.resolve();
        } catch (ActivityNotFoundException e) {
            call.reject("No app on this phone can handle that");
        } catch (Exception e) {
            call.reject(e.getMessage());
        }
    }

    @PluginMethod
    public void setAlarm(PluginCall call) {
        Intent i = new Intent(AlarmClock.ACTION_SET_ALARM);
        i.putExtra(AlarmClock.EXTRA_HOUR, call.getInt("hour", 7));
        i.putExtra(AlarmClock.EXTRA_MINUTES, call.getInt("minute", 0));
        i.putExtra(AlarmClock.EXTRA_MESSAGE, call.getString("message", "Jarvis"));
        i.putExtra(AlarmClock.EXTRA_SKIP_UI, call.getBoolean("skipUi", true));
        JSArray days = call.getArray("days");
        if (days != null && days.length() > 0) {
            ArrayList<Integer> d = new ArrayList<>();
            try { for (int k = 0; k < days.length(); k++) d.add(days.getInt(k)); } catch (Exception ignored) { }
            i.putExtra(AlarmClock.EXTRA_DAYS, d);
        }
        startSafely(i, call);
    }

    @PluginMethod
    public void setTimer(PluginCall call) {
        Intent i = new Intent(AlarmClock.ACTION_SET_TIMER);
        i.putExtra(AlarmClock.EXTRA_LENGTH, call.getInt("seconds", 60));
        i.putExtra(AlarmClock.EXTRA_MESSAGE, call.getString("message", "Jarvis"));
        i.putExtra(AlarmClock.EXTRA_SKIP_UI, call.getBoolean("skipUi", true));
        startSafely(i, call);
    }

    @PluginMethod
    public void showAlarms(PluginCall call) { startSafely(new Intent(AlarmClock.ACTION_SHOW_ALARMS), call); }

    @PluginMethod
    public void listApps(PluginCall call) {
        PackageManager pm = getContext().getPackageManager();
        Intent main = new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER);
        List<ResolveInfo> list = pm.queryIntentActivities(main, 0);
        JSArray arr = new JSArray();
        for (ResolveInfo r : list) {
            JSObject o = new JSObject();
            o.put("label", r.loadLabel(pm).toString());
            o.put("package", r.activityInfo.packageName);
            arr.put(o);
        }
        JSObject res = new JSObject();
        res.put("apps", arr);
        call.resolve(res);
    }

    @PluginMethod
    public void openApp(PluginCall call) {
        String pkg = call.getString("package", "");
        Intent i = getContext().getPackageManager().getLaunchIntentForPackage(pkg);
        if (i == null) { call.reject("App not found: " + pkg); return; }
        startSafely(i, call);
    }

    @PluginMethod
    public void flashlight(PluginCall call) {
        boolean on = call.getBoolean("on", !torchOn);
        try {
            CameraManager cm = (CameraManager) getContext().getSystemService(Context.CAMERA_SERVICE);
            String id = null;
            for (String c : cm.getCameraIdList()) {
                Boolean flash = cm.getCameraCharacteristics(c).get(CameraCharacteristics.FLASH_INFO_AVAILABLE);
                if (Boolean.TRUE.equals(flash)) { id = c; break; }
            }
            if (id == null) { call.reject("No flashlight on this device"); return; }
            cm.setTorchMode(id, on);
            torchOn = on;
            JSObject o = new JSObject(); o.put("on", on); call.resolve(o);
        } catch (Exception e) { call.reject("Flashlight error: " + e.getMessage()); }
    }

    @PluginMethod
    public void battery(PluginCall call) {
        BatteryManager bm = (BatteryManager) getContext().getSystemService(Context.BATTERY_SERVICE);
        JSObject o = new JSObject();
        o.put("level", bm.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY));
        o.put("charging", bm.isCharging());
        call.resolve(o);
    }

    @PluginMethod
    public void deviceInfo(PluginCall call) {
        ActivityManager am = (ActivityManager) getContext().getSystemService(Context.ACTIVITY_SERVICE);
        ActivityManager.MemoryInfo mi = new ActivityManager.MemoryInfo();
        am.getMemoryInfo(mi);
        StatFs fs = new StatFs(Environment.getDataDirectory().getPath());
        JSObject o = new JSObject();
        o.put("model", Build.MODEL);
        o.put("manufacturer", Build.MANUFACTURER);
        o.put("android", Build.VERSION.RELEASE);
        o.put("sdk", Build.VERSION.SDK_INT);
        o.put("ramTotalMb", mi.totalMem / (1024 * 1024));
        o.put("ramAvailMb", mi.availMem / (1024 * 1024));
        o.put("storageFreeMb", fs.getAvailableBytes() / (1024 * 1024));
        call.resolve(o);
    }

    @PluginMethod
    public void openUrl(PluginCall call) { startSafely(new Intent(Intent.ACTION_VIEW, Uri.parse(call.getString("url", ""))), call); }

    @PluginMethod
    public void dial(PluginCall call) { startSafely(new Intent(Intent.ACTION_DIAL, Uri.parse("tel:" + Uri.encode(call.getString("number", "")))), call); }

    @PluginMethod
    public void sms(PluginCall call) {
        Intent i = new Intent(Intent.ACTION_SENDTO, Uri.parse("smsto:" + Uri.encode(call.getString("number", ""))));
        i.putExtra("sms_body", call.getString("body", ""));
        startSafely(i, call);
    }

    @PluginMethod
    public void email(PluginCall call) {
        Intent i = new Intent(Intent.ACTION_SENDTO, Uri.parse("mailto:"));
        i.putExtra(Intent.EXTRA_EMAIL, new String[] { call.getString("to", "") });
        i.putExtra(Intent.EXTRA_SUBJECT, call.getString("subject", ""));
        i.putExtra(Intent.EXTRA_TEXT, call.getString("body", ""));
        startSafely(i, call);
    }

    @PluginMethod
    public void share(PluginCall call) {
        Intent send = new Intent(Intent.ACTION_SEND);
        send.setType("text/plain");
        send.putExtra(Intent.EXTRA_TEXT, call.getString("text", ""));
        startSafely(Intent.createChooser(send, call.getString("title", "Share")), call);
    }

    @PluginMethod
    public void calendarInsert(PluginCall call) {
        Intent i = new Intent(Intent.ACTION_INSERT).setData(CalendarContract.Events.CONTENT_URI);
        i.putExtra(CalendarContract.Events.TITLE, call.getString("title", ""));
        i.putExtra(CalendarContract.EXTRA_EVENT_BEGIN_TIME, call.getData().optLong("start"));
        i.putExtra(CalendarContract.EXTRA_EVENT_END_TIME, call.getData().optLong("end"));
        if (call.getString("location") != null) i.putExtra(CalendarContract.Events.EVENT_LOCATION, call.getString("location"));
        if (call.getString("description") != null) i.putExtra(CalendarContract.Events.DESCRIPTION, call.getString("description"));
        startSafely(i, call);
    }

    @PluginMethod
    public void openSettings(PluginCall call) {
        String page = call.getString("page", "main");
        String action;
        switch (page) {
            case "wifi": action = Settings.ACTION_WIFI_SETTINGS; break;
            case "bluetooth": action = Settings.ACTION_BLUETOOTH_SETTINGS; break;
            case "display": action = Settings.ACTION_DISPLAY_SETTINGS; break;
            case "sound": action = Settings.ACTION_SOUND_SETTINGS; break;
            case "battery": action = Intent.ACTION_POWER_USAGE_SUMMARY; break;
            case "location": action = Settings.ACTION_LOCATION_SOURCE_SETTINGS; break;
            case "apps": action = Settings.ACTION_APPLICATION_SETTINGS; break;
            case "airplane": action = Settings.ACTION_AIRPLANE_MODE_SETTINGS; break;
            case "tts": action = "com.android.settings.TTS_SETTINGS"; break;
            case "notifications":
                Intent n = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS);
                n.putExtra(Settings.EXTRA_APP_PACKAGE, getContext().getPackageName());
                startSafely(n, call);
                return;
            default: action = Settings.ACTION_SETTINGS;
        }
        startSafely(new Intent(action), call);
    }

    @PluginMethod
    public void clipboardRead(PluginCall call) {
        ClipboardManager cm = (ClipboardManager) getContext().getSystemService(Context.CLIPBOARD_SERVICE);
        String text = "";
        if (cm.hasPrimaryClip() && cm.getPrimaryClip() != null && cm.getPrimaryClip().getItemCount() > 0) {
            CharSequence cs = cm.getPrimaryClip().getItemAt(0).coerceToText(getContext());
            if (cs != null) text = cs.toString();
        }
        JSObject o = new JSObject(); o.put("text", text); call.resolve(o);
    }

    @PluginMethod
    public void clipboardWrite(PluginCall call) {
        ClipboardManager cm = (ClipboardManager) getContext().getSystemService(Context.CLIPBOARD_SERVICE);
        cm.setPrimaryClip(ClipData.newPlainText("Jarvis", call.getString("text", "")));
        call.resolve();
    }

    @PluginMethod
    public void keepAwake(PluginCall call) {
        final boolean on = call.getBoolean("on", false);
        getActivity().runOnUiThread(() -> {
            if (on) getActivity().getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            else getActivity().getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            call.resolve();
        });
    }

    @PluginMethod
    public void saveFile(PluginCall call) {
        String name = call.getString("name", "jarvis.json");
        String content = call.getString("content", "");
        String mime = call.getString("mime", "application/json");
        try {
            byte[] bytes = content.getBytes(StandardCharsets.UTF_8);
            if (Build.VERSION.SDK_INT >= 29) {
                ContentValues v = new ContentValues();
                v.put(MediaStore.Downloads.DISPLAY_NAME, name);
                v.put(MediaStore.Downloads.MIME_TYPE, mime);
                v.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/Jarvis");
                Uri uri = getContext().getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, v);
                if (uri == null) throw new Exception("Could not create file");
                try (OutputStream os = getContext().getContentResolver().openOutputStream(uri)) { if (os != null) os.write(bytes); }
                JSObject o = new JSObject(); o.put("uri", "Downloads/Jarvis/" + name); call.resolve(o);
            } else {
                File dir = getContext().getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
                File f = new File(dir, name);
                try (FileOutputStream os = new FileOutputStream(f)) { os.write(bytes); }
                JSObject o = new JSObject(); o.put("uri", f.getAbsolutePath()); call.resolve(o);
            }
        } catch (Exception e) { call.reject("Save failed: " + e.getMessage()); }
    }

    // =====================================================================
    // WIDGET DATA
    // =====================================================================
    @PluginMethod
    public void updateWidget(PluginCall call) {
        SharedPreferences p = getContext().getSharedPreferences(JarvisWideWidget.PREFS, Context.MODE_PRIVATE);
        p.edit().putString(JarvisWideWidget.KEY_LINE, call.getString("line", "")).apply();
        AppWidgetManager mgr = AppWidgetManager.getInstance(getContext());
        int[] ids = mgr.getAppWidgetIds(new ComponentName(getContext(), JarvisWideWidget.class));
        if (ids.length > 0) JarvisWideWidget.updateAll(getContext(), mgr, ids);
        call.resolve();
    }

    @PluginMethod
    public void updateChatWidget(PluginCall call) {
        JarvisChatWidget.save(getContext(), call.getString("question"), call.getString("answer"), call.getString("status"));
        call.resolve();
    }

    @PluginMethod
    public void updateTodayWidget(PluginCall call) {
        JarvisTodayWidget.save(getContext(), call.getString("t1"), call.getString("t2"), call.getString("t3"), call.getString("stats"));
        call.resolve();
    }

    // =====================================================================
    // HAPTICS
    // =====================================================================
    @PluginMethod
    public void haptic(PluginCall call) {
        String kind = call.getString("kind", "light");
        try {
            android.os.Vibrator vib;
            if (Build.VERSION.SDK_INT >= 31) {
                android.os.VibratorManager vm = (android.os.VibratorManager) getContext().getSystemService(Context.VIBRATOR_MANAGER_SERVICE);
                vib = vm.getDefaultVibrator();
            } else {
                vib = (android.os.Vibrator) getContext().getSystemService(Context.VIBRATOR_SERVICE);
            }
            if (vib == null || !vib.hasVibrator()) { call.resolve(); return; }
            android.os.VibrationEffect fx;
            if (Build.VERSION.SDK_INT >= 29 && ("tick".equals(kind) || "light".equals(kind) || "medium".equals(kind))) {
                int id = "tick".equals(kind) ? android.os.VibrationEffect.EFFECT_TICK
                       : "light".equals(kind) ? android.os.VibrationEffect.EFFECT_CLICK : android.os.VibrationEffect.EFFECT_HEAVY_CLICK;
                fx = android.os.VibrationEffect.createPredefined(id);
            } else if ("success".equals(kind)) {
                fx = android.os.VibrationEffect.createWaveform(new long[] { 0, 14, 70, 28 }, -1);
            } else if ("warning".equals(kind)) {
                fx = android.os.VibrationEffect.createWaveform(new long[] { 0, 30, 90, 30 }, -1);
            } else {
                fx = android.os.VibrationEffect.createOneShot("medium".equals(kind) ? 25 : 12, android.os.VibrationEffect.DEFAULT_AMPLITUDE);
            }
            vib.vibrate(fx);
        } catch (Exception ignored) { }
        call.resolve();
    }

    // =====================================================================
    // TERMUX / OLLAMA ENGINE
    // =====================================================================
    @PluginMethod
    public void isTermuxInstalled(PluginCall call) {
        boolean installed;
        try { getContext().getPackageManager().getPackageInfo("com.termux", 0); installed = true; }
        catch (PackageManager.NameNotFoundException e) { installed = false; }
        JSObject o = new JSObject(); o.put("installed", installed); call.resolve(o);
    }

    @PluginMethod
    public void startTermuxOllama(PluginCall call) {
        if (getPermissionState("termux") != PermissionState.GRANTED) {
            requestPermissionForAlias("termux", call, "termuxPermCallback");
            return;
        }
        runTermux(call);
    }

    @PermissionCallback
    private void termuxPermCallback(PluginCall call) {
        if (getPermissionState("termux") == PermissionState.GRANTED) runTermux(call);
        else call.reject("Allow Jarvis to run commands in Termux (App info → Permissions → Additional permissions)");
    }

    private void runTermux(PluginCall call) {
        String origins = call.getString("origins", "*");
        String script = "export OLLAMA_ORIGINS='" + origins.replace("'", "") + "'; " +
            "curl -s -m 2 http://127.0.0.1:11434/api/version >/dev/null 2>&1 || " +
            "(command -v termux-wake-lock >/dev/null && termux-wake-lock; nohup ollama serve > $HOME/ollama.log 2>&1 &)";
        Intent i = new Intent();
        i.setClassName("com.termux", "com.termux.app.RunCommandService");
        i.setAction("com.termux.RUN_COMMAND");
        i.putExtra("com.termux.RUN_COMMAND_PATH", "/data/data/com.termux/files/usr/bin/bash");
        i.putExtra("com.termux.RUN_COMMAND_ARGUMENTS", new String[] { "-c", script });
        i.putExtra("com.termux.RUN_COMMAND_WORKDIR", "/data/data/com.termux/files/home");
        i.putExtra("com.termux.RUN_COMMAND_BACKGROUND", true);
        try {
            if (Build.VERSION.SDK_INT >= 26) getContext().startForegroundService(i);
            else getContext().startService(i);
            call.resolve();
        } catch (Exception e) {
            call.reject("Couldn't start Termux: " + e.getMessage() + ". In Termux run: echo \"allow-external-apps = true\" >> ~/.termux/termux.properties");
        }
    }
}
