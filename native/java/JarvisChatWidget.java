package com.jarvis.assistant;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.SharedPreferences;
import android.widget.RemoteViews;

/** Resizable chat widget: shows the last exchange; tap to type, mic to talk, chips for one-tap prompts. */
public class JarvisChatWidget extends AppWidgetProvider {
    static final String PREFS = "jarvis_chat_widget";

    @Override
    public void onUpdate(Context ctx, AppWidgetManager mgr, int[] ids) { updateAll(ctx, mgr, ids); }

    static void refresh(Context ctx) {
        AppWidgetManager mgr = AppWidgetManager.getInstance(ctx);
        int[] ids = mgr.getAppWidgetIds(new ComponentName(ctx, JarvisChatWidget.class));
        if (ids.length > 0) updateAll(ctx, mgr, ids);
    }

    static void save(Context ctx, String question, String answer, String status) {
        SharedPreferences.Editor e = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit();
        if (question != null) e.putString("q", question);
        if (answer != null) e.putString("a", answer);
        if (status != null) e.putString("s", status);
        e.apply();
        refresh(ctx);
    }

    static void updateAll(Context ctx, AppWidgetManager mgr, int[] ids) {
        SharedPreferences p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String q = p.getString("q", "");
        String a = p.getString("a", "At your service, sir. Tap below to ask anything.");
        String s = p.getString("s", "Ready · offline");
        for (int id : ids) {
            RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.jarvis_widget_chat);
            v.setTextViewText(R.id.jarvis_chat_question, q.isEmpty() ? "" : "You: " + q);
            v.setTextViewText(R.id.jarvis_chat_answer, a);
            v.setTextViewText(R.id.jarvis_chat_status, s);
            v.setOnClickPendingIntent(R.id.jarvis_chat_input, JarvisMicWidget.launch(ctx, "chat", 7101));
            v.setOnClickPendingIntent(R.id.jarvis_chat_answer, JarvisMicWidget.launch(ctx, "chat", 7102));
            v.setOnClickPendingIntent(R.id.jarvis_chat_mic, JarvisMicWidget.launch(ctx, "chatvoice", 7103));
            v.setOnClickPendingIntent(R.id.jarvis_chat_chip1, JarvisMicWidget.launch(ctx, "chat:next", 7104));
            v.setOnClickPendingIntent(R.id.jarvis_chat_chip2, JarvisMicWidget.launch(ctx, "chat:plan", 7105));
            v.setOnClickPendingIntent(R.id.jarvis_chat_chip3, JarvisMicWidget.launch(ctx, "chat:capture", 7106));
            mgr.updateAppWidget(id, v);
        }
    }
}
