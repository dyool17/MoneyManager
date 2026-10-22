import { beforeEach, describe, expect, it, vi } from 'vitest'

let saved: Map<string, string>
beforeEach(() => {
  saved = new Map()
  vi.stubGlobal('localStorage', { getItem: (k: string) => saved.get(k) ?? null, setItem: (k: string, v: string) => { saved.set(k, v) } })
  vi.resetModules()
})

describe('i18n', () => {
  it('starts in Spanish when the system is Spanish and remembers the chosen language', async () => {
    vi.stubGlobal('navigator', { language: 'es-GT' })
    const { locale, setLocale } = await import('./index')
    expect(locale.value).toBe('es')
    setLocale('en')
    expect(saved.get('mm.locale')).toBe('en')
    vi.resetModules()
    const again = await import('./index')
    expect(again.locale.value).toBe('en')
  })

  it('falls back to English for other systems and ignores invalid saved values', async () => {
    vi.stubGlobal('navigator', { language: 'fr-FR' })
    saved.set('mm.locale', 'de')
    const { locale } = await import('./index')
    expect(locale.value).toBe('en')
  })

  it('translates English source text, fills placeholders and falls back to the source', async () => {
    vi.stubGlobal('navigator', { language: 'en-US' })
    const { t, setLocale, addMessages } = await import('./index')
    addMessages({ 'Spent this month': 'Gastado este mes', '{n} movements': '{n} movimientos' })
    expect(t('Spent this month')).toBe('Spent this month')
    expect(t('{n} movements', { n: 3 })).toBe('3 movements')
    setLocale('es')
    expect(t('Spent this month')).toBe('Gastado este mes')
    expect(t('{n} movements', { n: 3 })).toBe('3 movimientos')
    expect(t('Not translated yet')).toBe('Not translated yet')
  })

  it('formats money and dates for the chosen language', async () => {
    vi.stubGlobal('navigator', { language: 'en-US' })
    const { setLocale } = await import('./index')
    const { formatMoney, formatDate, monthLabel } = await import('../domain/format')
    expect(formatMoney(12345.67)).toBe('12,345.67')
    expect(formatDate('2026-10-21')).toBe('Oct 21, 2026')
    expect(monthLabel('2026-10-01')).toBe('October 2026')
    setLocale('es')
    expect(formatMoney(12345.67)).toBe('12,345.67')
    expect(formatDate('2026-10-21')).toMatch(/^21 oct\.? 2026$/)
    expect(monthLabel('2026-10-01')).toBe('octubre de 2026')
  })
})

/** Every literal passed to t() must have a Spanish entry, so the language switch never shows a half-English screen. */
describe('Spanish catalog', () => {
  it('covers every t() literal in the app', async () => {
    vi.stubGlobal('navigator', { language: 'es' })
    const { hasSpanish } = await import('./index')
    const sources = import.meta.glob<string>(['../**/*.vue', '../**/*.ts', '!../**/*.test.ts'], { query: '?raw', import: 'default', eager: true })
    expect(Object.keys(sources).length).toBeGreaterThan(50)
    const missing = new Set<string>()
    const literal = /\bt\(\s*(['"`])((?:\\.|(?!\1).)*?)\1/g
    for (const [file, text] of Object.entries(sources)) {
      for (const m of text.matchAll(literal)) {
        if (m[1] === '`' && m[2].includes('${')) continue
        const key = m[2].replace(/\\(['"`\\])/g, '$1')
        if (!hasSpanish(key)) missing.add(`${file}: ${key}`)
      }
    }
    expect([...missing]).toEqual([])
  })
})
