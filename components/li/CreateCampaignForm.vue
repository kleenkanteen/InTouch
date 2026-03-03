<script setup lang="ts">
import { ref } from 'vue';

const emit = defineEmits<{
  create: [name: string];
}>();

const name = ref('');

function submit() {
  const trimmed = name.value.trim();
  if (!trimmed) return;
  emit('create', trimmed);
  name.value = '';
}
</script>

<template>
  <div class="create">
    <input v-model="name" type="text" placeholder="Campaign name" @keydown.enter.prevent="submit" />
    <button @click="submit">Create Campaign</button>
  </div>
</template>

<style scoped>
.create {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 8px;
  margin-top: 10px;
}
input {
  border: 1px solid #d1d5db;
  border-radius: 8px;
  padding: 8px;
  font-size: 13px;
}
button {
  border: 0;
  background: #0a66c2;
  color: white;
  border-radius: 8px;
  padding: 8px 10px;
  font-size: 12px;
  cursor: pointer;
}
</style>
