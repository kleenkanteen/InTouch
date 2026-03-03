# LinkedIn Extension Implementation + Incremental Playwright Validation Plan

## Summary
Implement the extension in small, testable increments. After each feature increment, run Playwright MCP on LinkedIn and validate behavior on:

- `https://www.linkedin.com/in/wjayesh/`

Hard safety gate: do **not** click final `Send` on a connection request during intermediate tests. When all pre-send behavior is complete and validated, stop and request your explicit permission before executing the final send action.

## Delivery Sequence (Feature-by-Feature)

1. **LinkedIn-only activation + floating launcher**
- Add content script match for `www.linkedin.com`.
- Inject draggable circular `LI` button and persist position.
- Playwright test: launcher appears on profile page, draggable, persisted after refresh.

2. **Campaign storage + campaign list/create**
- Local storage schema for campaigns.
- Create campaign flow with unique name (case-insensitive trimmed).
- Playwright test: create campaign, duplicate-name rejection, persistence after reload.

3. **Campaign panel tabs scaffold**
- Add `Message`, `Upload`, `People` tabs with campaign context.
- Playwright test: tab switching and campaign context persistence.

4. **Message tab core**
- Add daily limit input (persisted).
- Add persisted connection-note input (used later during automation).
- Add session prospect list UI (click opens profile in current tab).
- Playwright test: both inputs persist, row click navigates correctly.

5. **Upload tab CSV + mapping**
- Upload CSV, map required columns, import valid prospects.
- Duplicate detection by normalized profile URL (in-campaign + in-file).
- Show popup: `"X duplicates detected"` + duplicate people list.
- Playwright test: import success, duplicate popup content, non-duplicates still imported.

6. **People tab list/delete/export**
- Show all prospects + status.
- Delete prospect.
- Export CSV with: Name, URL, Company, Job Title, Status, Last Attempt At, Status Reason.
- Playwright test: delete works, export file schema/content is correct.

7. **Automation engine skeleton + status state machine**
- Queue from `Prospect` only.
- Status transitions prepared: `Prospect`, `Sent Request`, `Already connected`, `Invalid Profile`.
- PST daily-limit accounting and pause-on-limit behavior.
- Playwright test: dry progression and state updates without clicking connect/send.

8. **LinkedIn action selectors + connect flow (pre-send validation only)**
- Detect `Pending`/`Message` => mark `Already connected`.
- Detect direct `Connect`, fallback through `More` menu for `Connect`.
- Open connect modal, click `Add a note` when present, fill persisted note.
- Enforce 5–10 second random delay before each action.
- Playwright test on `wjayesh` profile: validate every step up to final send button, verify delays from timestamps.
- **Do not click final send.**

9. **Final permission gate**
- Once all above pass, pause and ask you for explicit permission.
- Only after approval: perform final click on send connection request in Playwright validation.

## Public Interfaces / Data

- `Campaign`: includes `dailyLimit`, persisted `connectionNote`, `prospects`.
- `Prospect`: includes campaign status + audit fields.
- `CsvImportResult`: includes `duplicates` for popup rendering.
- Background/content message contracts:
  - `START_CAMPAIGN`, `STOP_CAMPAIGN`, `RUN_NEXT_STEP`, `UPDATE_PROSPECT_STATUS`, `GET_RUN_STATE`.

## Testing Protocol (Applied After Every Increment)

- Open LinkedIn profile URL above in Playwright MCP.
- Validate only the newly delivered feature + regression check prior features.
- Capture evidence by deterministic checks (visible text, control existence, storage state, status labels).
- Maintain safe mode: no final send until explicit user approval.

## Assumptions / Defaults

- “Small feature” = each numbered increment above.
- Current-tab profile opening behavior is retained.
- Duplicate identity key is normalized profile URL.
- Convex deploy step remains non-applicable unless Convex endpoints are introduced.