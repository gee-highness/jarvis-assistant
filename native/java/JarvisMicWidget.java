package com.jarvis.assistant;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.widget.RemoteViews;

/** 1x1 home-screen mic: tap to open Jarvis straight into voice mode. */
public class JarvisMicWidget extends AppWidgetProvider {

    static PendingIntent launch(Context ctx, String action, int requestCode) {
        Intent i = new Intent(ctx, MainActivity.class);
        i.setAction(Intent.ACTION_MAIN);
        i.putExtra(JarvisDevicePlugin.EXTRA_ACTION, action);
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        return PendingIntent.getActivity(ctx, requestCode, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    @Override
    public void onUpdate(Context ctx, AppWidgetManager mgr, int[] ids) {
        for (int id : ids) {
            RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.jarvis_widget_mic);
            v.setOnClickPendingIntent(R.id.jarvis_widget_mic_btn, launch(ctx, "voice", 7001));
            mgr.updateAppWidget(id, v);
        }
    }
}
