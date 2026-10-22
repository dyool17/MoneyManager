<script setup lang="ts">
import { nextTick, onMounted, ref, watch } from 'vue'
import Icon from './Icon.vue'
import { useChat } from '../stores/chat'
import { useNav } from '../stores/nav'
import { renderMarkdown } from '../domain/markdown'
import { t } from '../i18n'

const chat = useChat()
const nav = useNav()
const draft = ref('')
const log = ref<HTMLElement | null>(null)
const input = ref<HTMLTextAreaElement | null>(null)

const SUGGESTIONS = [
  'What are my three biggest risks right now?',
  'Where can I save 10% without touching fixed bills?',
  'Am I on track to end this month with money left over?',
  'Build me a realistic monthly budget from my history.',
]

/** Translate display-only lookup connectors; tool and field identifiers stay intact. */
function lookupLabel(source: string) {
  return t(source)
    .replace(/\bfrom (\d{4}-\d{2}-\d{2})/g, (_, date: string) => t('from {date}', { date }))
    .replace(/\bto (\d{4}-\d{2}-\d{2})/g, (_, date: string) => t('to {date}', { date }))
    .replace(/\bby /g, () => t(' by ').trimStart())
}

async function send(text = draft.value) {
  if (!text.trim() || chat.sending) return
  // Clear right away so the box is free while the answer arrives; put the
  // question back only if it failed and nothing new was typed.
  if (text === draft.value) draft.value = ''
  const ok = await chat.send(text, nav.focus)
  if (!ok && !draft.value) draft.value = text
}
function onKey(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
}

// A question asked from a button elsewhere arrives here.
watch(() => nav.pending, (q) => {
  if (!q) return
  nav.pending = null
  if (chat.ready) send(q)
  else draft.value = q
}, { immediate: true })
watch(() => [chat.messages.length, chat.sending], async () => {
  await nextTick()
  log.value?.scrollTo({ top: log.value.scrollHeight, behavior: 'smooth' })
})
onMounted(() => { chat.refreshStatus(); input.value?.focus() })
</script>

<template>
  <aside class="ask" :aria-label="t('Ask about your money')">
    <header>
      <strong><Icon name="sparkle" :size="16" /> {{ t('Ask') }}</strong>
      <div class="actions">
        <button type="button" class="ghost" :disabled="!chat.messages.length || chat.sending" @click="chat.reset()">{{ t('New chat') }}</button>
        <button type="button" class="ghost" :aria-label="t('Close the Ask panel')" @click="nav.askOpen = false"><Icon name="close" :size="16" /></button>
      </div>
    </header>

    <p v-if="nav.focus" class="focus">
      <span>{{ t('Looking at:') }} <b>{{ nav.focus }}</b></span>
      <button type="button" :aria-label="t('Stop focusing on this')" @click="nav.focus = null"><Icon name="close" :size="12" /></button>
    </p>

    <div v-if="!chat.ready" class="setup">
      <p>{{ t(chat.missing || 'Set up an assistant to ask about your money.') }}</p>
      <button type="button" class="primary" @click="nav.go('settings', 'ai')">{{ t('Set up in Settings') }}</button>
    </div>

    <div ref="log" class="log" aria-live="polite">
      <div v-if="!chat.messages.length && chat.ready" class="empty">
        <p class="muted">{{ t('Ask anything about your money. The assistant reads the same reports you see and can look up specific movements.') }}</p>
        <button v-for="s in SUGGESTIONS" :key="s" type="button" :disabled="chat.sending" @click="send(t(s))">{{ t(s) }}</button>
      </div>
      <div v-for="(m, i) in chat.messages" :key="i" :class="['msg', m.role]">
        <div v-if="m.role === 'assistant'" class="answer">
          <details v-if="m.lookups?.length" class="lookups">
            <summary><Icon name="search" :size="12" /> {{ m.lookups.length === 1 ? t('Looked up {n} query', { n: m.lookups.length }) : t('Looked up {n} queries', { n: m.lookups.length }) }}</summary>
            <ul><li v-for="(l, j) in m.lookups" :key="j">{{ lookupLabel(l) }}</li></ul>
          </details>
          <div class="bubble md" v-html="renderMarkdown(m.content)" />
        </div>
        <div v-else class="bubble">{{ m.content }}</div>
      </div>
      <div v-if="chat.sending" class="msg assistant">
        <div class="bubble typing"><i /><i /><i /><span v-if="chat.lookingUp" class="lookup-now">{{ t('Looking up {query}', { query: lookupLabel(chat.lookingUp) }) }}</span></div>
      </div>
    </div>

    <p v-if="chat.error" class="error" role="alert">{{ t(chat.error) }}</p>

    <form class="composer" @submit.prevent="send()">
      <textarea ref="input" v-model="draft" rows="2" :placeholder="nav.focus ? t('Ask about {focus}…', { focus: nav.focus }) : t('Ask about your money…')" :disabled="!chat.available" @keydown="onKey" />
      <button type="submit" class="primary" :disabled="!chat.ready || chat.sending || !draft.trim()">{{ t('Send') }}</button>
    </form>
    <p class="foot muted">{{ t('Reads totals and categories; shop names only if you allow it in Settings.') }}</p>
  </aside>
</template>

<style scoped>
.ask { display: flex; flex-direction: column; gap: 0.75rem; background: var(--paper); border-radius: 16px; padding: 1rem 1rem 0.8rem; height: calc(100vh - 2.8rem); position: sticky; top: 1.4rem; min-width: 0; }
header { display: flex; justify-content: space-between; align-items: center; }
header strong { display: inline-flex; align-items: center; gap: 0.45rem; color: var(--accent-ink); }
header strong :deep(svg) { color: var(--accent); }
.actions { display: flex; gap: 0.35rem; }
.ghost { border-color: transparent; background: transparent; display: inline-flex; align-items: center; padding: 0.3rem 0.55rem; font-size: 0.85rem; color: var(--ink-soft); }
.ghost:hover:not(:disabled) { background: var(--hover); color: var(--ink); border-color: transparent; }
.focus { display: flex; justify-content: space-between; align-items: center; gap: 0.5rem; margin: 0; padding: 0.45rem 0.65rem; border-radius: 9px; background: var(--mist); font-size: 0.82rem; color: var(--ink-soft); }
.focus b { color: var(--ink); font-weight: 600; }
.focus button { border: 0; background: transparent; padding: 0.2rem; display: inline-flex; color: var(--ink-soft); }
.setup { display: grid; gap: 0.6rem; padding: 0.9rem; border-radius: 12px; background: var(--warn-bg); color: var(--warn-ink); font-size: 0.9rem; }
.setup p { margin: 0; }
.setup button { justify-self: start; }
.log { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 0.7rem; padding: 0.1rem; }
.empty { display: grid; gap: 0.45rem; }
.empty p { margin: 0 0 0.3rem; font-size: 0.9rem; }
.empty button { text-align: left; border-radius: 10px; padding: 0.55rem 0.75rem; font-size: 0.88rem; }
.empty button:hover:not(:disabled) { border-color: var(--accent); color: var(--accent-ink); }
.msg { display: flex; }
.msg.user { justify-content: flex-end; }
.bubble { max-width: 88%; padding: 0.65rem 0.85rem; border-radius: 14px; line-height: 1.55; font-size: 0.93rem; white-space: pre-wrap; overflow-wrap: anywhere; animation: pop 0.2s ease both; }
.user .bubble { background: var(--accent); color: #fff; border-bottom-right-radius: 4px; }
.assistant .bubble { background: var(--mist); border-bottom-left-radius: 4px; }
.md { white-space: normal; }
.md :deep(p) { margin: 0 0 0.5rem; }
.md :deep(p:last-child) { margin-bottom: 0; }
.md :deep(ul), .md :deep(ol) { margin: 0.2rem 0 0.5rem; padding-left: 1.15rem; }
.md :deep(h4) { margin: 0.5rem 0 0.25rem; font-size: 0.93rem; }
.md :deep(code) { background: var(--paper); padding: 0 0.3rem; border-radius: 4px; }
.answer { display: grid; gap: 0.3rem; max-width: 92%; }
.answer .bubble { max-width: 100%; }
.lookups { font-size: 0.78rem; color: var(--ink-soft); }
.lookups summary { cursor: pointer; width: fit-content; display: inline-flex; align-items: center; gap: 0.3rem; }
.lookups ul { margin: 0.3rem 0 0; padding-left: 1.1rem; }
.lookup-now { margin-left: 0.5rem; font-size: 0.78rem; color: var(--ink-soft); }
.typing { display: inline-flex; align-items: center; gap: 4px; padding: 0.8rem 0.9rem; }
.typing i { width: 7px; height: 7px; border-radius: 50%; background: var(--ink-soft); animation: blink 1.2s infinite ease-in-out; }
.typing i:nth-child(2) { animation-delay: 0.15s; } .typing i:nth-child(3) { animation-delay: 0.3s; }
.error { margin: 0; padding: 0.55rem 0.75rem; border-radius: 9px; background: var(--warn-bg); color: var(--warn-ink); font-size: 0.88rem; }
.composer { display: flex; gap: 0.5rem; align-items: flex-end; }
.composer textarea { flex: 1; resize: none; min-height: 2.8rem; border-radius: 12px; padding: 0.6rem 0.75rem; }
.composer button { height: 2.8rem; padding: 0 1rem; border-radius: 12px; }
.foot { margin: 0; font-size: 0.75rem; }
@keyframes pop { from { opacity: 0; transform: translateY(4px); } }
@keyframes blink { 0%, 80%, 100% { opacity: 0.25; } 40% { opacity: 1; } }
@media (max-width: 1100px) { .ask { position: static; height: 80vh; } }
</style>
