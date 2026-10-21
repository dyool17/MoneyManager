<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import Icon from './Icon.vue'
import { SCREENS, useNav, type Screen } from '../stores/nav'
import { useChat } from '../stores/chat'

/** Ctrl+K: jump to a screen, or ask the assistant whatever was typed. */
const nav = useNav()
const chat = useChat()
const text = ref('')
const open = ref(false)
const active = ref(0)
const input = ref<HTMLInputElement | null>(null)

type Option = { kind: 'go'; screen: Screen; label: string; hint: string } | { kind: 'ask'; label: string }
const options = computed<Option[]>(() => {
  const q = text.value.trim().toLowerCase()
  const screens: Option[] = SCREENS
    .filter((s) => !q || s.label.toLowerCase().includes(q) || s.hint.toLowerCase().includes(q))
    .map((s) => ({ kind: 'go', screen: s.id, label: `Go to ${s.label}`, hint: s.hint }))
  return q && chat.ready ? [{ kind: 'ask', label: text.value.trim() }, ...screens] : screens
})

function choose(o: Option | undefined) {
  if (!o) return
  if (o.kind === 'go') nav.go(o.screen)
  else nav.ask(o.label)
  text.value = ''
  open.value = false
  input.value?.blur()
}
function onKey(e: KeyboardEvent) {
  if (e.key === 'ArrowDown') { e.preventDefault(); active.value = Math.min(active.value + 1, options.value.length - 1) }
  else if (e.key === 'ArrowUp') { e.preventDefault(); active.value = Math.max(active.value - 1, 0) }
  else if (e.key === 'Enter') { e.preventDefault(); choose(options.value[active.value]) }
  else if (e.key === 'Escape') { open.value = false; input.value?.blur() }
  else active.value = 0
}
function shortcut(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); input.value?.focus() }
}
onMounted(() => window.addEventListener('keydown', shortcut))
onBeforeUnmount(() => window.removeEventListener('keydown', shortcut))
</script>

<template>
  <div class="bar">
    <label>
      <Icon :name="chat.ready ? 'sparkle' : 'search'" />
      <span class="sr">Search or ask</span>
      <input
        ref="input" v-model="text" type="text" role="combobox" autocomplete="off"
        :aria-expanded="open" aria-controls="askbar-options"
        :placeholder="chat.ready ? 'Ask about your money, or jump to a screen…' : 'Jump to a screen…'"
        @focus="open = true" @blur="open = false" @input="open = true" @keydown="onKey"
      />
      <kbd>Ctrl K</kbd>
    </label>
    <ul v-if="open && options.length" id="askbar-options" role="listbox">
      <li v-for="(o, i) in options" :key="o.label" role="option" :aria-selected="i === active">
        <button type="button" tabindex="-1" @mousedown.prevent="choose(o)" @mouseenter="active = i">
          <Icon :name="o.kind === 'ask' ? 'sparkle' : 'arrow'" :size="15" />
          <span v-if="o.kind === 'ask'">Ask: <b>{{ o.label }}</b></span>
          <span v-else>{{ o.label }} <small>{{ o.hint }}</small></span>
        </button>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.bar { position: relative; flex: 1 1 360px; }
label { display: flex; align-items: center; gap: 0.6rem; min-height: 2.9rem; padding: 0 0.9rem; border-radius: 12px; background: var(--paper); border: 1px solid var(--rule); color: var(--accent); }
label:focus-within { border-color: var(--accent); }
input { flex: 1; border: 0; outline: 0; background: transparent; padding: 0; color: var(--ink); min-width: 0; }
kbd { font: 500 0.72rem inherit; font-family: inherit; color: var(--ink-soft); border: 1px solid var(--rule); border-radius: 6px; padding: 0.1rem 0.4rem; }
.sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
ul { position: absolute; z-index: 20; top: calc(100% + 6px); left: 0; right: 0; margin: 0; padding: 0.35rem; list-style: none; background: var(--paper); border: 1px solid var(--rule); border-radius: 12px; box-shadow: 0 12px 32px rgb(17 19 24 / 0.12); }
li button { width: 100%; display: flex; align-items: center; gap: 0.6rem; text-align: left; border: 0; background: transparent; padding: 0.55rem 0.65rem; border-radius: 8px; color: var(--ink); }
li button :deep(svg) { color: var(--ink-soft); flex: none; }
li[aria-selected='true'] button { background: var(--accent-soft); }
li[aria-selected='true'] button :deep(svg) { color: var(--accent); }
small { color: var(--ink-soft); margin-left: 0.4rem; }
</style>
