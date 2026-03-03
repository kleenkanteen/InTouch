<script setup lang="ts">
import { ref } from 'vue';

const props = defineProps<{ x: number; y: number }>();
const emit = defineEmits<{ click: []; move: [x: number, y: number] }>();

const dragging = ref(false);
const moved = ref(false);
let offsetX = 0;
let offsetY = 0;
let startX = 0;
let startY = 0;

const DRAG_THRESHOLD_PX = 6;

function onPointerDown(event: PointerEvent) {
  dragging.value = true;
  moved.value = false;
  startX = event.clientX;
  startY = event.clientY;
  offsetX = event.clientX - props.x;
  offsetY = event.clientY - props.y;
  (event.target as HTMLElement).setPointerCapture(event.pointerId);
}

function onPointerMove(event: PointerEvent) {
  if (!dragging.value) return;
  const movedDistance = Math.hypot(event.clientX - startX, event.clientY - startY);
  if (movedDistance > DRAG_THRESHOLD_PX) {
    moved.value = true;
  }
  if (!moved.value) return;
  const x = Math.max(0, event.clientX - offsetX);
  const y = Math.max(0, event.clientY - offsetY);
  emit('move', x, y);
}

function onPointerUp() {
  if (!moved.value) {
    emit('click');
  }
  dragging.value = false;
  moved.value = false;
}
</script>

<template>
  <button
    class="launcher"
    :style="{ left: `${x}px`, top: `${y}px` }"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
  >
    LI
  </button>
</template>

<style scoped>
.launcher {
  position: fixed !important;
  width: 52px;
  height: 52px;
  border-radius: 999px;
  border: 0;
  background: #0a66c2;
  color: white;
  font-size: 16px;
  font-weight: 700;
  cursor: grab;
  z-index: 2147483647 !important;
  pointer-events: auto;
  box-shadow: 0 10px 24px rgba(10, 102, 194, 0.35);
}
.launcher:active { cursor: grabbing; }
</style>
