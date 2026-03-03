<script setup lang="ts">
import type { Campaign } from '@/lib/types';

defineProps<{ campaigns: Campaign[]; activeCampaignId: string | null }>();

const emit = defineEmits<{
  select: [campaignId: string];
}>();
</script>

<template>
  <div class="campaign-list">
    <button
      v-for="campaign in campaigns"
      :key="campaign.id"
      class="campaign"
      :class="{ active: campaign.id === activeCampaignId }"
      @click="emit('select', campaign.id)"
    >
      {{ campaign.name }}
    </button>
    <p v-if="!campaigns.length" class="empty">No campaigns yet.</p>
  </div>
</template>

<style scoped>
.campaign-list {
  min-height: 150px;
  max-height: 220px;
  overflow: auto;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 8px;
  background: #f8fafc;
}
.campaign {
  display: block;
  width: 100%;
  text-align: left;
  border: 1px solid #dbe3ef;
  background: #fff;
  padding: 8px;
  border-radius: 7px;
  margin-bottom: 8px;
  font-size: 13px;
  cursor: pointer;
}
.campaign.active { border-color: #0a66c2; background: #eef6ff; }
.empty { color: #6b7280; font-size: 12px; margin: 4px 0; }
</style>
