package com.jarvis.assistant;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "JarvisPet")
public class JarvisPetPlugin extends Plugin {
    @PluginMethod
    public void update(PluginCall call) {
        JarvisPetWidget.save(getContext(), call.getString("idle"), call.getString("happy"), call.getString("line"), call.getString("status"), call.getString("reactions"));
        call.resolve();
    }

    @PluginMethod
    public void takeTaps(PluginCall call) {
        JSObject o = new JSObject();
        o.put("taps", JarvisPetWidget.takeTaps(getContext()));
        call.resolve(o);
    }
}
