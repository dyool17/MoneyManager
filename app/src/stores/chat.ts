import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import { aiAvailable, aiChat, aiSetKey, aiStatus, type AiMessage, type AiProvider, type AiStatus } from '../infrastructure/ai'
import { buildContext, systemPrompt } from '../domain/ai-context'
import { earliestDate, extractQueries, MAX_ROUNDS, QUERY_GUIDE, runQuery } from '../domain/ai-queries'
import { useHistory } from './history'
import { useSession } from './session'
import { useAccountMetadata } from './metadata'
import { useLifeEvents } from './life-events'
import { useBudgetPlans } from './budgets'
import { useDecisions } from './decisions'
import { useLiquid } from '../composables/liquid'
import { languageName } from '../i18n'

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

/** First day of the 24-month window the advisor reads, ending at `last`. */
export function advisorStart(last: string): string {
  const [y, m] = last.split('-').map(Number)
  const d = new Date(y, m - 24, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

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
  const lifeEvents = useLifeEvents()
  const budgetPlans = useBudgetPlans()
  const decisions = useDecisions()
  const { liquid } = useLiquid()

  const context = computed(() => {
    if (history.state !== 'ready') return ''
    const debts = metadata.totals.debts ?? session.dashboard?.debts ?? null
    // The advisor reads up to 24 months: everything loaded, capped there.
    const loaded = history.movements.reduce((min, m) => (m.date < min ? m.date : min), history.span.first)
    const start = advisorStart(history.span.last)
    const first = start < loaded ? loaded.slice(0, 8) + '01' : start
    return buildContext({
      movements: history.movements, first, last: history.span.last,
      currency: metadata.state.baseCurrency, liquid: session.assets.length ? liquid.value : null, debts,
      budgets: history.budgets, includeDetails: settings.value.includeDetails,
      events: lifeEvents.state.events,
      plan: budgetPlans.state.plan, modes: budgetPlans.state.modes,
      confirmed: decisions.confirmed,
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

  /** The selected provider is installed (or has its key and model), so AI controls can show. */
  const ready = computed(() => {
    const st = status.value
    if (!available || !st) return false
    const p = settings.value.provider
    if (p === 'claude-cli') return !!st.claude
    if (p === 'codex-cli') return !!st.codex
    return st.hasKey && !!settings.value.models['openai-compatible']
  })
  /** Why the assistant cannot answer yet, in words for the user. */
  const missing = computed(() => {
    const st = status.value
    if (!available) return 'The assistant runs in the desktop app. This browser preview cannot reach it.'
    if (!st) return ''
    const p = settings.value.provider
    if (p === 'claude-cli' && !st.claude) return 'Claude Code was not found. Install it and run `claude` once to sign in.'
    if (p === 'codex-cli' && !st.codex) return 'Codex CLI was not found. Install it and run `codex login` to sign in.'
    if (p === 'openai-compatible' && !st.hasKey) return 'Add your API key in Settings.'
    if (p === 'openai-compatible' && !settings.value.models['openai-compatible']) return 'Choose a model in Settings.'
    return ''
  })

  async function ensureContext(): Promise<string | null> {
    if (history.state === 'idle') await history.fromSession(12)
    // Older months come from the phone once (reads only); a backup already holds them.
    if (history.state === 'ready' && history.source === 'phone') {
      try { await history.extend(advisorStart(history.span.last)) } catch { /* the advisor works with what is loaded */ }
    }
    return context.value || null
  }

  /**
   * Runs one exchange with the provider, letting the assistant look up data
   * between rounds. Returns the final answer and the lookups it used.
   */
  async function converse(transcript: AiMessage[], focus?: string | null, onLookup?: (what: string | null) => void) {
    const s = settings.value
    const where = focus ? `\n\nThe user is looking at: ${focus}. Answer about that first.` : ''
    const system = `${systemPrompt(context.value)}\n\n${QUERY_GUIDE}${where}\n\nThe app is set to ${languageName()}; use it when the user's language is unclear.`
    const lookups: string[] = []
    const ask = () => aiChat({
      provider: s.provider, system, messages: transcript,
      model: s.models[s.provider] || undefined,
      effort: s.efforts[s.provider] || undefined,
      baseUrl: s.provider === 'openai-compatible' ? s.baseUrl : undefined,
    })
    let answer = await ask()
    try {
      for (let round = 0; round < MAX_ROUNDS; round++) {
        const queries = extractQueries(answer)
        if (!queries.length) break
        onLookup?.(queries.map(describe).join(', '))
        lookups.push(...queries.map(describe))
        const results = await runAll(queries)
        transcript.push({ role: 'assistant', content: answer }, { role: 'user', content: `Query results (from the app, not the user):\n\n${results}${round === MAX_ROUNDS - 1 ? '\n\nNo more lookups: answer now with what you have.' : ''}` })
        answer = await ask()
      }
    } finally {
      onLookup?.(null)
    }
    // A last answer that still only asks for data has nothing to show.
    if (extractQueries(answer).length) {
      const rest = answer.replace(/```(?:query|json)?[\s\S]*?```/g, '').trim()
      answer = rest && !extractQueries(rest).length ? rest : 'I could not finish looking up the data. Try a narrower question.'
    }
    return { answer, lookups }
  }

  /** Returns whether the question was answered, so the view can keep the draft on failure. */
  async function send(text: string, focus?: string | null): Promise<boolean> {
    const content = text.trim()
    if (!content || sending.value) return false
    error.value = null
    if (!(await ensureContext())) { error.value = 'Reports are not ready yet. Connect the phone or open a backup in Analysis.'; return false }
    messages.value = [...messages.value, { role: 'user', content }]
    sending.value = true
    try {
      const transcript: AiMessage[] = messages.value.map(({ role, content }) => ({ role, content }))
      const { answer, lookups } = await converse(transcript, focus, (w) => { lookingUp.value = w })
      messages.value = [...messages.value, { role: 'assistant', content: answer, ...(lookups.length ? { lookups } : {}) }]
      return true
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
      // Keep the question so the user can retry or edit it.
      messages.value = messages.value.slice(0, -1)
      return false
    } finally {
      sending.value = false
    }
  }

  /**
   * A single answer outside the conversation, for briefs, explanations and
   * suggestions. Throws when the assistant is not ready or the call fails.
   */
  async function oneShot(instruction: string, focus?: string | null): Promise<string> {
    if (!ready.value) throw new Error(missing.value || 'The assistant is not set up.')
    if (!(await ensureContext())) throw new Error('Reports are not ready yet.')
    const { answer } = await converse([{ role: 'user', content: instruction }], focus)
    return answer
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

  return { settings, status, messages, lookingUp, sending, error, available, ready, missing, context, refreshStatus, saveKey, send, oneShot, reset }
})
