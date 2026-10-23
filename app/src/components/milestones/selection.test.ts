import { describe, expect, it } from 'vitest'
import { readSelection, writeSelection } from './selection'

describe('milestone category selection', () => {
  it('round trips affected, relieved and optional positive expectations', () => {
    const event = { categoryIds: ['a'], relieved: ['b'], expected: { b: 125 } }
    expect(writeSelection(readSelection(event))).toEqual(event)
    expect(writeSelection({ a: { direction: 'none', expected: '50' }, b: { direction: 'relieved', expected: '' } })).toEqual({ categoryIds: [], relieved: ['b'], expected: {} })
  })
  it('keeps invalid entered amounts for the domain validator to reject, rather than silently dropping them', () => {
    expect(writeSelection({ a: { direction: 'affected', expected: '-2' } }).expected).toEqual({ a: -2 })
  })
  it('loads legacy affected-only milestones', () => {
    expect(readSelection({ categoryIds: ['a'] })).toEqual({ a: { direction: 'affected', expected: '' } })
  })
})
