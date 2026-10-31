package com.jarvis.assistant;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import android.os.Build;
import android.os.IBinder;

import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;

/**
 * Always-on companion: keeps a low-priority notification, logs screen/unlock/step signals into
 * SenseStore and restarts after reboot. Uses almost no battery (event-driven, no polling).
 */
public class JarvisCoreService extends Service implements SensorEventListener {
    public static final String CHANNEL = "jarvis_core";
    public static final String ACTION_PAUSE = "com.jarvis.assistant.CORE_PAUSE";
    private static final int NOTIF_ID = 4711;
    private BroadcastReceiver screen;
    private SensorManager sensors;

    public static boolean enabled(Context c) { return SenseStore.prefs(c).getBoolean("coreEnabled", false); }

    public static void start(Context c) {
        SenseStore.prefs(c).edit().putBoolean("coreEnabled", true).apply();
        Intent i = new Intent(c, JarvisCoreService.class);
        if (Build.VERSION.SDK_INT >= 26) c.startForegroundService(i); else c.startService(i);
    }

    public static void stop(Context c) {
        SenseStore.prefs(c).edit().putBoolean("coreEnabled", false).apply();
        c.stopService(new Intent(c, JarvisCoreService.class));
    }

    @Override public IBinder onBind(Intent intent) { return null; }

    @Override
    public void onCreate() {
        super.onCreate();
        screen = new BroadcastReceiver() {
            @Override public void onReceive(Context c, Intent i) {
                long t = System.currentTimeMillis();
                String a = i.getAction();
                if (Intent.ACTION_SCREEN_OFF.equals(a)) SenseStore.screenOff(c, t);
                else if (Intent.ACTION_SCREEN_ON.equals(a)) SenseStore.screenOn(c, t);
                else if (Intent.ACTION_USER_PRESENT.equals(a)) SenseStore.unlock(c, t);
            }
        };
        IntentFilter f = new IntentFilter();
        f.addAction(Intent.ACTION_SCREEN_ON);
        f.addAction(Intent.ACTION_SCREEN_OFF);
        f.addAction(Intent.ACTION_USER_PRESENT);
        if (Build.VERSION.SDK_INT >= 33) registerReceiver(screen, f, Context.RECEIVER_NOT_EXPORTED); else registerReceiver(screen, f);
        sensors = (SensorManager) getSystemService(SENSOR_SERVICE);
        boolean stepOk = Build.VERSION.SDK_INT < 29 || ContextCompat.checkSelfPermission(this, "android.permission.ACTIVITY_RECOGNITION") == PackageManager.PERMISSION_GRANTED;
        Sensor step = sensors != null ? sensors.getDefaultSensor(Sensor.TYPE_STEP_COUNTER) : null;
        if (stepOk && step != null) sensors.registerListener(this, step, SensorManager.SENSOR_DELAY_NORMAL, 60_000_000);
        SenseStore.prune(this);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && ACTION_PAUSE.equals(intent.getAction())) { stop(this); stopSelf(); return START_NOT_STICKY; }
        Notification n = buildNotification();
        try {
            if (Build.VERSION.SDK_INT >= 34) startForeground(NOTIF_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
            else startForeground(NOTIF_ID, n);
        } catch (Exception e) {
            stopSelf();
            return START_NOT_STICKY;
        }
        return START_STICKY;
    }

    private Notification buildNotification() {
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= 26 && nm.getNotificationChannel(CHANNEL) == null) {
            NotificationChannel ch = new NotificationChannel(CHANNEL, "Jarvis (always on)", NotificationManager.IMPORTANCE_MIN);
            ch.setDescription("Lets Jarvis keep track of your day in the background");
            ch.setShowBadge(false);
            nm.createNotificationChannel(ch);
        }
        int flags = Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0;
        PendingIntent open = PendingIntent.getActivity(this, 0, new Intent(this, MainActivity.class), flags);
        PendingIntent pause = PendingIntent.getService(this, 1, new Intent(this, JarvisCoreService.class).setAction(ACTION_PAUSE), flags);
        int icon = getResources().getIdentifier("ic_stat_jarvis", "drawable", getPackageName());
        return new NotificationCompat.Builder(this, CHANNEL)
            .setSmallIcon(icon != 0 ? icon : android.R.drawable.ic_dialog_info)
            .setContentTitle("Jarvis is keeping watch")
            .setContentText("Private, on-device. Tap Pause to stop.")
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_MIN)
            .setContentIntent(open)
            .addAction(0, "Pause", pause)
            .build();
    }

    @Override public void onSensorChanged(SensorEvent e) { if (e.sensor.getType() == Sensor.TYPE_STEP_COUNTER) SenseStore.steps(this, (long) e.values[0]); }
    @Override public void onAccuracyChanged(Sensor s, int a) { }

    @Override
    public void onDestroy() {
        try { unregisterReceiver(screen); } catch (Exception ignored) { }
        if (sensors != null) sensors.unregisterListener(this);
        super.onDestroy();
    }
}
