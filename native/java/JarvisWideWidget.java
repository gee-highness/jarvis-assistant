package com.jarvis.assistant;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.SharedPreferences;
import android.widget.RemoteViews;

/** 4x1 widget: mic button + your next priority (updated by the app). */
public class JarvisWideWidget extends AppWidgetProvider {
    public static final String PREFS = "jarvis_widget";
    public static final String KEY_LINE = "line";

    @Override
    public void onUpdate(Context ctx, AppWidgetManager mgr, int[] ids) { updateAll(ctx, mgr, ids); }

    public static void updateAll(Context ctx, AppWidgetManager mgr, int[] ids) {
        SharedPreferences p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String line = p.getString(KEY_LINE, "Tap the mic to talk to Jarvis");
        for (int id : ids) {
            RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.jarvis_widget_wide);
            v.setTextViewText(R.id.jarvis_widget_line, line);
            v.setOnClickPendingIntent(R.id.jarvis_widget_wide_mic, JarvisMicWidget.launch(ctx, "voice", 7002));
            v.setOnClickPendingIntent(R.id.jarvis_widget_line, JarvisMicWidget.launch(ctx, "brief", 7003));
            v.setOnClickPendingIntent(R.id.jarvis_widget_focus, JarvisMicWidget.launch(ctx, "focus", 7004));
            mgr.updateAppWidget(id, v);
        }
    }
}
