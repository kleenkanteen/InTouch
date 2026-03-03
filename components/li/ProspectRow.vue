<script setup lang="ts">
import type { Prospect } from '@/lib/types';
import StatusBadge from './StatusBadge.vue';

defineProps<{ prospect: Prospect; showStatus?: boolean }>();

const emit = defineEmits<{
  open: [prospect: Prospect];
  remove: [prospect: Prospect];
}>();
</script>

<template>
  <div class="row">
    <button class="open" @click="emit('open', prospect)">
      <div class="name-line">
        <span class="name">{{ prospect.fullName }}</span>
        <StatusBadge v-if="showStatus" :status="prospect.status" />
      </div>
      <div class="meta">{{ prospect.jobTitle || 'Unknown Role' }} · {{ prospect.company || 'Unknown Company' }}</div>
    </button>
    <button v-if="showStatus" class="remove" @click="emit('remove', prospect)">Delete</button>
  </div>
</template>

<style scoped>
.row {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 8px;
  align-items: center;
  padding: 8px;
  border-bottom: 1px solid #edf0f5;
}
.open {
  text-align: left;
  border: 0;
  background: transparent;
  cursor: pointer;
  padding: 0;
}
.name-line {
  display: flex;
  align-items: center;
  gap: 8px;
}
.name { color: #111827; font-weight: 600; font-size: 13px; }
.meta { color: #6b7280; font-size: 12px; margin-top: 2px; }
.remove {
  font-size: 11px;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  background: #fff;
  color: #b42318;
  padding: 4px 8px;
  cursor: pointer;
}
</style>
