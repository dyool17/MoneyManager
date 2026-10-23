import { describe, expect, it, vi } from 'vitest'

vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => undefined })
const { advisorStart } = await import('./chat')

describe('advisor history window', () => {
  it('starts 24 whole months back, including the current month', () => {
    expect(advisorStart('2026-10-20')).toBe('2024-11-01')
    expect(advisorStart('2026-01-05')).toBe('2024-02-01')
    expect(advisorStart('2026-12-31')).toBe('2025-01-01')
  })
})
