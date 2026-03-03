<script setup lang="ts">
import { computed, ref } from 'vue';
import type { Campaign, Prospect } from '@/lib/types';
import CampaignList from './CampaignList.vue';
import CampaignTabs from './CampaignTabs.vue';
import CreateCampaignForm from './CreateCampaignForm.vue';
import MessageTab from './MessageTab.vue';
import PeopleTab from './PeopleTab.vue';
import UploadTab from './UploadTab.vue';

const props = defineProps<{
  campaigns: Campaign[];
  activeCampaignId: string | null;
  isRunning: boolean;
  sentToday: number;
  x: number;
  y: number;
}>();

const emit = defineEmits<{
  selectCampaign: [campaignId: string];
  createCampaign: [name: string];
  updateDailyLimit: [payload: { campaignId: string; value: number }];
  updateConnectionNote: [payload: { campaignId: string; value: string }];
  appendProspects: [payload: { campaignId: string; prospects: Prospect[] }];
  removeProspect: [payload: { campaignId: string; prospectId: string }];
  openProspect: [prospect: Prospect];
  startCampaign: [campaignId: string];
  stopCampaign: [];
  movePanel: [x: number, y: number];
}>();

const selectedTab = ref<'Message' | 'Upload' | 'People'>('Message');
const dragging = ref(false);
let offsetX = 0;
let offsetY = 0;

function onDragStart(event: PointerEvent) {
  dragging.value = true;
  offsetX = event.clientX - props.x;
  offsetY = event.clientY - props.y;
  (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
}

function onDragMove(event: PointerEvent) {
  if (!dragging.value) return;
  const x = Math.max(0, event.clientX - offsetX);
  const y = Math.max(0, event.clientY - offsetY);
  emit('movePanel', x, y);
}

function onDragEnd() {
  dragging.value = false;
}

const activeCampaign = computed(() =>
  props.campaigns.find((campaign) => campaign.id === props.activeCampaignId) ?? null,
);
</script>

<template>
  <div class="panel" :style="{ left: `${x}px`, top: `${y}px` }">
    <h3
      class="drag-handle"
      @pointerdown="onDragStart"
      @pointermove="onDragMove"
      @pointerup="onDragEnd"
    >
      LinkedIn Campaigns
    </h3>
    <CampaignList
      :campaigns="campaigns"
      :active-campaign-id="activeCampaignId"
      @select="emit('selectCampaign', $event)"
    />
    <CreateCampaignForm @create="emit('createCampaign', $event)" />

    <div v-if="activeCampaign" class="campaign-area">
      <CampaignTabs v-model="selectedTab" />

      <MessageTab
        v-if="selectedTab === 'Message'"
        :campaign="activeCampaign"
        :is-running="isRunning"
        :sent-today="sentToday"
        @update-limit="emit('updateDailyLimit', { campaignId: activeCampaign.id, value: $event })"
        @update-note="emit('updateConnectionNote', { campaignId: activeCampaign.id, value: $event })"
        @open="emit('openProspect', $event)"
        @start="emit('startCampaign', activeCampaign.id)"
        @stop="emit('stopCampaign')"
      />

      <UploadTab
        v-if="selectedTab === 'Upload'"
        :campaign="activeCampaign"
        @append-prospects="emit('appendProspects', { campaignId: activeCampaign.id, prospects: $event })"
      />

      <PeopleTab
        v-if="selectedTab === 'People'"
        :campaign="activeCampaign"
        @open="emit('openProspect', $event)"
        @remove="emit('removeProspect', { campaignId: activeCampaign.id, prospectId: $event.id })"
      />
    </div>
  </div>
</template>

<style scoped>
.panel {
  position: fixed;
  left: 24px;
  top: 30px;
  width: 390px;
  max-height: 80vh;
  overflow: auto;
  z-index: 2147483646;
  background: white;
  border: 1px solid #d9e1ed;
  border-radius: 12px;
  box-shadow: 0 12px 28px rgba(2, 6, 23, 0.15);
  padding: 12px;
  font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}
h3 { margin: 0 0 8px; font-size: 16px; color: #0f172a; }
.drag-handle { cursor: move; user-select: none; }
.campaign-area { margin-top: 10px; border-top: 1px solid #edf0f5; padding-top: 10px; }
</style>
