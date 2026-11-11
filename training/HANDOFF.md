# Handoff: non-LLM router training (read this first after a /clear)

User's standing wishes: speak as Jarvis ("sir"), be very token-frugal. Work on branch `ccr-3801851b-dbt9gq`, commit + push after each group. No PR unless asked.

## Goal in progress
Sets 101-200 = 100M "real speech" messages, in ten groups of 10M. For each group: generate, score BEFORE tuning (honest held-out number), patch rules from the misses, retrain the intent model, re-score, log in `training/RESULTS.md`, commit, push. All sentences must read as natural human speech. **When all ten groups are done: merge the branch to main and release** (user asked; check `.github/workflows/android.yml` for how a release is cut, bump `package.json` version).
Also "enhance everything to do with the non-LLM model" (router rules, typo repair, filler stripping, time parsing, intent model).

## State
- `training/genr2.py K` (K=0..9) makes sets 101+10K..110+10K. Rewritten for natural grammar (verb phrase vs gerund slots, typed time phrases, "!" = imperative frame, "?" = question). Round K uses frames with index%10==K.
- Group 101-110 (K=0): DONE (99.96% -> 100.00%, logged, pushed).
- Listening mode added (`src/app/core/support.ts`, wired in `jarvis.service.ts`; test: `node scripts/test-support.mjs`): detects venting/distress without the LLM, drops tools and productivity talk, injects reflective-listening prompt, fixed crisis note, offline fallback reply. User wants Jarvis to be a place to vent; keep improving it.
- Groups 111-200 (K=1..9): not started.

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
