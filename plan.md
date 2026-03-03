# InTouch LinkedIn Automation Plan (Updated)

## Product Goal
Build a WXT Chrome extension (LinkedIn-only) that manages campaigns from CSV imports and runs controlled connection-request automation with 5–10 second randomized delays between actions.

## Current Agreed Behavior

### UI Surface
1. Extension is active only on `www.linkedin.com`.
2. Main campaign panel is always rendered on page load (floating, draggable).
3. Floating `LI` circle launcher has been removed.
4. Panel drag uses title bar and should not block clicks on controls.

### Campaigns
1. Campaigns are locally persisted and restored across navigation/reload.
2. Campaign name is required and unique (case-insensitive, trimmed).
3. Creating a campaign auto-selects it.

### Campaign Storage
1. Primary persistence: `browser.storage.local`.
2. Mirror fallback persistence: `localStorage` key `intouch:campaign-store:v1` to survive intermittent storage issues.
3. Storage read/write sanitization is applied to prevent malformed data from crashing UI.

### Campaign Tabs

#### Message Tab
1. Shows daily send limit input (PST day window).
2. Shows persisted connection note input (used in connection request note).
3. Shows only first `X` prospects for today where:
   - `X = dailyLimit - sentToday(PST)`
   - filtered to status `Prospect`
4. `Start Campaign` disabled when no eligible prospects.
5. While running, show `Stop Campaign` button.
6. Under `Stop Campaign`, show:
   - countdown in seconds
   - next action description (for delay windows)

#### Upload Tab
1. CSV upload + mapping fields:
   - Full Name
   - Profile URL
   - Company
   - Job Title
2. On import, show loading text while processing rows.
3. Duplicate detection by normalized profile URL:
   - duplicates already in campaign
   - duplicates within uploaded CSV
4. Duplicate popup format:
   - title: `"X duplicates detected"`
   - list of duplicate people below
5. Non-duplicate valid rows still import.

#### People Tab
1. Shows all people in campaign with status.
2. Clicking a person opens their profile in current tab.
3. Deleting a person removes from campaign.
4. Export CSV button exports all profiles + campaign status fields:
   - Full Name
   - Profile URL
   - Company
   - Job Title
   - Status
   - Last Attempt At
   - Status Reason

## Automation Runtime Behavior

### Start/Stop
1. `Start Campaign` triggers background-runner orchestration.
2. Active tab resolution is robust:
   - message tab id (if present)
   - sender tab id
   - fallback active-tab query
3. `Stop Campaign` stops run and clears next-action state.

### Queue Construction
1. Queue built from campaign prospects with `status === 'Prospect'`.
2. Queue is capped to today’s remaining quota (`dailyLimit - sentToday(PST)`).
3. Order follows campaign people list order (topmost first).

### Per-Prospect Flow
For each queued profile:
1. Navigate current tab to profile URL.
2. Wait 5–10 seconds.
3. Validate profile page (`/in/...`), else `Invalid Profile`.
4. If `Pending` or `Message` is present in profile actions: mark `Already connected`.
5. Attempt connect:
   - try direct `Connect`
   - if not visible, click profile-card `More` and then `Connect`
6. If connection modal supports notes:
   - click `Add a note`
   - fill campaign connection note
7. Click `Send` (except dry-run mode where it stops before send).
8. Update status accordingly.

### Delay Policy
1. Every action step uses randomized delay in `[5000ms, 10000ms]`.
2. Countdown + next-action text are surfaced from background run-state.

### Daily Quota (PST)
1. Day window is midnight-to-midnight America/Los_Angeles.
2. Once limit reached, campaign pauses/stops for current run.
3. Sent counters tracked per PST date key.

## Status Model
- `Prospect`
- `Sent Request`
- `Already connected`
- `Invalid Profile`

## Safety and Sending Rule
1. During manual validation, do not click final `Send` until explicitly permitted by user.
2. Pre-send validation path includes:
   - `More -> Connect -> Add a note -> note filled -> Send visible`

## Debug and Observability
Structured logs were added across layers with prefix `[InTouch]`:
1. UI logs for create/start/stop/open/refresh.
2. Content logs for mount and profile-processing message receipt.
3. Background logs for message routing, tab resolution, queue build, navigation, and run results.
4. Runner logs for action step timing and selector-path decisions.

## Known Non-Functional Constraints
1. No Convex endpoints currently in project; Convex deploy rule is not applicable.
2. If TypeScript strictness blocks low-value progress, `// @ts-expect-error <reason>` may be used surgically.
