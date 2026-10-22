<script setup lang="ts">
import Icon from './Icon.vue'
import { t } from '../i18n'
import { useChat } from '../stores/chat'
import { useNav } from '../stores/nav'

/**
 * Asks the assistant about something on screen. Hidden when the assistant is
 * not set up, so the app reads the same without AI.
 */
const props = defineProps<{ question: string; about?: string; compact?: boolean }>()
const chat = useChat()
const nav = useNav()
</script>

<template>
  <button v-if="chat.ready" type="button" :class="['ai-btn', { compact }]" @click="nav.ask(props.question, props.about)">
    <Icon name="sparkle" :size="14" />
    <slot>{{ t('Explain') }}</slot>
  </button>
</template>

<style scoped>
.ai-btn { display: inline-flex; align-items: center; gap: 0.35rem; min-height: 2.25rem; padding: 0 0.85rem; border-radius: 9px; border: 1px solid var(--accent-line); background: var(--accent-soft); color: var(--accent-ink); font-size: 0.87rem; font-weight: 500; white-space: nowrap; }
.ai-btn:hover { border-color: var(--accent); }
.ai-btn.compact { min-height: 1.9rem; padding: 0 0.6rem; font-size: 0.8rem; }
</style>
