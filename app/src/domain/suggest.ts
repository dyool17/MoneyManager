import type { Movement } from './types'

export interface CategorySuggestion {
  categoryId: string
  subcategoryId?: string
  /** Account most often used with that note. */
  assetId: string
  label: string
  /** How many earlier movements back the suggestion. */
  count: number
}

const norm = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim()

/**
 * Suggests a category for a new movement from the user's own history: the
 * category used most often with the same note, else with notes that start
 * with what was typed. Nothing leaves the computer.
 */
export function suggestCategory(note: string, kind: 'expense' | 'income', movements: Movement[]): CategorySuggestion | null {
  const typed = norm(note)
  if (typed.length < 3) return null
  const same = movements.filter((m) => m.type === kind && m.categoryId && m.content)
  const exact = same.filter((m) => norm(m.content!) === typed)
  const pool = exact.length ? exact : same.filter((m) => norm(m.content!).startsWith(typed))
  if (!pool.length) return null

  const tally = new Map<string, { m: Movement; count: number; accounts: Map<string, number> }>()
  for (const m of pool) {
    const key = `${m.categoryId}/${m.subcategoryId ?? ''}`
    const t = tally.get(key) ?? { m, count: 0, accounts: new Map() }
    t.count++
    t.accounts.set(m.assetId, (t.accounts.get(m.assetId) ?? 0) + 1)
    tally.set(key, t)
  }
  const best = [...tally.values()].sort((a, b) => b.count - a.count)[0]!
  const assetId = [...best.accounts].sort((a, b) => b[1] - a[1])[0]![0]
  const label = [best.m.categoryName, best.m.subcategoryName].filter(Boolean).join(' › ')
  return { categoryId: best.m.categoryId!, ...(best.m.subcategoryId ? { subcategoryId: best.m.subcategoryId } : {}), assetId, label, count: best.count }
}
