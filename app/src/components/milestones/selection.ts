import type { LifeEvent } from '../../domain/life-events'

export type Selection = Record<string, { direction: 'affected' | 'relieved' | 'none'; expected: string }>
export function readSelection(event: Pick<LifeEvent, 'categoryIds' | 'relieved' | 'expected'>): Selection {
  const selection: Selection = {}
  for (const id of [...event.categoryIds, ...(event.relieved ?? [])]) {
    selection[id] = { direction: event.categoryIds.includes(id) ? 'affected' : 'relieved', expected: event.expected?.[id]?.toString() ?? '' }
  }
  return selection
}
export function writeSelection(selection: Selection) {
  const categoryIds: string[] = []
  const relieved: string[] = []
  const expected: Record<string, number> = {}
  for (const [id, value] of Object.entries(selection)) {
    if (value.direction === 'none') continue
    ;(value.direction === 'affected' ? categoryIds : relieved).push(id)
    if (value.expected !== '') expected[id] = Number(value.expected)
  }
  return { categoryIds, relieved, expected }
}
