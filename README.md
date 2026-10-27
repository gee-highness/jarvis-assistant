# J.A.R.V.I.S. — offline productivity assistant (Android)

Angular 20 + Capacitor 8. On-device llama.cpp brain (no Ollama/Termux needed), long-term memory, voice, home-screen mic + chat widgets, XP/levels/streaks/quests.

## Install
1. Push to `main` → GitHub Actions builds the APK (`Build Jarvis APK`).
2. Download `jarvis.apk` from the latest Release (`build-N`) or the `jarvis-apk` artifact; sideload.
3. Open the app → **More → Brain** → download the recommended model for your RAM (Nano 0.6B … Max 8B) and the memory engine. Works offline afterwards.
4. Long-press the home screen → Widgets → Jarvis (mic, wide, chat).

## Build diagnostics
CI writes logs to the `build-logs` branch (`ERRORS.txt`, `BUILD_LOG.txt`).
