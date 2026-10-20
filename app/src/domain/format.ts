const money = new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

// `+ 0` turns -0 into 0 so zero balances never show as "-0.00".
export const formatMoney = (n: number) => money.format(n + 0)

export function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

/** Shifts a whole-month period by `delta` months. */
export function shiftMonth(startDate: string, delta: number) {
  const [y, m] = startDate.split('-').map(Number)
  const first = new Date(y, m - 1 + delta, 1)
  const last = new Date(first.getFullYear(), first.getMonth() + 1, 0)
  const iso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  return { startDate: iso(first), endDate: iso(last) }
}

export function monthLabel(startDate: string): string {
  const [y, m] = startDate.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
}
