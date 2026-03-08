import type { ProcessProfileResult, RuntimeMessage } from '@/lib/runtime-messages';
import {
  getCampaignStore,
  getRunState,
  normalizeProfileUrl,
  setRunState,
  updateCampaignStore,
  updateRunState,
  updateProspectStatus,
} from '@/lib/storage';
import { getRandomDelayMs } from '@/lib/random-delay';
import { getPstDateKey } from '@/lib/time-pst';
import type { Campaign, Prospect } from '@/lib/types';

let stopRequested = false;

function waitFor(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function setRunNextAction(label: string | null, at: number | null): Promise<void> {
  await updateRunState((state) => ({
    ...state,
    nextActionLabel: label,
    nextActionAt: at,
  }));
}

async function waitForBackgroundAction(label: string): Promise<void> {
  const delayMs = getRandomDelayMs();
  console.log('[InTouch][BG] runCampaign:wait:start', { label, delayMs });
  try {
    await setRunNextAction(label, Date.now() + delayMs);
    await waitFor(delayMs);
  } finally {
    await setRunNextAction(null, null);
    console.log('[InTouch][BG] runCampaign:wait:done', { label, delayMs });
  }
}

function waitForTabComplete(tabId: number): Promise<void> {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      browser.tabs.onUpdated.removeListener(listener);
      resolve();
    }, 20_000);

    function listener(updatedTabId: number, info: { status?: string }) {
      if (updatedTabId === tabId && info.status === 'complete') {
        clearTimeout(timeout);
        browser.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    }

    browser.tabs.onUpdated.addListener(listener);
  });
}

function buildProspectQueue(campaign: Campaign): Prospect[] {
  return campaign.prospects.filter((prospect) => prospect.status === 'Prospect');
}

async function navigateTabToProfile(
  tabId: number,
  profileUrl: string,
  waitBeforeNavigate?: () => Promise<void>,
): Promise<boolean> {
  let currentUrl = '';
  try {
    const tab = await browser.tabs.get(tabId);
    currentUrl = normalizeProfileUrl(tab.url || '');
  } catch {
    currentUrl = '';
  }

  if (currentUrl === profileUrl) {
    console.log('[InTouch][BG] runCampaign:navigate-skip-already-on-profile', { tabId, profileUrl });
    return false;
  }

  if (waitBeforeNavigate) {
    await waitBeforeNavigate();
  }

  await browser.tabs.update(tabId, { url: profileUrl });
  await waitForTabComplete(tabId);
  return true;
}

function isMissingContentScriptError(error: unknown): boolean {
  const message = (error as { message?: string })?.message || String(error);
  return (
    message.includes('Receiving end does not exist') ||
    message.includes('Could not establish connection')
  );
}

function isInvalidProcessResponseError(error: unknown): boolean {
  const message = (error as { message?: string })?.message || String(error);
  return message.includes('Invalid PROCESS_CURRENT_PROFILE response');
}

function isProcessProfileResult(value: unknown): value is ProcessProfileResult {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as ProcessProfileResult;
  return typeof candidate.status === 'string' && Array.isArray(candidate.timeline);
}

async function sendProcessMessage(
  tabId: number,
  message: Extract<RuntimeMessage, { type: 'PROCESS_CURRENT_PROFILE' }>,
): Promise<ProcessProfileResult> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      const result = (await browser.tabs.sendMessage(tabId, message)) as unknown;
      if (!isProcessProfileResult(result)) {
        throw new Error(
          `Invalid PROCESS_CURRENT_PROFILE response (attempt ${attempt + 1}): ${String(result)}`,
        );
      }
      return result;
    } catch (error) {
      lastError = error;
      if (
        (!isMissingContentScriptError(error) && !isInvalidProcessResponseError(error)) ||
        attempt === 19
      ) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 750));
    }
  }

  throw lastError;
}

async function setProspectStatus(
  campaignId: string,
  prospectId: string,
  status: Prospect['status'],
  reason?: string,
): Promise<void> {
  await updateCampaignStore((store) => ({
    ...store,
    campaigns: store.campaigns.map((campaign) =>
      campaign.id === campaignId
        ? updateProspectStatus(campaign, prospectId, status, reason)
        : campaign,
    ),
  }));
}

async function setProspectStatusWithVerify(
  campaignId: string,
  prospectId: string,
  status: Prospect['status'],
  reason?: string,
  maxAttempts = 3,
): Promise<Prospect['status'] | null> {
  let lastObservedStatus: Prospect['status'] | null = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    await setProspectStatus(campaignId, prospectId, status, reason);
    const store = await getCampaignStore();
    const campaign = store.campaigns.find((item) => item.id === campaignId);
    const prospect = campaign?.prospects.find((item) => item.id === prospectId);
    lastObservedStatus = prospect?.status ?? null;
    if (prospect?.status === status) {
      console.log('[InTouch][BG] runCampaign:status-persisted', {
        campaignId,
        prospectId,
        status,
        attempt,
      });
      return status;
    }

    console.warn('[InTouch][BG] runCampaign:status-persist-retry', {
      campaignId,
      prospectId,
      status,
      attempt,
      persistedStatus: prospect?.status,
    });
    await waitFor(250);
  }

  console.error('[InTouch][BG] runCampaign:status-persist-failed', {
    campaignId,
    prospectId,
    status,
  });

  return lastObservedStatus;
}

async function resolveCampaignForRun(
  campaignId: string,
  campaignSnapshot?: Campaign,
): Promise<Campaign | null> {
  const store = await getCampaignStore();
  const fromStore = store.campaigns.find((item) => item.id === campaignId);
  if (fromStore) {
    return fromStore;
  }

  if (campaignSnapshot && campaignSnapshot.id === campaignId) {
    await updateCampaignStore((current) => {
      const exists = current.campaigns.some((item) => item.id === campaignId);
      if (exists) {
        return current;
      }
      return {
        ...current,
        campaigns: [campaignSnapshot, ...current.campaigns],
        activeCampaignId: current.activeCampaignId ?? campaignId,
      };
    });
    const refreshed = await getCampaignStore();
    return refreshed.campaigns.find((item) => item.id === campaignId) ?? campaignSnapshot;
  }

  return null;
}

async function getPersistedProspectStatus(
  campaignId: string,
  prospectId: string,
): Promise<Prospect['status'] | null> {
  const store = await getCampaignStore();
  const campaign = store.campaigns.find((item) => item.id === campaignId);
  const prospect = campaign?.prospects.find((item) => item.id === prospectId);
  return prospect?.status ?? null;
}

async function persistTerminalStatus(
  campaignId: string,
  prospectId: string,
  status: Prospect['status'],
  reason?: string,
): Promise<Prospect['status'] | null> {
  await setProspectStatusWithVerify(campaignId, prospectId, status, reason);
  let finalStatus = await getPersistedProspectStatus(campaignId, prospectId);
  if (finalStatus === 'Prospect') {
    console.warn('[InTouch][BG] runCampaign:status-still-prospect-after-write', {
      campaignId,
      prospectId,
      requestedStatus: status,
    });
    await setProspectStatusWithVerify(
      campaignId,
      prospectId,
      'Invalid Profile',
      'Status write recovery applied',
    );
    finalStatus = await getPersistedProspectStatus(campaignId, prospectId);
  }

  console.log('[InTouch][BG] runCampaign:status-final', {
    campaignId,
    prospectId,
    requestedStatus: status,
    finalStatus,
  });
  return finalStatus;
}

async function applyProspectResult(
  campaignId: string,
  prospectId: string,
  result: ProcessProfileResult,
): Promise<Prospect['status'] | null> {
  switch (result.status) {
    case 'Sent Request':
      return persistTerminalStatus(campaignId, prospectId, 'Sent Request', result.reason);
    case 'Already connected':
      return persistTerminalStatus(campaignId, prospectId, 'Already connected', result.reason);
    case 'Invalid Profile':
      return persistTerminalStatus(campaignId, prospectId, 'Invalid Profile', result.reason);
    default:
      return persistTerminalStatus(
        campaignId,
        prospectId,
        'Invalid Profile',
        `Unexpected result status: ${String((result as { status?: unknown }).status)}`,
      );
  }
}

async function runCampaign(
  campaignId: string,
  tabId: number,
  dryRun = false,
  campaignSnapshot?: Campaign,
): Promise<void> {
  console.log('[InTouch][BG] runCampaign:start', { campaignId, tabId, dryRun });
  try {
    stopRequested = false;

    const campaign = await resolveCampaignForRun(campaignId, campaignSnapshot);
    if (!campaign) {
      console.warn('[InTouch][BG] runCampaign:campaign-not-found', { campaignId });
      return;
    }

    const initialState = await getRunState();
    const pstKey = getPstDateKey();
    const sentToday = (initialState.dailySentCountByPstDate?.[pstKey] ?? 0);
    const remainingToday = Math.max(0, campaign.dailyLimit - sentToday);
    const queue = buildProspectQueue(campaign).slice(0, remainingToday);
  console.log('[InTouch][BG] runCampaign:queue-built', {
    dailyLimit: campaign.dailyLimit,
    sentToday,
    remainingToday,
    queueLength: queue.length,
    queueProspects: queue.map((p) => ({ id: p.id, url: p.profileUrl })),
  });

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

    if (!queue.length) {
      console.log('[InTouch][BG] runCampaign:no-queue-items');
      const doneState = await getRunState();
      await setRunState({
        ...doneState,
        isRunning: false,
        currentProspectId: null,
        queue: [],
        nextActionLabel: null,
        nextActionAt: null,
      });
      return;
    }

    for (const [index, prospect] of queue.entries()) {
      if (stopRequested) break;
      console.log('[InTouch][BG] runCampaign:prospect-start', {
        prospectId: prospect.id,
        profileUrl: prospect.profileUrl,
        initialStatus: prospect.status,
      });

      const runState = await getRunState();
      await setRunState({
        ...runState,
        currentProspectId: prospect.id,
        campaignId,
        queue: queue.slice(index).map((item) => item.id),
      });
      const pstKey = getPstDateKey();
      const sentToday = (runState.dailySentCountByPstDate?.[pstKey] ?? 0);

      if (sentToday >= campaign.dailyLimit) {
      console.log('[InTouch][BG] runCampaign:daily-limit-reached', {
        sentToday,
        dailyLimit: campaign.dailyLimit,
      });
      await setRunState({
        ...runState,
        isRunning: false,
        currentProspectId: null,
        nextActionLabel: null,
        nextActionAt: null,
      });
        return;
      }

      try {
        const normalizedUrl = normalizeProfileUrl(prospect.profileUrl);
        if (!normalizedUrl.startsWith('http://') && !normalizedUrl.startsWith('https://')) {
          const finalStatus = await persistTerminalStatus(
            campaignId,
            prospect.id,
            'Invalid Profile',
            'Invalid profile URL',
          );
          console.log('[InTouch][BG] runCampaign:prospect-finished', {
            prospectId: prospect.id,
            resultStatus: 'Invalid Profile',
            finalStatus,
          });
          continue;
        }

        console.log('[InTouch][BG] runCampaign:navigate', { tabId, normalizedUrl });
        const didNavigate = await navigateTabToProfile(
          tabId,
          normalizedUrl,
          async () => waitForBackgroundAction('Open next prospect profile'),
        );
        if (didNavigate) {
          await waitFor(700);
          console.log('[InTouch][BG] runCampaign:tab-complete', { tabId, normalizedUrl });
        }

        const result = await sendProcessMessage(tabId, {
          type: 'PROCESS_CURRENT_PROFILE',
          campaignId,
          prospectId: prospect.id,
          note: campaign.connectionNote,
          dryRun,
        });
        console.log('[InTouch][BG] runCampaign:process-result', {
          prospectId: prospect.id,
          result,
        });

        const finalStatus = await applyProspectResult(campaignId, prospect.id, result);
        if (finalStatus === 'Prospect') {
          console.warn('[InTouch][BG] runCampaign:prospect-ended-as-prospect', {
            prospectId: prospect.id,
            resultStatus: result.status,
          });
        }

        console.log('[InTouch][BG] runCampaign:prospect-finished', {
          prospectId: prospect.id,
          resultStatus: result.status,
          finalStatus,
        });

        if (finalStatus === 'Sent Request') {
          console.log('[InTouch][BG] runCampaign:sent-request', { prospectId: prospect.id, finalStatus });
          const latest = await getRunState();
          await setRunState({
            ...latest,
            dailySentCountByPstDate: {
              ...latest.dailySentCountByPstDate,
              [pstKey]: (latest.dailySentCountByPstDate[pstKey] || 0) + 1,
            },
          });
        }
      } catch (error) {
        const errorMessage = (error as { message?: string })?.message || String(error);
        console.error('[InTouch][BG] runCampaign:process-error', {
          prospectId: prospect.id,
          error,
        });
        const finalStatus = await persistTerminalStatus(
          campaignId,
          prospect.id,
          'Invalid Profile',
          `Automation error: ${errorMessage}`,
        );
        console.log('[InTouch][BG] runCampaign:prospect-finished', {
          prospectId: prospect.id,
          resultStatus: 'Invalid Profile',
          finalStatus,
        });
      }
    }

    const finalState = await getRunState();
    console.log('[InTouch][BG] runCampaign:complete', {
      campaignId,
      processed: queue.length,
    });
    await setRunState({
      ...finalState,
      isRunning: false,
      currentProspectId: null,
      queue: [],
      nextActionLabel: null,
      nextActionAt: null,
    });
  } catch (error) {
    console.error('[InTouch][BG] runCampaign:fatal-error', error);
    const current = await getRunState();
    await setRunState({
      ...current,
      isRunning: false,
      currentProspectId: null,
      nextActionLabel: null,
      nextActionAt: null,
    });
  }
}

export default defineBackground(() => {
  browser.runtime.onMessage.addListener((message: RuntimeMessage, sender) => {
    console.log('[InTouch][BG] onMessage', {
      type: message.type,
      senderTabId: sender.tab?.id,
      message,
    });
    if (message.type === 'GET_RUN_STATE') {
      return getRunState();
    }

    if (message.type === 'STOP_CAMPAIGN') {
      stopRequested = true;
      return getRunState().then((current) =>
        setRunState({
          ...current,
          isRunning: false,
          queue: [],
          currentProspectId: null,
          campaignId: null,
          runStartedAt: null,
          nextActionLabel: null,
          nextActionAt: null,
        }),
      );
    }

    if (message.type === 'START_CAMPAIGN') {
      const tabId = message.tabId ?? sender.tab?.id;
      if (tabId) {
        return runCampaign(
          message.campaignId,
          tabId,
          Boolean(message.dryRun),
          message.campaign,
        )
          .then(() => ({ started: true, tabId }))
          .catch((error) => {
            console.error('[InTouch][BG] startCampaign:run-error', error);
            return { started: false, reason: 'Campaign run failed' };
          });
      }

      return browser.tabs
        .query({ active: true, currentWindow: true })
        .then((tabs) => {
          const resolvedTabId = tabs[0]?.id;
          if (!resolvedTabId) {
            return { started: false, reason: 'No active tab id' };
          }
          return runCampaign(
            message.campaignId,
            resolvedTabId,
            Boolean(message.dryRun),
            message.campaign,
          )
            .then(() => ({ started: true, tabId: resolvedTabId }))
            .catch((error) => {
              console.error('[InTouch][BG] startCampaign:run-error', error);
              return { started: false, reason: 'Campaign run failed' };
            });
        })
        .catch((error) => {
          console.error('[InTouch][BG] startCampaign:tab-resolution-error', error);
          return { started: false, reason: 'Failed to resolve active tab' };
        });
    }

    if (message.type === 'UPDATE_PROSPECT_STATUS') {
      return setProspectStatus(
        message.campaignId,
        message.prospectId,
        message.status,
        message.reason,
      );
    }

    if (message.type === 'OPEN_PROFILE') {
      const tabId = message.tabId ?? sender.tab?.id;
      if (!tabId) {
        return Promise.resolve({ opened: false, reason: 'No active tab id' });
      }
      return browser.tabs.update(tabId, { url: message.profileUrl });
    }

    if (message.type === 'SET_RUN_NEXT_ACTION') {
      return updateRunState((state) => ({
        ...state,
        nextActionLabel: message.nextActionLabel,
        nextActionAt: message.nextActionAt,
      }));
    }

    return undefined;
  });
});
