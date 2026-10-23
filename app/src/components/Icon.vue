<script setup lang="ts">
/** 24px stroke icons drawn inline, so the app needs no icon font. */
const PATHS = {
  sparkle: 'M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8zM19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z',
  milestones: 'M5 3v18M5 4h14l-3 4 3 4H5M9 17h10M9 21h6',
  today: 'M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16zM12 8v4l3 2',
  money: 'M3 6h18v13H3zM3 10h18',
  spending: 'M4 7h16M4 12h10M4 17h6',
  analysis: 'M5 19v-8M12 19V5M19 19v-6',
  settings: 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1',
  help: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.5M12 17h.01',
  search: 'M11 5a6 6 0 1 0 0 12 6 6 0 0 0 0-12zM20 20l-4-4',
  close: 'M6 6l12 12M18 6L6 18',
  plus: 'M12 5v14M5 12h14',
  arrow: 'M5 12h14M13 6l6 6-6 6',
  logo: 'M4 17l5-5 4 4 7-8',
  phone: 'M8 3h8v18H8zM11 18h2',
  expand: 'M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7',
} as const
export type IconName = keyof typeof PATHS
defineProps<{ name: IconName; size?: number }>()
</script>

<template>
  <svg :width="size ?? 18" :height="size ?? 18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path :d="PATHS[name]" />
  </svg>
</template>
