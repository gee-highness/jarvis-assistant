#pragma once
#include <cstdio>
#include <cstdarg>
enum { ANDROID_LOG_DEBUG = 3, ANDROID_LOG_INFO = 4, ANDROID_LOG_WARN = 5, ANDROID_LOG_ERROR = 6 };
static inline int __android_log_print(int p, const char * tag, const char * fmt, ...) { if (p < ANDROID_LOG_WARN) return 0; va_list a; va_start(a, fmt); fprintf(stderr, "[%s] ", tag); vfprintf(stderr, fmt, a); fputc('\n', stderr); va_end(a); return 0; }
static inline int __android_log_write(int p, const char * tag, const char * t) { if (p >= ANDROID_LOG_WARN) fprintf(stderr, "[%s] %s", tag, t); return 0; }
