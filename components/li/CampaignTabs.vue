<script setup lang="ts">
const props = defineProps<{ modelValue: 'Message' | 'Upload' | 'People' }>();
const emit = defineEmits<{ 'update:modelValue': [tab: 'Message' | 'Upload' | 'People'] }>();

const tabs: Array<'Message' | 'Upload' | 'People'> = ['Message', 'Upload', 'People'];
</script>

<template>
  <div class="tabs">
    <button
      v-for="tab in tabs"
      :key="tab"
      :class="{ active: tab === props.modelValue }"
      @click="emit('update:modelValue', tab)"
    >
      {{ tab }}
    </button>
  </div>
</template>

<style scoped>
.tabs {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
  margin-bottom: 8px;
}
button {
  border: 1px solid #d7dde8;
  background: #f7f9fc;
  border-radius: 8px;
  padding: 7px 8px;
  font-size: 12px;
  cursor: pointer;
}
button.active { background: #0a66c2; color: #fff; border-color: #0a66c2; }
</style>
