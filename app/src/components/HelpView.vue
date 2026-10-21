<script setup lang="ts">
defineEmits<{ go: [view: string] }>()

const SCREENS = [
  { id: 'networth', title: 'Net worth', text: 'Your net worth today, how it moved month by month, and which accounts hold your money. Totals use the account metadata so excluded accounts and foreign currencies are handled the way your phone does.' },
  { id: 'insights', title: 'Insights', text: 'Reports across up to 12 months: a financial health score, risks, strengths and weak spots, ways to spend less, and spending patterns. Pick 3, 6 or 12 months at the top right.' },
  { id: 'chat', title: 'Ask AI', text: 'Chat about your reports with Claude, ChatGPT or an API-key provider such as OpenCode Go. Choose the provider in Settings. Open "What is shared" to see exactly what the assistant reads.' },
  { id: 'summary', title: 'Monthly summary', text: 'Income, spending and categories for one month. Move between months with the arrows above the page.' },
  { id: 'budgets', title: 'Budgets', text: 'How each budget is doing this month, compared with how much of the month has passed.' },
  { id: 'movements', title: 'Transactions', text: 'Every movement of the month. You can add, edit or delete entries; each change is shown for confirmation before it reaches the phone.' },
  { id: 'accounts', title: 'Accounts and Credit cards', text: 'Balances per account and what you owe on each card.' },
  { id: 'metadata', title: 'Account metadata', text: 'Choose which accounts count toward totals and set their currency and rate. Import it from a .mmbak backup or set it by hand. This never changes the phone.' },
]

const REPORTS = [
  ['Financial health', 'A 0 to 100 score with fixed weights: savings rate 25, emergency cushion 25, debt load 20, steady spending 15, months in the green 15. Hover a line to see how it is scored.'],
  ['Emergency cushion', 'Months your spendable money lasts at your average spending. Open "Which accounts count" to choose the accounts you could actually use tomorrow.'],
  ['Month-end projection', 'What you have spent this month plus what earlier months usually spent from this day to the end. Bills paid on the 1st do not inflate it.'],
  ['Debt load', 'Total debt against your average monthly income. Under 30% is comfortable.'],
  ['Already committed', 'Expenses already saved in the app for future dates, such as installments and repeating entries, for the next 12 months.'],
  ['Budget track record', 'For each budget, in how many months you went over and by how much. It needs the phone: it reads one summary per month. It assumes the phone reports the budget each month had at the time.'],
  ['Unusual expenses', 'Expenses more than two standard deviations above their category norm and at least 1.5 times the usual amount. Repeating charges are left out.'],
  ['What if you cut back?', 'Pick categories and a percentage to see the monthly and yearly saving, and how many months it adds to your cushion.'],
  ['Patterns', 'Income against spending per month (click a month to filter categories), top subcategories, the most expensive weekday, the days you spent the most and a daily calendar.'],
]
</script>

<template>
  <section class="help">
    <header>
      <h1>Help</h1>
      <p class="lead">Money Manager Desktop shows and analyses the data of the Money Manager phone app on your computer. Everything stays on this computer.</p>
    </header>

    <div class="card steps">
      <h2>Connect your phone</h2>
      <ol>
        <li>On the phone, open Money Manager and go to <b>More → PC Manager → Start</b>.</li>
        <li>Keep the phone and this computer on the same Wi-Fi network.</li>
        <li>Open <button class="link" @click="$emit('go', 'connection')">Connect phone</button> and type the address the phone shows, for example <code>http://192.168.1.161:8080</code>.</li>
        <li>Keep the phone unlocked with Money Manager on screen. PC Manager stops when the phone locks or you switch apps.</li>
      </ol>
      <p class="muted">Without a phone the app opens with demo data, so you can look around safely.</p>
    </div>

    <h2 class="section">Screens</h2>
    <div class="grid">
      <button v-for="s in SCREENS" :key="s.id" class="card screen" @click="$emit('go', s.id)">
        <strong>{{ s.title }}</strong>
        <span>{{ s.text }}</span>
      </button>
    </div>

    <h2 class="section">Insights reports</h2>
    <div class="card">
      <p class="muted">Every figure is computed with fixed rules from your own data. The same data always gives the same result.</p>
      <dl>
        <template v-for="[term, text] in REPORTS" :key="term">
          <dt>{{ term }}</dt>
          <dd>{{ text }}</dd>
        </template>
      </dl>
      <p class="muted">No phone around? <b>Open backup…</b> in Insights reads a <code>.mmbak</code> backup in memory for offline reports. Balances, debt and budgets still come from the phone connection.</p>
    </div>

    <h2 class="section">Ask AI</h2>
    <div class="card">
      <dl>
        <dt>Claude subscription</dt>
        <dd>Install Claude Code and run <code>claude</code> once to sign in. The app calls it without tools, saved sessions or plugins; usage counts against your Claude plan.</dd>
        <dt>ChatGPT subscription</dt>
        <dd>Install the Codex CLI and run <code>codex login</code>. The app runs it read-only and without saving the session; usage counts against your ChatGPT plan.</dd>
        <dt>API key (OpenCode Go)</dt>
        <dd>Paste the key from your provider and choose a model. The default address is <code>https://opencode.ai/zen/go/v1</code>; any OpenAI-compatible service works. The key is stored on this computer, readable only by your user, and never shown again.</dd>
        <dt>What is shared</dt>
        <dd>Totals, categories, dates and the same figures Insights shows. Shop names and notes are sent only if you turn on "Share transaction descriptions". The conversation is not saved.</dd>
      </dl>
    </div>

    <h2 class="section">Changing data on the phone</h2>
    <div class="card">
      <ul>
        <li>Every change is shown for confirmation first. Deleting requires typing <code>delete</code>.</li>
        <li>A backup from the last 30 minutes is required. One is saved automatically when you connect.</li>
        <li>If the phone is not reachable, changes wait in <b>Pending changes</b> and are sent when it is back. Nothing is lost.</li>
        <li>A change is never sent twice. If the phone does not answer in time, check the phone before trying again.</li>
        <li>Demo data cannot be changed.</li>
      </ul>
    </div>

    <h2 class="section">Troubleshooting</h2>
    <div class="card">
      <dl>
        <dt>The phone does not connect</dt>
        <dd>Check that PC Manager says it is running, that both devices share the Wi-Fi, and that the address includes the port.</dd>
        <dt>It disconnected by itself</dt>
        <dd>The phone probably locked or switched apps. Unlock it, open Money Manager and press Reload.</dd>
        <dt>Net worth differs from the phone</dt>
        <dd>Review <button class="link" @click="$emit('go', 'metadata')">Account metadata</button>: which accounts count and their currency rates.</dd>
      </dl>
    </div>
  </section>
</template>

<style scoped>
.help { display: grid; gap: 1.1rem; max-width: 920px; }
h1 { margin: 0; font-size: 1.6rem; letter-spacing: -0.02em; }
.lead { color: var(--ink-soft); margin: 0.3rem 0 0; }
h2 { font-size: 1.05rem; margin: 0 0 0.6rem; }
h2.section { margin: 0.6rem 0 0; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--ink-soft); }
.card { background: var(--paper); border: 1px solid var(--rule); border-radius: 12px; padding: 1.1rem 1.3rem; }
.muted { color: var(--ink-soft); font-size: 0.9rem; }
ol, ul { margin: 0; padding-left: 1.2rem; display: grid; gap: 0.4rem; }
code { background: var(--mist); padding: 0.05rem 0.35rem; border-radius: 4px; font-size: 0.88em; }
.grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 0.9rem; }
.screen { display: grid; gap: 0.3rem; text-align: left; cursor: pointer; transition: border-color 0.15s, transform 0.15s; }
.screen:hover { border-color: var(--accent); transform: translateY(-1px); }
.screen span { color: var(--ink-soft); font-size: 0.9rem; }
dl { margin: 0.5rem 0; display: grid; grid-template-columns: 12rem 1fr; gap: 0.55rem 1.2rem; }
dt { font-weight: 600; }
dd { margin: 0; color: var(--ink-soft); }
.link { border: 0; background: none; padding: 0; color: var(--accent); text-decoration: underline; cursor: pointer; }
@media (max-width: 760px) { .grid, dl { grid-template-columns: 1fr; } }
</style>
