package com.jarvis.assistant;

import android.app.Notification;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;

/** Counts notifications per app (opt-in). Content is never stored. */
public class JarvisNotificationListener extends NotificationListenerService {
    @Override
    public void onNotificationPosted(StatusBarNotification sbn) {
        if (sbn == null || sbn.isOngoing() || getPackageName().equals(sbn.getPackageName())) return;
        Notification n = sbn.getNotification();
        if (n != null && (n.flags & Notification.FLAG_GROUP_SUMMARY) != 0) return;
        SenseStore.countNotification(this, sbn.getPackageName());
    }
}
