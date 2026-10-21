import { computed, ref, watch } from 'vue'
import { useSession } from '../stores/session'
import { isLikelyLiquid } from '../domain/health'

const LIQUID_KEY = 'mm.liquidGroups'
function readLiquid(): Record<string, boolean> {
  try { return JSON.parse(localStorage.getItem(LIQUID_KEY) ?? '{}') } catch { return {} }
}
/** Shared across views so the cushion and the AI context use the same accounts. */
const choice = ref<Record<string, boolean>>(readLiquid())
watch(choice, (v) => { try { localStorage.setItem(LIQUID_KEY, JSON.stringify(v)) } catch { /* private mode */ } }, { deep: true })

/** Spendable account groups: a per-viewer choice, remembered in this browser only. */
export function useLiquid() {
  const session = useSession()
  const groups = computed(() => session.assets
    .filter((g) => g.balance > 0)
    .map((g) => ({ id: g.id, name: g.name, balance: g.balance, liquid: choice.value[g.id] ?? isLikelyLiquid(g.name) })))
  const liquid = computed(() => groups.value.filter((g) => g.liquid).reduce((a, g) => a + g.balance, 0))
  const toggle = (id: string, on: boolean) => { choice.value = { ...choice.value, [id]: on } }
  return { groups, liquid, toggle }
}
