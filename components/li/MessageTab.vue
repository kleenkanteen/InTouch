<script setup lang="ts">
import { computed } from 'vue';
import type { Campaign, Prospect } from '@/lib/types';
import ProspectRow from './ProspectRow.vue';

const props = defineProps<{
  campaign: Campaign;
  isRunning: boolean;
  sentToday: number;
  nextActionLabel?: string | null;
  nextActionCountdown?: number | null;
}>();
const emit = defineEmits<{
  updateLimit: [value: number];
  updateNote: [value: string];
  start: [];
  stop: [];
  open: [prospect: Prospect];
}>();

const remainingToday = computed(() =>
  Math.max(0, (props.campaign.dailyLimit || 0) - (props.sentToday || 0)),
);

const sessionProspects = computed(() =>
  props.campaign.prospects
    .filter((prospect) => prospect.status === 'Prospect')
    .slice(0, remainingToday.value),
);
</script>

<template>
  <div class="tab">
    <label>
      Daily limit (PST)
      <input
        type="number"
        min="1"
        :value="campaign.dailyLimit"
        @input="emit('updateLimit', Number(($event.target as HTMLInputElement).value || 0))"
      />
    </label>

    <label>
      Connection note (persisted)
      <textarea
        :value="campaign.connectionNote"
        rows="4"
        maxlength="280"
        placeholder="Write the note that gets attached to each connection request"
        @input="emit('updateNote', ($event.target as HTMLTextAreaElement).value)"
      />
    </label>

    <div class="list">
      <p class="quota">
        {{ remainingToday }} of {{ campaign.dailyLimit }} left to send today (PST).
      </p>
      <ProspectRow
        v-for="prospect in sessionProspects"
        :key="prospect.id"
        :prospect="prospect"
        @open="emit('open', $event)"
      />
      <p v-if="!sessionProspects.length" class="empty">No prospects ready in this session.</p>
    </div>

    <button class="start" v-if="!isRunning" :disabled="!sessionProspects.length" @click="emit('start')">Start Campaign</button>
    <button class="stop" v-else @click="emit('stop')">Stop Campaign</button>
    <p v-if="isRunning && nextActionCountdown !== null" class="countdown">
      Next action in {{ nextActionCountdown }}s<span v-if="nextActionLabel">: {{ nextActionLabel }}</span>
    </p>
  </div>
</template>

<style scoped>
.tab { display: grid; gap: 8px; }
label { font-size: 12px; color: #374151; display: grid; gap: 6px; }
input, textarea {
  border: 1px solid #d1d5db;
  border-radius: 8px;
  padding: 8px;
  font-size: 13px;
}
.list {
  max-height: 190px;
  overflow: auto;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
}
.quota { margin: 0; padding: 8px; font-size: 12px; color: #4b5563; border-bottom: 1px solid #edf0f5; }
.start, .stop {
  border: 0;
  border-radius: 8px;
  padding: 10px;
  color: white;
  cursor: pointer;
}
.start { background: #0a66c2; }
.stop { background: #b42318; }
.start:disabled { background: #93c5fd; cursor: not-allowed; }
.countdown {
  margin: 0;
  font-size: 12px;
  color: #1f2937;
  background: #f3f4f6;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 8px;
}
.empty { color: #6b7280; font-size: 12px; padding: 8px; margin: 0; }
</style>
