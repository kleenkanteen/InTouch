<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import CampaignPanel from './CampaignPanel.vue';
import {
  createCampaign,
  getCampaignStore,
  getRunState,
  normalizeCampaignName,
  setCampaignStore,
} from '@/lib/storage';
import type { CampaignStore, Prospect, RunState } from '@/lib/types';
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
});
const todayPstKey = computed(() => getPstDateKey());
const sentToday = computed(() => runState.value.dailySentCountByPstDate[todayPstKey.value] || 0);
let persistQueue: Promise<void> = Promise.resolve();
let isPersistingStore = false;

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
  store.value = await getCampaignStore();
  runState.value = await getRunState();
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
  const [activeTab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (!activeTab?.id) {
    window.alert('Unable to determine current tab');
    return;
  }

  const message: RuntimeMessage = {
    type: 'START_CAMPAIGN',
    campaignId,
    tabId: activeTab.id,
  };

  await browser.runtime.sendMessage(message);
  runState.value = {
    ...runState.value,
    isRunning: true,
    campaignId,
  };
}

async function stopCampaign() {
  await browser.runtime.sendMessage({ type: 'STOP_CAMPAIGN' } satisfies RuntimeMessage);
  await refresh();
}

async function openProspect(prospect: Prospect) {
  if (!prospect.profileUrl) return;
  const [activeTab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (!activeTab?.id) return;
  await browser.tabs.update(activeTab.id, { url: prospect.profileUrl });
}

onMounted(async () => {
  await refresh();
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
</script>

<template>
  <CampaignPanel
    :campaigns="store.campaigns"
    :active-campaign-id="store.activeCampaignId"
    :is-running="runState.isRunning"
    :sent-today="sentToday"
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
