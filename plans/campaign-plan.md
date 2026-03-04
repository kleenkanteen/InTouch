# Campaign Start-to-Finish Flow

This documents the exact runtime flow after clicking **Start Campaign** in the injected LinkedIn panel.

## Main Components Involved

- `components/li/CampaignPanel.vue` (Start button emit)
- `components/li/LinkedInAutomationApp.vue` (UI orchestration + runtime messages)
- `entrypoints/background.ts` (tab navigation + run loop + state updates)
- `entrypoints/content.ts` (LinkedIn content script + PROCESS_CURRENT_PROFILE handler)
- `lib/automation-runner.ts` (in-page LinkedIn clicks/typing/send)
- `lib/linkedin-selectors.ts` (button/textarea lookup logic)
- `lib/storage.ts` (campaign + run state persistence)

## 1) Start Button to Background Kickoff

1. User clicks Start in the panel.
2. `CampaignPanel` emits `startCampaign`.
3. `LinkedInAutomationApp.startCampaign(campaignId)`:
   - validates campaign exists
   - validates at least one prospect has status `Prospect`
   - sends `OPEN_PROFILE` for the first eligible prospect
   - sends `START_CAMPAIGN` with `campaignId`, optional `tabId`, and campaign snapshot

Key code:

```ts
const opened = await browser.runtime.sendMessage({
  type: 'OPEN_PROFILE',
  profileUrl: firstEligibleProspect.profileUrl,
});

const message: RuntimeMessage = {
  type: 'START_CAMPAIGN',
  campaignId,
  tabId: runTabId,
  campaign: campaignSnapshot,
};
void browser.runtime.sendMessage(message);
```

## 2) Background Resolves Tab + Initializes Queue

In `background.ts`, `START_CAMPAIGN`:

1. Uses provided `tabId` or falls back to `browser.tabs.query({ active: true, currentWindow: true })`.
2. Calls `runCampaign(campaignId, tabId, dryRun, campaignSnapshot)`.

Inside `runCampaign`:

1. Loads campaign from snapshot/store.
2. Computes daily quota using PST key:
   - `sentToday = runState.dailySentCountByPstDate[pstKey] || 0`
   - `remainingToday = max(0, dailyLimit - sentToday)`
3. Builds queue from prospects still in `Prospect` status and slices by `remainingToday`.
4. Persists run state as running with queue and timestamps.

Key code:

```ts
const queue = buildProspectQueue(campaign).slice(0, remainingToday);
await setRunState({
  isRunning: true,
  campaignId,
  queue: queue.map((prospect) => prospect.id),
  currentProspectId: null,
  runStartedAt: new Date().toISOString(),
  dailySentCountByPstDate: initialState.dailySentCountByPstDate || {},
  nextActionLabel: null,
  nextActionAt: null,
});
```

## 3) Per-Prospect Loop

For each queued prospect:

1. Abort loop early if `stopRequested` is true.
2. Update `currentProspectId` and remaining queue in run state.
3. Re-check daily limit before doing work.
4. Normalize URL:
   - invalid URL -> mark prospect `Invalid Profile` and continue
5. Navigate tab:
   - if already on same normalized URL, skip navigation
   - otherwise wait randomized `5s-10s` (tracked in `nextActionLabel`/`nextActionAt`), then `browser.tabs.update(tabId, { url })` and wait for tab complete (or timeout at 20s)
6. Send `PROCESS_CURRENT_PROFILE` to content script with note + `dryRun`.
7. If send fails because content script is not ready, retries up to 20 times (750ms each).

Key code:

```ts
const result = await sendProcessMessage(tabId, {
  type: 'PROCESS_CURRENT_PROFILE',
  campaignId,
  prospectId: prospect.id,
  note: campaign.connectionNote,
  dryRun,
});
```

## 4) Content Script Receives Work

`entrypoints/content.ts` runs on `*://www.linkedin.com/*` and:

1. Injects root node `#intouch-li-extension-root` into `document.body`.
2. Mounts Vue app (`LinkedInAutomationApp`).
3. Listens for runtime messages.
4. On `PROCESS_CURRENT_PROFILE`, calls `processCurrentProfile(note, dryRun)`.

Key code:

```ts
browser.runtime.onMessage.addListener((message: RuntimeMessage) => {
  if (message.type !== 'PROCESS_CURRENT_PROFILE') return;
  return processCurrentProfile(message.note, Boolean(message.dryRun));
});
```

## 5) In-Page LinkedIn Automation (`processCurrentProfile`)

On the currently loaded LinkedIn profile page:

1. Verifies URL is `www.linkedin.com/in/...`; otherwise returns `Invalid Profile`.
2. Waits for profile load and random action delays (`5s` to `10s`) between actions.
3. Resolves UI targets (`Connect`, `More`, `Add a note`, textarea, `Send`) via selector helpers.
   - `Add a note`, note textarea, and `Send` are scoped to the active connection dialog first, then fall back to page-level search.
4. If direct `Connect` missing but `More` exists:
   - clicks `More`
   - searches for `Connect` inside menu
5. If no `Connect` target is found:
   - if `Pending` or `Message` exists, returns `Already connected`
   - otherwise returns `Invalid Profile`
6. Clicks `Connect`.
7. Optionally clicks `Add a note`.
8. If note exists, fills textarea and dispatches `input`/`change`.
9. Finds `Send`:
   - `dryRun` => returns `Sent Request` without clicking Send
   - normal run => clicks `Send`, then waits randomized `5s-10s` and verifies completion before returning success:
     - confirms profile actions show `Pending` or `Message`, or
     - confirms connection modal send controls are gone
   - if not confirmed within timeout, returns `Invalid Profile` with reason.

It also pushes progress into run state via `SET_RUN_NEXT_ACTION` so UI can show countdown/status.

## 6) Result Handling + Moving Through Whole List

Back in `runCampaign` after each prospect result:

1. If `Invalid Profile`: persists prospect status as invalid with reason.
2. If `Already connected`: persists prospect status as `Already connected`.
3. If `Sent Request`:
   - persists prospect status as `Sent Request`
   - increments `dailySentCountByPstDate[pstKey]`.
4. Continues to next queued prospect until:
   - queue exhausted
   - stop requested
   - daily limit reached

This keeps the campaign queue moving prospect-by-prospect while persisting terminal status for each processed profile.

## 7) Stop and Finalization

- `STOP_CAMPAIGN` sets `stopRequested = true`, then resets run state to not running.
- After loop completion (or fatal error), `runCampaign` sets:
  - `isRunning = false`
  - `currentProspectId = null`
  - `queue = []`
  - clears next-action fields

This is how one Start click drives profile-by-profile processing through the eligible list for that campaign run.
