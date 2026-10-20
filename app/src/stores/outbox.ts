import { defineStore } from 'pinia'
import { computed, ref, shallowRef, watch } from 'vue'
import { applyWrite, type WriteOp } from '../infrastructure/client'

/**
 * A change that never left the computer, waiting for the phone.
 *
 * Only changes that were never sent are queued: the request did not reach the
 * phone, so sending it later cannot duplicate anything. A change whose outcome
 * is unknown (the phone did not answer) is kept apart, because it may already
 * have been applied and must never be sent again without the user checking.
 */
export interface QueuedChange {
  id: string
  op: WriteOp
  label: string
  status: 'pending' | 'unconfirmed'
  createdAt: string
  phone: string
}

export type WriteFailure = Error & { kind?: string }

const KEY = 'mm.outbox.v1'
const read = (): QueuedChange[] => {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((c): c is QueuedChange =>
      !!c && typeof c === 'object' && typeof (c as QueuedChange).id === 'string' &&
      typeof (c as QueuedChange).status === 'string' && !!(c as QueuedChange).op)
  } catch {
    return []
  }
}

export const useOutbox = defineStore('outbox', () => {
  const items = shallowRef<QueuedChange[]>(read())
  const sending = ref(false)
  const lastError = ref('')
  const persist = () => {
    try {
      localStorage.setItem(KEY, JSON.stringify(items.value))
    } catch {
      lastError.value = 'The pending changes could not be saved on this computer.'
    }
  }
  watch(items, persist, { deep: true, flush: 'sync' })

  const pending = computed(() => items.value.filter((c) => c.status === 'pending'))
  const unconfirmed = computed(() => items.value.filter((c) => c.status === 'unconfirmed'))
  const canSend = computed(() => pending.value.length > 0 && !sending.value)

  /** Adds a change that never reached the phone. */
  function queue(op: WriteOp, label: string, phone = '') {
    items.value = [
      ...items.value,
      { id: `${Date.now()}-${items.value.length}`, op, label, status: 'pending', createdAt: new Date().toISOString(), phone },
    ]
  }

  /** Records a failed attempt: only a never-sent change goes back to the queue. */
  function recordFailure(op: WriteOp, error: unknown, label = '', phone = '') {
    const kind = (error as WriteFailure)?.kind
    if (kind === 'offline') {
      queue(op, label, phone)
      return
    }
    if (kind === 'unconfirmed' || kind === 'timeout') {
      items.value = [
        ...items.value,
        { id: `${Date.now()}-${items.value.length}`, op, label, status: 'unconfirmed', createdAt: new Date().toISOString(), phone },
      ]
    }
  }

  /** Sends the queued changes in order, one at a time. */
  async function sendAll(baseUrl: string) {
    sending.value = true
    lastError.value = ''
    let sent = 0, failed = 0
    const queue = pending.value.slice()
    const outcome = new Map<string, 'sent' | 'pending' | 'unconfirmed' | 'dropped'>()
    for (const change of queue) {
      try {
        await applyWrite(baseUrl, change.op)
        sent += 1
        outcome.set(change.id, 'sent')
      } catch (e) {
        failed += 1
        lastError.value = (e as Error)?.message ?? String(e)
        const kind = (e as WriteFailure)?.kind
        if (kind === 'offline') outcome.set(change.id, 'pending')
        else if (kind === 'unconfirmed' || kind === 'timeout') outcome.set(change.id, 'unconfirmed')
        else outcome.set(change.id, 'dropped')
      }
    }
    const untouched = items.value.filter((c) => !queue.some((q) => q.id === c.id))
    const kept = queue.filter((c) => outcome.get(c.id) === 'pending')
    const review = queue
      .filter((c) => outcome.get(c.id) === 'unconfirmed')
      .map((c) => ({ ...c, status: 'unconfirmed' as const }))
    items.value = [...untouched, ...kept, ...review]
    sending.value = false
    return { sent, failed }
  }

  /** Removes a change the user already verified on the phone. */
  function discard(id: string) {
    items.value = items.value.filter((c) => c.id !== id)
  }

  return { items, pending, unconfirmed, canSend, sending, lastError, queue, recordFailure, sendAll, discard }
})
