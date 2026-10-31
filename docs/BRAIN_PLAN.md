# Jarvis Brain: master plan (no LLM)

Goal: the most capable, private, always-on personal assistant possible on a phone without a language model. It understands, acts on the device, remembers everything with timestamps, looks things up when unsure, runs 24/7, and tracks physical and mental wellbeing responsibly.

**Honest framing.** A rule-and-retrieval brain beats an LLM on speed (ms vs seconds), privacy (nothing leaves the phone), battery, reliability (never invents facts: it either knows, computes, looks up and cites, or says it doesn't know) and precise memory (exact quotes with timestamps). It will not out-reason or out-write an LLM on open-ended creative or novel problems. The plan maximises the first list and covers the second with research and retrieval.

---

## 1. Architecture

```
┌──────────────────────── Android (Capacitor) ────────────────────────┐
│  JarvisCoreService (foreground, 24/7)                                │
│    ├─ Scheduler (WorkManager + exact alarms)                         │
│    ├─ Sensors: steps, activity, screen on/off, charging, location*   │
│    ├─ NotificationListener* → events (who messaged, reminders)       │
│    ├─ UsageStats* → screen time, app habits, late-night use          │
│    ├─ Health Connect* → sleep, heart rate, steps, workouts            │
│    ├─ AccessibilityService* → open/operate apps, read screen on ask  │
│    └─ Event log (SQLite) ──────────────┐                             │
│                                        ▼                             │
│  WebView: Angular app                Reflex brain                    │
│    ├─ Chat / voice / widgets         ├─ NLU (TF-IDF + MiniLM)        │
│    ├─ Pages                          ├─ Dialogue + episodic memory   │
│    └─ ReflexService ◀───────────────▶├─ Facts / semantic memory      │
│                                      ├─ Skills (tools)               │
│                                      ├─ Research (web, cached)       │
│                                      ├─ Wellbeing engine             │
│                                      ├─ Insight engine (patterns)    │
│                                      └─ Grammar (persona replies)    │
└──────────────────────────────────────────────────────────────────────┘
 * = opt-in permission, explained in plain words, revocable in Settings → Privacy
```

Principles: everything on-device by default; every background capability is opt-in with a visible "what Jarvis can see" page; one-tap pause; full export and delete.

## 2. Phases

### Phase 1: Brain (done or in progress)
- [x] Reflex NLU, entities, dialogue, slot filling, teaching, multi-command
- [x] Persona grammar (over a trillion replies), alive layer, curiosity, milestones
- [x] Long-term facts, episodic memory with timestamps, time reasoning, repeat awareness
- [x] Online research with citations, offline cache, offline question queue
- [x] **Wellbeing engine** (section 4): check-ins, PHQ-2/9 and GAD-2/7, trends, crisis protocol with help lines by country
- [x] **Device skills**: navigation, play on YouTube/Spotify, share, copy/paste, websites, call/SMS/email drafts, calendar, settings pages
- [ ] **Insight engine**: correlations across mood, sleep, focus, habits and tasks ("you're 40% more productive after 7h sleep")

### Phase 2: Always-on (native)
- [x] `JarvisCoreService`: foreground service with a low-priority persistent notification ("Jarvis is keeping watch"), restarts on boot
- [ ] Headless brain: run the Reflex engine in the service's WebView-free context for scheduled jobs (morning briefing, evening check-in, habit nudges, offline-question lookups, nightly memory consolidation)
- [x] Event log: screen on/off, unlock count, steps, sleep estimate, late-night use, per-app time (UsageStats), notification counts (never content)
- [ ] Nightly consolidation: summarise the day into episodic memory, decay stale states, refresh insights
- [ ] Battery budget: under 2%/day; adaptive sampling; nothing runs while the battery is under 15% unless charging

### Phase 3: Device control
- [ ] Deep app launching: intents for WhatsApp chat, Maps navigation, Spotify search, YouTube search, camera, dialer, settings sub-pages
- [ ] AccessibilityService (opt-in): "open WhatsApp and message Thandi I'm late", "pause music", "scroll", "read this screen", "turn on Do Not Disturb"
- [ ] Media session control (play/pause/next) via MediaController
- [ ] DND, ringer mode, brightness, Wi-Fi/Bluetooth panels (Android 10+ uses settings panels)
- [ ] Notifications: "what did I miss?" summary, auto-reminders from messages ("remind me about Sam's message tonight")
- [ ] Routines: "when I get home, turn on Wi-Fi and remind me to call mom" (geofence plus time triggers)

### Phase 4: Health
- [ ] Health Connect: sleep sessions, steps, heart rate, resting heart rate, exercise, weight (read-only, opt-in per type)
- [ ] Without Health Connect: step counter sensor, sleep estimate from screen-off and charging patterns, workout logging by chat
- [ ] Daily health card: sleep, steps, activity minutes, water, medication adherence
- [ ] Medication reminders with "taken / snooze / skip" actions and adherence history
- [ ] Trends and gentle coaching; never diagnosis

### Phase 5: Mind (mental health)
See section 4. Ships with Phase 1 (core) and grows with Phase 4 signals.

### Phase 6: Senses (optional)
- [ ] Offline speech recognition (Vosk), wake word ("Hey Jarvis") in the service
- [ ] On-device OCR (ML Kit) for "read this", receipts and documents into the library
- [ ] Small custom models trained offline with JAX/Flax (intent classifier, answer ranker, mood-from-text), exported to TFLite/ONNX and run on device. Still no LLM.

### Also shipped
- [x] Full theme customisation: 12 presets, accent and second colour, 10 backgrounds plus custom, corner radius, glow, fonts, spacing, bubble style, glass, grid, borders, nav labels, text size, shareable theme codes
- [x] Companion pup (original character): mood from your real day, 5 personalities, coats, colours and accessories, home-screen widget you can pet while the app is closed, optional "pet talks in chat" mode, and it can be used as the assistant avatar

## 3. Memory model
| Layer | What | Retention |
|---|---|---|
| Working | dialogue state, pending questions, pronouns | session |
| Episodic | every turn with timestamp, intent, topic; device events | 4000 turns, plus daily summaries kept forever |
| Semantic | facts about you and your people, preferences, goals | until you delete it |
| States | "going to gym", "feeling tired": follow-ups when due | 24 h |
| Knowledge cache | researched answers with source and time | 1 h (volatile) to 30 days |
| Insights | computed patterns | refreshed nightly |

## 4. Wellbeing engine (mental and physical)
**Signals (all on-device):** conversation sentiment per turn; daily mood and energy check-ins; journal; sleep (Health Connect or estimate); steps and activity; late-night phone use; social contact (count of messages and calls, opt-in); focus and task completion; habit streaks.

**Check-ins:** a 10-second evening check-in (mood 1–5, energy 1–5, one word). Weekly: PHQ-2 and GAD-2. If either scores 3 or more, Jarvis offers the full PHQ-9 / GAD-7 (validated, free-to-use screeners), clearly labelled as screening, not diagnosis.

**Insights:** rolling 7- and 30-day trends, best and worst days, correlations (sleep ↔ mood, exercise ↔ mood, screen-late ↔ next-day energy), "what helped last time" from your own notes.

**Interventions (evidence-based, self-help):** box breathing, 5-4-3-2-1 grounding, behavioural activation (one small valued activity), thought-record prompts, worry time, sleep-hygiene nudges, a walk suggestion, and "message someone you trust".

**Safety protocol (non-negotiable):**
- Detects crisis language (self-harm, suicide, wanting to die, abuse). It immediately switches to a calm, caring script: acknowledges, says it is glad you told it, gives crisis lines for the user's country, offers to call or text a trusted contact, and stays present. It never debates, never minimises, never gives method information.
- Persistent low mood (2+ weeks of PHQ-9 at 10 or above, or the self-harm item above 0) → strongly encourages professional help and shows local services.
- Wellbeing data never leaves the device. A one-tap "hide wellbeing" mode is available, and data can be exported and deleted.
- Jarvis is a supportive tool, not a therapist or doctor. This is stated in onboarding and in the Mind page.

## 5. Privacy and permissions
Each capability has its own toggle, a plain-language purpose and a live "last used" time. A **Privacy page** shows everything Jarvis has stored, by type, with delete buttons. Background collection pauses with one tap from the persistent notification.

## 6. Quality bar
- Headless test suite (`scripts/reflex-test.ts`) with at least 300 utterances, at least 95% intent accuracy, and p95 latency under 30 ms
- A paraphrase set it has never seen, at at least 85%
- CI runs the tests on every push
- Battery and memory budgets measured on a mid-range phone
