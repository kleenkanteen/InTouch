import type { ProcessProfileResult, RuntimeMessage } from '@/lib/runtime-messages';
import {
  getCampaignStore,
  getRunState,
  normalizeProfileUrl,
  setRunState,
  updateCampaignStore,
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
  stopRequested = false;

  const store = await getCampaignStore();
  const campaign = store.campaigns.find((item) => item.id === campaignId);
  if (!campaign) return;

  const queue = buildProspectQueue(campaign);

  await setRunState({
    isRunning: true,
    campaignId,
    queue: queue.map((prospect) => prospect.id),
    currentProspectId: null,
    runStartedAt: new Date().toISOString(),
    dailySentCountByPstDate: (await getRunState()).dailySentCountByPstDate,
  });

  for (const prospect of queue) {
    if (stopRequested) break;

    const runState = await getRunState();
    await setRunState({
      ...runState,
      currentProspectId: prospect.id,
      campaignId,
      queue: queue.map((item) => item.id),
    });
    const pstKey = getPstDateKey();
    const sentToday = runState.dailySentCountByPstDate[pstKey] || 0;

    if (sentToday >= campaign.dailyLimit) {
      await setRunState({ ...runState, isRunning: false, currentProspectId: null });
      return;
    }

    const normalizedUrl = normalizeProfileUrl(prospect.profileUrl);
    await browser.tabs.update(tabId, { url: normalizedUrl });
    await waitForTabComplete(tabId);

    const result = (await browser.tabs.sendMessage(tabId, {
      type: 'PROCESS_CURRENT_PROFILE',
      campaignId,
      prospectId: prospect.id,
      note: campaign.connectionNote,
      dryRun,
    } satisfies RuntimeMessage)) as ProcessProfileResult;

    await setProspectStatus(campaignId, prospect.id, result.status, result.reason);

    if (result.status === 'Sent Request') {
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
  await setRunState({
    ...finalState,
    isRunning: false,
    currentProspectId: null,
    queue: [],
  });
}

export default defineBackground(() => {
  browser.runtime.onMessage.addListener((message: RuntimeMessage) => {
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
        }),
      );
    }

    if (message.type === 'START_CAMPAIGN') {
      void runCampaign(message.campaignId, message.tabId, Boolean(message.dryRun));
      return Promise.resolve({ started: true });
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
      return browser.tabs.update(message.tabId, { url: message.profileUrl });
    }

    return undefined;
  });
});
