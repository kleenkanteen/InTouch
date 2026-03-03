<script setup lang="ts">
import type { DuplicateRecord } from '@/lib/types';

defineProps<{ duplicates: DuplicateRecord[] }>();
const emit = defineEmits<{ close: [] }>();
</script>

<template>
  <div class="overlay">
    <div class="popup">
      <h3>{{ duplicates.length }} duplicates detected</h3>
      <ul>
        <li v-for="duplicate in duplicates" :key="`${duplicate.profileUrl}-${duplicate.sourceRowNumber}`">
          <span>{{ duplicate.fullName || duplicate.profileUrl }}</span>
          <small>{{ duplicate.profileUrl }}</small>
        </li>
      </ul>
      <button @click="emit('close')">Close</button>
    </div>
  </div>
</template>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
}
.popup {
  width: 360px;
  max-height: 420px;
  overflow: auto;
  background: white;
  border-radius: 10px;
  padding: 14px;
}
h3 { margin: 0 0 10px; font-size: 15px; }
ul { list-style: none; padding: 0; margin: 0; }
li { border-bottom: 1px solid #edf0f5; padding: 8px 0; display: grid; }
small { color: #6b7280; font-size: 11px; }
button {
  width: 100%;
  margin-top: 10px;
  border: 0;
  background: #0a66c2;
  color: white;
  border-radius: 8px;
  padding: 8px;
  cursor: pointer;
}
</style>
