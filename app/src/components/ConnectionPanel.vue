<script setup lang="ts">
import { ref } from 'vue'
import { t } from '../i18n'
import { useSession } from '../stores/session'
import BackupPanel from './BackupPanel.vue'

const emit = defineEmits<{ connected: [] }>()
const session = useSession()
const address = ref(session.address || 'http://192.168.1.')

async function connect(source: 'demo' | 'phone') {
  await session.connect(source, address.value)
  // Stay here after a phone connection so the backup result is visible.
  if (session.status === 'ready' && source === 'demo') emit('connected')
}
</script>

<template>
  <section class="panel">
    <h1>{{ t('Connect your phone') }}</h1>
    <ol>
      <li>{{ t('Open Money Manager on your phone.') }}</li>
      <li>{{ t('Go to More, then PC Manager, and tap Start.') }}</li>
      <li>{{ t('Keep the phone and this computer on the same Wi-Fi.') }}</li>
      <li>{{ t('Type the address the phone shows, including the port.') }}</li>
    </ol>
    <form @submit.prevent="connect('phone')">
      <label for="address">{{ t('Phone address') }}</label>
      <div class="row">
        <input id="address" v-model="address" placeholder="http://192.168.1.161:8080" autocomplete="off" spellcheck="false" />
        <button class="primary" type="submit" :disabled="session.status === 'loading'">{{ t('Connect') }}</button>
      </div>
    </form>
    <p class="alt">
      {{ t('No phone nearby?') }}
      <button type="button" @click="connect('demo')">{{ t('Use demo data') }}</button>
    </p>
    <BackupPanel />
  </section>
</template>

<style scoped>
.panel { max-width: 34rem; }
h1 { font-size: 1.6rem; margin: 0 0 1rem; letter-spacing: -0.01em; }
ol { padding-left: 1.2rem; color: var(--ink-soft); }
li { margin-bottom: 0.25rem; }
label { display: block; font-weight: 600; margin: 1.5rem 0 0.4rem; }
.row { display: flex; gap: 0.5rem; }
.row input { flex: 1; }
.alt { margin-top: 2rem; color: var(--ink-soft); }
</style>
