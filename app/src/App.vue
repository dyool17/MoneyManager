<script setup lang="ts">
import { onMounted } from 'vue'
import { t } from './i18n'
import { useSession } from './stores/session'
import { useChat } from './stores/chat'
import { SCREENS, useNav, type Screen } from './stores/nav'
import { applyTheme } from './composables/theme'
import Icon, { type IconName } from './components/Icon.vue'
import StatusBanner from './components/StatusBanner.vue'
import AskBar from './components/AskBar.vue'
import AskPanel from './components/AskPanel.vue'
import TodayView from './components/TodayView.vue'
import MoneyView from './components/MoneyView.vue'
import SpendingView from './components/SpendingView.vue'
import AnalysisView from './components/AnalysisView.vue'
import SettingsView from './components/SettingsView.vue'
import HelpView from './components/HelpView.vue'
import MilestonesView from './components/MilestonesView.vue'

const session = useSession()
const chat = useChat()
const nav = useNav()

const MAIN = SCREENS.filter((s) => s.id !== 'settings' && s.id !== 'help')
const ICON: Record<Screen, IconName> = { today: 'today', money: 'money', spending: 'spending', analysis: 'analysis', milestones: 'milestones', settings: 'settings', help: 'help' }

onMounted(() => {
  applyTheme()
  session.connect('demo')
  chat.refreshStatus()
})
</script>

<template>
  <div :class="['shell', { asking: nav.askOpen }]">
    <nav class="rail" :aria-label="t('Main')">
      <div class="brand">
        <span class="logo"><Icon name="logo" :size="16" /></span>
        <div class="book">
          <select
            v-if="(session.init?.books.length ?? 0) > 1"
            :aria-label="t('Book')"
            :value="session.bookId"
            :disabled="session.status === 'loading'"
            @change="session.setBook(($event.target as HTMLSelectElement).value)"
          >
            <option v-for="b in session.init?.books" :key="b.id" :value="b.id">{{ b.name }}</option>
          </select>
          <strong v-else>{{ session.init?.currentBook.name ?? 'Money Manager' }}</strong>
        </div>
      </div>

      <button v-for="s in MAIN" :key="s.id" type="button" class="nav" :aria-current="nav.screen === s.id ? 'page' : undefined" @click="nav.go(s.id)">
        <Icon :name="ICON[s.id]" />{{ t(s.label) }}
      </button>
      <button v-if="chat.ready" type="button" class="nav" :aria-pressed="nav.askOpen" @click="nav.askOpen = !nav.askOpen">
        <Icon name="sparkle" />{{ t('Ask') }}
      </button>

      <div class="spacer" />
      <button type="button" class="nav" :aria-current="nav.screen === 'settings' ? 'page' : undefined" @click="nav.go('settings')"><Icon name="settings" />{{ t('Settings') }}</button>
      <button type="button" class="nav" :aria-current="nav.screen === 'help' ? 'page' : undefined" @click="nav.go('help')"><Icon name="help" />{{ t('Help') }}</button>

      <button type="button" class="status" @click="nav.go('settings', 'phone')">
        <span :class="['dot', session.source === 'phone' ? 'live' : 'demo']" />
        <span>
          {{ session.source === 'phone' ? t('Phone connected') : t('Demo data') }}
          <small>{{ session.source === 'phone' ? (session.backupState === 'done' ? t('Backup saved') : session.address) : t('Connect your phone') }}</small>
        </span>
      </button>
    </nav>

    <main>
      <div class="top">
        <AskBar />
      </div>
      <StatusBanner />
      <HelpView v-if="nav.screen === 'help'" />
      <SettingsView v-else-if="nav.screen === 'settings' || !session.init" />
      <template v-else>
        <TodayView v-if="nav.screen === 'today'" />
        <MoneyView v-else-if="nav.screen === 'money'" />
        <SpendingView v-else-if="nav.screen === 'spending'" />
        <AnalysisView v-else-if="nav.screen === 'analysis'" />
        <MilestonesView v-else-if="nav.screen === 'milestones'" />
      </template>
    </main>

    <AskPanel v-if="nav.askOpen" class="panel" />
  </div>
</template>

<style scoped>
.shell { display: grid; grid-template-columns: 232px minmax(0, 1fr); min-height: 100vh; }
.shell.asking { grid-template-columns: 232px minmax(0, 1fr) minmax(320px, 380px); }
.rail { display: flex; flex-direction: column; gap: 0.2rem; padding: 1.4rem 1rem; position: sticky; top: 0; height: 100vh; }
.brand { display: flex; align-items: center; gap: 0.65rem; padding: 0.2rem 0.75rem 1.4rem; }
.logo { width: 30px; height: 30px; flex: none; border-radius: 9px; background: var(--ink); color: var(--paper); display: inline-flex; align-items: center; justify-content: center; }
.book { min-width: 0; }
.book strong { font-size: 0.98rem; }
.book select { font-weight: 600; max-width: 100%; padding: 0.2rem 0.4rem; }
.nav { display: flex; align-items: center; gap: 0.75rem; border: 0; background: transparent; padding: 0.62rem 0.75rem; border-radius: 10px; color: var(--ink-soft); font-weight: 500; text-align: left; }
.nav:hover { background: var(--hover); color: var(--ink); }
.nav[aria-current='page'], .nav[aria-pressed='true'] { background: var(--paper); color: var(--ink); box-shadow: 0 1px 2px rgb(17 19 24 / 0.06); }
.nav[aria-pressed='true'] :deep(svg), .nav:last-of-type:hover :deep(svg) { color: var(--accent); }
.spacer { flex: 1; }
.status { margin-top: 0.7rem; display: flex; align-items: center; gap: 0.6rem; text-align: left; border: 0; border-radius: 10px; background: var(--paper); padding: 0.7rem 0.8rem; font-size: 0.8rem; }
.status small { display: block; color: var(--ink-soft); overflow: hidden; text-overflow: ellipsis; max-width: 150px; white-space: nowrap; }
.dot { width: 8px; height: 8px; border-radius: 50%; flex: none; }
.dot.live { background: var(--income); }
.dot.demo { background: var(--neutral-mark); }
main { padding: 1.4rem 2rem 3rem 0.5rem; min-width: 0; display: flex; flex-direction: column; gap: 1.25rem; }
.shell.asking main { padding-right: 1rem; }
.top { display: flex; flex-wrap: wrap; gap: 0.75rem; align-items: center; }
.panel { margin: 1.4rem 1.4rem 1.4rem 0; }
@media (max-width: 1100px) {
  .shell.asking { grid-template-columns: 232px minmax(0, 1fr); }
  .shell.asking .panel { grid-column: 2; margin: 0 1rem 2rem 0.5rem; }
}
@media (max-width: 760px) {
  .shell, .shell.asking { grid-template-columns: 1fr; }
  .rail { position: static; height: auto; flex-direction: row; flex-wrap: wrap; padding: 0.8rem; }
  .brand { width: 100%; padding-bottom: 0.6rem; }
  .spacer, .status { display: none; }
  main { padding: 1rem; }
  .shell.asking .panel { grid-column: 1; margin: 0 1rem 1rem; }
}
</style>
