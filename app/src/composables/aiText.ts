import { reactive } from 'vue'
import { useChat } from '../stores/chat'

export interface AiText { state: 'idle' | 'loading' | 'ready' | 'failed'; text: string; error: string }

/** Assistant-written texts by key, kept in memory for this session only. */
const texts = reactive(new Map<string, AiText>())

export function useAiText() {
  const chat = useChat()
  const get = (key: string): AiText => texts.get(key) ?? { state: 'idle', text: '', error: '' }

  async function write(key: string, instruction: string, focus?: string) {
    if (get(key).state === 'loading') return
    texts.set(key, { state: 'loading', text: '', error: '' })
    try {
      texts.set(key, { state: 'ready', text: await chat.oneShot(instruction, focus), error: '' })
    } catch (e) {
      texts.set(key, { state: 'failed', text: '', error: e instanceof Error ? e.message : String(e) })
    }
  }

  return { get, write }
}
