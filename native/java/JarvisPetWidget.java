package com.jarvis.assistant;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.util.Base64;
import android.widget.RemoteViews;

import java.util.Random;

/**
 * Home-screen pet. The app renders the pet (any colours/accessories/mood) to PNGs and hands them over;
 * tapping the pet makes it react instantly, even when the app is closed.
 */
public class JarvisPetWidget extends AppWidgetProvider {
    static final String PREFS = "jarvis_pet_widget";
    static final String ACTION_PAT = "com.jarvis.assistant.PET_PAT";

    @Override
    public void onUpdate(Context ctx, AppWidgetManager mgr, int[] ids) { updateAll(ctx, mgr, ids, false); }

    @Override
    public void onReceive(Context ctx, Intent intent) {
        super.onReceive(ctx, intent);
        if (ACTION_PAT.equals(intent.getAction())) {
            SharedPreferences p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            p.edit().putInt("taps", p.getInt("taps", 0) + 1).putLong("lastTap", System.currentTimeMillis()).apply();
            AppWidgetManager mgr = AppWidgetManager.getInstance(ctx);
            updateAll(ctx, mgr, mgr.getAppWidgetIds(new ComponentName(ctx, JarvisPetWidget.class)), true);
        }
    }

    static void save(Context ctx, String idle, String happy, String line, String status, String reactions, String sleep, String walk, String walk2) {
        SharedPreferences.Editor e = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit();
        if (idle != null && !idle.isEmpty()) e.putString("idle", idle);
        if (happy != null && !happy.isEmpty()) e.putString("happy", happy);
        if (sleep != null && !sleep.isEmpty()) e.putString("sleep", sleep);
        if (walk != null && !walk.isEmpty()) e.putString("walk", walk);
        if (walk2 != null && !walk2.isEmpty()) e.putString("walk2", walk2);
        e.putString("line", line == null ? "" : line);
        e.putString("status", status == null ? "" : status);
        if (reactions != null) e.putString("reactions", reactions);
        e.apply();
        AppWidgetManager mgr = AppWidgetManager.getInstance(ctx);
        int[] ids = mgr.getAppWidgetIds(new ComponentName(ctx, JarvisPetWidget.class));
        if (ids.length > 0) updateAll(ctx, mgr, ids, false);
        JarvisPetOverlayService.refresh(ctx);
    }

    static int takeTaps(Context ctx) {
        SharedPreferences p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        int t = p.getInt("taps", 0);
        p.edit().putInt("taps", 0).apply();
        return t;
    }

    static Bitmap decode(String b64) {
        if (b64 == null || b64.isEmpty()) return null;
        try {
            byte[] bytes = Base64.decode(b64.replaceFirst("^data:image/\\w+;base64,", ""), Base64.DEFAULT);
            return BitmapFactory.decodeByteArray(bytes, 0, bytes.length);
        } catch (Exception e) { return null; }
    }

    static void updateAll(Context ctx, AppWidgetManager mgr, int[] ids, boolean patted) {
        SharedPreferences p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        Bitmap img = decode(p.getString(patted ? "happy" : "idle", ""));
        if (img == null && patted) img = decode(p.getString("idle", ""));
        String line = p.getString("line", "");
        if (patted) {
            String[] r = p.getString("reactions", "*happy wiggle*|*wags tail*|*leans into the scratch*|Woof! More!").split("\\|");
            line = r[new Random().nextInt(r.length)];
        }
        Intent pat = new Intent(ctx, JarvisPetWidget.class).setAction(ACTION_PAT);
        PendingIntent patPi = PendingIntent.getBroadcast(ctx, 7301, pat, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        for (int id : ids) {
            RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.jarvis_widget_pet);
            if (img != null) v.setImageViewBitmap(R.id.jarvis_pet_img, img);
            v.setTextViewText(R.id.jarvis_pet_line, line.isEmpty() ? "Tap me!" : line);
            v.setTextViewText(R.id.jarvis_pet_status, p.getString("status", ""));
            v.setOnClickPendingIntent(R.id.jarvis_pet_img, patPi);
            v.setOnClickPendingIntent(R.id.jarvis_pet_line, JarvisMicWidget.launch(ctx, "pet", 7302));
            v.setOnClickPendingIntent(R.id.jarvis_pet_status, JarvisMicWidget.launch(ctx, "pet", 7303));
            mgr.updateAppWidget(id, v);
        }
    }
}
