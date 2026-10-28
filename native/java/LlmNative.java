package com.jarvis.assistant;

/** JNI bindings for native/cpp/jarvis_llm.cpp (llama.cpp). All text crosses as UTF-8 bytes. */
final class LlmNative {
    interface DeltaCallback { void onDelta(byte[] content, byte[] reasoning); }

    private static boolean loaded = false;
    private static Throwable loadError = null;

    static synchronized boolean ensure(String nativeLibDir) {
        if (loaded) return true;
        if (loadError != null) return false;
        try {
            System.loadLibrary("jarvisllm");
            init(nativeLibDir);
            loaded = true;
        } catch (Throwable t) {
            loadError = t;
        }
        return loaded;
    }

    static String error() { return loadError == null ? null : String.valueOf(loadError.getMessage()); }

    static native void init(String nativeLibDir);
    static native byte[] systemInfo();
    static native int defaultThreads();
    static native byte[] load(String path, int nCtx, int nThreads, int nBatch, int mode);
    static native void unload();
    static native byte[] info();
    static native void stop();
    static native byte[] chat(byte[] requestJson, DeltaCallback callback);
    static native void clearSlot(int slot);
    static native byte[] loadEmbed(String path);
    static native void unloadEmbed();
    static native float[] embed(byte[] text);

    private LlmNative() { }
}
