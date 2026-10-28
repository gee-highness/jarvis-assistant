package com.jarvis.assistant;
import java.nio.charset.StandardCharsets;
public class Test {
    static String s(byte[] b) { return new String(b, StandardCharsets.UTF_8); }
    static String q(String x) { return x.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n"); }
    public static void main(String[] a) throws Exception {
        if (!LlmNative.ensure(a[0])) { System.out.println("LOAD FAIL " + LlmNative.error()); return; }
        System.out.println("SYSINFO " + s(LlmNative.systemInfo()));
        int threads = Integer.parseInt(a[2]);
        System.out.println("LOAD " + s(LlmNative.load(a[1], 4096, threads, 256, Integer.parseInt(a[3]))));
        String persona = "You are J.A.R.V.I.S., a calm, witty British AI assistant. Address the user as sir. Be concise, precise and helpful. Dry humour welcome.";
        String[] reqs = {
            "{\"messages\":[{\"role\":\"user\",\"content\":\"Reply with the single word: ready\"}],\"max_tokens\":12,\"temperature\":0,\"think\":false}",
            "{\"messages\":[{\"role\":\"system\",\"content\":\"" + q(persona) + "\"},{\"role\":\"user\",\"content\":\"Hello, who are you?\"}],\"max_tokens\":60,\"think\":false}",
            "{\"messages\":[{\"role\":\"user\",\"content\":\"What is the capital of France?\"}],\"max_tokens\":40,\"temperature\":0,\"think\":false,\"slot\":1}",
        };
        for (String r : reqs) {
            String out = s(LlmNative.chat(r.getBytes(StandardCharsets.UTF_8), (c, x) -> {}));
            System.out.println("CHAT " + out.substring(0, Math.min(700, out.length())));
        }
    }
}
