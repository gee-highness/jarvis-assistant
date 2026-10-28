package com.jarvis.assistant;

import android.Manifest;
import android.content.ContentResolver;
import android.content.ContentUris;
import android.database.Cursor;
import android.net.Uri;
import android.provider.CalendarContract;
import android.provider.ContactsContract;
import android.telephony.SmsManager;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.util.ArrayList;

/** Reads the device calendar and contacts, and sends SMS (each behind its own runtime permission). */
@CapacitorPlugin(
    name = "JarvisData",
    permissions = {
        @Permission(alias = "calendar", strings = { Manifest.permission.READ_CALENDAR }),
        @Permission(alias = "contacts", strings = { Manifest.permission.READ_CONTACTS }),
        @Permission(alias = "sms", strings = { Manifest.permission.SEND_SMS })
    }
)
public class JarvisDataPlugin extends Plugin {

    // ------------------------------------------------------------ calendar
    @PluginMethod
    public void getEvents(PluginCall call) {
        if (getPermissionState("calendar") != PermissionState.GRANTED) {
            requestPermissionForAlias("calendar", call, "calendarPerm");
            return;
        }
        runEvents(call);
    }

    @PermissionCallback
    private void calendarPerm(PluginCall call) {
        if (getPermissionState("calendar") == PermissionState.GRANTED) runEvents(call);
        else call.reject("Calendar permission was not granted");
    }

    private void runEvents(PluginCall call) {
        try {
            long from = call.getData().optLong("from", System.currentTimeMillis());
            long to = call.getData().optLong("to", from + 24L * 3600 * 1000);
            int limit = call.getInt("limit", 40);
            Uri.Builder b = CalendarContract.Instances.CONTENT_URI.buildUpon();
            ContentUris.appendId(b, from);
            ContentUris.appendId(b, to);
            String[] proj = { CalendarContract.Instances.TITLE, CalendarContract.Instances.BEGIN, CalendarContract.Instances.END,
                CalendarContract.Instances.EVENT_LOCATION, CalendarContract.Instances.ALL_DAY };
            ContentResolver cr = getContext().getContentResolver();
            JSArray out = new JSArray();
            try (Cursor c = cr.query(b.build(), proj, null, null, CalendarContract.Instances.BEGIN + " ASC")) {
                while (c != null && c.moveToNext() && out.length() < limit) {
                    JSObject o = new JSObject();
                    o.put("title", c.getString(0));
                    o.put("start", c.getLong(1));
                    o.put("end", c.getLong(2));
                    o.put("location", c.getString(3));
                    o.put("allDay", c.getInt(4) == 1);
                    out.put(o);
                }
            }
            JSObject res = new JSObject();
            res.put("events", out);
            call.resolve(res);
        } catch (Exception e) {
            call.reject("Could not read the calendar: " + e.getMessage());
        }
    }

    // ------------------------------------------------------------ contacts
    @PluginMethod
    public void findContacts(PluginCall call) {
        if (getPermissionState("contacts") != PermissionState.GRANTED) {
            requestPermissionForAlias("contacts", call, "contactsPerm");
            return;
        }
        runContacts(call);
    }

    @PermissionCallback
    private void contactsPerm(PluginCall call) {
        if (getPermissionState("contacts") == PermissionState.GRANTED) runContacts(call);
        else call.reject("Contacts permission was not granted");
    }

    private void runContacts(PluginCall call) {
        try {
            String q = call.getString("query", "");
            String[] proj = { ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME, ContactsContract.CommonDataKinds.Phone.NUMBER };
            ContentResolver cr = getContext().getContentResolver();
            JSArray out = new JSArray();
            ArrayList<String> seen = new ArrayList<>();
            try (Cursor c = cr.query(ContactsContract.CommonDataKinds.Phone.CONTENT_URI, proj,
                ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME + " LIKE ?", new String[] { "%" + q + "%" },
                ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME + " ASC")) {
                while (c != null && c.moveToNext() && out.length() < 8) {
                    String key = c.getString(0) + "|" + c.getString(1);
                    if (seen.contains(key)) continue;
                    seen.add(key);
                    JSObject o = new JSObject();
                    o.put("name", c.getString(0));
                    o.put("number", c.getString(1));
                    out.put(o);
                }
            }
            JSObject res = new JSObject();
            res.put("contacts", out);
            call.resolve(res);
        } catch (Exception e) {
            call.reject("Could not read contacts: " + e.getMessage());
        }
    }

    // ------------------------------------------------------------ sms
    @PluginMethod
    public void sendSms(PluginCall call) {
        if (getPermissionState("sms") != PermissionState.GRANTED) {
            requestPermissionForAlias("sms", call, "smsPerm");
            return;
        }
        runSms(call);
    }

    @PermissionCallback
    private void smsPerm(PluginCall call) {
        if (getPermissionState("sms") == PermissionState.GRANTED) runSms(call);
        else call.reject("SMS permission was not granted");
    }

    @SuppressWarnings("deprecation")
    private void runSms(PluginCall call) {
        try {
            String number = call.getString("number", "");
            String text = call.getString("text", "");
            if (number.isEmpty() || text.isEmpty()) { call.reject("Number and text are required"); return; }
            SmsManager sm = android.os.Build.VERSION.SDK_INT >= 31
                ? getContext().getSystemService(SmsManager.class) : SmsManager.getDefault();
            ArrayList<String> parts = sm.divideMessage(text);
            sm.sendMultipartTextMessage(number, null, parts, null, null);
            call.resolve();
        } catch (Exception e) {
            call.reject("Could not send the SMS: " + e.getMessage());
        }
    }
}
