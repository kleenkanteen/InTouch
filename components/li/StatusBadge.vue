<script setup lang="ts">
import { computed } from 'vue';
import type { ProspectStatus } from '@/lib/types';

const props = defineProps<{ status: ProspectStatus }>();

const className = computed(() => {
  switch (props.status) {
    case 'Sent Request':
      return 'sent';
    case 'Already connected':
      return 'connected';
    case 'Invalid Profile':
      return 'invalid';
    default:
      return 'prospect';
  }
});

const displayStatus = computed(() => {
  if (props.status === 'Sent Request') {
    return 'Request Sent';
  }
  return props.status;
});
</script>

<template>
  <span class="status" :class="className">{{ displayStatus }}</span>
</template>

<style scoped>
.status {
  font-size: 11px;
  border-radius: 999px;
  padding: 2px 8px;
  border: 1px solid transparent;
}
.prospect { background: #edf2ff; color: #2a4fa8; border-color: #d4e0ff; }
.sent { background: #e9f8ee; color: #0f6b34; border-color: #bee9cf; }
.connected { background: #fff4e6; color: #a15c00; border-color: #ffd9ad; }
.invalid { background: #feecec; color: #8a1f1f; border-color: #f7c2c2; }
</style>
