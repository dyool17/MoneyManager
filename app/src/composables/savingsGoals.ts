import { computed } from 'vue'
import { useSession } from '../stores/session'
import { useAccountMetadata } from '../stores/metadata'
import { savingsGoalProgress, type SavingsGoal } from '../domain/savings-goal'

export function useSavingsGoals() {
  const session = useSession()
  const metadata = useAccountMetadata()
  const accounts = computed(() => {
    const debts = new Set(session.cards.flatMap(g => g.items.map(c => c.id)))
    return session.assets.flatMap(g => g.items).filter(a => !debts.has(a.id))
  })
  function progress(goal: SavingsGoal) {
    if (session.source === 'stored' || !session.loadedAt) return null
    return savingsGoalProgress(goal, accounts.value.map(a => ({ id: a.id, amount: a.balance })), metadata.state)
  }
  return { accounts, progress, metadata, session }
}
