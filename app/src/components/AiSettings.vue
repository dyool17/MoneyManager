<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { t } from '../i18n'
import { useChat, DEFAULT_BASE_URL } from '../stores/chat'
import { EFFORTS, type AiProvider } from '../infrastructure/ai'

const chat = useChat()
const keyDraft = ref('')

const PROVIDERS: { id: AiProvider; label: string; hint: string; placeholder: string; models: string[] }[] = [
  { id: 'claude-cli', label: 'Claude subscription', hint: 'Uses the Claude Code app on this computer, signed in with your Claude plan.', placeholder: 'Default (for example sonnet or opus)', models: ['sonnet', 'opus', 'haiku'] },
  { id: 'codex-cli', label: 'ChatGPT subscription', hint: 'Uses the Codex CLI on this computer, signed in with your ChatGPT plan.', placeholder: 'Default (from your Codex settings)', models: [] },
  { id: 'openai-compatible', label: 'API key (OpenCode Go)', hint: 'Any OpenAI-compatible endpoint. OpenCode Go is the default; billing follows that service.', placeholder: 'Required, for example minimax-m3.1-flash-free', models: ['minimax-m3.1-flash-free', 'glm-5.3-flash', 'kimi-k2'] },
]
const current = computed(() => PROVIDERS.find((p) => p.id === chat.settings.provider)!)
const found = (id: AiProvider) => (id === 'claude-cli' ? chat.status?.claude : id === 'codex-cli' ? chat.status?.codex : chat.status?.hasKey)
const showContext = ref(false)

async function saveKey() {
  await chat.saveKey(keyDraft.value || null)
  keyDraft.value = ''
}
onMounted(() => chat.refreshStatus())
</script>

<template>
  <div class="ai-settings">
    <p v-if="chat.missing" class="notice">{{ t(chat.missing) }}</p>
    <fieldset>
      <legend>{{ t('Provider') }}</legend>
      <label v-for="p in PROVIDERS" :key="p.id" :class="['provider', { on: chat.settings.provider === p.id }]">
        <input v-model="chat.settings.provider" type="radio" :value="p.id" />
        <span><b>{{ t(p.label) }}</b><small>{{ t(p.hint) }}</small></span>
        <em v-if="chat.status" :class="found(p.id) ? 'ok' : 'no'">
          {{ found(p.id) ? (p.id === 'openai-compatible' ? t('Key saved') : t('Found')) : (p.id === 'openai-compatible' ? t('No key') : t('Not found')) }}
        </em>
      </label>
    </fieldset>
    <div class="row2">
      <label class="field">{{ t('Model') }}
        <input v-model.trim="chat.settings.models[chat.settings.provider]" :placeholder="t(current.placeholder)" spellcheck="false" list="model-hints" />
        <datalist id="model-hints">
          <option v-for="m in current.models" :key="m" :value="m" />
        </datalist>
      </label>
      <label class="field">{{ t('Effort') }}
        <select v-model="chat.settings.efforts[chat.settings.provider]">
          <option value="">{{ t('Default') }}</option>
          <option v-for="e in EFFORTS[chat.settings.provider]" :key="e" :value="e">{{ t(e) }}</option>
        </select>
      </label>
    </div>
    <small v-if="chat.settings.provider === 'openai-compatible' && chat.settings.efforts['openai-compatible']" class="muted">{{ t('Some models reject the effort setting. Choose Default if you get an error.') }}</small>
    <template v-if="chat.settings.provider === 'openai-compatible'">
      <label class="field">{{ t('Base URL') }}
        <input v-model.trim="chat.settings.baseUrl" :placeholder="DEFAULT_BASE_URL" spellcheck="false" />
      </label>
      <form class="field key" @submit.prevent="saveKey">
        <span>{{ t('API key') }} <small>{{ t('Stored on this computer only, readable by your user. The app never shows it again.') }}</small></span>
        <div>
          <input v-model="keyDraft" type="password" autocomplete="off" :placeholder="chat.status?.hasKey ? t('•••••••• saved') : t('Paste your key')" />
          <button type="submit" class="primary" :disabled="!keyDraft">{{ t('Save') }}</button>
          <button v-if="chat.status?.hasKey" type="button" @click="chat.saveKey(null)">{{ t('Remove') }}</button>
        </div>
      </form>
    </template>
    <label class="check">
      <input v-model="chat.settings.includeDetails" type="checkbox" />
      {{ t('Share transaction descriptions (shop names, notes). Off: only totals, categories and dates are sent.') }}
    </label>
    <details class="shared" :open="showContext" @toggle="showContext = ($event.target as HTMLDetailsElement).open">
      <summary>{{ t('What is shared with the assistant') }}</summary>
      <p class="muted">{{ chat.settings.provider === 'openai-compatible' ? t('Only this text, your questions and the data the assistant looks up are sent to the endpoint above. Nothing else leaves this computer.') : t('Only this text, your questions and the data the assistant looks up are sent through {provider}. Nothing else leaves this computer.', { provider: t(current.label) }) }}</p>
      <pre v-if="showContext">{{ chat.context || t('Reports are still loading.') }}</pre>
    </details>
  </div>
</template>

<style scoped>
.ai-settings { display: grid; gap: 0.9rem; }
fieldset { border: 0; padding: 0; margin: 0; display: grid; gap: 0.5rem; }
legend { font-weight: 600; margin-bottom: 0.4rem; }
.provider { display: grid; grid-template-columns: auto 1fr auto; gap: 0.7rem; align-items: center; padding: 0.7rem 0.9rem; border: 1px solid var(--rule); border-radius: 12px; cursor: pointer; }
.provider.on { border-color: var(--accent); background: var(--accent-soft); }
.provider span { display: grid; }
.provider small { color: var(--ink-soft); }
.provider em { font-style: normal; font-size: 0.78rem; font-weight: 600; padding: 0.1rem 0.55rem; border-radius: 99px; }
.provider em.ok { color: var(--income); background: color-mix(in oklab, var(--income) 14%, var(--paper)); }
.provider em.no { color: var(--ink-soft); background: var(--mist); }
.field { display: grid; gap: 0.3rem; font-weight: 600; }
.field input, .field select { font-weight: 400; }
.row2 { display: grid; grid-template-columns: 2fr 1fr; gap: 0.8rem; }
.field small { display: block; font-weight: 400; color: var(--ink-soft); font-size: 0.8rem; }
.key div { display: flex; gap: 0.5rem; }
.key input { flex: 1; }
.check { display: flex; gap: 0.5rem; align-items: flex-start; font-size: 0.9rem; }
.notice { margin: 0; padding: 0.6rem 0.85rem; border-radius: 9px; background: var(--warn-bg); color: var(--warn-ink); }
.shared summary { cursor: pointer; color: var(--accent); font-size: 0.9rem; }
.shared pre { max-height: 22rem; overflow: auto; background: var(--mist); border-radius: 9px; padding: 0.8rem; font-size: 0.78rem; white-space: pre-wrap; }
@media (max-width: 720px) { .row2 { grid-template-columns: 1fr; } }
</style>
