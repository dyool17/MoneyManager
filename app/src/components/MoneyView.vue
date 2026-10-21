<script setup lang="ts">
// Placeholder until the Money screen is built (T3).
import NetWorthView from './NetWorthView.vue'
import AccountsView from './AccountsView.vue'
import CardsView from './CardsView.vue'
import { useNav } from '../stores/nav'
const nav = useNav()
</script>

<template>
  <NetWorthView @configure="nav.go('settings', 'accounts')" />
  <AccountsView />
  <CardsView />
</template>
