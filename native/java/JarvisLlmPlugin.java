package com.jarvis.assistant;

import android.app.Activity;
import android.app.ActivityManager;
import android.app.DownloadManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.database.Cursor;
import android.net.Uri;
import android.os.StatFs;
import android.provider.OpenableColumns;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.Iterator;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;

/**
 * On-device brain: llama.cpp inference (chat + embeddings), model downloads through Android's
 * DownloadManager (survives the app being closed, resumes, shows a notification) and .gguf import.
 */
@CapacitorPlugin(name = "JarvisLlm")
public class JarvisLlmPlugin extends Plugin {

    private static final String PREFS = "jarvis_llm_downloads";
    private final ExecutorService llmExec = Executors.newSingleThreadExecutor();
    private final ExecutorService embedExec = Executors.newSingleThreadExecutor();
    private final ExecutorService ioExec = Executors.newCachedThreadPool();
    private final ScheduledExecutorService poller = Executors.newSingleThreadScheduledExecutor();
    private ScheduledFuture<?> pollTask = null;
    private boolean available = false;

    @Override
    public void load() {
        available = LlmNative.ensure(getContext().getApplicationInfo().nativeLibraryDir);
        if (!trackedIds().isEmpty()) startPolling();
    }

    @Override
    protected void handleOnDestroy() {
        if (pollTask != null) pollTask.cancel(false);
        super.handleOnDestroy();
    }

    // =====================================================================
    // helpers
    // =====================================================================
    private File modelsDir() {
        File d = getContext().getExternalFilesDir("models");
        if (d == null) d = new File(getContext().getFilesDir(), "models");
        if (!d.exists()) d.mkdirs();
        return d;
    }

    private static boolean safeName(String f) {
        return f != null && !f.isEmpty() && !f.contains("/") && !f.contains("\\") && !f.startsWith(".") && f.toLowerCase(Locale.ROOT).endsWith(".gguf");
    }

    private static JSObject parse(byte[] utf8) {
        try { return new JSObject(new String(utf8 == null ? new byte[0] : utf8, StandardCharsets.UTF_8)); }
        catch (JSONException e) { JSObject o = new JSObject(); o.put("error", "internal"); o.put("message", "Bad engine response"); return o; }
    }

    private boolean requireEngine(PluginCall call) {
        if (available) return true;
        call.reject("On-device engine unavailable: " + LlmNative.error());
        return false;
    }

    // =====================================================================
    // status / models on disk
    // =====================================================================
    @PluginMethod
    public void getStatus(PluginCall call) {
        JSObject o = new JSObject();
        o.put("available", available);
        if (!available) o.put("error", LlmNative.error());
        File dir = modelsDir();
        o.put("modelsDir", dir.getAbsolutePath());
        try { StatFs st = new StatFs(dir.getAbsolutePath()); o.put("freeBytes", st.getAvailableBytes()); } catch (Exception ignored) { }
        ActivityManager am = (ActivityManager) getContext().getSystemService(Context.ACTIVITY_SERVICE);
        ActivityManager.MemoryInfo mi = new ActivityManager.MemoryInfo();
        am.getMemoryInfo(mi);
        o.put("ramTotalMb", mi.totalMem / 1048576L);
        o.put("ramAvailMb", mi.availMem / 1048576L);
        o.put("cores", Runtime.getRuntime().availableProcessors());
        if (available) {
            o.put("defaultThreads", LlmNative.defaultThreads());
            o.put("systemInfo", new String(LlmNative.systemInfo(), StandardCharsets.UTF_8));
        }
        call.resolve(o);
    }

    @PluginMethod
    public void listModels(PluginCall call) {
        JSArray arr = new JSArray();
        File[] files = modelsDir().listFiles();
        if (files != null) {
            for (File f : files) {
                if (!f.isFile() || !f.getName().toLowerCase(Locale.ROOT).endsWith(".gguf")) continue;
                JSObject m = new JSObject();
                m.put("file", f.getName());
                m.put("size", f.length());
                m.put("modified", f.lastModified());
                arr.put(m);
            }
        }
        JSObject o = new JSObject();
        o.put("models", arr);
        call.resolve(o);
    }

    /** SHA-256 of a model file, so Diagnostics can spot a corrupted download/import. */
    @PluginMethod
    public void hashModel(PluginCall call) {
        String file = call.getString("file");
        if (!safeName(file)) { call.reject("Invalid file name"); return; }
        File f = new File(modelsDir(), file);
        new Thread(() -> {
            try {
                JSObject o = new JSObject(); o.put("sha256", sha256(f)); o.put("size", f.length()); o.put("path", f.getAbsolutePath());
                call.resolve(o);
            } catch (Exception e) { call.reject(String.valueOf(e.getMessage())); }
        }).start();
    }

    private static String sha256(File f) throws Exception {
        try (InputStream in = new java.io.FileInputStream(f)) {
            java.security.MessageDigest md = java.security.MessageDigest.getInstance("SHA-256");
            byte[] buf = new byte[1 << 20];
            int n;
            while ((n = in.read(buf)) > 0) md.update(buf, 0, n);
            StringBuilder sb = new StringBuilder();
            for (byte b : md.digest()) sb.append(String.format("%02x", b));
            return sb.toString();
        }
    }

    @PluginMethod
    public void deleteModel(PluginCall call) {
        String file = call.getString("file");
        if (!safeName(file)) { call.reject("Invalid file name"); return; }
        File f = new File(modelsDir(), file);
        boolean ok = !f.exists() || f.delete();
        JSObject o = new JSObject(); o.put("deleted", ok); call.resolve(o);
    }

    // =====================================================================
    // inference
    // =====================================================================
    @PluginMethod
    public void load(PluginCall call) {
        if (!requireEngine(call)) return;
        String file = call.getString("file");
        if (!safeName(file)) { call.reject("Invalid model file"); return; }
        File f = new File(modelsDir(), file);
        if (!f.exists()) { call.reject("Model not downloaded: " + file); return; }
        int nCtx = call.getInt("nCtx", 4096);
        int threads = call.getInt("threads", 0);
        int batch = call.getInt("batch", 256);
        int mode = call.getInt("mode", 1);
        llmExec.execute(() -> call.resolve(parse(LlmNative.load(f.getAbsolutePath(), nCtx, threads, batch, mode))));
    }

    @PluginMethod
    public void unload(PluginCall call) {
        if (!requireEngine(call)) return;
        LlmNative.stop();
        llmExec.execute(() -> { LlmNative.unload(); call.resolve(); });
    }

    @PluginMethod
    public void info(PluginCall call) {
        if (!requireEngine(call)) return;
        llmExec.execute(() -> call.resolve(parse(LlmNative.info())));
    }

    @PluginMethod
    public void chat(PluginCall call) {
        if (!requireEngine(call)) return;
        String request = call.getString("request");
        String requestId = call.getString("requestId", "");
        if (request == null) { call.reject("Missing request"); return; }
        byte[] req = request.getBytes(StandardCharsets.UTF_8);
        llmExec.execute(() -> {
            byte[] out = LlmNative.chat(req, (content, reasoning) -> {
                JSObject d = new JSObject();
                d.put("requestId", requestId);
                d.put("content", new String(content, StandardCharsets.UTF_8));
                d.put("reasoning", new String(reasoning, StandardCharsets.UTF_8));
                notifyListeners("llmDelta", d);
            });
            call.resolve(parse(out));
        });
    }

    /** Stops the running generation (or prompt processing) as soon as possible. */
    @PluginMethod
    public void stop(PluginCall call) {
        if (available) LlmNative.stop();
        call.resolve();
    }

    @PluginMethod
    public void clearSlot(PluginCall call) {
        if (!requireEngine(call)) return;
        int slot = call.getInt("slot", 0);
        llmExec.execute(() -> { LlmNative.clearSlot(slot); call.resolve(); });
    }

    @PluginMethod
    public void loadEmbed(PluginCall call) {
        if (!requireEngine(call)) return;
        String file = call.getString("file");
        if (!safeName(file)) { call.reject("Invalid model file"); return; }
        File f = new File(modelsDir(), file);
        if (!f.exists()) { call.reject("Embedding model not downloaded"); return; }
        embedExec.execute(() -> call.resolve(parse(LlmNative.loadEmbed(f.getAbsolutePath()))));
    }

    @PluginMethod
    public void embed(PluginCall call) {
        if (!requireEngine(call)) return;
        JSArray texts = call.getArray("texts");
        if (texts == null) { call.reject("Missing texts"); return; }
        embedExec.execute(() -> {
            try {
                JSONArray vectors = new JSONArray();
                for (int i = 0; i < texts.length(); i++) {
                    float[] v = LlmNative.embed(texts.getString(i).getBytes(StandardCharsets.UTF_8));
                    if (v == null) { call.reject("Embedding failed (model not loaded?)"); return; }
                    JSONArray row = new JSONArray();
                    for (float x : v) row.put((double) x);
                    vectors.put(row);
                }
                JSObject o = new JSObject();
                o.put("vectors", vectors);
                call.resolve(o);
            } catch (Exception e) {
                call.reject("Embedding failed: " + e.getMessage());
            }
        });
    }

    // =====================================================================
    // downloads (Hugging Face → DownloadManager)
    // =====================================================================
    private SharedPreferences prefs() { return getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE); }

    private java.util.List<String> trackedIds() {
        java.util.List<String> ids = new java.util.ArrayList<>();
        for (String k : prefs().getAll().keySet()) ids.add(k);
        return ids;
    }

    private static String httpGet(String url) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
        c.setConnectTimeout(15000);
        c.setReadTimeout(20000);
        c.setRequestProperty("User-Agent", "Jarvis-Android");
        c.setRequestProperty("Accept", "application/json");
        int code = c.getResponseCode();
        if (code >= 400) throw new Exception("HTTP " + code);
        try (InputStream in = c.getInputStream(); ByteArrayOutputStream bo = new ByteArrayOutputStream()) {
            byte[] buf = new byte[16384];
            int n;
            while ((n = in.read(buf)) > 0) bo.write(buf, 0, n);
            return bo.toString("UTF-8");
        } finally { c.disconnect(); }
    }

    /** Finds the exact .gguf in a Hugging Face repo: preferred file name, else the first file matching the quant tag. */
    private static JSONObject resolveRepoFile(String repo, String preferred, String quant) throws Exception {
        JSONArray tree = new JSONArray(httpGet("https://huggingface.co/api/models/" + repo + "/tree/main"));
        JSONObject byQuant = null;
        String q = quant == null ? "" : quant.toLowerCase(Locale.ROOT);
        for (int i = 0; i < tree.length(); i++) {
            JSONObject e = tree.getJSONObject(i);
            if (!"file".equals(e.optString("type"))) continue;
            String path = e.optString("path");
            String lower = path.toLowerCase(Locale.ROOT);
            if (!lower.endsWith(".gguf") || lower.contains("mmproj") || lower.matches(".*-\\d{5}-of-\\d{5}\\.gguf")) continue;
            if (preferred != null && path.equals(preferred)) return e;
            if (byQuant == null && !q.isEmpty() && (lower.contains("-" + q + ".") || lower.contains("." + q + ".") || lower.contains("_" + q + "."))) byQuant = e;
        }
        if (byQuant != null) return byQuant;
        throw new Exception("No " + (quant == null ? "" : quant + " ") + "GGUF file found in " + repo);
    }

    private static String encodePath(String path) throws Exception {
        StringBuilder sb = new StringBuilder();
        for (String seg : path.split("/")) {
            if (sb.length() > 0) sb.append('/');
            sb.append(URLEncoder.encode(seg, "UTF-8").replace("+", "%20"));
        }
        return sb.toString();
    }

    /**
     * Starts a download. Args: id (catalog id), repo, file (preferred repo file, optional), quant (fallback match),
     * dest (local .gguf name), title, wifiOnly. Progress arrives as "llmDownload" events.
     */
    @PluginMethod
    public void download(PluginCall call) {
        String id = call.getString("id");
        String repo = call.getString("repo");
        String file = call.getString("file");
        String quant = call.getString("quant");
        String dest = call.getString("dest");
        String title = call.getString("title", "Jarvis model");
        boolean wifiOnly = Boolean.TRUE.equals(call.getBoolean("wifiOnly", false));
        if (id == null || repo == null || !safeName(dest)) { call.reject("Invalid download request"); return; }
        if (prefs().contains(id)) { call.reject("Already downloading"); return; }
        ioExec.execute(() -> {
            try {
                String repoFile = file;
                long expected = -1;
                String sha = "";
                try {
                    JSONObject e = resolveRepoFile(repo, file, quant);
                    repoFile = e.getString("path");
                    JSONObject lfs = e.optJSONObject("lfs");
                    expected = lfs != null ? lfs.optLong("size", e.optLong("size", -1)) : e.optLong("size", -1);
                    if (lfs != null) sha = lfs.optString("oid", "");   // LFS oid is the file's SHA-256
                } catch (Exception resolveError) {
                    if (repoFile == null) throw resolveError;   // no fallback name: report the real problem
                }
                File dir = modelsDir();
                if (expected > 0) {
                    long free = new StatFs(dir.getAbsolutePath()).getAvailableBytes();
                    if (free < expected + 200L * 1048576L) throw new Exception("Not enough storage: need " + (expected / 1048576L) + " MB, " + (free / 1048576L) + " MB free");
                }
                String tmpName = dest + ".download";
                new File(dir, tmpName).delete();
                String url = "https://huggingface.co/" + repo + "/resolve/main/" + encodePath(repoFile) + "?download=true";
                DownloadManager.Request r = new DownloadManager.Request(Uri.parse(url));
                r.setTitle(title);
                r.setDescription("Jarvis on-device brain");
                r.addRequestHeader("User-Agent", "Jarvis-Android");
                r.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
                r.setAllowedOverMetered(!wifiOnly);
                r.setAllowedOverRoaming(!wifiOnly);
                r.setDestinationInExternalFilesDir(getContext(), "models", tmpName);
                DownloadManager dm = (DownloadManager) getContext().getSystemService(Context.DOWNLOAD_SERVICE);
                long dmId = dm.enqueue(r);
                JSONObject t = new JSONObject();
                t.put("dmId", dmId);
                t.put("dest", dest);
                t.put("tmp", tmpName);
                t.put("expected", expected);
                t.put("sha256", sha);
                prefs().edit().putString(id, t.toString()).apply();
                startPolling();
                JSObject o = new JSObject();
                o.put("started", true);
                o.put("repoFile", repoFile);
                o.put("expected", expected);
                call.resolve(o);
            } catch (Exception e) {
                call.reject(e.getMessage() == null ? "Download failed" : e.getMessage());
            }
        });
    }

    @PluginMethod
    public void cancelDownload(PluginCall call) {
        String id = call.getString("id");
        String raw = id == null ? null : prefs().getString(id, null);
        if (raw != null) {
            try {
                JSONObject t = new JSONObject(raw);
                DownloadManager dm = (DownloadManager) getContext().getSystemService(Context.DOWNLOAD_SERVICE);
                dm.remove(t.getLong("dmId"));
                new File(modelsDir(), t.getString("tmp")).delete();
            } catch (Exception ignored) { }
            prefs().edit().remove(id).apply();
            emitDownload(id, "cancelled", 0, 0, null);
        }
        call.resolve();
    }

    @PluginMethod
    public void getDownloads(PluginCall call) {
        JSObject o = new JSObject();
        o.put("downloads", pollOnce());
        call.resolve(o);
    }

    private synchronized void startPolling() {
        if (pollTask != null && !pollTask.isDone()) return;
        pollTask = poller.scheduleWithFixedDelay(() -> {
            try {
                pollOnce();
                if (trackedIds().isEmpty() && pollTask != null) pollTask.cancel(false);
            } catch (Exception ignored) { }
        }, 0, 800, TimeUnit.MILLISECONDS);
    }

    private void emitDownload(String id, String status, long received, long total, String error) {
        JSObject d = new JSObject();
        d.put("id", id);
        d.put("status", status);
        d.put("received", received);
        d.put("total", total);
        if (error != null) d.put("error", error);
        notifyListeners("llmDownload", d);
    }

    /** Queries DownloadManager for every tracked download, finalises finished ones and emits progress. */
    private synchronized JSArray pollOnce() {
        JSArray out = new JSArray();
        DownloadManager dm = (DownloadManager) getContext().getSystemService(Context.DOWNLOAD_SERVICE);
        for (String id : trackedIds()) {
            JSONObject t;
            try { t = new JSONObject(prefs().getString(id, "{}")); } catch (JSONException e) { prefs().edit().remove(id).apply(); continue; }
            long dmId = t.optLong("dmId", -1);
            String status = "error";
            long received = 0, total = t.optLong("expected", -1);
            String error = null;
            try (Cursor c = dm.query(new DownloadManager.Query().setFilterById(dmId))) {
                if (c != null && c.moveToFirst()) {
                    int st = c.getInt(c.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS));
                    received = c.getLong(c.getColumnIndexOrThrow(DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR));
                    long tot = c.getLong(c.getColumnIndexOrThrow(DownloadManager.COLUMN_TOTAL_SIZE_BYTES));
                    if (tot > 0) total = tot;
                    int reason = c.getInt(c.getColumnIndexOrThrow(DownloadManager.COLUMN_REASON));
                    switch (st) {
                        case DownloadManager.STATUS_PENDING: status = "pending"; break;
                        case DownloadManager.STATUS_RUNNING: status = "running"; break;
                        case DownloadManager.STATUS_PAUSED: status = "paused"; error = pausedReason(reason); break;
                        case DownloadManager.STATUS_SUCCESSFUL: status = "done"; break;
                        default: status = "error"; error = failedReason(reason); break;
                    }
                } else {
                    error = "Download was removed";
                }
            } catch (Exception e) { error = e.getMessage(); }

            if ("done".equals(status)) {
                File tmp = new File(modelsDir(), t.optString("tmp"));
                File dest = new File(modelsDir(), t.optString("dest"));
                long expected = t.optLong("expected", -1);
                if (!tmp.exists()) { status = "error"; error = "Downloaded file missing"; }
                else if (expected > 0 && tmp.length() != expected) { status = "error"; error = "Size mismatch (" + tmp.length() + " of " + expected + " bytes)"; tmp.delete(); }
                else if (!isGguf(tmp)) { status = "error"; error = "Downloaded file is not a GGUF model"; tmp.delete(); }
                else if (!shaMatches(tmp, t.optString("sha256"))) { status = "error"; error = "Download corrupted (checksum mismatch), please download again"; tmp.delete(); }
                else {
                    dest.delete();
                    if (!tmp.renameTo(dest)) { status = "error"; error = "Could not finalise model file"; }
                    else received = total = dest.length();
                }
                dm.remove(dmId); // forget the DM record; the file lives in our models dir now (rename already done)
            }
            if ("done".equals(status) || "error".equals(status)) {
                if ("error".equals(status)) { try { dm.remove(dmId); } catch (Exception ignored) { } new File(modelsDir(), t.optString("tmp")).delete(); }
                prefs().edit().remove(id).apply();
            }
            emitDownload(id, status, received, total, error);
            JSObject row = new JSObject();
            row.put("id", id); row.put("status", status); row.put("received", received); row.put("total", total);
            if (error != null) row.put("error", error);
            out.put(row);
        }
        return out;
    }

    /** Same-size downloads can still carry bad bytes (flaky resume/storage), which makes the model emit gibberish. */
    private static boolean shaMatches(File f, String expected) {
        if (expected == null || expected.length() != 64) return true;   // no hash published: size check only
        try { return expected.equalsIgnoreCase(sha256(f)); } catch (Exception e) { return false; }
    }

    private static boolean isGguf(File f) {
        try (InputStream in = new java.io.FileInputStream(f)) {
            byte[] b = new byte[4];
            return in.read(b) == 4 && b[0] == 'G' && b[1] == 'G' && b[2] == 'U' && b[3] == 'F';
        } catch (Exception e) { return false; }
    }

    private static String pausedReason(int r) {
        switch (r) {
            case DownloadManager.PAUSED_QUEUED_FOR_WIFI: return "Waiting for Wi-Fi";
            case DownloadManager.PAUSED_WAITING_FOR_NETWORK: return "Waiting for network";
            case DownloadManager.PAUSED_WAITING_TO_RETRY: return "Retrying…";
            default: return "Paused";
        }
    }

    private static String failedReason(int r) {
        switch (r) {
            case DownloadManager.ERROR_INSUFFICIENT_SPACE: return "Not enough storage";
            case DownloadManager.ERROR_DEVICE_NOT_FOUND: return "Storage unavailable";
            case DownloadManager.ERROR_HTTP_DATA_ERROR: return "Network error";
            case DownloadManager.ERROR_TOO_MANY_REDIRECTS: return "Too many redirects";
            case DownloadManager.ERROR_CANNOT_RESUME: return "Could not resume, please retry";
            case DownloadManager.ERROR_FILE_ERROR: return "File error";
            default: return r >= 400 && r < 600 ? "Server error " + r : "Download failed (" + r + ")";
        }
    }

    // =====================================================================
    // import a .gguf from phone storage
    // =====================================================================
    @PluginMethod
    public void importModel(PluginCall call) {
        Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        i.addCategory(Intent.CATEGORY_OPENABLE);
        i.setType("*/*");
        startActivityForResult(call, i, "importResult");
    }

    @ActivityCallback
    private void importResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null || result.getData().getData() == null) {
            call.reject("cancelled");
            return;
        }
        Uri uri = result.getData().getData();
        ioExec.execute(() -> {
            String name = "imported.gguf";
            long size = -1;
            try (Cursor c = getContext().getContentResolver().query(uri, null, null, null, null)) {
                if (c != null && c.moveToFirst()) {
                    int ni = c.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                    int si = c.getColumnIndex(OpenableColumns.SIZE);
                    if (ni >= 0) name = c.getString(ni);
                    if (si >= 0) size = c.getLong(si);
                }
            } catch (Exception ignored) { }
            name = name.replaceAll("[^A-Za-z0-9._-]", "_");
            if (!name.toLowerCase(Locale.ROOT).endsWith(".gguf")) { call.reject("Please pick a .gguf model file"); return; }
            File dir = modelsDir();
            if (size > 0) {
                long free = new StatFs(dir.getAbsolutePath()).getAvailableBytes();
                if (free < size + 100L * 1048576L) { call.reject("Not enough storage"); return; }
            }
            File tmp = new File(dir, name + ".import");
            File dest = new File(dir, name);
            String evId = "import:" + name;
            try (InputStream in = getContext().getContentResolver().openInputStream(uri); OutputStream out = new FileOutputStream(tmp)) {
                if (in == null) throw new Exception("Cannot open file");
                byte[] buf = new byte[1 << 20];
                long copied = 0, lastEmit = 0;
                int n;
                while ((n = in.read(buf)) > 0) {
                    out.write(buf, 0, n);
                    copied += n;
                    if (copied - lastEmit > 32L * 1048576L) { lastEmit = copied; emitDownload(evId, "running", copied, size, null); }
                }
                out.flush();
            } catch (Exception e) {
                tmp.delete();
                emitDownload(evId, "error", 0, size, e.getMessage());
                call.reject("Import failed: " + e.getMessage());
                return;
            }
            if (!isGguf(tmp)) { tmp.delete(); call.reject("That file is not a GGUF model"); return; }
            dest.delete();
            if (!tmp.renameTo(dest)) { tmp.delete(); call.reject("Could not save model"); return; }
            emitDownload(evId, "done", dest.length(), dest.length(), null);
            JSObject o = new JSObject();
            o.put("file", name);
            o.put("size", dest.length());
            call.resolve(o);
        });
    }
}
