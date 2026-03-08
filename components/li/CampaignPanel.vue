<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
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
  nextActionLabel: string | null;
  nextActionCountdown: number | null;
  x: number;
  y: number;
}>();

const emit = defineEmits<{
  selectCampaign: [campaignId: string];
  createCampaign: [name: string];
  renameCampaign: [payload: { campaignId: string; name: string }];
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
let startX = 0;
let startY = 0;
let dragEnabled = false;

const DRAG_THRESHOLD_PX = 6;
const DRAG_HOLD_MS = 120;
let dragStartTimer: number | null = null;

function onWindowMouseMove(event: MouseEvent) {
  if (!dragging.value || !dragEnabled) return;
  const movedDistance = Math.hypot(event.clientX - startX, event.clientY - startY);
  if (movedDistance < DRAG_THRESHOLD_PX) return;
  const x = Math.max(0, event.clientX - offsetX);
  const y = Math.max(0, event.clientY - offsetY);
  emit('movePanel', x, y);
}

function onWindowMouseUp() {
  if (dragStartTimer !== null) {
    window.clearTimeout(dragStartTimer);
    dragStartTimer = null;
  }
  dragging.value = false;
  dragEnabled = false;
  window.removeEventListener('mousemove', onWindowMouseMove);
  window.removeEventListener('mouseup', onWindowMouseUp);
}

function onDragStart(event: MouseEvent) {
  if (event.button !== 0) return;
  dragging.value = true;
  dragEnabled = false;
  startX = event.clientX;
  startY = event.clientY;
  offsetX = event.clientX - props.x;
  offsetY = event.clientY - props.y;
  dragStartTimer = window.setTimeout(() => {
    dragEnabled = true;
  }, DRAG_HOLD_MS);
  window.addEventListener('mousemove', onWindowMouseMove);
  window.addEventListener('mouseup', onWindowMouseUp);
}

onBeforeUnmount(() => {
  if (dragStartTimer !== null) {
    window.clearTimeout(dragStartTimer);
  }
  window.removeEventListener('mousemove', onWindowMouseMove);
  window.removeEventListener('mouseup', onWindowMouseUp);
});

const activeCampaign = computed(() =>
  props.campaigns.find((campaign) => campaign.id === props.activeCampaignId) ?? null,
);
const campaignNameDraft = ref('');

watch(
  activeCampaign,
  (campaign) => {
    campaignNameDraft.value = campaign?.name ?? '';
  },
  { immediate: true },
);

function submitRename() {
  const campaign = activeCampaign.value;
  const trimmed = campaignNameDraft.value.trim();
  if (!campaign || !trimmed || trimmed === campaign.name) return;
  emit('renameCampaign', { campaignId: campaign.id, name: trimmed });
}
</script>

<template>
  <div class="panel" :style="{ left: `${x}px`, top: `${y}px` }">
    <h3
      class="drag-handle"
      @mousedown="onDragStart"
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
      <div class="campaign-name-editor">
        <input
          v-model="campaignNameDraft"
          type="text"
          placeholder="Campaign name"
          @keydown.enter.prevent="submitRename"
        />
        <button @click="submitRename">Rename</button>
      </div>

      <CampaignTabs v-model="selectedTab" />

      <MessageTab
        v-if="selectedTab === 'Message'"
        :campaign="activeCampaign"
        :is-running="isRunning"
        :sent-today="sentToday"
        :next-action-label="nextActionLabel"
        :next-action-countdown="nextActionCountdown"
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
.campaign-name-editor {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 8px;
  margin-bottom: 10px;
}
.campaign-name-editor input {
  min-width: 0;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  padding: 8px;
  font-size: 13px;
}
.campaign-name-editor button {
  border: 0;
  background: #0f172a;
  color: white;
  border-radius: 8px;
  padding: 8px 10px;
  font-size: 12px;
  cursor: pointer;
}
</style>
