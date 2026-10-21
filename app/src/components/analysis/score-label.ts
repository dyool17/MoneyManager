/** Word for a 0-100 health score, from fixed thresholds. */
export function scoreWord(total: number): 'Fragile' | 'Fair' | 'Solid' | 'Strong' {
  if (total >= 80) return 'Strong'
  if (total >= 60) return 'Solid'
  if (total >= 40) return 'Fair'
  return 'Fragile'
}

/** Keys of score parts whose input is unknown, so the screen can show "?" rather than a fake zero. */
export function unknownPartKeys(input: { savingsRate: number | null; cushion: number | null; averageIncome: number; volatility: number | null }): Set<string> {
  const keys = new Set<string>()
  if (input.savingsRate === null) keys.add('savings')
  if (input.cushion === null) keys.add('cushion')
  if (!(input.averageIncome > 0)) keys.add('debt')
  if (input.volatility === null) keys.add('steady')
  return keys
}
