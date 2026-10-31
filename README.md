# J.A.R.V.I.S. — offline productivity assistant (Android)

**Website & download:** https://gee-highness.github.io/jarvis-assistant/  ·  **Latest APK:** [Releases](https://github.com/gee-highness/jarvis-assistant/releases/latest)

Angular 20 + Capacitor 8. **Reflex brain (default): no language model at all**, instant replies, long-term memory, voice, home-screen mic + chat widgets, XP/levels/streaks/quests. An optional on-device llama.cpp model is still available under Brain.

## Reflex: the LLM-free brain
`src/app/core/reflex/` makes Jarvis feel like an LLM without running one. A typical turn takes 2–20 ms.
- **Understands:** TF-IDF (words + bigrams + character trigrams) nearest-example matching over 114 skills and 840 phrasings, regex boosts, follow-ups ("and tomorrow?"), pronouns ("mark it done"), several commands in one sentence, and optional MiniLM semantic matching when the 25 MB memory engine is installed.
- **Acts:** every existing tool (tasks, reminders, alarms, timers, focus, habits, goals, journal, mood, notes, memory, calendar, phone, web) is wired to a skill.
- **Remembers:** rule-based fact learning ("my sister is Thandi", "I live in Mbabane", "I have an interview tomorrow"), recall ("what's my sister's name?"), and follow-ups ("How did the interview go?").
- **Talks:** a persona-aware generative grammar (`banks/`). It can produce over a trillion distinct replies, conditioned on the 12 personality sliders, dialect, time of day and your live data, with anti-repetition. Replies stream in word by word.
- **Feels alive:** Jarvis keeps its own state (mood, relationship age, milestones, stable opinions), sends proactive nudges, asks curiosity questions to get to know you, remembers your birthday, and listens reflectively when it doesn't know an answer.
- **Learns:** if it misunderstands, say "teach" and tell it what you meant. It also learns from "did you mean…?" choices.

Test it headless (no Angular needed):
```
npx esbuild scripts/reflex-test.ts --bundle --platform=node --outfile=/tmp/rt.cjs && node /tmp/rt.cjs
```
Optional expansion pack: drop `src/assets/reflex/pack.json` (`{"intents":[{"id":"…","examples":[…]}],"rules":{"r.<id>":[…]}}`) and it is merged at startup.

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
