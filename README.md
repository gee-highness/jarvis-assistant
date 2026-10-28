# J.A.R.V.I.S. — offline productivity assistant (Android)

**Website & download:** https://gee-highness.github.io/jarvis-assistant/  ·  **Latest APK:** [Releases](https://github.com/gee-highness/jarvis-assistant/releases/latest)

Angular 20 + Capacitor 8. On-device llama.cpp brain (no Ollama/Termux needed), long-term memory, voice, home-screen mic + chat widgets, XP/levels/streaks/quests.

## Install
1. Push to `main` → GitHub Actions builds the APK (`Build Jarvis APK`).
2. Download `jarvis.apk` from the latest Release (`build-N`) or the `jarvis-apk` artifact; sideload.
3. Open the app → **More → Brain** → download the recommended model for your RAM (Nano 0.6B … Max 8B) and the memory engine. Works offline afterwards.
4. Long-press the home screen → Widgets → Jarvis (mic, wide, chat).

## Build diagnostics
Features: goals, journal with mood trends, projects and templates, recurring tasks, subtasks, swipe gestures, focus soundscapes, adjustable personality, onboarding.

CI writes logs to the `build-logs` branch (`ERRORS.txt`, `BUILD_LOG.txt`).

## Signing (one-time)
Add a repository secret `JARVIS_KEYSTORE_B64` (Settings → Secrets and variables → Actions) containing the base64 of your release keystore (alias `jarvis`, password `jarvis-release`). Builds are then signed with a stable key and install over each other. Without it CI builds a debug-signed APK. Never commit the keystore.

## Website
`site/` is published to the `gh-pages` branch by `.github/workflows/pages.yml`. Enable it once: Settings → Pages → Deploy from branch → `gh-pages` / root.
