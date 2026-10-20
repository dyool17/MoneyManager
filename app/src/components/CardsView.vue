<script setup lang="ts">
import { useSession } from '../stores/session'
import { formatMoney } from '../domain/format'

const session = useSession()
const accountName = (id?: string) =>
  session.assets.flatMap((g) => g.items).find((i) => i.id === id)?.name ?? id
</script>

<template>
  <section>
    <p v-if="!session.cards.length" class="muted">No credit cards in this book.</p>
    <div v-for="g in session.cards" :key="g.id" class="group">
      <h2>{{ g.name }}</h2>
      <div class="grid">
        <article v-for="c in g.items" :key="c.id" class="card" :style="{ '--card': c.color ?? 'var(--transfer)' }">
          <header>
            <span class="name">{{ c.name }}</span>
            <span v-if="c.linkedAssetId" class="muted">Paid from {{ accountName(c.linkedAssetId) }}</span>
          </header>
          <div class="due">
            <span class="muted">To pay</span>
            <strong class="amount">{{ formatMoney(c.outstanding) }}</strong>
          </div>
          <dl>
            <div><dt>Balance</dt><dd class="amount">{{ formatMoney(c.balance) }}</dd></div>
            <div v-if="c.closingDay"><dt>Statement closes</dt><dd>Day {{ c.closingDay }}</dd></div>
            <div v-if="c.paymentDay"><dt>Payment due</dt><dd>Day {{ c.paymentDay }}</dd></div>
          </dl>
        </article>
      </div>
    </div>
  </section>
</template>

<style scoped>
.muted { color: var(--ink-soft); }
.group + .group { margin-top: 2rem; }
h2 { font-size: 1.05rem; margin: 0 0 0.75rem; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(18rem, 1fr)); gap: 1.25rem; }
.card {
  background: var(--paper);
  border: 1px solid var(--rule);
  border-top: 4px solid var(--card);
  border-radius: 12px;
  padding: 1.25rem 1.5rem;
}
header { display: flex; flex-direction: column; margin-bottom: 1.25rem; }
.name { font-weight: 600; font-size: 1.1rem; }
header .muted { font-size: 0.85rem; }
.due span { display: block; font-size: 0.85rem; }
.due strong { font-size: 2rem; font-weight: 650; letter-spacing: -0.02em; }
dl { display: grid; grid-template-columns: repeat(3, auto); gap: 1rem; margin: 1.25rem 0 0; padding-top: 1rem; border-top: 1px solid var(--rule); }
dt { color: var(--ink-soft); font-size: 0.8rem; }
dd { margin: 0; }
</style>
