package com.jarvis.assistant;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.SharedPreferences;
import android.widget.RemoteViews;

/** Home-screen "Today" widget: the three MITs, a progress line and one-tap focus / capture / tasks. */
public class JarvisTodayWidget extends AppWidgetProvider {
    static final String PREFS = "jarvis_today_widget";

    @Override
    public void onUpdate(Context ctx, AppWidgetManager mgr, int[] ids) { updateAll(ctx, mgr, ids); }

    static void save(Context ctx, String t1, String t2, String t3, String stats) {
        SharedPreferences.Editor e = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit();
        e.putString("t1", t1 == null ? "" : t1);
        e.putString("t2", t2 == null ? "" : t2);
        e.putString("t3", t3 == null ? "" : t3);
        e.putString("stats", stats == null ? "" : stats);
        e.apply();
        AppWidgetManager mgr = AppWidgetManager.getInstance(ctx);
        int[] ids = mgr.getAppWidgetIds(new ComponentName(ctx, JarvisTodayWidget.class));
        if (ids.length > 0) updateAll(ctx, mgr, ids);
    }

    static void updateAll(Context ctx, AppWidgetManager mgr, int[] ids) {
        SharedPreferences p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String t1 = p.getString("t1", "");
        for (int id : ids) {
            RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.jarvis_widget_today);
            v.setTextViewText(R.id.jarvis_today_t1, t1.isEmpty() ? "Tap to set your 3 MITs" : "★ " + t1);
            String t2 = p.getString("t2", ""), t3 = p.getString("t3", "");
            v.setTextViewText(R.id.jarvis_today_t2, t2.isEmpty() ? "" : "★ " + t2);
            v.setTextViewText(R.id.jarvis_today_t3, t3.isEmpty() ? "" : "★ " + t3);
            v.setTextViewText(R.id.jarvis_today_stats, p.getString("stats", ""));
            v.setOnClickPendingIntent(R.id.jarvis_today_root, JarvisMicWidget.launch(ctx, "tasks", 7201));
            v.setOnClickPendingIntent(R.id.jarvis_today_t1, JarvisMicWidget.launch(ctx, "tasks", 7202));
            v.setOnClickPendingIntent(R.id.jarvis_today_focus, JarvisMicWidget.launch(ctx, "focus", 7203));
            v.setOnClickPendingIntent(R.id.jarvis_today_add, JarvisMicWidget.launch(ctx, "chat:capture", 7204));
            v.setOnClickPendingIntent(R.id.jarvis_today_open, JarvisMicWidget.launch(ctx, "tasks", 7205));
            mgr.updateAppWidget(id, v);
        }
    }
}
