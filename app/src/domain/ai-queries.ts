import type { Movement } from './types'

/** Read-only lookups the assistant can ask for when the summary is not enough. */
export type Query = Record<string, unknown>
export interface QueryOptions {
  movements: Movement[]
  includeDetails: boolean
  /** Dates actually loaded, so the assistant knows when data is missing. */
  available: { first: string; last: string }
}

export const MAX_ROWS = 50
export const MAX_ROUNDS = 3

export const QUERY_GUIDE = `## Looking up more data
If the reports above are not enough, ask the app for data with one or more blocks like this, and nothing else in that message:
\`\`\`query
{"tool":"movements","category":"Food","from":"2026-01-01","to":"2026-03-31","limit":20}
\`\`\`
The app replies with the result; then answer the user. Use at most ${MAX_ROUNDS} rounds. Available queries:
- {"tool":"movements", "from"?, "to"?, "category"?, "account"?, "type"? ("expense"|"income"|"transfer"), "text"?, "min"?, "max"?, "limit"? (max ${MAX_ROWS})}: individual movements, largest first. "category" matches the group or subcategory name; "text" searches descriptions.
- {"tool":"totals", "groupBy" ("category"|"month"|"account"|"weekday"|"day"), "from"?, "to"?, "category"?, "type"? (default "expense")}: sums and counts.
- {"tool":"day", "date"}: every movement of one day.
Dates are YYYY-MM-DD. Never show query blocks to the user as an answer.`

const DATE = /^\d{4}-\d{2}-\d{2}$/
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const n = (v: number) => (Math.round(v * 100) / 100).toFixed(2)
const norm = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined)
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)
const categoryOf = (m: Movement) => [m.categoryName, m.subcategoryName].filter(Boolean).join(' / ') || 'Uncategorized'
const oneLine = (s: string) => s.replace(/\s+/g, ' ').replace(/"/g, "'").trim()

export function extractQueries(text: string): Query[] {
  const out: Query[] = []
  for (const match of text.matchAll(/```query\s*([\s\S]*?)```/g)) {
    try {
      const q = JSON.parse(match[1]!)
      out.push(q && typeof q === 'object' && !Array.isArray(q) ? q : { error: 'Query must be a JSON object.' })
    } catch {
      out.push({ error: 'Query is not valid JSON.' })
    }
  }
  if (out.length) return out
  // Some models skip the fence; accept a message that is only a query object.
  const bare = text.trim().replace(/^```(?:json)?\s*([\s\S]*?)```$/, '$1').trim()
  if (bare.startsWith('{') && bare.endsWith('}')) {
    try {
      const q = JSON.parse(bare)
      if (q && typeof q === 'object' && typeof q.tool === 'string') return [q]
    } catch { /* plain answer */ }
  }
  return out
}

function row(m: Movement, details: boolean) {
  const base = `${m.date} | ${m.type} | ${categoryOf(m)} | ${m.accountName} | ${n(m.amount)}`
  const text = [m.content, m.detail].filter(Boolean).join(' - ')
  return details && text ? `${base} | "${oneLine(text)}"` : base
}

export function runQuery(q: Query, o: QueryOptions): string {
  if (typeof q.error === 'string') return q.error
  const from = str(q.from), to = str(q.to), date = str(q.date)
  if ([from, to, date].some((d) => d !== undefined && !DATE.test(d))) return 'Dates must be YYYY-MM-DD.'
  const note = from && from < o.available.first ? `Only ${o.available.first} to ${o.available.last} is loaded; earlier data is not included.\n` : ''

  const inRange = (m: Movement) => (!from || m.date >= from) && (!to || m.date <= to)
  const category = str(q.category)
  const byCategory = (m: Movement) => !category || norm(categoryOf(m)).includes(norm(category))

  switch (q.tool) {
    case 'movements': {
      const text = str(q.text)
      if (text && !o.includeDetails) return 'Text search needs "Share transaction descriptions" turned on in Settings.'
      const account = str(q.account), type = str(q.type), min = num(q.min), max = num(q.max)
      const list = o.movements
        .filter((m) => inRange(m) && byCategory(m))
        .filter((m) => !account || norm(m.accountName).includes(norm(account)))
        .filter((m) => !type || m.type === type)
        .filter((m) => !text || norm(`${m.content ?? ''} ${m.detail ?? ''}`).includes(norm(text)))
        .filter((m) => (min === undefined || m.amount >= min) && (max === undefined || m.amount <= max))
        .sort((a, b) => b.amount - a.amount)
      const limit = Math.min(MAX_ROWS, Math.max(1, num(q.limit) ?? 20))
      const sum = n(list.reduce((a, m) => a + m.amount, 0))
      const head = list.length > limit ? `${list.length} movement(s) totalling ${sum}, showing the ${limit} largest` : `${list.length} movement(s) totalling ${sum}`
      return `${note}${head} (date | type | category | account | amount${o.includeDetails ? ' | description' : ''}):\n${list.slice(0, limit).map((m) => row(m, o.includeDetails)).join('\n')}`.trimEnd()
    }
    case 'totals': {
      const groupBy = str(q.groupBy)
      const keyOf: Record<string, (m: Movement) => string> = {
        category: categoryOf,
        month: (m) => m.date.slice(0, 7),
        day: (m) => m.date,
        account: (m) => m.accountName,
        weekday: (m) => WEEKDAYS[new Date(`${m.date}T12:00:00`).getDay()]!,
      }
      const key = groupBy ? keyOf[groupBy] : undefined
      if (!key) return 'groupBy must be category, month, account, weekday or day.'
      const type = str(q.type) ?? 'expense'
      const sums = new Map<string, { total: number; count: number }>()
      for (const m of o.movements) {
        if (m.type !== type || !inRange(m) || !byCategory(m)) continue
        const s = sums.get(key(m)) ?? { total: 0, count: 0 }
        s.total += m.amount
        s.count++
        sums.set(key(m), s)
      }
      const rows = [...sums].sort((a, b) => (groupBy === 'month' || groupBy === 'day' ? a[0].localeCompare(b[0]) : b[1].total - a[1].total))
      const all = n(rows.reduce((a, [, x]) => a + x.total, 0))
      return `${note}${type} totals by ${groupBy} (${rows.length} group(s), overall ${all}):\n${rows.slice(0, MAX_ROWS * 2).map(([k, s]) => `- ${k}: ${n(s.total)} in ${s.count}`).join('\n')}`.trimEnd()
    }
    case 'day': {
      if (!date) return 'Give a "date" as YYYY-MM-DD.'
      const list = o.movements.filter((m) => m.date === date).sort((a, b) => b.amount - a.amount)
      return `${list.length} movement(s) on ${date} totalling ${n(list.reduce((a, m) => a + m.amount, 0))}:\n${list.slice(0, MAX_ROWS).map((m) => row(m, o.includeDetails)).join('\n')}`.trimEnd()
    }
    default:
      return `Unknown query "${String(q.tool)}". Use movements, totals or day.`
  }
}

/** Earliest date a query asks for, so the app can load older months first. */
export const earliestDate = (qs: Query[]) =>
  qs.flatMap((q) => [str(q.from), str(q.date)]).filter((d): d is string => !!d && DATE.test(d)).sort()[0]
