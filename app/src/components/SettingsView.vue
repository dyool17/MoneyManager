<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useNav } from '../stores/nav'
import ConnectionPanel from './ConnectionPanel.vue'
import AccountMetadataView from './AccountMetadataView.vue'
import AiSettings from './AiSettings.vue'
import PendingChanges from './PendingChanges.vue'
import { applyTheme, savedTheme, type Theme } from '../composables/theme'

type Tab = 'phone' | 'accounts' | 'ai' | 'appearance'
const TABS: { id: Tab; label: string }[] = [
  { id: 'phone', label: 'Phone and backups' },
  { id: 'accounts', label: 'Accounts' },
  { id: 'ai', label: 'Assistant' },
  { id: 'appearance', label: 'Appearance' },
]
const nav = useNav()
const tab = ref<Tab>('phone')
watch(() => nav.section, (s) => { if (TABS.some((t) => t.id === s)) tab.value = s as Tab }, { immediate: true })

const theme = ref<Theme>(savedTheme())
const themeLabel = computed(() => ({ system: 'Follow the system', light: 'Light', dark: 'Dark' })[theme.value])
watch(theme, (t) => applyTheme(t, true))
</script>


<template>
  <section class="settings">
    <h1>Settings</h1>
    <div class="seg" role="tablist" aria-label="Settings sections">
      <button v-for="t in TABS" :key="t.id" type="button" role="tab" :aria-selected="tab === t.id" @click="tab = t.id">{{ t.label }}</button>
    </div>

    <div v-if="tab === 'phone'" class="stack">
      <PendingChanges />
      <div class="card"><ConnectionPanel @connected="nav.go('today')" /></div>
    </div>
    <div v-else-if="tab === 'accounts'" class="card"><AccountMetadataView /></div>
    <div v-else-if="tab === 'ai'" class="card">
      <h2>Assistant</h2>
      <p class="muted">The assistant explains your reports and answers questions. Figures always come from the app's own calculations, and nothing on the phone changes without your confirmation.</p>
      <AiSettings />
    </div>
    <div v-else class="card">
      <h2>Appearance</h2>
      <fieldset class="themes">
        <legend class="muted">Theme · {{ themeLabel }}</legend>
        <label v-for="t in (['system', 'light', 'dark'] as const)" :key="t">
          <input v-model="theme" type="radio" name="theme" :value="t" />
          {{ { system: 'Follow the system', light: 'Light', dark: 'Dark' }[t] }}
        </label>
      </fieldset>
    </div>
  </section>
</template>

<style scoped>
.settings { display: grid; gap: 1.1rem; max-width: 980px; }
h1 { margin: 0; font-size: 1.9rem; }
.seg { justify-self: start; flex-wrap: wrap; }
.stack { display: grid; gap: 1rem; }
h2 { margin: 0 0 0.4rem; font-size: 1.05rem; }
.card > .muted { margin: 0 0 1rem; }
.themes { border: 0; padding: 0; margin: 0; display: flex; flex-wrap: wrap; gap: 0.6rem; }
.themes legend { margin-bottom: 0.6rem; }
.themes label { display: inline-flex; align-items: center; gap: 0.5rem; padding: 0.6rem 0.9rem; border: 1px solid var(--rule); border-radius: 10px; cursor: pointer; }
.themes label:has(input:checked) { border-color: var(--accent); background: var(--accent-soft); }
</style>
