<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import CampaignPanel from './CampaignPanel.vue';
import {
  createCampaign,
  getCampaignStore,
  getRunState,
  normalizeCampaignName,
  setCampaignStore,
} from '@/lib/storage';
import type { Campaign, CampaignStore, Prospect, RunState } from '@/lib/types';
import type { RuntimeMessage } from '@/lib/runtime-messages';
import { getPstDateKey } from '@/lib/time-pst';

const store = ref<CampaignStore>({
  campaigns: [],
  activeCampaignId: null,
  floatingButtonPosition: { x: 24, y: 120 },
  panelPosition: { x: 24, y: 30 },
});
const runState = ref<RunState>({
  isRunning: false,
  campaignId: null,
  queue: [],
  currentProspectId: null,
  runStartedAt: null,
  dailySentCountByPstDate: {},
  nextActionLabel: null,
  nextActionAt: null,
});
const todayPstKey = computed(() => getPstDateKey());
const sentToday = computed(() => runState.value.dailySentCountByPstDate[todayPstKey.value] || 0);
const nextActionCountdown = ref<number | null>(null);
let persistQueue: Promise<void> = Promise.resolve();
let isPersistingStore = false;
let countdownInterval: number | null = null;
let runSyncInterval: number | null = null;
let isRefreshing = false;

function queuePersistStore(): Promise<void> {
  persistQueue = persistQueue.then(async () => {
    isPersistingStore = true;
    try {
      await setCampaignStore(store.value);
    } finally {
      isPersistingStore = false;
    }
  });

  return persistQueue;
}

async function refresh() {
  if (isRefreshing) {
    return;
  }
  isRefreshing = true;
  try {
    store.value = await getCampaignStore();
    runState.value = await getRunState();
    console.log('[InTouch][UI] refresh', {
      campaigns: store.value.campaigns.length,
      activeCampaignId: store.value.activeCampaignId,
      isRunning: runState.value.isRunning,
      queue: runState.value.queue.length,
      nextActionLabel: runState.value.nextActionLabel,
      nextActionAt: runState.value.nextActionAt,
    });
  } finally {
    isRefreshing = false;
  }
}

async function movePanel(x: number, y: number) {
  store.value = {
    ...store.value,
    panelPosition: { x, y },
  };
  await queuePersistStore();
}

async function selectCampaign(campaignId: string) {
  store.value = { ...store.value, activeCampaignId: campaignId };
  await queuePersistStore();
}

async function createNewCampaign(name: string) {
  try {
    console.log('[InTouch][UI] createNewCampaign:start', { name });
    const normalized = normalizeCampaignName(name);
    const exists = store.value.campaigns.some(
      (campaign) => normalizeCampaignName(campaign?.name) === normalized,
    );
    if (exists) {
      window.alert('Campaign name already exists');
      return;
    }

    const campaign = createCampaign(name);
    store.value = {
      ...store.value,
      campaigns: [campaign, ...store.value.campaigns],
      activeCampaignId: campaign.id,
    };
    await queuePersistStore();
    console.log('[InTouch][UI] createNewCampaign:done', {
      campaignId: campaign.id,
      campaigns: store.value.campaigns.length,
    });
  } catch (error) {
    console.error('Failed to create campaign', error);
    window.alert('Failed to create campaign. Please refresh and try again.');
  }
}

async function updateCampaign(campaignId: string, updater: (campaign: any) => any) {
  store.value = {
    ...store.value,
    campaigns: store.value.campaigns.map((campaign) =>
      campaign.id === campaignId ? updater(campaign) : campaign,
    ),
  };
  await queuePersistStore();
}

async function updateDailyLimit(payload: { campaignId: string; value: number }) {
  await updateCampaign(payload.campaignId, (campaign) => ({
    ...campaign,
    dailyLimit: Math.max(1, Number(payload.value) || 1),
    updatedAt: new Date().toISOString(),
  }));
}

async function updateConnectionNote(payload: { campaignId: string; value: string }) {
  await updateCampaign(payload.campaignId, (campaign) => ({
    ...campaign,
    connectionNote: String(payload.value ?? ''),
    updatedAt: new Date().toISOString(),
  }));
}

async function appendProspects(payload: { campaignId: string; prospects: Prospect[] }) {
  await updateCampaign(payload.campaignId, (campaign) => ({
    ...campaign,
    prospects: [...campaign.prospects, ...payload.prospects],
    updatedAt: new Date().toISOString(),
  }));
}

async function removeProspect(payload: { campaignId: string; prospectId: string }) {
  await updateCampaign(payload.campaignId, (campaign) => ({
    ...campaign,
    prospects: campaign.prospects.filter((prospect: Prospect) => prospect.id !== payload.prospectId),
    updatedAt: new Date().toISOString(),
  }));
}

async function startCampaign(campaignId: string) {
  console.log('[InTouch][UI] startCampaign:click', { campaignId });
  const campaign = store.value.campaigns.find((item) => item.id === campaignId);
  if (!campaign) {
    window.alert('Unable to start campaign: campaign not found.');
    return;
  }

  const firstEligibleProspect = campaign.prospects.find((prospect) => prospect.status === 'Prospect');
  if (!firstEligibleProspect) {
    window.alert('No prospects are ready to run for this campaign.');
    return;
  }

  const campaignSnapshot = JSON.parse(JSON.stringify(campaign)) as Campaign;
  const message: RuntimeMessage = {
    type: 'START_CAMPAIGN',
    campaignId,
    campaign: campaignSnapshot,
  };

  runState.value = {
    ...runState.value,
    isRunning: true,
    campaignId,
  };
  console.log('[InTouch][UI] startCampaign:localStateUpdated', {
    isRunning: runState.value.isRunning,
    campaignId: runState.value.campaignId,
  });

  void browser.runtime.sendMessage(message).catch((error) => {
    console.error('[InTouch][UI] startCampaign:message-error', error);
  });
}

async function stopCampaign() {
  console.log('[InTouch][UI] stopCampaign:click');
  await browser.runtime.sendMessage({ type: 'STOP_CAMPAIGN' } satisfies RuntimeMessage);
  nextActionCountdown.value = null;
  await refresh();
}

async function openProspect(prospect: Prospect) {
  if (!prospect.profileUrl) return;
  console.log('[InTouch][UI] openProspect', { prospectId: prospect.id, profileUrl: prospect.profileUrl });
  await browser.runtime.sendMessage({
    type: 'OPEN_PROFILE',
    profileUrl: prospect.profileUrl,
  } satisfies RuntimeMessage);
}

onMounted(async () => {
  await refresh();
  countdownInterval = window.setInterval(() => {
    if (!runState.value.nextActionAt) {
      nextActionCountdown.value = null;
      return;
    }
    const seconds = Math.max(0, Math.ceil((runState.value.nextActionAt - Date.now()) / 1000));
    nextActionCountdown.value = seconds;
    if (seconds <= 0 && !runState.value.isRunning) {
      nextActionCountdown.value = null;
    }
  }, 250);
  runSyncInterval = window.setInterval(() => {
    if (runState.value.isRunning) {
      void refresh();
    }
  }, 1500);

  browser.storage.onChanged.addListener(async (changes, area) => {
    if (area !== 'local') return;
    if (changes['liCampaigns:v1'] || changes['liRunState:v1']) {
      if (isPersistingStore && changes['liCampaigns:v1']) {
        return;
      }
      await refresh();
    }
  });
});

onBeforeUnmount(() => {
  if (countdownInterval !== null) {
    window.clearInterval(countdownInterval);
    countdownInterval = null;
  }
  if (runSyncInterval !== null) {
    window.clearInterval(runSyncInterval);
    runSyncInterval = null;
  }
});
</script>

<template>
  <CampaignPanel
    :campaigns="store.campaigns"
    :active-campaign-id="store.activeCampaignId"
    :is-running="runState.isRunning"
    :sent-today="sentToday"
    :next-action-label="runState.nextActionLabel"
    :next-action-countdown="nextActionCountdown"
    :x="store.panelPosition.x"
    :y="store.panelPosition.y"
    @select-campaign="selectCampaign"
    @create-campaign="createNewCampaign"
    @update-daily-limit="updateDailyLimit"
    @update-connection-note="updateConnectionNote"
    @append-prospects="appendProspects"
    @remove-prospect="removeProspect"
    @open-prospect="openProspect"
    @start-campaign="startCampaign"
    @stop-campaign="stopCampaign"
    @move-panel="movePanel"
  />
</template>
