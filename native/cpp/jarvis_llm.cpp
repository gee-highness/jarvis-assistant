// Jarvis on-device LLM engine: a thin JNI layer over llama.cpp.
//
// - chat(): OpenAI-style request JSON in, streamed deltas out, final message (content, reasoning, tool calls) as JSON.
//   Uses llama.cpp's jinja chat templates + PEG parsers, so native tool calling works for every model whose
//   template supports it, with grammar-constrained (lazy) sampling for well-formed calls.
// - Two KV "slots" (sequences): 0 = the conversation, 1 = background jobs. Prompt prefixes are reused per slot,
//   so follow-up turns only process the new tokens.
// - embed(): a separate small embedding model for long-term memory.
//
// Strings cross JNI as UTF-8 byte arrays (JNI's NewStringUTF uses modified UTF-8 and breaks on emoji).

#include <jni.h>
#include <android/log.h>

#include <algorithm>
#include <atomic>
#include <chrono>
#include <cstdio>
#include <mutex>
#include <stdexcept>
#include <string>
#include <vector>
#include <unistd.h>
#include <dirent.h>
#include <dlfcn.h>
#include <sys/auxv.h>

#include "llama.h"
#include "common.h"
#include "chat.h"
#include "sampling.h"

#define TAG "JarvisLLM"
#define LOGI(...) __android_log_print(ANDROID_LOG_INFO, TAG, __VA_ARGS__)
#define LOGW(...) __android_log_print(ANDROID_LOG_WARN, TAG, __VA_ARGS__)
#define LOGE(...) __android_log_print(ANDROID_LOG_ERROR, TAG, __VA_ARGS__)

namespace {

constexpr int N_SLOTS = 2;

std::mutex g_mu;                       // guards the chat model/context
llama_model * g_model = nullptr;
llama_context * g_ctx = nullptr;
common_chat_templates_ptr g_tmpls;
std::vector<llama_token> g_cache[N_SLOTS];   // tokens currently held in the KV cache, per slot
std::string g_model_path;
int g_n_ctx = 0;
std::atomic<bool> g_stop{false};

std::mutex e_mu;                       // guards the embedding model/context
llama_model * e_model = nullptr;
llama_context * e_ctx = nullptr;
std::string e_model_path;

int g_threads = 4;
bool g_kv_q8 = false;

std::mutex l_mu;
std::string g_diag;                    // warnings/errors + backend probe, shown in Diagnostics

void log_cb(ggml_log_level level, const char * text, void *) {
    if (level == GGML_LOG_LEVEL_ERROR || level == GGML_LOG_LEVEL_WARN) {
        std::lock_guard<std::mutex> lk(l_mu);
        if (g_diag.size() < 4000) g_diag += text;
    }
    int prio = ANDROID_LOG_DEBUG;
    if (level == GGML_LOG_LEVEL_ERROR) prio = ANDROID_LOG_ERROR;
    else if (level == GGML_LOG_LEVEL_WARN) prio = ANDROID_LOG_WARN;
    else if (level == GGML_LOG_LEVEL_INFO) prio = ANDROID_LOG_INFO;
    __android_log_write(prio, TAG, text);
}

bool abort_cb(void *) { return g_stop.load(); }

std::string to_str(JNIEnv * env, jbyteArray a) {
    if (!a) return "";
    const jsize n = env->GetArrayLength(a);
    std::string s((size_t) n, '\0');
    if (n > 0) env->GetByteArrayRegion(a, 0, n, reinterpret_cast<jbyte *>(&s[0]));
    return s;
}

std::string to_str(JNIEnv * env, jstring js) {
    if (!js) return "";
    const char * c = env->GetStringUTFChars(js, nullptr);
    std::string s(c ? c : "");
    if (c) env->ReleaseStringUTFChars(js, c);
    return s;
}

jbyteArray to_bytes(JNIEnv * env, const std::string & s) {
    jbyteArray a = env->NewByteArray((jsize) s.size());
    if (a && !s.empty()) env->SetByteArrayRegion(a, 0, (jsize) s.size(), reinterpret_cast<const jbyte *>(s.data()));
    return a;
}

// length of the longest prefix of s that does not end inside a multi-byte UTF-8 sequence
size_t utf8_complete_len(const std::string & s) {
    const size_t n = s.size();
    for (size_t back = 1; back <= 4 && back <= n; back++) {
        const unsigned char c = (unsigned char) s[n - back];
        if ((c & 0xC0) == 0x80) continue;            // continuation byte, keep looking for the lead byte
        size_t need = 1;
        if ((c & 0xE0) == 0xC0) need = 2;
        else if ((c & 0xF0) == 0xE0) need = 3;
        else if ((c & 0xF8) == 0xF0) need = 4;
        return need > back ? n - back : n;
    }
    return n;
}

// Pick a thread count: the number of "big" cores (max freq within 80% of the fastest), clamped to 2..6.
int default_threads() {
    const long ncpu = sysconf(_SC_NPROCESSORS_CONF);
    std::vector<long> freqs;
    for (long i = 0; i < ncpu; i++) {
        char path[128];
        snprintf(path, sizeof(path), "/sys/devices/system/cpu/cpu%ld/cpufreq/cpuinfo_max_freq", i);
        FILE * f = fopen(path, "r");
        if (!f) continue;
        long v = 0;
        if (fscanf(f, "%ld", &v) == 1) freqs.push_back(v);
        fclose(f);
    }
    int n = 0;
    if (!freqs.empty()) {
        const long mx = *std::max_element(freqs.begin(), freqs.end());
        for (long v : freqs) if (v >= mx * 8 / 10) n++;
    }
    if (n < 2) n = (int) std::max(2L, std::min(4L, sysconf(_SC_NPROCESSORS_ONLN) - 2));
    return std::max(2, std::min(6, n));
}

void free_chat_model() {
    g_tmpls.reset();
    if (g_ctx) { llama_free(g_ctx); g_ctx = nullptr; }
    if (g_model) { llama_model_free(g_model); g_model = nullptr; }
    for (auto & c : g_cache) c.clear();
    g_model_path.clear();
    g_n_ctx = 0;
}

void free_embed_model() {
    if (e_ctx) { llama_free(e_ctx); e_ctx = nullptr; }
    if (e_model) { llama_model_free(e_model); e_model = nullptr; }
    e_model_path.clear();
}

common_json model_info_json() {
    common_json o = common_json::object();
    o["loaded"] = g_model != nullptr;
    if (!g_model) return o;
    char desc[256] = {0};
    llama_model_desc(g_model, desc, sizeof(desc));
    o["path"] = g_model_path;
    o["desc"] = std::string(desc);
    o["size"] = (double) llama_model_size(g_model);
    o["params"] = (double) llama_model_n_params(g_model);
    o["n_ctx"] = g_n_ctx;
    o["n_ctx_train"] = llama_model_n_ctx_train(g_model);
    o["threads"] = g_threads;
    o["kv_q8"] = g_kv_q8;
    if (g_tmpls) {
        o["has_template"] = common_chat_templates_was_explicit(g_tmpls.get());
        o["supports_thinking"] = common_chat_templates_support_enable_thinking(g_tmpls.get());
        common_json caps = common_json::object();
        for (const auto & kv : common_chat_templates_get_caps(g_tmpls.get())) caps[kv.first] = kv.second;
        o["caps"] = caps;
    }
    return o;
}

// Decode tokens [from, toks.size()) into `slot`, positions continuing from `from`. Last token gets logits.
// Returns 0 ok, 1 aborted, 2 failure.
int decode_prompt(const std::vector<llama_token> & toks, size_t from, int slot) {
    const int n_batch = (int) llama_n_batch(g_ctx);
    common_batch batch(g_ctx);
    for (size_t i = from; i < toks.size(); i += (size_t) n_batch) {
        const size_t n = std::min(toks.size() - i, (size_t) n_batch);
        batch.clear();
        for (size_t j = 0; j < n; j++) {
            const size_t k = i + j;
            batch.add(toks[k], (llama_pos) k, slot, k == toks.size() - 1);
        }
        const int rc = llama_process(g_ctx, LLAMA_PROCESS_TYPE_DECODE, batch.get());
        if (rc != 0) {
            // the KV state of a failed/aborted batch is undefined: forget everything past what we know is valid
            llama_memory_seq_rm(llama_get_memory(g_ctx), slot, (llama_pos) g_cache[slot].size(), -1);
            if (g_stop.load()) return 1;
            LOGE("decode failed rc=%d", rc);
            return 2;
        }
        g_cache[slot].insert(g_cache[slot].end(), toks.begin() + (long) i, toks.begin() + (long) (i + n));
    }
    return 0;
}

std::string error_json(const std::string & code, const std::string & message) {
    common_json o = common_json::object();
    o["error"] = code;
    o["message"] = message;
    return o.dump_safe();
}

} // namespace

extern "C" {

JNIEXPORT void JNICALL
Java_com_jarvis_assistant_LlmNative_init(JNIEnv * env, jclass, jstring jlibdir) {
    llama_log_set(log_cb, nullptr);
    const std::string dir = to_str(env, jlibdir);
    LOGI("loading ggml backends from %s", dir.c_str());
    // probe every CPU variant ourselves so Diagnostics can show why one was (not) chosen
    {
        std::string probe = "hwcap=" + std::to_string(getauxval(AT_HWCAP)) + " hwcap2=" + std::to_string(getauxval(AT_HWCAP2))
            + " dotprod=" + ((getauxval(AT_HWCAP) & (1UL << 20)) ? "1" : "0") + "\n";
        if (DIR * d = opendir(dir.c_str())) {
            while (dirent * e = readdir(d)) {
                std::string n = e->d_name;
                if (n.rfind("libggml-cpu-", 0) != 0) continue;
                std::string full = dir + "/" + n;
                void * h = dlopen(full.c_str(), RTLD_NOW | RTLD_LOCAL);
                if (!h) { const char * er = dlerror(); probe += n + ": dlopen FAIL " + (er ? er : "") + "\n"; continue; }
                auto fn = (int (*)()) dlsym(h, "ggml_backend_score");
                probe += n + ": score " + (fn ? std::to_string(fn()) : std::string("n/a")) + "\n";
                dlclose(h);
            }
            closedir(d);
        } else probe += "cannot open " + dir + "\n";
        std::lock_guard<std::mutex> lk(l_mu);
        g_diag += probe;
    }
    ggml_backend_load_all_from_path(dir.c_str());
    llama_backend_init();
    g_threads = default_threads();
    LOGI("backend ready, default threads %d", g_threads);
}

JNIEXPORT jbyteArray JNICALL
Java_com_jarvis_assistant_LlmNative_systemInfo(JNIEnv * env, jclass) {
    std::lock_guard<std::mutex> lk(l_mu);
    return to_bytes(env, std::string(llama_print_system_info()) + "\n" + g_diag);
}

JNIEXPORT jint JNICALL
Java_com_jarvis_assistant_LlmNative_defaultThreads(JNIEnv *, jclass) {
    return default_threads();
}

// Load (or keep) the chat model. Returns JSON: model info, or {"error":...}.
JNIEXPORT jbyteArray JNICALL
Java_com_jarvis_assistant_LlmNative_load(JNIEnv * env, jclass, jstring jpath, jint n_ctx, jint n_threads, jint n_batch) {
    std::lock_guard<std::mutex> lk(g_mu);
    const std::string path = to_str(env, jpath);
    const int threads = n_threads > 0 ? n_threads : default_threads();
    if (g_model && g_ctx && path == g_model_path && (int) n_ctx == g_n_ctx && threads == g_threads) {
        return to_bytes(env, model_info_json().dump_safe());
    }
    free_chat_model();

    llama_model_params mp = llama_model_default_params();
    mp.n_gpu_layers = 0;
    mp.use_mmap = false;   // app storage may sit on FUSE, where mmap can serve stale/corrupt pages
    llama_model * model = llama_model_load_from_file(path.c_str(), mp);
    if (!model) return to_bytes(env, error_json("load", "Could not load model file (corrupt or unsupported)."));

    const int train = llama_model_n_ctx_train(model);
    int ctx_size = n_ctx > 0 ? (int) n_ctx : 4096;
    if (train > 0 && ctx_size > train) ctx_size = train;

    llama_context_params cp = llama_context_default_params();
    cp.n_ctx = (uint32_t) ctx_size;
    cp.n_batch = (uint32_t) std::max(32, (int) n_batch);
    cp.n_ubatch = cp.n_batch;
    cp.n_seq_max = N_SLOTS;
    cp.kv_unified = true;              // slots share one KV buffer (total = n_ctx)
    cp.n_threads = threads;
    cp.n_threads_batch = threads;
    cp.abort_callback = abort_cb;
    cp.abort_callback_data = nullptr;
    cp.no_perf = true;
    cp.flash_attn_type = LLAMA_FLASH_ATTN_TYPE_DISABLED;   // safest path on phone CPUs

    // 8-bit KV cache (needs flash attention) halves context memory at no visible quality cost
    llama_context_params cpq = cp;
    // (disabled: quantised KV + flash attention was far too slow on some phone CPUs; plain f16 is the safe default)
    llama_context * ctx = llama_init_from_model(model, cp);
    bool kv_q8 = false;
    (void) cpq;
    if (!ctx) {
        llama_model_free(model);
        return to_bytes(env, error_json("memory", "Not enough memory for this model and context size. Try a smaller model or context."));
    }
    g_kv_q8 = kv_q8;

    g_model = model;
    g_ctx = ctx;
    g_model_path = path;
    g_n_ctx = (int) llama_n_ctx(ctx);
    g_threads = threads;
    try {
        g_tmpls = common_chat_templates_init(g_model, "");
    } catch (const std::exception & e) {
        LOGW("chat template init failed (%s), falling back to chatml", e.what());
        g_tmpls = common_chat_templates_init(g_model, "chatml");
    }
    LOGI("model loaded: %s ctx=%d threads=%d", path.c_str(), g_n_ctx, g_threads);
    return to_bytes(env, model_info_json().dump_safe());
}

JNIEXPORT void JNICALL
Java_com_jarvis_assistant_LlmNative_unload(JNIEnv *, jclass) {
    g_stop = true;
    std::lock_guard<std::mutex> lk(g_mu);
    free_chat_model();
    g_stop = false;
}

JNIEXPORT jbyteArray JNICALL
Java_com_jarvis_assistant_LlmNative_info(JNIEnv * env, jclass) {
    std::lock_guard<std::mutex> lk(g_mu);
    return to_bytes(env, model_info_json().dump_safe());
}

JNIEXPORT void JNICALL
Java_com_jarvis_assistant_LlmNative_stop(JNIEnv *, jclass) {
    g_stop = true;
}

// Chat completion. `jreq` is UTF-8 JSON:
// { messages:[OpenAI messages], tools?:[OpenAI tools], think?:bool, json?:bool, slot?:0|1,
//   temperature?, top_p?, top_k?, min_p?, repeat_penalty?, max_tokens?, seed? }
// Streams `callback.onDelta(byte[] content, byte[] reasoning)`; returns final JSON.
JNIEXPORT jbyteArray JNICALL
Java_com_jarvis_assistant_LlmNative_chat(JNIEnv * env, jclass, jbyteArray jreq, jobject callback) {
    std::lock_guard<std::mutex> lk(g_mu);
    g_stop = false;
    if (!g_model || !g_ctx || !g_tmpls) return to_bytes(env, error_json("not_loaded", "No model loaded."));

    jmethodID on_delta = nullptr;
    if (callback) {
        jclass cls = env->GetObjectClass(callback);
        on_delta = env->GetMethodID(cls, "onDelta", "([B[B)V");
        env->DeleteLocalRef(cls);
        if (!on_delta) { env->ExceptionClear(); return to_bytes(env, error_json("internal", "callback missing onDelta")); }
    }

    const llama_vocab * vocab = llama_model_get_vocab(g_model);
    common_json req;
    try {
        req = common_json::parse(to_str(env, jreq));
    } catch (const std::exception & e) {
        return to_bytes(env, error_json("request", e.what()));
    }

    const int slot = std::max(0, std::min(N_SLOTS - 1, req.value<int>("slot", 0)));
    const int max_tokens = std::max(16, req.value<int>("max_tokens", 1024));

    // ---- render the prompt with the model's own chat template ----
    common_chat_templates_inputs in;
    common_chat_session session;
    try {
        in.messages = common_chat_msgs_parse_oaicompat(req.at("messages"));
        if (req.contains("tools") && req.at("tools").is_array() && !req.at("tools").empty()) {
            in.tools = common_chat_tools_parse_oaicompat(req.at("tools"));
            in.tool_choice = COMMON_CHAT_TOOL_CHOICE_AUTO;
            in.parallel_tool_calls = req.value<bool>("parallel_tool_calls", false);
        }
        in.use_jinja = true;
        in.add_generation_prompt = true;
        in.enable_thinking = req.value<bool>("think", false);
        in.reasoning_format = COMMON_REASONING_FORMAT_AUTO;
        if (req.value<bool>("json", false) && in.tools.empty()) in.json_schema = "{\"type\":\"object\"}";
        session = common_chat_session(g_tmpls.get(), vocab, in);
    } catch (const std::exception & e) {
        LOGE("template error: %s", e.what());
        return to_bytes(env, error_json(in.tools.empty() ? "template" : "template_tools", e.what()));
    }

    // ---- tokenize: template text may contain special tokens, user/tool text may not ----
    std::vector<llama_token> toks;
    {
        bool first = true;
        for (const auto & part : session.prompt().parts) {
            auto t = common_tokenize(vocab, part.text, /*add_special*/ first, /*parse_special*/ !part.is_input);
            toks.insert(toks.end(), t.begin(), t.end());
            first = false;
        }
    }
    if (toks.empty()) return to_bytes(env, error_json("request", "Empty prompt."));

    // ---- context budget (slots share one KV buffer) ----
    const int other = 1 - slot;
    auto * mem = llama_get_memory(g_ctx);
    const int reserve = std::min(max_tokens, 512);
    if ((int) toks.size() + reserve > g_n_ctx) {
        common_json o = common_json::object();
        o["error"] = "context";
        o["message"] = "Prompt is too long for the context window.";
        o["prompt_tokens"] = (int) toks.size();
        o["n_ctx"] = g_n_ctx;
        return to_bytes(env, o.dump_safe());
    }
    if ((int) (toks.size() + g_cache[other].size()) + reserve > g_n_ctx) {
        llama_memory_seq_rm(mem, other, -1, -1);   // evict the other slot to make room
        g_cache[other].clear();
    }

    // ---- reuse the longest common prefix already in this slot ----
    size_t n_keep = 0;
    while (n_keep < g_cache[slot].size() && n_keep < toks.size() && g_cache[slot][n_keep] == toks[n_keep]) n_keep++;
    if (n_keep == toks.size()) n_keep--;       // re-evaluate the last token to get fresh logits
    if (!llama_memory_seq_rm(mem, slot, (llama_pos) n_keep, -1)) {
        llama_memory_seq_rm(mem, slot, -1, -1);
        n_keep = 0;
    }
    g_cache[slot].resize(n_keep);

    const auto t_start = std::chrono::steady_clock::now();
    const int rc = decode_prompt(toks, n_keep, slot);
    if (rc == 1) return to_bytes(env, error_json("aborted", "Stopped."));
    if (rc != 0) return to_bytes(env, error_json("decode", "The engine failed while reading the prompt."));
    const auto t_prompt = std::chrono::steady_clock::now();

    // ---- sampler (grammar for tool calls / JSON comes from the session) ----
    common_params_sampling sp;
    sp.temp = req.value<float>("temperature", 0.6f);
    sp.top_p = req.value<float>("top_p", 0.95f);
    sp.top_k = req.value<int>("top_k", 40);
    sp.min_p = req.value<float>("min_p", 0.05f);
    sp.penalty_repeat = req.value<float>("repeat_penalty", 1.05f);
    sp.penalty_last_n = 128;
    if (req.contains("seed")) sp.seed = (uint32_t) req.value<long long>("seed", 0);
    session.apply_sampling(sp);
    common_sampler_ptr smpl(common_sampler_init(g_model, sp));
    if (!smpl) return to_bytes(env, error_json("sampler", "Could not initialise the sampler (grammar)."));

    // ---- generate ----
    std::string sent_content, sent_reasoning, raw;
    bool cb_failed = false;
    auto emit = [&](const common_chat_msg & m) {
        if (!on_delta || cb_failed) return;
        std::string dc, dr;
        if (m.content.size() > sent_content.size() && m.content.compare(0, sent_content.size(), sent_content) == 0) {
            std::string add = m.content.substr(sent_content.size());
            dc = add.substr(0, utf8_complete_len(add));
            sent_content += dc;
        }
        if (m.reasoning_content.size() > sent_reasoning.size() &&
            m.reasoning_content.compare(0, sent_reasoning.size(), sent_reasoning) == 0) {
            std::string add = m.reasoning_content.substr(sent_reasoning.size());
            dr = add.substr(0, utf8_complete_len(add));
            sent_reasoning += dr;
        }
        if (dc.empty() && dr.empty()) return;
        jbyteArray jc = to_bytes(env, dc);
        jbyteArray jr = to_bytes(env, dr);
        env->CallVoidMethod(callback, on_delta, jc, jr);
        env->DeleteLocalRef(jc);
        env->DeleteLocalRef(jr);
        if (env->ExceptionCheck()) { env->ExceptionClear(); cb_failed = true; }
    };

    const auto & stops = session.additional_stops();
    std::string finish = "stop";
    int n_gen = 0;
    common_batch batch(g_ctx);
    while (true) {
        if (g_stop.load()) { finish = "aborted"; break; }
        if (n_gen >= max_tokens) { finish = "length"; break; }
        if ((int) (g_cache[slot].size() + g_cache[other].size()) >= g_n_ctx - 1) { finish = "length"; break; }

        const llama_token tok = common_sampler_sample(smpl.get(), g_ctx, -1);
        common_sampler_accept(smpl.get(), tok, true);
        if (llama_vocab_is_eog(vocab, tok)) break;

        const bool special = sp.preserved_tokens.count(tok) > 0;
        const std::string piece = common_token_to_piece(vocab, tok, special);
        raw += piece;
        n_gen++;

        batch.clear();
        batch.add(tok, (llama_pos) g_cache[slot].size(), slot, true);
        if (llama_process(g_ctx, LLAMA_PROCESS_TYPE_DECODE, batch.get()) != 0) {
            llama_memory_seq_rm(mem, slot, (llama_pos) g_cache[slot].size(), -1);
            finish = g_stop.load() ? "aborted" : "error";
            break;
        }
        g_cache[slot].push_back(tok);

        common_chat_input chunk;
        chunk.append(piece, tok);
        try {
            emit(session.feed(chunk));
        } catch (const std::exception & e) {
            LOGW("partial parse: %s", e.what());
        }

        bool hit = false;
        for (const auto & s : stops) {
            if (!s.empty() && raw.size() >= s.size() && raw.compare(raw.size() - s.size(), s.size(), s) == 0) { hit = true; break; }
        }
        if (hit) break;
    }

    common_chat_msg final_msg;
    try {
        final_msg = session.finish();
    } catch (const std::exception & e) {
        LOGW("final parse failed (%s); using partial result", e.what());
        final_msg = session.msg();
        if (final_msg.content.empty() && final_msg.tool_calls.empty()) final_msg.content = raw;
    }
    emit(final_msg);

    const auto t_end = std::chrono::steady_clock::now();
    const double prompt_ms = std::chrono::duration<double, std::milli>(t_prompt - t_start).count();
    const double gen_ms = std::chrono::duration<double, std::milli>(t_end - t_prompt).count();

    common_json out = common_json::object();
    out["content"] = final_msg.content;
    out["reasoning"] = final_msg.reasoning_content;
    common_json calls = common_json::array();
    for (const auto & tc : final_msg.tool_calls) {
        common_json c = common_json::object();
        c["id"] = tc.id;
        c["name"] = tc.name;
        c["arguments"] = tc.arguments;
        calls.push_back(c);
    }
    out["tool_calls"] = calls;
    out["finish"] = finish;
    out["prompt_tokens"] = (int) toks.size();
    out["cached_tokens"] = (int) n_keep;
    out["gen_tokens"] = n_gen;
    out["prompt_ms"] = prompt_ms;
    out["gen_ms"] = gen_ms;
    out["tps"] = gen_ms > 0 ? n_gen / (gen_ms / 1000.0) : 0.0;
    out["format"] = std::string(common_chat_format_name(session.format()));
    return to_bytes(env, out.dump_safe());
}

// Forget the KV cache of a slot (e.g. after the system prompt template changes).
JNIEXPORT void JNICALL
Java_com_jarvis_assistant_LlmNative_clearSlot(JNIEnv *, jclass, jint slot) {
    std::lock_guard<std::mutex> lk(g_mu);
    if (!g_ctx || slot < 0 || slot >= N_SLOTS) return;
    llama_memory_seq_rm(llama_get_memory(g_ctx), slot, -1, -1);
    g_cache[slot].clear();
}

// ---------------- embeddings ----------------

JNIEXPORT jbyteArray JNICALL
Java_com_jarvis_assistant_LlmNative_loadEmbed(JNIEnv * env, jclass, jstring jpath) {
    std::lock_guard<std::mutex> lk(e_mu);
    const std::string path = to_str(env, jpath);
    if (e_model && e_ctx && path == e_model_path) return to_bytes(env, "{\"ok\":true}");
    free_embed_model();

    llama_model_params mp = llama_model_default_params();
    mp.n_gpu_layers = 0;
    llama_model * model = llama_model_load_from_file(path.c_str(), mp);
    if (!model) return to_bytes(env, error_json("load", "Could not load embedding model."));
    if (llama_model_has_encoder(model) && llama_model_has_decoder(model)) {
        llama_model_free(model);
        return to_bytes(env, error_json("load", "Encoder-decoder models are not supported for embeddings."));
    }

    const int train = llama_model_n_ctx_train(model);
    const uint32_t n = (uint32_t) std::max(64, std::min(train > 0 ? train : 512, 512));
    llama_context_params cp = llama_context_default_params();
    cp.n_ctx = n;
    cp.n_batch = n;
    cp.n_ubatch = n;                   // non-causal models need the whole input in one ubatch
    cp.n_threads = std::max(2, g_threads / 2);
    cp.n_threads_batch = cp.n_threads;
    cp.embeddings = true;
    cp.no_perf = true;
    llama_context * ctx = llama_init_from_model(model, cp);
    if (!ctx) {
        llama_model_free(model);
        return to_bytes(env, error_json("memory", "Could not create embedding context."));
    }
    e_model = model;
    e_ctx = ctx;
    e_model_path = path;
    common_json o = common_json::object();
    o["ok"] = true;
    o["dims"] = llama_model_n_embd_out(model);
    return to_bytes(env, o.dump_safe());
}

JNIEXPORT void JNICALL
Java_com_jarvis_assistant_LlmNative_unloadEmbed(JNIEnv *, jclass) {
    std::lock_guard<std::mutex> lk(e_mu);
    free_embed_model();
}

// Returns an L2-normalised embedding, or null on failure.
JNIEXPORT jfloatArray JNICALL
Java_com_jarvis_assistant_LlmNative_embed(JNIEnv * env, jclass, jbyteArray jtext) {
    std::lock_guard<std::mutex> lk(e_mu);
    if (!e_model || !e_ctx) return nullptr;
    const llama_vocab * vocab = llama_model_get_vocab(e_model);
    auto toks = common_tokenize(vocab, to_str(env, jtext), true, false);
    const size_t max_n = llama_n_batch(e_ctx);
    if (toks.size() > max_n) toks.resize(max_n);
    if (toks.empty()) return nullptr;

    llama_memory_clear(llama_get_memory(e_ctx), true);
    common_batch batch(e_ctx);
    for (size_t i = 0; i < toks.size(); i++) batch.add(toks[i], (llama_pos) i, 0, true);
    const auto type = llama_model_has_encoder(e_model) ? LLAMA_PROCESS_TYPE_ENCODE : LLAMA_PROCESS_TYPE_DECODE;
    if (llama_process(e_ctx, type, batch.get()) < 0) return nullptr;

    const int n_embd = llama_model_n_embd_out(e_model);
    const float * emb = nullptr;
    if (llama_pooling_type(e_ctx) == LLAMA_POOLING_TYPE_NONE) {
        emb = llama_get_embeddings_ith(e_ctx, (int32_t) toks.size() - 1);
    } else {
        emb = llama_get_embeddings_seq(e_ctx, 0);
    }
    if (!emb) return nullptr;
    std::vector<float> out((size_t) n_embd);
    common_embd_normalize(emb, out.data(), n_embd, 2);
    jfloatArray arr = env->NewFloatArray(n_embd);
    if (arr) env->SetFloatArrayRegion(arr, 0, n_embd, out.data());
    return arr;
}

} // extern "C"
