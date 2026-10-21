import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import { aiAvailable, aiChat, aiSetKey, aiStatus, type AiMessage, type AiProvider, type AiStatus } from '../infrastructure/ai'
import { buildContext, systemPrompt } from '../domain/ai-context'
import { earliestDate, extractQueries, MAX_ROUNDS, QUERY_GUIDE, runQuery } from '../domain/ai-queries'
import { useHistory } from './history'
import { useSession } from './session'
import { useAccountMetadata } from './metadata'
import { useLiquid } from '../composables/liquid'

const SETTINGS_KEY = 'mm.chatSettings'
export const DEFAULT_BASE_URL = 'https://opencode.ai/zen/go/v1'

export interface ChatSettings {
  provider: AiProvider
  models: Record<AiProvider, string>
  efforts: Record<AiProvider, string>
  baseUrl: string
  includeDetails: boolean
}

const defaults = (): ChatSettings => ({
  provider: 'claude-cli',
  models: { 'claude-cli': '', 'codex-cli': '', 'openai-compatible': '' },
  efforts: { 'claude-cli': '', 'codex-cli': '', 'openai-compatible': '' },
  baseUrl: DEFAULT_BASE_URL,
  includeDetails: false,
})

function readSettings(): ChatSettings {
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}')
    const d = defaults()
    return { ...d, ...saved, models: { ...d.models, ...(saved.models ?? {}) }, efforts: { ...d.efforts, ...(saved.efforts ?? {}) } }
  } catch {
    return defaults()
  }
}

/** A visible message; `lookups` lists the data queries the assistant ran for it. */
export interface ChatMessage extends AiMessage { lookups?: string[] }
/** How far back a lookup may load from the phone. */
const MAX_MONTHS_BACK = 24

/** The conversation lives in memory only; settings (never the API key) are remembered. */
export const useChat = defineStore('chat', () => {
  const settings = ref<ChatSettings>(readSettings())
  watch(settings, (v) => { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(v)) } catch { /* private mode */ } }, { deep: true })
  const status = ref<AiStatus | null>(null)
  const messages = ref<ChatMessage[]>([])
  const lookingUp = ref<string | null>(null)
  const sending = ref(false)
  const error = ref<string | null>(null)
  const available = aiAvailable()

  const history = useHistory()
  const session = useSession()
  const metadata = useAccountMetadata()
  const { liquid } = useLiquid()

  const context = computed(() => {
    if (history.state !== 'ready') return ''
    const debts = metadata.totals.debts ?? session.dashboard?.debts ?? null
    const first = (() => {
      const [y, m] = history.span.last.split('-').map(Number)
      const d = new Date(y, m - 12, 1)
      const start = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
      return start < history.span.first ? history.span.first : start
    })()
    return buildContext({
      movements: history.movements, first, last: history.span.last,
      currency: metadata.state.baseCurrency, liquid: session.assets.length ? liquid.value : null, debts,
      budgets: history.budgets, includeDetails: settings.value.includeDetails,
    })
  })

  async function refreshStatus() {
    if (!available) return
    try { status.value = await aiStatus() } catch (e) { error.value = String(e) }
  }

  async function saveKey(key: string | null) {
    await aiSetKey(key)
    await refreshStatus()
  }

  /** Returns whether the question was answered, so the view can keep the draft on failure. */
  async function send(text: string): Promise<boolean> {
    const content = text.trim()
    if (!content || sending.value) return false
    error.value = null
    if (history.state === 'idle') await history.fromSession(12)
    if (!context.value) { error.value = 'Reports are not ready yet. Connect the phone or open a backup in Insights.'; return false }
    messages.value = [...messages.value, { role: 'user', content }]
    sending.value = true
    try {
      const s = settings.value
      const system = `${systemPrompt(context.value)}\n\n${QUERY_GUIDE}`
      const transcript: AiMessage[] = messages.value.map(({ role, content }) => ({ role, content }))
      const lookups: string[] = []
      const ask = () => aiChat({
        provider: s.provider, system, messages: transcript,
        model: s.models[s.provider] || undefined,
        effort: s.efforts[s.provider] || undefined,
        baseUrl: s.provider === 'openai-compatible' ? s.baseUrl : undefined,
      })
      let answer = await ask()
      for (let round = 0; round < MAX_ROUNDS; round++) {
        const queries = extractQueries(answer)
        if (!queries.length) break
        lookingUp.value = queries.map(describe).join(', ')
        lookups.push(...queries.map(describe))
        const results = await runAll(queries)
        transcript.push({ role: 'assistant', content: answer }, { role: 'user', content: `Query results (from the app, not the user):\n\n${results}${round === MAX_ROUNDS - 1 ? '\n\nNo more lookups: answer now with what you have.' : ''}` })
        answer = await ask()
      }
      // A last answer that still only asks for data has nothing to show.
      if (extractQueries(answer).length) {
        const rest = answer.replace(/```(?:query|json)?[\s\S]*?```/g, '').trim()
        answer = rest && !extractQueries(rest).length ? rest : 'I could not finish looking up the data. Try a narrower question.'
      }
      messages.value = [...messages.value, { role: 'assistant', content: answer, ...(lookups.length ? { lookups } : {}) }]
      return true
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
      // Keep the question so the user can retry or edit it.
      messages.value = messages.value.slice(0, -1)
      return false
    } finally {
      lookingUp.value = null
      sending.value = false
    }
  }

  function describe(q: Record<string, unknown>): string {
    if (typeof q.error === 'string') return 'invalid query'
    const parts = [q.groupBy && `by ${q.groupBy}`, q.category, q.account, q.text && `"${q.text}"`, q.date, q.from && `from ${q.from}`, q.to && `to ${q.to}`].filter(Boolean)
    return `${String(q.tool)}${parts.length ? ` (${parts.join(', ')})` : ''}`
  }

  async function runAll(queries: Record<string, unknown>[]): Promise<string> {
    let note = ''
    const wanted = earliestDate(queries)
    if (wanted) {
      const today = new Date()
      const floor = new Date(today.getFullYear(), today.getMonth() - MAX_MONTHS_BACK + 1, 1)
      const limit = `${floor.getFullYear()}-${String(floor.getMonth() + 1).padStart(2, '0')}-01`
      try { await history.extend(wanted < limit ? limit : wanted) } catch { note = 'Older months could not be loaded from the phone.\n' }
    }
    const loaded = history.movements.reduce((min, m) => (m.date < min ? m.date : min), history.span.first)
    const options = { movements: history.movements, includeDetails: settings.value.includeDetails, available: { first: loaded, last: history.span.last } }
    return note + queries.map((q, i) => `### Query ${i + 1}\n${runQuery(q, options)}`).join('\n\n')
  }

  const reset = () => { messages.value = []; error.value = null }

  return { settings, status, messages, lookingUp, sending, error, available, context, refreshStatus, saveKey, send, reset }
})
