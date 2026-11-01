package com.jarvis.assistant;

import android.app.AppOpsManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.app.usage.UsageEvents;
import android.app.usage.UsageStatsManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.content.pm.ServiceInfo;
import android.graphics.Bitmap;
import android.graphics.PixelFormat;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.provider.Settings;
import android.util.DisplayMetrics;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.HapticFeedbackConstants;
import android.view.MotionEvent;
import android.view.View;
import android.view.WindowManager;
import android.widget.ImageView;
import android.widget.TextView;

import androidx.core.app.NotificationCompat;

import java.util.HashSet;
import java.util.List;
import java.util.Random;
import java.util.Set;

/**
 * The roaming pup: a small see-through window that walks, sits, sniffs, hops and sleeps across the screen.
 * Only the pup itself is touchable, so everything under the rest of the screen keeps working.
 * Tap = pat, drag = pick him up, hold = talk to Jarvis (voice). Off by default; needs "Display over other apps".
 */
public class JarvisPetOverlayService extends Service {
    static final String PREFS = "jarvis_pet_overlay";
    static final String CHANNEL = "jarvis_pet";
    static final int NOTIF_ID = 7410;
    static final String ACTION_STOP = "com.jarvis.assistant.PET_OVERLAY_STOP";
    static final String ACTION_REFRESH = "com.jarvis.assistant.PET_OVERLAY_REFRESH";
    public static volatile boolean running = false;

    // ------------------------------------------------------------ static helpers (used by the plugin and boot receiver)
    static SharedPreferences prefs(Context c) { return c.getSharedPreferences(PREFS, MODE_PRIVATE); }
    public static boolean enabled(Context c) { return prefs(c).getBoolean("enabled", false); }
    public static void setEnabled(Context c, boolean on) { prefs(c).edit().putBoolean("enabled", on).apply(); }
    public static boolean canDraw(Context c) { return Build.VERSION.SDK_INT < 23 || Settings.canDrawOverlays(c); }
    static boolean hasUsage(Context c) {
        try {
            AppOpsManager ops = (AppOpsManager) c.getSystemService(Context.APP_OPS_SERVICE);
            int mode = Build.VERSION.SDK_INT >= 29
                ? ops.unsafeCheckOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, android.os.Process.myUid(), c.getPackageName())
                : ops.checkOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, android.os.Process.myUid(), c.getPackageName());
            return mode == AppOpsManager.MODE_ALLOWED;
        } catch (Exception e) { return false; }
    }
    static void configure(Context c, String where, int sizeDp, String lines, String name) {
        prefs(c).edit().putString("where", "everywhere".equals(where) ? "everywhere" : "home").putInt("size", Math.max(56, Math.min(180, sizeDp)))
            .putString("lines", lines == null ? "" : lines).putString("name", name == null ? "Pup" : name).apply();
    }
    public static void start(Context c) {
        Intent i = new Intent(c, JarvisPetOverlayService.class);
        if (Build.VERSION.SDK_INT >= 26) c.startForegroundService(i); else c.startService(i);
    }
    public static void stop(Context c) { c.stopService(new Intent(c, JarvisPetOverlayService.class)); }
    /** Re-read sprites and settings in the running service (no-op when it is not running). */
    static void refresh(Context c) {
        if (!running) return;
        try { c.startService(new Intent(c, JarvisPetOverlayService.class).setAction(ACTION_REFRESH)); } catch (Exception ignored) { }
    }

    // ------------------------------------------------------------ behaviour
    private enum S { WALK, SIT, SNIFF, HOP, SLEEP, DRAG, HAPPY }

    private WindowManager wm;
    private ImageView pup;
    private TextView bubble;
    private WindowManager.LayoutParams pupLp, bubbleLp;
    private boolean pupAdded = false, bubbleAdded = false, shown = true, screenOn = true;
    private final Handler h = new Handler(Looper.getMainLooper());
    private final Random rnd = new Random();
    private float density = 2f, sizePx = 200f;
    private int screenW = 1080, screenH = 1920;
    private float x = 200, y = 600, tx = 200, ty = 600;
    private int facing = 1;
    private S state = S.SIT;
    private long stateStart = 0, stateUntil = 0, lastStep = 0, lastPolicy = 0, bubbleUntil = 0, happyUntil = 0;
    private Bitmap idle, walk, sleep, happy;
    private String where = "home", name = "Pup";
    private String[] lines = new String[] { "Woof!", "Arf arf!", "Wuff?" };
    private Set<String> launchers = new HashSet<>();
    private String cachedFg = null;
    private float grabX, grabY, downX, downY;
    private boolean dragging = false, longFired = false;
    private int lastWinX = Integer.MIN_VALUE, lastWinY = Integer.MIN_VALUE;

    private final BroadcastReceiver screen = new BroadcastReceiver() {
        @Override public void onReceive(Context c, Intent i) { screenOn = Intent.ACTION_SCREEN_ON.equals(i.getAction()) || Intent.ACTION_USER_PRESENT.equals(i.getAction()); }
    };
    private final Runnable tick = new Runnable() {
        @Override public void run() {
            try { step(); } catch (Exception ignored) { }
            h.postDelayed(this, 33);
        }
    };
    private final Runnable longPress = new Runnable() {
        @Override public void run() {
            if (dragging) return;
            longFired = true;
            if (pup != null) pup.performHapticFeedback(HapticFeedbackConstants.LONG_PRESS);
            try { JarvisMicWidget.launch(JarvisPetOverlayService.this, "voice", 7411).send(); } catch (Exception ignored) { }
        }
    };

    @Override public IBinder onBind(Intent i) { return null; }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && ACTION_STOP.equals(intent.getAction())) { setEnabled(this, false); stopSelf(); return START_NOT_STICKY; }
        try {
            Notification n = buildNotification();
            if (Build.VERSION.SDK_INT >= 34) startForeground(NOTIF_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
            else startForeground(NOTIF_ID, n);
        } catch (Exception e) { stopSelf(); return START_NOT_STICKY; }
        if (!canDraw(this)) { setEnabled(this, false); stopSelf(); return START_NOT_STICKY; }
        try {
            if (!pupAdded) setup();
            loadSettings();
            applySize();
        } catch (Exception e) { stopSelf(); return START_NOT_STICKY; }
        running = true;
        return START_STICKY;
    }

    private void setup() {
        wm = (WindowManager) getSystemService(WINDOW_SERVICE);
        density = getResources().getDisplayMetrics().density;
        readScreen();
        pup = new ImageView(this);
        pup.setScaleType(ImageView.ScaleType.FIT_CENTER);
        pup.setOnTouchListener(this::onPupTouch);
        pup.setContentDescription("Your pup");
        int type = Build.VERSION.SDK_INT >= 26 ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY : WindowManager.LayoutParams.TYPE_PHONE;
        int flags = WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE | WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL | WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS | WindowManager.LayoutParams.FLAG_HARDWARE_ACCELERATED;
        pupLp = new WindowManager.LayoutParams(200, 200, type, flags, PixelFormat.TRANSLUCENT);
        pupLp.gravity = Gravity.TOP | Gravity.START;
        bubble = new TextView(this);
        bubble.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13);
        bubble.setTextColor(0xFF1F2937);
        bubble.setTypeface(Typeface.DEFAULT_BOLD);
        bubble.setMaxWidth((int) (200 * density));
        int pad = (int) (9 * density);
        bubble.setPadding(pad + 2, pad, pad + 2, pad);
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(0xF5FFFFFF);
        bg.setCornerRadius(16 * density);
        bubble.setBackground(bg);
        bubbleLp = new WindowManager.LayoutParams(WindowManager.LayoutParams.WRAP_CONTENT, WindowManager.LayoutParams.WRAP_CONTENT, type,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE | WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE | WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS, PixelFormat.TRANSLUCENT);
        bubbleLp.gravity = Gravity.TOP | Gravity.START;
        loadLaunchers();
        wm.addView(pup, pupLp);
        pupAdded = true;
        IntentFilter f = new IntentFilter(Intent.ACTION_SCREEN_ON);
        f.addAction(Intent.ACTION_SCREEN_OFF);
        f.addAction(Intent.ACTION_USER_PRESENT);
        registerReceiver(screen, f);
        x = screenW * 0.4f; y = screenH * 0.55f; tx = x; ty = y;
        state = S.SIT; stateStart = now(); stateUntil = now() + 1500;
        h.post(tick);
    }

    private void loadLaunchers() {
        try {
            Intent home = new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME);
            List<ResolveInfo> l = getPackageManager().queryIntentActivities(home, PackageManager.MATCH_DEFAULT_ONLY);
            for (ResolveInfo r : l) launchers.add(r.activityInfo.packageName);
        } catch (Exception ignored) { }
        launchers.add("com.android.systemui");
    }

    private void loadSettings() {
        SharedPreferences p = prefs(this);
        where = p.getString("where", "home");
        name = p.getString("name", "Pup");
        String l = p.getString("lines", "");
        if (!l.isEmpty()) { String[] a = l.split("\\|"); if (a.length > 0) lines = a; }
        SharedPreferences w = getSharedPreferences(JarvisPetWidget.PREFS, MODE_PRIVATE);
        idle = JarvisPetWidget.decode(w.getString("idle", ""));
        happy = JarvisPetWidget.decode(w.getString("happy", ""));
        sleep = JarvisPetWidget.decode(w.getString("sleep", ""));
        walk = JarvisPetWidget.decode(w.getString("walk", ""));
        if (happy == null) happy = idle;
        if (sleep == null) sleep = idle;
        if (walk == null) walk = idle;
        if (idle != null && pup != null) pup.setImageBitmap(idle);
    }

    private void applySize() {
        sizePx = prefs(this).getInt("size", 88) * density;
        pupLp.width = (int) sizePx; pupLp.height = (int) sizePx;
        try { if (pupAdded) wm.updateViewLayout(pup, pupLp); } catch (Exception ignored) { }
    }

    private void readScreen() {
        try {
            if (Build.VERSION.SDK_INT >= 30) {
                android.graphics.Rect b = wm.getCurrentWindowMetrics().getBounds();
                screenW = b.width(); screenH = b.height();
            } else {
                DisplayMetrics dm = new DisplayMetrics();
                wm.getDefaultDisplay().getRealMetrics(dm);
                screenW = dm.widthPixels; screenH = dm.heightPixels;
            }
        } catch (Exception ignored) { }
    }

    private long now() { return System.currentTimeMillis(); }

    // ------------------------------------------------------------ the loop
    private void step() {
        long t = now();
        float dt = lastStep == 0 ? 0.033f : Math.min(0.1f, (t - lastStep) / 1000f);
        lastStep = t;
        if (t - lastPolicy > 1500) { lastPolicy = t; readScreen(); updateVisibility(); }
        if (!shown || !screenOn) return;
        boolean night = isNight();
        float bob = 0, rot = 0, scale = 1f;
        Bitmap img = idle;
        if (state == S.HAPPY) { img = happy; if (t > happyUntil) { state = S.SIT; stateStart = t; stateUntil = t + 1500; } }
        else if (state == S.DRAG) { img = happy; }
        else if (night && state != S.SLEEP && state != S.DRAG) {
            if (dist() < 12 * density) { state = S.SLEEP; stateStart = t; }
            else if (state != S.WALK) { tx = screenW * (0.15f + rnd.nextFloat() * 0.6f); ty = screenH - sizePx - 90 * density; state = S.WALK; stateStart = t; }
        }
        switch (state) {
            case WALK: {
                float dx = tx - x, dy = ty - y, d = (float) Math.sqrt(dx * dx + dy * dy);
                if (d < 8 * density) { arrive(t, night); }
                else {
                    float speed = sizePx * 0.62f;
                    float stepLen = Math.min(d, speed * dt);
                    x += dx / d * stepLen; y += dy / d * stepLen;
                    if (Math.abs(dx) > 4 * density) facing = dx < 0 ? -1 : 1;
                    double ph = t / 95.0;
                    bob = (float) Math.sin(ph) * sizePx * 0.035f;
                    rot = (float) Math.sin(ph) * 4f;
                    img = ((t / 170) % 2 == 0) ? idle : walk;
                }
                break;
            }
            case SIT: {
                scale = 1f + (float) Math.sin(t / 650.0) * 0.012f;
                if (t > stateUntil) pickTarget(t);
                break;
            }
            case SNIFF: {
                bob = (float) Math.abs(Math.sin(t / 130.0)) * sizePx * 0.025f;
                rot = (float) Math.sin(t / 160.0) * 6f;
                if (t > stateUntil) pickTarget(t);
                break;
            }
            case HOP: {
                float k = Math.min(1f, (t - stateStart) / 700f);
                bob = -(float) Math.abs(Math.sin(k * Math.PI * 2)) * sizePx * 0.28f;
                img = happy;
                if (k >= 1f) { state = S.SIT; stateStart = t; stateUntil = t + 1800; }
                break;
            }
            case SLEEP: {
                img = sleep;
                scale = 1f + (float) Math.sin(t / 1300.0) * 0.02f;
                if (!night) { state = S.SIT; stateStart = t; stateUntil = t + 800; }
                else if (t > bubbleUntil + 9000 && rnd.nextInt(300) == 0) say("Zzz...", 2600);
                break;
            }
            default: break;
        }
        if (state == S.SIT && bubbleUntil < t && rnd.nextInt(520) == 0) say(randomLine(), 3200);
        x = Math.max(0, Math.min(screenW - sizePx, x));
        y = Math.max(24 * density, Math.min(screenH - sizePx - 40 * density, y));
        pup.setScaleX(facing * scale); pup.setScaleY(scale); pup.setRotation(rot * facing);
        if (img != null && pup.getTag() != img) { pup.setImageBitmap(img); pup.setTag(img); }
        int wx = Math.round(x), wy = Math.round(y + bob);
        if (wx != lastWinX || wy != lastWinY) {
            pupLp.x = wx; pupLp.y = wy; lastWinX = wx; lastWinY = wy;
            try { wm.updateViewLayout(pup, pupLp); } catch (Exception ignored) { }
        }
        if (bubbleAdded) {
            if (t > bubbleUntil) hideBubble(); else placeBubble();
        }
    }

    private float dist() { float dx = tx - x, dy = ty - y; return (float) Math.sqrt(dx * dx + dy * dy); }

    private void arrive(long t, boolean night) {
        int r = rnd.nextInt(10);
        if (r < 6) { state = S.SIT; stateUntil = t + 2500 + rnd.nextInt(5000); }
        else if (r < 8) { state = S.SNIFF; stateUntil = t + 1800 + rnd.nextInt(1500); }
        else { state = S.HOP; }
        stateStart = t;
    }

    private void pickTarget(long t) {
        float minX = 0, maxX = Math.max(1, screenW - sizePx);
        float minY = 60 * density, maxY = Math.max(minY + 1, screenH - sizePx - 90 * density);
        // mostly short strolls, sometimes a long trek across the screen
        if (rnd.nextInt(4) == 0) { tx = minX + rnd.nextFloat() * (maxX - minX); ty = minY + rnd.nextFloat() * (maxY - minY); }
        else { tx = Math.max(minX, Math.min(maxX, x + (rnd.nextFloat() - 0.5f) * screenW * 0.5f)); ty = Math.max(minY, Math.min(maxY, y + (rnd.nextFloat() - 0.5f) * screenH * 0.3f)); }
        state = S.WALK; stateStart = t;
    }

    private boolean isNight() {
        int hr = java.util.Calendar.getInstance().get(java.util.Calendar.HOUR_OF_DAY);
        return hr >= 23 || hr < 6;
    }

    // ------------------------------------------------------------ visibility policy
    private void updateVisibility() {
        boolean want = screenOn;
        if (want) {
            String fg = foreground();
            if (fg != null) {
                if (fg.equals(getPackageName())) want = false; // the app shows the pup itself
                else if ("home".equals(where)) want = launchers.contains(fg);
            }
        }
        if (want != shown) {
            shown = want;
            if (pup != null) pup.setVisibility(shown ? View.VISIBLE : View.GONE);
            if (!shown) hideBubble();
        }
    }

    /** Foreground package, or null when it cannot be known (no usage access): then the pup is simply shown. */
    private String foreground() {
        if (!hasUsage(this)) return null;
        try {
            UsageStatsManager um = (UsageStatsManager) getSystemService(Context.USAGE_STATS_SERVICE);
            long end = now();
            UsageEvents ev = um.queryEvents(end - 20_000, end);
            UsageEvents.Event e = new UsageEvents.Event();
            while (ev.hasNextEvent()) {
                ev.getNextEvent(e);
                if (e.getEventType() == UsageEvents.Event.MOVE_TO_FOREGROUND) cachedFg = e.getPackageName();
            }
        } catch (Exception ignored) { }
        return cachedFg;
    }

    // ------------------------------------------------------------ speech bubble
    private String randomLine() { return lines[rnd.nextInt(lines.length)]; }

    private void say(String text, long ms) {
        if (!shown || bubble == null) return;
        bubble.setText(text);
        bubbleUntil = now() + ms;
        try {
            if (!bubbleAdded) { wm.addView(bubble, bubbleLp); bubbleAdded = true; }
            placeBubble();
        } catch (Exception ignored) { }
    }

    private void placeBubble() {
        int w = bubble.getWidth(), hh = bubble.getHeight();
        if (w == 0 || hh == 0) { bubble.measure(View.MeasureSpec.makeMeasureSpec(screenW, View.MeasureSpec.AT_MOST), View.MeasureSpec.UNSPECIFIED); w = bubble.getMeasuredWidth(); hh = bubble.getMeasuredHeight(); }
        int bx = Math.round(x + sizePx / 2f - w / 2f);
        bx = Math.max(4, Math.min(screenW - w - 4, bx));
        int by = Math.round(y - hh - 4 * density);
        if (by < 24 * density) by = Math.round(y + sizePx);
        if (bx != bubbleLp.x || by != bubbleLp.y) { bubbleLp.x = bx; bubbleLp.y = by; try { wm.updateViewLayout(bubble, bubbleLp); } catch (Exception ignored) { } }
    }

    private void hideBubble() {
        if (bubbleAdded) { try { wm.removeView(bubble); } catch (Exception ignored) { } bubbleAdded = false; }
    }

    // ------------------------------------------------------------ touch: pat, pick up, hold to talk
    private boolean onPupTouch(View v, MotionEvent ev) {
        switch (ev.getActionMasked()) {
            case MotionEvent.ACTION_DOWN:
                downX = ev.getRawX(); downY = ev.getRawY();
                dragging = false; longFired = false;
                h.postDelayed(longPress, 650);
                return true;
            case MotionEvent.ACTION_MOVE: {
                float mx = ev.getRawX() - downX, my = ev.getRawY() - downY;
                if (!dragging && Math.sqrt(mx * mx + my * my) > 14 * density) {
                    dragging = true; h.removeCallbacks(longPress);
                    grabX = downX - x; grabY = downY - y;
                    state = S.DRAG; stateStart = now();
                    say("Wheee!", 1400);
                }
                if (dragging) { x = ev.getRawX() - grabX; y = ev.getRawY() - grabY; }
                return true;
            }
            case MotionEvent.ACTION_UP:
            case MotionEvent.ACTION_CANCEL:
                h.removeCallbacks(longPress);
                if (dragging) { dragging = false; state = S.SIT; stateStart = now(); stateUntil = now() + 2500; say("Arf!", 1400); }
                else if (!longFired && ev.getActionMasked() == MotionEvent.ACTION_UP) pat();
                return true;
            default: return true;
        }
    }

    private void pat() {
        SharedPreferences p = getSharedPreferences(JarvisPetWidget.PREFS, MODE_PRIVATE);
        p.edit().putInt("taps", p.getInt("taps", 0) + 1).putLong("lastTap", now()).apply();
        if (pup != null) pup.performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP);
        state = S.HAPPY; stateStart = now(); happyUntil = now() + 1300;
        say(randomLine() + " 💛", 2000);
    }

    // ------------------------------------------------------------ notification + teardown
    private Notification buildNotification() {
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= 26 && nm.getNotificationChannel(CHANNEL) == null) {
            NotificationChannel ch = new NotificationChannel(CHANNEL, "Your pup (roaming)", NotificationManager.IMPORTANCE_MIN);
            ch.setDescription("Shows while your pup is out walking on your screen");
            ch.setShowBadge(false);
            nm.createNotificationChannel(ch);
        }
        int flags = Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0;
        PendingIntent open = JarvisMicWidget.launch(this, "pet", 7412);
        PendingIntent tuck = PendingIntent.getService(this, 7413, new Intent(this, JarvisPetOverlayService.class).setAction(ACTION_STOP), flags);
        int icon = getResources().getIdentifier("ic_stat_jarvis", "drawable", getPackageName());
        String nm2 = prefs(this).getString("name", "Your pup");
        return new NotificationCompat.Builder(this, CHANNEL)
            .setSmallIcon(icon != 0 ? icon : android.R.drawable.ic_dialog_info)
            .setContentTitle(nm2 + " is out for a wander")
            .setContentText("Tap to visit, or tuck them in.")
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_MIN)
            .setContentIntent(open)
            .addAction(0, "Tuck in", tuck)
            .build();
    }

    @Override
    public void onDestroy() {
        running = false;
        h.removeCallbacksAndMessages(null);
        try { unregisterReceiver(screen); } catch (Exception ignored) { }
        hideBubble();
        if (pupAdded) { try { wm.removeView(pup); } catch (Exception ignored) { } pupAdded = false; }
        super.onDestroy();
    }
}
