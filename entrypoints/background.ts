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
import { getPstDateKey } from '@/lib/time-pst';
import type { Campaign, Prospect } from '@/lib/types';

let stopRequested = false;

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

async function runCampaign(campaignId: string, tabId: number, dryRun = false): Promise<void> {
  console.log('[InTouch][BG] runCampaign:start', { campaignId, tabId, dryRun });
  try {
    stopRequested = false;

    const store = await getCampaignStore();
    const campaign = store.campaigns.find((item) => item.id === campaignId);
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

    for (const prospect of queue) {
      if (stopRequested) break;
    console.log('[InTouch][BG] runCampaign:prospect-start', {
      prospectId: prospect.id,
      profileUrl: prospect.profileUrl,
    });

      const runState = await getRunState();
      await setRunState({
        ...runState,
        currentProspectId: prospect.id,
        campaignId,
        queue: queue.map((item) => item.id),
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

      const normalizedUrl = normalizeProfileUrl(prospect.profileUrl);
    console.log('[InTouch][BG] runCampaign:navigate', { tabId, normalizedUrl });
      await browser.tabs.update(tabId, { url: normalizedUrl });
      await waitForTabComplete(tabId);
    console.log('[InTouch][BG] runCampaign:tab-complete', { tabId, normalizedUrl });

      let result: ProcessProfileResult;
      try {
        result = (await browser.tabs.sendMessage(tabId, {
          type: 'PROCESS_CURRENT_PROFILE',
          campaignId,
          prospectId: prospect.id,
          note: campaign.connectionNote,
          dryRun,
        } satisfies RuntimeMessage)) as ProcessProfileResult;
      console.log('[InTouch][BG] runCampaign:process-result', {
        prospectId: prospect.id,
        result,
      });
      } catch (error) {
      console.error('[InTouch][BG] runCampaign:process-error', {
        prospectId: prospect.id,
        error,
      });
        await setProspectStatus(campaignId, prospect.id, 'Invalid Profile', 'Content script message failed');
        continue;
      }

      await setProspectStatus(campaignId, prospect.id, result.status, result.reason);

      if (result.status === 'Sent Request') {
      console.log('[InTouch][BG] runCampaign:sent-request', { prospectId: prospect.id });
        const latest = await getRunState();
        await setRunState({
          ...latest,
          dailySentCountByPstDate: {
            ...latest.dailySentCountByPstDate,
            [pstKey]: (latest.dailySentCountByPstDate[pstKey] || 0) + 1,
          },
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
        void runCampaign(message.campaignId, tabId, Boolean(message.dryRun));
        return Promise.resolve({ started: true, tabId });
      }

      return browser.tabs
        .query({ active: true, currentWindow: true })
        .then((tabs) => {
          const resolvedTabId = tabs[0]?.id;
          if (!resolvedTabId) {
            return { started: false, reason: 'No active tab id' };
          }
          void runCampaign(message.campaignId, resolvedTabId, Boolean(message.dryRun));
          return { started: true, tabId: resolvedTabId };
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
