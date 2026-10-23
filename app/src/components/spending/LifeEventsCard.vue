<script setup lang="ts">
import { t } from '../../i18n'
import { formatDate } from '../../domain/format'
import { useLifeEvents } from '../../stores/life-events'
import { useNav } from '../../stores/nav'
const events = useLifeEvents()
const nav = useNav()
</script>

<template>
  <div class="card cats events">
    <div class="card-head"><h2>{{ t('Life events') }}</h2><button type="button" @click="nav.go('milestones')">{{ t('Manage milestones') }}</button></div>
    <ul v-if="events.state.events.length">
      <li v-for="e in events.state.events" :key="e.id">{{ e.label }} · {{ formatDate(e.start) }}</li>
    </ul>
    <p v-else>{{ t('No events recorded.') }}</p>
    <p v-if="events.storageError" role="alert">{{ t(events.storageError) }}</p>
  </div>
</template>

<style scoped>
.events { margin-top: 1.25rem; }
ul { padding-left: 1.2rem; }
[role='alert'] { color: var(--expense); }
</style>
