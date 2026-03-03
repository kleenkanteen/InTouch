<script setup lang="ts">
import { exportCampaignPeopleCsv } from '@/lib/csv-export';
import type { Campaign, Prospect } from '@/lib/types';
import ProspectRow from './ProspectRow.vue';

const props = defineProps<{ campaign: Campaign }>();
const emit = defineEmits<{
  open: [prospect: Prospect];
  remove: [prospect: Prospect];
}>();

function exportCsv() {
  const out = exportCampaignPeopleCsv(props.campaign);
  const blob = new Blob([out.content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = out.filename;
  a.click();
  URL.revokeObjectURL(url);
}
</script>

<template>
  <div class="tab">
    <button class="export" @click="exportCsv">Export CSV</button>

    <div class="list">
      <ProspectRow
        v-for="prospect in campaign.prospects"
        :key="prospect.id"
        :prospect="prospect"
        :show-status="true"
        @open="emit('open', $event)"
        @remove="emit('remove', $event)"
      />
      <p v-if="!campaign.prospects.length" class="empty">No people in this campaign.</p>
    </div>
  </div>
</template>

<style scoped>
.tab { display: grid; gap: 8px; }
.export {
  border: 1px solid #0a66c2;
  border-radius: 8px;
  background: #fff;
  color: #0a66c2;
  padding: 8px;
  cursor: pointer;
}
.list {
  max-height: 260px;
  overflow: auto;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
}
.empty { margin: 0; color: #6b7280; font-size: 12px; padding: 8px; }
</style>
