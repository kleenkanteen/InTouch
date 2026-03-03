<script setup lang="ts">
import { computed, ref } from 'vue';
import { importCsvRows, parseCsv } from '@/lib/csv';
import type { Campaign, CsvMapping, DuplicateRecord } from '@/lib/types';
import DuplicatePopup from './DuplicatePopup.vue';

const props = defineProps<{ campaign: Campaign }>();
const emit = defineEmits<{ appendProspects: [prospects: Campaign['prospects']]; }>();

const csvText = ref('');
const headers = ref<string[]>([]);
const hasParsed = ref(false);
const mapping = ref<CsvMapping>({ fullName: '0', profileUrl: '1', company: '2', jobTitle: '3' });
const summary = ref('');
const duplicates = ref<DuplicateRecord[]>([]);
const isImporting = ref(false);

const hasHeaders = computed(() => headers.value.length > 0);

async function onFileChange(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  csvText.value = await file.text();
  const parsed = parseCsv(csvText.value);
  headers.value = parsed.headers;
  hasParsed.value = true;
  summary.value = `${parsed.rows.length} rows loaded`;
}

async function importMappedCsv() {
  isImporting.value = true;
  const parsed = parseCsv(csvText.value);
  await new Promise((resolve) => setTimeout(resolve, 250));
  const result = importCsvRows(parsed, mapping.value, props.campaign);

  emit('appendProspects', result.imported);

  duplicates.value = result.duplicates;
  summary.value = `Imported ${result.imported.length} rows, ${result.invalidRows.length} invalid rows`;
  isImporting.value = false;
}
</script>

<template>
  <div class="tab">
    <label class="upload">
      <span>Upload CSV</span>
      <input type="file" accept=".csv,text/csv" @change="onFileChange" />
    </label>

    <div v-if="hasParsed && hasHeaders" class="map-grid">
      <label>
        Full Name
        <select v-model="mapping.fullName">
          <option v-for="(header, index) in headers" :key="header + index" :value="String(index)">{{ header }}</option>
        </select>
      </label>
      <label>
        Profile URL
        <select v-model="mapping.profileUrl">
          <option v-for="(header, index) in headers" :key="header + index + 'p'" :value="String(index)">{{ header }}</option>
        </select>
      </label>
      <label>
        Company
        <select v-model="mapping.company">
          <option v-for="(header, index) in headers" :key="header + index + 'c'" :value="String(index)">{{ header }}</option>
        </select>
      </label>
      <label>
        Job Title
        <select v-model="mapping.jobTitle">
          <option v-for="(header, index) in headers" :key="header + index + 'j'" :value="String(index)">{{ header }}</option>
        </select>
      </label>
      <button class="import" @click="importMappedCsv">Import</button>
    </div>

    <p class="summary">{{ summary }}</p>
    <p v-if="isImporting" class="loading">Loading people into the campaign...</p>

    <DuplicatePopup v-if="duplicates.length" :duplicates="duplicates" @close="duplicates = []" />
  </div>
</template>

<style scoped>
.tab { display: grid; gap: 10px; }
.upload {
  border: 1px dashed #9ca3af;
  border-radius: 8px;
  padding: 10px;
  font-size: 13px;
  display: grid;
  gap: 8px;
}
.map-grid { display: grid; gap: 8px; }
label { display: grid; gap: 4px; font-size: 12px; }
select, input {
  border: 1px solid #d1d5db;
  border-radius: 8px;
  padding: 8px;
}
.import {
  border: 0;
  border-radius: 8px;
  background: #0a66c2;
  color: white;
  padding: 8px;
  cursor: pointer;
}
.summary { margin: 0; color: #4b5563; font-size: 12px; }
</style>
