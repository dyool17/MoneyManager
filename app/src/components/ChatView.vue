<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useChat, DEFAULT_BASE_URL } from '../stores/chat'
import { useHistory } from '../stores/history'
import { renderMarkdown } from '../domain/markdown'
import { EFFORTS, type AiProvider } from '../infrastructure/ai'

const chat = useChat()
const history = useHistory()
const draft = ref('')
const keyDraft = ref('')
const showSettings = ref(false)
const showContext = ref(false)
const log = ref<HTMLElement | null>(null)

const PROVIDERS: { id: AiProvider; label: string; hint: string; placeholder: string; models: string[] }[] = [
  { id: 'claude-cli', label: 'Claude subscription', hint: 'Uses the Claude Code app on this computer, signed in with your Claude plan.', placeholder: 'Default (for example sonnet or opus)', models: ['sonnet', 'opus', 'haiku'] },
  { id: 'codex-cli', label: 'ChatGPT subscription', hint: 'Uses the Codex CLI on this computer, signed in with your ChatGPT plan.', placeholder: 'Default (from your Codex settings)', models: [] },
  { id: 'openai-compatible', label: 'API key (OpenCode Go)', hint: 'Any OpenAI-compatible endpoint. OpenCode Go is the default; billing follows that service.', placeholder: 'Required, for example glm-5.3-flash', models: ['glm-5.3-flash', 'kimi-k2'] },
]
const current = computed(() => PROVIDERS.find((p) => p.id === chat.settings.provider)!)
const ready = computed(() => {
  const s = chat.status
  if (!s) return false
  if (chat.settings.provider === 'claude-cli') return !!s.claude
  if (chat.settings.provider === 'codex-cli') return !!s.codex
  return s.hasKey && !!chat.settings.models['openai-compatible']
})
const missing = computed(() => {
  const s = chat.status
  if (!s) return ''
  if (chat.settings.provider === 'claude-cli' && !s.claude) return 'Claude Code was not found. Install it and run `claude` once to sign in.'
  if (chat.settings.provider === 'codex-cli' && !s.codex) return 'Codex CLI was not found. Install it and run `codex login` to sign in.'
  if (chat.settings.provider === 'openai-compatible' && !s.hasKey) return 'Add your API key in the settings.'
  if (chat.settings.provider === 'openai-compatible' && !chat.settings.models['openai-compatible']) return 'Choose a model in the settings.'
  return ''
})

const SUGGESTIONS = [
  'What are my three biggest risks right now?',
  'Where can I save 10% without touching fixed bills?',
  'How did my spending change in the last three months?',
  'Am I on track to end this month with money left over?',
  'What are my financial strengths?',
  'Build me a realistic monthly budget from my history.',
]

async function send(text = draft.value) {
  const ok = await chat.send(text)
  if (ok) draft.value = ''
  else if (!draft.value) draft.value = text
}
function onKey(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
}
async function saveKey() {
  await chat.saveKey(keyDraft.value || null)
  keyDraft.value = ''
}
watch(() => [chat.messages.length, chat.sending], async () => {
  await nextTick()
  log.value?.scrollTo({ top: log.value.scrollHeight, behavior: 'smooth' })
})
onMounted(() => {
  chat.refreshStatus()
  if (history.state === 'idle') history.fromSession(12)
})
</script>

<template>
  <section class="chat">
    <header class="top">
      <div>
        <h1>Ask AI</h1>
        <p class="sub">Talk about your reports. {{ current.label }}<template v-if="chat.settings.models[chat.settings.provider]"> · {{ chat.settings.models[chat.settings.provider] }}</template><template v-if="chat.settings.efforts[chat.settings.provider]"> · {{ chat.settings.efforts[chat.settings.provider] }} effort</template></p>
      </div>
      <div class="actions">
        <button class="ghost" :disabled="!chat.messages.length" @click="chat.reset()">New chat</button>
        <button class="ghost" :aria-expanded="showSettings" @click="showSettings = !showSettings">Settings</button>
      </div>
    </header>

    <p v-if="!chat.available" class="notice">The assistant runs in the desktop app. This browser preview cannot reach it.</p>

    <div v-if="showSettings" class="card settings">
      <fieldset>
        <legend>Provider</legend>
        <label v-for="p in PROVIDERS" :key="p.id" :class="['provider', { on: chat.settings.provider === p.id }]">
          <input v-model="chat.settings.provider" type="radio" :value="p.id" />
          <span><b>{{ p.label }}</b><small>{{ p.hint }}</small></span>
          <em v-if="chat.status" :class="(p.id === 'claude-cli' ? chat.status.claude : p.id === 'codex-cli' ? chat.status.codex : chat.status.hasKey) ? 'ok' : 'no'">
            {{ (p.id === 'claude-cli' ? chat.status.claude : p.id === 'codex-cli' ? chat.status.codex : chat.status.hasKey) ? (p.id === 'openai-compatible' ? 'Key saved' : 'Found') : (p.id === 'openai-compatible' ? 'No key' : 'Not found') }}
          </em>
        </label>
      </fieldset>
      <div class="row2">
        <label class="field">Model
          <input v-model.trim="chat.settings.models[chat.settings.provider]" :placeholder="current.placeholder" spellcheck="false" list="model-hints" />
          <datalist id="model-hints">
            <option v-for="m in current.models" :key="m" :value="m" />
          </datalist>
        </label>
        <label class="field">Effort
          <select v-model="chat.settings.efforts[chat.settings.provider]">
            <option value="">Default</option>
            <option v-for="e in EFFORTS[chat.settings.provider]" :key="e" :value="e">{{ e }}</option>
          </select>
        </label>
      </div>
      <small v-if="chat.settings.provider === 'openai-compatible' && chat.settings.efforts['openai-compatible']" class="muted">Some models reject the effort setting. Choose Default if you get an error.</small>
      <template v-if="chat.settings.provider === 'openai-compatible'">
        <label class="field">Base URL
          <input v-model.trim="chat.settings.baseUrl" :placeholder="DEFAULT_BASE_URL" spellcheck="false" />
        </label>
        <form class="field key" @submit.prevent="saveKey">
          <span>API key <small>Stored on this computer only, readable by your user. The app never shows it again.</small></span>
          <div>
            <input v-model="keyDraft" type="password" autocomplete="off" :placeholder="chat.status?.hasKey ? '•••••••• saved' : 'Paste your key'" />
            <button type="submit" class="primary" :disabled="!keyDraft">Save</button>
            <button v-if="chat.status?.hasKey" type="button" @click="chat.saveKey(null)">Remove</button>
          </div>
        </form>
      </template>
      <label class="check">
        <input v-model="chat.settings.includeDetails" type="checkbox" />
        Share transaction descriptions (shop names, notes). Off: only totals, categories and dates are sent.
      </label>
    </div>

    <div ref="log" class="log" aria-live="polite">
      <div v-if="!chat.messages.length" class="empty">
        <p>Ask anything about your money. The assistant reads the same reports you see in Insights.</p>
        <div class="suggestions">
          <button v-for="s in SUGGESTIONS" :key="s" :disabled="!ready || chat.sending" @click="send(s)">{{ s }}</button>
        </div>
      </div>
      <div v-for="(m, i) in chat.messages" :key="i" :class="['msg', m.role]">
        <div v-if="m.role === 'assistant'" class="bubble md" v-html="renderMarkdown(m.content)" />
        <div v-else class="bubble">{{ m.content }}</div>
      </div>
      <div v-if="chat.sending" class="msg assistant"><div class="bubble typing"><i /><i /><i /></div></div>
    </div>

    <p v-if="chat.error" class="error" role="alert">{{ chat.error }}</p>
    <p v-else-if="missing" class="notice">{{ missing }}</p>

    <form class="composer" @submit.prevent="send()">
      <textarea v-model="draft" rows="2" placeholder="Ask about your spending, savings, risks…" :disabled="!chat.available" @keydown="onKey" />
      <button type="submit" class="primary" :disabled="!ready || chat.sending || !draft.trim()">Send</button>
    </form>

    <details class="shared" :open="showContext" @toggle="showContext = ($event.target as HTMLDetailsElement).open">
      <summary>What is shared with the assistant</summary>
      <p class="muted">Only this text and your messages are sent{{ chat.settings.provider === 'openai-compatible' ? ' to the endpoint above' : ` through ${current.label}` }}. Nothing else leaves this computer.</p>
      <pre v-if="showContext">{{ chat.context || 'Reports are still loading.' }}</pre>
    </details>
  </section>
</template>

<style scoped>
.chat { display: grid; gap: 1rem; max-width: 900px; }
.top { display: flex; justify-content: space-between; align-items: flex-end; gap: 1rem; flex-wrap: wrap; }
h1 { margin: 0; font-size: 1.6rem; letter-spacing: -0.02em; }
.sub { margin: 0.2rem 0 0; color: var(--ink-soft); }
.actions { display: flex; gap: 0.5rem; }
.ghost { border: 1px solid var(--rule); border-radius: 8px; }
.card { background: var(--paper); border: 1px solid var(--rule); border-radius: 12px; padding: 1.1rem 1.3rem; }
.settings { display: grid; gap: 0.9rem; }
fieldset { border: 0; padding: 0; margin: 0; display: grid; gap: 0.5rem; }
legend { font-weight: 600; margin-bottom: 0.4rem; }
.provider { display: grid; grid-template-columns: auto 1fr auto; gap: 0.7rem; align-items: center; padding: 0.6rem 0.8rem; border: 1px solid var(--rule); border-radius: 10px; cursor: pointer; }
.provider.on { border-color: var(--accent); background: color-mix(in oklab, var(--accent) 8%, var(--paper)); }
.provider span { display: grid; }
.provider small { color: var(--ink-soft); }
.provider em { font-style: normal; font-size: 0.78rem; padding: 0.1rem 0.5rem; border-radius: 99px; }
.provider em.ok { color: var(--income); background: color-mix(in oklab, var(--income) 14%, var(--paper)); }
.provider em.no { color: var(--ink-soft); background: var(--mist); }
.field { display: grid; gap: 0.3rem; font-weight: 600; }
.field input, .field select { font-weight: 400; }
.row2 { display: grid; grid-template-columns: 2fr 1fr; gap: 0.8rem; }
.field small { display: block; font-weight: 400; color: var(--ink-soft); font-size: 0.8rem; }
.key div { display: flex; gap: 0.5rem; }
.key input { flex: 1; }
.check { display: flex; gap: 0.5rem; align-items: flex-start; font-size: 0.9rem; }
.log { min-height: 18rem; max-height: 60vh; overflow-y: auto; display: grid; gap: 0.8rem; align-content: start; padding: 0.25rem; }
.empty p { color: var(--ink-soft); margin: 0 0 0.8rem; }
.suggestions { display: grid; grid-template-columns: repeat(2, 1fr); gap: 0.5rem; }
.suggestions button { text-align: left; border-radius: 10px; padding: 0.65rem 0.8rem; background: var(--paper); }
.suggestions button:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); }
.msg { display: flex; }
.msg.user { justify-content: flex-end; }
.bubble { max-width: 82%; padding: 0.7rem 0.95rem; border-radius: 14px; line-height: 1.55; white-space: pre-wrap; overflow-wrap: anywhere; animation: pop 0.2s ease both; }
.user .bubble { background: var(--accent); color: #fff; border-bottom-right-radius: 4px; }
.assistant .bubble { background: var(--paper); border: 1px solid var(--rule); border-bottom-left-radius: 4px; }
.md { white-space: normal; }
.md :deep(p) { margin: 0 0 0.55rem; }
.md :deep(p:last-child) { margin-bottom: 0; }
.md :deep(ul), .md :deep(ol) { margin: 0.2rem 0 0.6rem; padding-left: 1.2rem; }
.md :deep(h4) { margin: 0.6rem 0 0.3rem; font-size: 0.95rem; }
.md :deep(code) { background: var(--mist); padding: 0 0.3rem; border-radius: 4px; }
.typing { display: inline-flex; gap: 4px; padding: 0.9rem 1rem; }
.typing i { width: 7px; height: 7px; border-radius: 50%; background: var(--ink-soft); animation: blink 1.2s infinite ease-in-out; }
.typing i:nth-child(2) { animation-delay: 0.15s; } .typing i:nth-child(3) { animation-delay: 0.3s; }
.composer { display: flex; gap: 0.6rem; align-items: flex-end; }
.composer textarea { flex: 1; font: inherit; color: inherit; background: var(--paper); border: 1px solid var(--rule); resize: vertical; min-height: 3rem; border-radius: 10px; padding: 0.6rem 0.75rem; }
.composer button { height: 3rem; padding: 0 1.3rem; border-radius: 10px; }
.notice { margin: 0; padding: 0.6rem 0.85rem; border-radius: 8px; background: var(--mist); color: var(--ink-soft); }
.error { margin: 0; padding: 0.6rem 0.85rem; border-radius: 8px; background: var(--warn-bg); color: var(--warn-ink); }
.shared summary { cursor: pointer; color: var(--accent); font-size: 0.9rem; }
.shared pre { max-height: 22rem; overflow: auto; background: var(--paper); border: 1px solid var(--rule); border-radius: 8px; padding: 0.8rem; font-size: 0.78rem; white-space: pre-wrap; }
.muted { color: var(--ink-soft); font-size: 0.86rem; }
@keyframes pop { from { opacity: 0; transform: translateY(4px); } }
@keyframes blink { 0%, 80%, 100% { opacity: 0.25; } 40% { opacity: 1; } }
@media (max-width: 720px) { .suggestions { grid-template-columns: 1fr; } .bubble { max-width: 92%; } }
</style>
