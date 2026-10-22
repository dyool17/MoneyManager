import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import { useChat } from './chat'
import { useSession } from './session'
import { languageName } from '../i18n'

/**
 * The AI brief on Today. Written once per set of reports and kept in memory
 * only; the figures it may use are the same reports the chat reads.
 */
export const useBrief = defineStore('brief', () => {
  const text = ref<string | null>(null)
  const state = ref<'idle' | 'loading' | 'ready' | 'failed'>('idle')
  const error = ref<string | null>(null)
  let writtenFor = ''

  // A brief describes the data it was written from; another source makes it wrong.
  const session = useSession()
  watch(() => [session.source, session.address, session.bookId], () => {
    text.value = null
    state.value = 'idle'
    error.value = null
    writtenFor = ''
  }, { flush: 'sync' })

  async function load(today: string, force = false) {
    const chat = useChat()
    if (!chat.ready || state.value === 'loading') return
    if (!force && state.value === 'ready' && writtenFor === chat.context) return
    state.value = 'loading'
    error.value = null
    try {
      const language = languageName()
      text.value = await chat.oneShot(
        `Today is ${today}. Write my brief for this month in exactly three short sentences: where I stand now, how the month is projected to close, and the main reason. ` +
        `Use only figures from the reports, rounded to whole units with the currency symbol. Plain prose: no headings, lists or questions. Write in ${language}.`,
      )
      writtenFor = chat.context
      state.value = 'ready'
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
      state.value = 'failed'
    }
  }

  return { text, state, error, load }
})
