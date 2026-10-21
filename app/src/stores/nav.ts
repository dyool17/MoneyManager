import { defineStore } from 'pinia'
import { ref } from 'vue'

export type Screen = 'today' | 'money' | 'spending' | 'analysis' | 'settings' | 'help'

export const SCREENS: { id: Screen; label: string; hint: string }[] = [
  { id: 'today', label: 'Today', hint: 'How this month is going' },
  { id: 'money', label: 'Money', hint: 'Net worth, accounts and cards' },
  { id: 'spending', label: 'Spending', hint: 'Movements, categories and budgets' },
  { id: 'analysis', label: 'Analysis', hint: 'Health, risks, opportunities and patterns' },
  { id: 'settings', label: 'Settings', hint: 'Phone, accounts, AI and backups' },
  { id: 'help', label: 'Help', hint: 'How the app works' },
]

/** Which screen is open, and the Ask panel that follows the user across screens. */
export const useNav = defineStore('nav', () => {
  const screen = ref<Screen>('today')
  /** Optional section inside a screen, for example the Settings tab to open. */
  const section = ref<string | null>(null)
  const askOpen = ref(false)
  /** What the user is looking at, so the assistant can answer in context. */
  const focus = ref<string | null>('Today screen (how this month is going)')
  /** A question waiting for the Ask panel to send it. */
  const pending = ref<string | null>(null)

  function go(to: Screen, sectionId: string | null = null) {
    screen.value = to
    section.value = sectionId
    // The assistant follows the user: a new screen becomes what it answers about.
    const s = SCREENS.find((x) => x.id === to)
    if (s && to !== 'settings' && to !== 'help') focus.value = `${s.label} screen (${s.hint.toLowerCase()})`
  }

  /** Opens the Ask panel; with a question, sends it about the given focus. */
  function ask(question?: string, about?: string) {
    if (about !== undefined) focus.value = about
    if (question) pending.value = question
    askOpen.value = true
  }

  return { screen, section, askOpen, focus, pending, go, ask }
})
