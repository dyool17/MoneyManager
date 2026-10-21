import { describe, expect, it } from 'vitest'
import { scoreWord, unknownPartKeys } from './score-label'

describe('scoreWord', () => {
  it('maps fixed thresholds to a word', () => {
    expect(scoreWord(0)).toBe('Fragile')
    expect(scoreWord(39)).toBe('Fragile')
    expect(scoreWord(40)).toBe('Fair')
    expect(scoreWord(59)).toBe('Fair')
    expect(scoreWord(60)).toBe('Solid')
    expect(scoreWord(79)).toBe('Solid')
    expect(scoreWord(80)).toBe('Strong')
    expect(scoreWord(100)).toBe('Strong')
  })
})

describe('unknownPartKeys', () => {
  it('flags parts whose input is missing instead of scoring them as zero', () => {
    const keys = unknownPartKeys({ savingsRate: null, cushion: null, averageIncome: 0, volatility: null })
    expect([...keys].sort()).toEqual(['cushion', 'debt', 'savings', 'steady'])
  })
  it('flags nothing when every input is known', () => {
    expect(unknownPartKeys({ savingsRate: 0.1, cushion: 2, averageIncome: 1000, volatility: 0.2 }).size).toBe(0)
  })
})
