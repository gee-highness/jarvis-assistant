package com.jarvis.assistant;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.Date;
import java.util.Iterator;
import java.util.Locale;

/**
 * On-device daily log of passive signals: steps, unlocks, screen time, sleep estimate,
 * late-night use and notification counts. Never leaves the phone.
 */
public final class SenseStore {
    private static final String PREFS = "jarvis_sense";
    private static final int KEEP_DAYS = 120;

    private SenseStore() {}

    static SharedPreferences prefs(Context c) { return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE); }

    static String day(long t) { return new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(new Date(t)); }

    static synchronized JSONObject get(Context c, String date) {
        try { return new JSONObject(prefs(c).getString("d:" + date, "{}")); } catch (Exception e) { return new JSONObject(); }
    }

    static synchronized void put(Context c, String date, JSONObject o) {
        prefs(c).edit().putString("d:" + date, o.toString()).apply();
    }

    static synchronized void add(Context c, String key, long delta) {
        String d = day(System.currentTimeMillis());
        JSONObject o = get(c, d);
        try { o.put(key, o.optLong(key, 0) + delta); } catch (Exception ignored) { }
        put(c, d, o);
    }

    static synchronized void set(Context c, String date, String key, long value) {
        JSONObject o = get(c, date);
        try { o.put(key, value); } catch (Exception ignored) { }
        put(c, date, o);
    }

    static synchronized void setIfAbsent(Context c, String key, long value) {
        String d = day(System.currentTimeMillis());
        JSONObject o = get(c, d);
        if (!o.has(key)) { try { o.put(key, value); } catch (Exception ignored) { } put(c, d, o); }
    }

    static synchronized void countNotification(Context c, String pkg) {
        String d = day(System.currentTimeMillis());
        JSONObject o = get(c, d);
        try {
            JSONObject n = o.optJSONObject("notif");
            if (n == null) n = new JSONObject();
            n.put(pkg, n.optInt(pkg, 0) + 1);
            o.put("notif", n);
            o.put("notifTotal", o.optInt("notifTotal", 0) + 1);
        } catch (Exception ignored) { }
        put(c, d, o);
    }

    // ---------------- steps (TYPE_STEP_COUNTER is cumulative since boot)
    static synchronized void steps(Context c, long counter) {
        SharedPreferences p = prefs(c);
        String today = day(System.currentTimeMillis());
        String baseDay = p.getString("stepBaseDay", "");
        long base = p.getLong("stepBase", -1);
        long last = p.getLong("stepLast", -1);
        SharedPreferences.Editor e = p.edit();
        if (!today.equals(baseDay) || base < 0) {
            // new day: today's baseline is the last reading of yesterday (or now)
            base = last >= 0 && last <= counter ? last : counter;
            e.putString("stepBaseDay", today);
        } else if (counter < last) {
            // reboot reset the counter: carry today's steps forward
            base = counter - (last - base);
        }
        e.putLong("stepBase", base).putLong("stepLast", counter).apply();
        set(c, today, "steps", Math.max(0, counter - base));
    }

    // ---------------- screen / sleep
    static synchronized void screenOff(Context c, long t) {
        prefs(c).edit().putLong("lastOff", t).apply();
        set(c, day(t), "lastOff", t);
    }

    static synchronized void screenOn(Context c, long t) {
        SharedPreferences p = prefs(c);
        long off = p.getLong("lastOff", 0);
        long lastOn = p.getLong("lastOn", 0);
        if (lastOn > 0 && off > lastOn) add(c, "screenOnMs", off - lastOn);
        p.edit().putLong("lastOn", t).apply();
        // sleep estimate: the longest screen-off gap that started after 19:00 or ended before 12:00
        if (off > 0 && t - off > 3 * 3600_000L) {
            Calendar s = Calendar.getInstance(); s.setTimeInMillis(off);
            Calendar w = Calendar.getInstance(); w.setTimeInMillis(t);
            int sh = s.get(Calendar.HOUR_OF_DAY), wh = w.get(Calendar.HOUR_OF_DAY);
            if ((sh >= 19 || sh < 6) && wh < 13) {
                String d = day(t);
                JSONObject o = get(c, d);
                long prev = o.optLong("sleepEnd", 0) - o.optLong("sleepStart", 0);
                if (t - off > prev) {
                    try { o.put("sleepStart", off); o.put("sleepEnd", t); } catch (Exception ignored) { }
                    put(c, d, o);
                }
            }
        }
        Calendar now = Calendar.getInstance(); now.setTimeInMillis(t);
        int h = now.get(Calendar.HOUR_OF_DAY);
        if (h >= 23 || h < 4) add(c, "lateOns", 1);
    }

    static synchronized void unlock(Context c, long t) {
        add(c, "unlocks", 1);
        setIfAbsent(c, "firstUnlock", t);
    }

    /** Last screen-on interval is still running: include it in today's total. */
    static synchronized JSONObject snapshot(Context c, String date) {
        JSONObject o = get(c, date);
        SharedPreferences p = prefs(c);
        long lastOn = p.getLong("lastOn", 0), off = p.getLong("lastOff", 0);
        if (date.equals(day(System.currentTimeMillis())) && lastOn > off && day(lastOn).equals(date)) {
            try { o.put("screenOnMs", o.optLong("screenOnMs", 0) + (System.currentTimeMillis() - lastOn)); } catch (Exception ignored) { }
        }
        try { o.put("date", date); } catch (Exception ignored) { }
        return o;
    }

    static synchronized void prune(Context c) {
        Calendar cut = Calendar.getInstance();
        cut.add(Calendar.DAY_OF_YEAR, -KEEP_DAYS);
        String limit = "d:" + day(cut.getTimeInMillis());
        SharedPreferences.Editor e = prefs(c).edit();
        Iterator<String> it = prefs(c).getAll().keySet().iterator();
        while (it.hasNext()) { String k = it.next(); if (k.startsWith("d:") && k.compareTo(limit) < 0) e.remove(k); }
        e.apply();
    }

    static synchronized void clear(Context c) { prefs(c).edit().clear().apply(); }
}
