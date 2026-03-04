## Fix Campaign Send Reliability + Action Delay Enforcement

### Summary
The current failure is most likely caused by returning immediately after `Send` and navigating to the next profile before LinkedIn finishes submitting the request, which can leave only the last profile actually sent.  
I will first update [/Volumes/ssd/coding/InTouch/plans/campaign-plan.md](/Volumes/ssd/coding/InTouch/plans/campaign-plan.md), then implement code changes so every prospect is processed with enforced randomized `5s-10s` waits between each click and each actual profile change.

### Key Changes I Will Make
1. Persist successful sends per prospect:
- In [/Volumes/ssd/coding/InTouch/entrypoints/background.ts](/Volumes/ssd/coding/InTouch/entrypoints/background.ts), when result is `Sent Request`, persist status with `setProspectStatus(..., 'Sent Request')` and keep daily counter increment.
- Handle `Already connected` result by persisting `Already connected`.

2. Enforce `5s-10s` randomized wait before every profile change:
- Add a background helper that sets `nextActionLabel/nextActionAt`, waits randomized `5s-10s`, then clears next action.
- Call it before each real `browser.tabs.update(...url...)` in campaign loop navigation.

3. Make send completion robust before moving to next prospect:
- In [/Volumes/ssd/coding/InTouch/lib/automation-runner.ts](/Volumes/ssd/coding/InTouch/lib/automation-runner.ts), after clicking `Send`, wait randomized `5s-10s`, then verify completion by checking either:
  - profile actions now show `Pending` or `Message`, or
  - connect modal no longer presents sendable controls.
- If neither condition appears within timeout, return `Invalid Profile` with explicit reason instead of false success.

4. Improve connect fallback classification:
- If no connect target is found after direct + `More` menu attempts:
  - if `Pending` or `Message` exists => return `Already connected`.
  - otherwise => return `Invalid Profile`.

5. Tighten selector targeting for note/send controls:
- In [/Volumes/ssd/coding/InTouch/lib/linkedin-selectors.ts](/Volumes/ssd/coding/InTouch/lib/linkedin-selectors.ts), prioritize visible connection dialog scope for `Add a note`, note textarea, and `Send` to reduce wrong-button matches.

### Public API / Interface Changes
- No new runtime message types.
- No schema/type additions required.
- Behavioral contract change: successful sends and already-connected detections are now persisted immediately per prospect during run.

### File-by-File Implementation Plan
1. Update [/Volumes/ssd/coding/InTouch/plans/campaign-plan.md](/Volumes/ssd/coding/InTouch/plans/campaign-plan.md):
- Document action-delay rule as “between every click and profile change.”
- Document post-send verification before advancing queue.
- Document new status persistence behavior for `Sent Request` and `Already connected`.

2. Update [/Volumes/ssd/coding/InTouch/lib/automation-runner.ts](/Volumes/ssd/coding/InTouch/lib/automation-runner.ts):
- Add post-send confirmation waiter.
- Replace weak “send clicked = success” with “send clicked + confirmation/timeout.”
- Return `Already connected` in no-connect + pending/message case.

3. Update [/Volumes/ssd/coding/InTouch/lib/linkedin-selectors.ts](/Volumes/ssd/coding/InTouch/lib/linkedin-selectors.ts):
- Scope note/send queries to active connection dialog first, then fallback.
- Keep visibility/disabled checks strict.

4. Update [/Volumes/ssd/coding/InTouch/entrypoints/background.ts](/Volumes/ssd/coding/InTouch/entrypoints/background.ts):
- Add randomized pre-navigation action delay + run-state countdown updates.
- Persist per-prospect success statuses.

5. Validate:
- Run `bun run build` (required by repo instructions).

### Test Cases and Scenarios
1. Multi-prospect happy path:
- Start campaign with 3+ valid prospects.
- Verify each profile gets connect flow and each prospect status becomes `Sent Request`.
- Verify LinkedIn shows requests sent for all, not only final profile.

2. Already connected/pending case:
- Prospect already has `Pending` or `Message`.
- Verify status saved as `Already connected` and run continues.

3. Missing connect action case:
- Profile without connect and without pending/message.
- Verify status `Invalid Profile` with reason.

4. Delay policy:
- Confirm logs/timeline show randomized `5000-10000ms` waits before every click and before each real profile navigation.

5. Note flow:
- With non-empty note, verify `Add a note` path fills textarea and sends.
- With empty note, verify send still proceeds when available.

### Assumptions and Defaults
- Dry-run semantics remain unchanged from current behavior.
- Delay is enforced only for actual profile changes (if already on same normalized URL, no profile-change action occurs).
- Existing daily limit and queue construction logic remain unchanged.
