# Handoff: non-LLM router training (read this first after a /clear)

User's standing wishes: speak as Jarvis ("sir"), be very token-frugal. Work on branch `ccr-3801851b-dbt9gq`, commit + push after each group. No PR unless asked.

## Goal in progress
Sets 101-200 = 100M "real speech" messages, in ten groups of 10M. For each group: generate, score BEFORE tuning (honest held-out number), patch rules from the misses, retrain the intent model, re-score, log in `training/RESULTS.md`, commit, push. All sentences must read as natural human speech. **When all ten groups are done: merge the branch to main and release** (user asked; check `.github/workflows/android.yml` for how a release is cut, bump `package.json` version).
Also "enhance everything to do with the non-LLM model" (router rules, typo repair, filler stripping, time parsing, intent model).

## State
- `training/genr2.py K` (K=0..9) makes sets 101+10K..110+10K. Rewritten for natural grammar (verb phrase vs gerund slots, typed time phrases, "!" = imperative frame, "?" = question). Round K uses frames with index%10==K.
- Group 101-110 (K=0): DONE (99.96% -> 100.00%, logged, pushed).
- Listening mode added (`src/app/core/support.ts`, wired in `jarvis.service.ts`; test: `node scripts/test-support.mjs`): detects venting/distress without the LLM, drops tools and productivity talk, injects reflective-listening prompt, fixed crisis note, offline fallback reply. User wants Jarvis to be a place to vent; keep improving it.
- Group 111-120 (K=1): DONE (99.84% -> 99.99%).
- From K=1 every batch includes venting/crisis sentences (`training/vent.py`, labels 44/45 = vent/crisis in categories.json). The NB model learns them; `distressLead()` in router-nb.ts feeds `supportLevel()` in support.ts. User wants detection to be conversational (no specific words needed).
- Per round now: `scripts/round.sh pre $lo` (honest scores + misses), patch triggers, `scripts/round.sh post $lo`, also `node scripts/test-support.mjs` (hand-written phrases; add the count to the RESULTS.md listening table). Debug model confidence: `node scripts/lead.mjs "sentence"`.
- Group 121-130 (K=2): DONE (99.43% -> 100.00%; detector 76/78 hand-written).
- Do NOT run generation at the same time as eval/fold: the worker was OOM-killed once doing that.
- Group 131-140 (K=3): DONE (99.99% -> 100.00%; detector 77/78).
- Group 141-150: DONE (99.68% -> 100.00%; detector 77/78 -> 77/78).
- Group 151-160: DONE (99.76% -> 100.00%; detector 77/78 -> 78/78).
- Group 161-170: DONE (99.98% -> 100.00%; detector 78/78 -> 78/78).
- Group 171-180: DONE (99.95% -> 100.00%; detector 78/78 -> 78/78).
- Group 181-190: DONE (99.81% -> 100.00%; detector 78/78 -> 78/78).
- Group 191-200: DONE (99.20% -> 100.00%; detector 78/78 -> 78/78). ALL TEN GROUPS DONE.
- Leftover note: generation queued in background (/tmp/gen$lo.done marks each); if the container was reset, regenerate with `scripts/group.sh gen $lo`. Not yet tuned.
- User asked: when set 200 is reached, build the APK (workflow_dispatch of android.yml on this branch publishes a release) and give it to them in chat.

## Per-group commands (lo = 101, 111, ...)
```
scripts/group.sh gen $lo        # ~10 min, writes training/jarvis_messages_*.md + .labels (git-ignored, too big to push)
scripts/group.sh eval $lo       # pre-tune score, per-category list
scripts/group.sh miss $lo       # example misses for weak categories
python3 scripts/patch-trig.py <group> 'alt1|alt2'   # append regex alternatives to TRIGGERS[group] in src/app/core/tools/tools.service.ts
node scripts/build-vocab.mjs    # refresh typo vocabulary
MIN_COUNT=400 scripts/group.sh fold $lo   # retrain NB model (counts kept in /tmp/nbc; if /tmp/nbc is empty, recount: node scripts/train-router.mjs count <file> /tmp/nbc/nbN.json for labelled sets)
scripts/group.sh post $lo       # post-tune score
npx tsc --noEmit -p tsconfig.app.json
```
Single-file check with examples: `SHOW_MISS=1 node scripts/eval-router.mjs training/jarvis_messages_N.md`.
Run long steps with run_in_background; raw data stays local.

## Final steps
Regression eval on one file per group (10,20,...,200), update RESULTS.md with honest caveats (synthetic data; pre-tune is the honest number; on-device LLM untested), type-check, merge to main, release.

## Status (after set 200)
All ten real-speech groups tuned and logged; final regression logged in RESULTS.md. APK builds 49 and 50 were produced by workflow_dispatch of android.yml on this branch and sent to the user in chat. NOT merged to main (user has not confirmed the merge since the listening-mode work was added).

## Reflex listening mode (added after merging main)
Main's default brain is Reflex (no LLM, `src/app/core/reflex/`). The user runs Reflex, so listening mode must work there: `reflex/listener.ts` (stateful reflective conversation) is called from `ReflexService.respond` when `supportLevel()` fires or a listening conversation is active; crisis wording still goes to the engine's own safety flow (`riskOf`). Replay test: `npx esbuild scripts/listen-test.ts --bundle --platform=node --outfile=/tmp/lt.cjs && node /tmp/lt.cjs`. main is merged INTO this branch; this branch is not merged to main.

## Reflex training (user: "I can't run models on my phone, focus everything on Reflex"; "use another 50M sentences")
- The NB intent model now feeds Reflex: `trained()` + `unwrap()` in reflex/engine.ts (TRAINED_MAP/TRAINED_HINT). Reflex real-speech accuracy 43% -> ~93-95% (see RESULTS.md).
- Always run `scripts/reflex-ci.sh training/jarvis_messages_N.md 60` after any Reflex change (all suites + accuracy sample; ~7 min; run in background). `scripts/reflex-why.ts` shows Reflex vs trained-model confidence per sentence.
- 50M more: sets 201-250 via `scripts/group.sh gen 201|211|221|231|241` (K>=10 reuses frame slices with new seeds). 201-220 generated; fold each group (`MIN_COUNT=400 scripts/group.sh fold $lo`) then re-run reflex-ci on its last set and log. Never run generation alongside tests (worker gets killed).
- Sets 201-250 all generated and folded (see RESULTS.md, `scripts/reflex-train.sh`). Next ideas: fix the weak spots listed in RESULTS.md; check slot extraction (times, task names), which the accuracy score does not cover.
