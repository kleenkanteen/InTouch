# Campaign Start-to-Finish Flow

This documents the actual runtime flow that begins when the user presses **Start Campaign** in the injected LinkedIn panel.

## Main Components Involved

- `components/li/MessageTab.vue` (`Start Campaign` button)
- `components/li/CampaignPanel.vue` (re-emits the start event)
- `components/li/LinkedInAutomationApp.vue` (UI orchestration and optimistic run-state update)
- `entrypoints/background.ts` (campaign loop, tab navigation, persistence, and message routing)
- `entrypoints/content.ts` (LinkedIn content script and `PROCESS_CURRENT_PROFILE` handler)
- `lib/automation-runner.ts` (in-page LinkedIn interaction flow)
- `lib/linkedin-selectors.ts` (button, menu, modal, and textarea lookup logic)
- `lib/storage.ts` (campaign store and run-state persistence)

## 1) Start Button in the Injected Panel

1. The user clicks the `Start Campaign` button in `MessageTab`.
2. `MessageTab` emits `start`.
3. `CampaignPanel` re-emits that as `startCampaign`.
4. `LinkedInAutomationApp.startCampaign(campaignId)` receives it.

## 2) UI-Side Validation and Kickoff

Inside `LinkedInAutomationApp.startCampaign(campaignId)`:

1. Waits for any pending store write via `persistQueue`.
2. Calls `refresh()` so it is working from the latest stored campaign/run state.
3. Looks up the campaign from `store.value.campaigns`.
4. If the campaign does not exist, it shows:
   - `Unable to start campaign: campaign not found.`
5. Finds the first prospect whose status is exactly `Prospect`.
6. If there is no eligible prospect, it shows:
   - `No prospects are ready to run for this campaign.`
7. Deep-clones the campaign into `campaignSnapshot`.
8. Optimistically updates local UI run state:
   - `isRunning = true`
   - `campaignId = <selected campaign id>`
9. Sends a runtime message:

```ts
{
  type: 'START_CAMPAIGN',
  campaignId,
  campaign: campaignSnapshot,
}
```

Important detail:

- The UI does not open the first eligible profile before starting.
- No `tabId` is passed from the UI.
- The local UI flips to running before the background script confirms the run actually started.

## 3) Background Message Handling

`entrypoints/background.ts` listens for `START_CAMPAIGN`.

When it receives the message:

1. It tries to resolve the target tab in this order:
   - `message.tabId`
   - `sender.tab?.id`
   - first result of `browser.tabs.query({ active: true, currentWindow: true })`
2. If no tab id can be resolved, it returns:
   - `{ started: false, reason: 'No active tab id' }`
3. If a tab id is found, it calls:

```ts
runCampaign(message.campaignId, resolvedTabId, Boolean(message.dryRun), message.campaign)
```

## 4) Campaign Resolution and Queue Construction

At the top of `runCampaign(...)`:

1. `stopRequested` is reset to `false`.
2. The background resolves the campaign with `resolveCampaignForRun(...)`:
   - first from persisted store
   - otherwise from the `campaignSnapshot` included in the message
   - if the snapshot is used and the campaign is missing from store, it inserts that snapshot into the store
3. If the campaign still cannot be found, the run exits.
4. It loads the current run state from storage.
5. It computes the PST day key via `getPstDateKey()`.
6. It reads how many requests have already been counted for that PST date:

```ts
const sentToday = initialState.dailySentCountByPstDate?.[pstKey] ?? 0;
```

7. It computes remaining quota:

```ts
const remainingToday = Math.max(0, campaign.dailyLimit - sentToday);
```

8. It builds the queue from prospects whose status is still `Prospect`:

```ts
const queue = buildProspectQueue(campaign).slice(0, remainingToday);
```

9. It persists run state as active:
   - `isRunning: true`
   - `campaignId`
   - `queue: [prospect ids for this run]`
   - `currentProspectId: null`
   - `runStartedAt: now`
   - preserves `dailySentCountByPstDate`
   - clears `nextActionLabel` / `nextActionAt`
10. If the queue is empty, it immediately writes a non-running state and exits.

## 5) Per-Prospect Loop in the Background

The background then loops through each queued prospect.

For each prospect:

1. If `stopRequested` is `true`, the loop breaks before starting that prospect.
2. It writes run state so the UI can show progress:
   - `currentProspectId = prospect.id`
   - `campaignId = current campaign`
   - `queue = remaining prospect ids including current`
3. It re-reads the PST send count from run state.
4. If the daily limit has been reached, it stops the run and exits.
5. It normalizes the prospect URL using `normalizeProfileUrl(...)`.
6. If the normalized URL does not start with `http://` or `https://`, it marks the prospect:
   - `Invalid Profile`
   - reason: `Invalid profile URL`
7. Otherwise it navigates the chosen tab to that profile.

## 6) Background Navigation Behavior

Navigation is handled by `navigateTabToProfile(tabId, normalizedUrl, waitBeforeNavigate)`.

That flow is:

1. Read the tab’s current URL.
2. Normalize it with the same URL normalizer.
3. If the tab is already on the exact normalized profile URL:
   - skip navigation entirely
4. Otherwise:
   - wait a randomized background delay before navigation
   - during that wait, set `nextActionLabel` and `nextActionAt`
   - call `browser.tabs.update(tabId, { url: normalizedUrl })`
   - wait for tab completion, with a 20-second timeout fallback
5. After a successful navigation, wait an extra `700ms`.

The randomized background delay uses `getRandomDelayMs()`, which is currently `5s` to `10s`.

## 7) Sending Work into the Content Script

After navigation, the background sends:

```ts
{
  type: 'PROCESS_CURRENT_PROFILE',
  campaignId,
  prospectId,
  note: campaign.connectionNote,
  dryRun,
}
```

This is sent with `browser.tabs.sendMessage(tabId, ...)`.

If the content script is not ready yet, the background retries up to:

- `20` attempts
- `750ms` between attempts

It only retries for:

- missing receiver / connection errors
- invalid `PROCESS_CURRENT_PROFILE` response shape

Other errors bubble out and the prospect is marked invalid.

## 8) Content Script Handling on the LinkedIn Page

`entrypoints/content.ts` is mounted on `*://www.linkedin.com/*`.

It:

1. Injects the root node `#intouch-li-extension-root` into `document.body`.
2. Mounts the Vue app.
3. Registers a runtime message listener once.
4. On `PROCESS_CURRENT_PROFILE`, it calls:

```ts
processCurrentProfile(message.note, Boolean(message.dryRun))
```

5. If that throws, it returns:
   - `status: 'Invalid Profile'`
   - reason: `Runner error: ...`

## 9) In-Page LinkedIn Automation Flow

`processCurrentProfile(note, dryRun)` performs the actual profile interaction.

### 9.1 Initial guards and timing

1. Creates a timeline array for debug history.
2. Uses `SET_RUN_NEXT_ACTION` messages to keep the background/UI countdown updated.
3. Verifies the current URL is a LinkedIn profile page:
   - host must be `www.linkedin.com`
   - path must start with `/in/`
4. If not, it returns:
   - `Invalid Profile`
   - reason: `Not on /in/ profile page`
5. Waits `3s` for the profile to settle.
6. Applies another randomized `5s-10s` delay before scanning buttons.

### 9.2 Selector resolution

The runner looks for:

- `Pending`
- `Message`
- `Connect`
- `More`
- `Connect` inside an open menu
- `Add a note`
- note textarea
- `Send`

Selectors are found via `lib/linkedin-selectors.ts`, using combinations of:

- text matches
- aria-label matches
- role-based clickable ancestors
- dialog-root scoped lookups
- menu-root scoped lookups

### 9.3 Early exits before clicking Connect

After the first scan:

1. If `Connect` is absent but `Pending` is visible:
   - returns `Sent Request`
   - reason: `Pending action is already visible on the profile`
2. If `Connect` is absent but `More` is visible:
   - waits randomly
   - clicks `More`
   - waits `900ms`
   - scans again for `Connect` in the menu
3. If `Connect` is still missing:
   - waits randomly
   - retries the selector lookup
4. If `Connect` is still missing after retry:
   - if `Pending` is visible, returns `Sent Request`
   - otherwise returns `Already connected`
   - reason: `Connect and Pending actions are not visible on the profile`

### 9.4 Connect flow

If a connect target is found:

1. Wait randomly.
2. Click `Connect`.
3. Wait `1200ms`.
4. If `Add a note` is visible:
   - wait randomly
   - click `Add a note`
   - wait `700ms`
5. If a note textarea exists and `note.trim()` is non-empty:
   - wait randomly
   - focus the textarea
   - assign the note text
   - dispatch `input`
   - dispatch `change`
6. It then looks for a `Send` button.

### 9.5 Send handling

If no `Send` button is found:

1. It tries to infer a LinkedIn block reason from page text.
2. It returns:
   - `Invalid Profile`
   - reason: blocked-invitation text if found, otherwise `Send button not found after connect flow`

If `dryRun === true`:

1. It does not click `Send`.
2. It returns:
   - `Sent Request`
   - reason: `Dry run completed before send click`

If it is a real run:

1. Wait randomly.
2. Click `Send`.
3. Wait randomly again.
4. Poll for up to `8s` to confirm submission.

Submission is considered confirmed if either:

- `Pending` becomes visible
- `Message` becomes visible
- the connection modal send controls are no longer visible

If confirmation does not happen in time:

- returns `Invalid Profile`
- reason: blocked-invitation text if found, otherwise `Connection request submission was not confirmed after clicking Send`

If confirmation succeeds:

- returns `Sent Request`

## 10) How the Background Maps Results

Back in `runCampaign(...)`, the background receives the `ProcessProfileResult` and maps it to stored prospect state.

Result mapping:

- `Sent Request` -> persist prospect as `Sent Request`
- `Already connected` -> persist prospect as `Already connected`
- `Invalid Profile` -> persist prospect as `Invalid Profile`
- anything unexpected -> persist as `Invalid Profile`

Persistence details:

1. Prospect status writes go through `setProspectStatusWithVerify(...)`.
2. That retries persistence verification up to `3` times.
3. If the persisted status somehow remains `Prospect`, the code force-recovers by marking it:
   - `Invalid Profile`
   - reason: `Status write recovery applied`

## 11) Daily Count Updates

After each processed prospect:

1. If the final persisted status is `Sent Request`, the background increments:

```ts
dailySentCountByPstDate[pstKey]
```

2. No increment happens for:
   - `Already connected`
   - `Invalid Profile`

This PST-based daily count is what drives:

- queue slicing at the start of a run
- the `remainingToday` number shown in the UI

## 12) Error Handling During the Loop

If a prospect-level error escapes navigation or processing:

1. The error is logged.
2. The prospect is marked:
   - `Invalid Profile`
   - reason: `Automation error: <message>`
3. The loop continues to the next queued prospect.

If a fatal error escapes the whole campaign run:

1. The background logs it.
2. It clears active run state:
   - `isRunning = false`
   - `currentProspectId = null`
   - clears next-action fields

## 13) Stop Behavior

If the UI sends `STOP_CAMPAIGN`:

1. The background sets `stopRequested = true`.
2. It immediately writes a non-running run state:
   - `isRunning = false`
   - `queue = []`
   - `currentProspectId = null`
   - `campaignId = null`
   - `runStartedAt = null`
   - clears next-action fields
3. The running loop only checks `stopRequested` between prospects, so the current profile attempt may continue until that attempt finishes.

## 14) Final Cleanup After the Loop

When the campaign loop ends normally:

1. The background reloads the latest run state.
2. It writes the final idle state:
   - `isRunning = false`
   - `currentProspectId = null`
   - `queue = []`
   - clears next-action fields

This is the full path from the `Start Campaign` button press through per-profile automation, status persistence, daily counting, and final cleanup.

## Concerns

1. The UI marks the campaign as running before background startup is confirmed. If `START_CAMPAIGN` fails to resolve a usable tab or the run exits early, the UI can briefly show a running state that was never actually established.

2. The runner treats an existing `Pending` state as `Sent Request`. That means a request sent in the past is counted the same as one sent by the current run, and the PST daily counter is incremented for it.

3. The runner treats `Connect` missing and `Pending` missing as `Already connected`, even if the real reason is selector drift, a blocked UI, or a page variant. That can permanently classify prospects as already connected when the automation may simply have failed to identify the controls.

4. `STOP_CAMPAIGN` is only honored between prospects. If a prospect is already mid-run, the current attempt can still keep clicking through LinkedIn even though the UI already shows the run as stopped.

5. A successful send can be confirmed simply because the connection modal controls disappeared, even if `Pending` or `Message` never became visible. That is a fairly loose success signal and could misclassify some failures as `Sent Request`.
