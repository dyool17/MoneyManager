import { afterEach, describe, expect, it } from 'vitest'
import { opportunityDetail, opportunityTitle } from './opportunity-text'
import { setLocale } from '../../i18n'
import type { Opportunity } from '../../domain/insights'

// The domain writes these in English for the assistant; the screen maps them by their template.
// If a domain template changes, these fail instead of the screen silently showing English.
const domain = (o: Opportunity) => [opportunityTitle(o), opportunityDetail(o)]

afterEach(() => setLocale('en'))

describe('opportunity text on screen', () => {
  it('translates every opportunity template the domain produces', () => {
    setLocale('es')
    const translated = [
      domain({ kind: 'rising', title: 'Regalos is growing', detail: '40% more per month than the three months before.', monthly: 10 }),
      domain({ kind: 'recurring', title: '3 repeating charges', detail: 'Subscriptions and fixed bills average this much per month. Cancelling one you no longer use saves every month.', monthly: 10 }),
      domain({ kind: 'small-purchases', title: '12 small purchases', detail: 'Purchases under 50 in the last 3 months add up quickly.', monthly: 10 }),
      domain({ kind: 'overspent-month', month: '2026-09', title: 'Spent more than earned in 2026-09', detail: 'Expenses passed income for that month.', monthly: 10 }),
    ]
    for (const [title, detail] of translated) {
      expect(title).not.toMatch(/is growing|repeating charges|small purchases|Spent more than earned/)
      expect(detail).not.toMatch(/more per month|Subscriptions|Purchases under|Expenses passed/)
    }
    // Phone category names are data, never translated.
    expect(translated[0]![0]).toContain('Regalos')
  })

  it('matches the templates insights.ts writes today', async () => {
    const source = (await import('../../domain/insights.ts?raw')).default
    for (const template of [
      '${c.name} is growing',
      '% more per month than the three months before.',
      '${input.recurring.length} repeating charges',
      'Subscriptions and fixed bills average this much per month. Cancelling one you no longer use saves every month.',
      '${small.length} small purchases',
      'Purchases under ${SMALL} in the last ${recent.size} months add up quickly.',
      'Spent more than earned in ${m.month}',
      'Expenses passed income for that month.',
    ]) expect(source).toContain(template)
  })

  it('leaves English untouched when English is chosen', () => {
    expect(domain({ kind: 'rising', title: 'Regalos is growing', detail: '40% more per month than the three months before.', monthly: 10 }))
      .toEqual(['Regalos is growing', '40% more per month than the three months before.'])
  })
})
