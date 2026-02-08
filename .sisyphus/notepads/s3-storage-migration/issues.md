# Issues — S3 Storage Migration

> Problems encountered, gotchas, and workarounds.

---

## [2026-02-08T22:50] Issue: Task 7 incomplete - worker field reference not updated

**Problem**: Task 7 renamed `ImageJobData.originalPath` to `originalKey` but didn't update the worker's field references, causing typecheck failure.

**Root Cause**: Task 7 was instructed "Do NOT change the worker yet (that's Task 8)" but this conflicted with acceptance criteria "npm run typecheck passes". The plan had contradictory requirements.

**Fix**: Orchestrator directly renamed all 5 references to `originalPath` → `originalKey` in `imageProcessor.ts` using Edit with replaceAll=true.

**Result**: Typecheck passes, all 279 tests pass.

**Lesson**: Interface renames must update all field references immediately - that's not "changing the worker logic" (which is Task 8's job), it's maintaining type safety.
