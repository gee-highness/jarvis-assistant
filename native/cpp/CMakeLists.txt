cmake_minimum_required(VERSION 3.22.1)
project("jarvisllm" C CXX)

set(CMAKE_C_STANDARD 11)
set(CMAKE_C_STANDARD_REQUIRED ON)
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# llama.cpp is cloned here by scripts/prepare-android.mjs (pinned tag)
set(LLAMA_SRC ${CMAKE_CURRENT_LIST_DIR}/llama.cpp)
if(NOT EXISTS ${LLAMA_SRC}/CMakeLists.txt)
    message(FATAL_ERROR "llama.cpp sources missing at ${LLAMA_SRC}. Run: node scripts/prepare-android.mjs")
endif()

# ---- llama.cpp / ggml build options (mirrors upstream examples/llama.android) ----
set(BUILD_SHARED_LIBS      ON  CACHE BOOL "" FORCE)
set(LLAMA_BUILD_COMMON     ON  CACHE BOOL "" FORCE)
set(LLAMA_BUILD_TESTS      OFF CACHE BOOL "" FORCE)
set(LLAMA_BUILD_TOOLS      OFF CACHE BOOL "" FORCE)
set(LLAMA_BUILD_EXAMPLES   OFF CACHE BOOL "" FORCE)
set(LLAMA_BUILD_SERVER     OFF CACHE BOOL "" FORCE)
set(LLAMA_BUILD_APP        OFF CACHE BOOL "" FORCE)
set(LLAMA_OPENSSL          OFF CACHE BOOL "" FORCE)
set(LLAMA_SUBPROCESS       OFF CACHE BOOL "" FORCE)
set(GGML_NATIVE            OFF CACHE BOOL "" FORCE)
set(GGML_LLAMAFILE         OFF CACHE BOOL "" FORCE)
# one CPU backend per ARM feature level (dotprod, i8mm, sve…), the best one is picked at runtime
set(GGML_BACKEND_DL        ON  CACHE BOOL "" FORCE)
set(GGML_CPU_ALL_VARIANTS  ON  CACHE BOOL "" FORCE)

if(ANDROID_ABI STREQUAL "arm64-v8a")
    set(GGML_CPU_KLEIDIAI OFF CACHE BOOL "" FORCE)   # produced garbage output on some phones
    # OpenMP's spin-waiting stalls badly on big.LITTLE phones; ggml's own thread pool is reliable
    set(GGML_OPENMP       OFF CACHE BOOL "" FORCE)
elseif(ANDROID_ABI STREQUAL "x86_64")
    set(GGML_CPU_KLEIDIAI OFF CACHE BOOL "" FORCE)
    set(GGML_OPENMP       OFF CACHE BOOL "" FORCE)
endif()

add_subdirectory(${LLAMA_SRC} build-llama)

add_library(jarvisllm SHARED jarvis_llm.cpp)

target_include_directories(jarvisllm PRIVATE
    ${LLAMA_SRC}
    ${LLAMA_SRC}/common
    ${LLAMA_SRC}/include
    ${LLAMA_SRC}/ggml/include)

target_link_libraries(jarvisllm llama llama-common android log)
