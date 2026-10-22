<script setup lang="ts">
import { useNav, type Screen } from '../stores/nav'

const nav = useNav()

const SCREENS: { id: Screen; title: string; text: string }[] = [
  { id: 'today', title: 'Today', text: 'How this month is going: what you have spent, how much you can still spend per day, where the month is heading against a typical month, and what needs attention. With an assistant set up, it also writes a three-line brief.' },
  { id: 'money', title: 'Money', text: 'Net worth and its history, and every account, card and loan in one sortable table. Select an account to see its balance over time and this month\'s money in and out.' },
  { id: 'spending', title: 'Spending', text: 'One month of movements with categories and budgets. Filter by category, account or type; add, edit or delete movements, each shown for confirmation before it reaches the phone. When you type a note, the app suggests the category you used before for it. Below the categories: budgets imported from a phone backup (judged month by month or over the year), your recorded life events, and flagged possible bad decisions.' },
  { id: 'analysis', title: 'Analysis', text: 'Reports across 3, 6 or 12 months in four tabs: Overview (health score, monthly report, savings goal), Risks, Opportunities and Patterns.' },
  { id: 'settings', title: 'Settings', text: 'Connect the phone and keep backups, choose which accounts count toward totals and their currencies, set up the assistant, and pick a light or dark theme.' },
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

const SPENDING_TOOLS = [
  ['Imported budgets', 'Subcategory budgets only exist in a .mmbak backup you export from the phone, so Spending asks you to import one. Each category is judged monthly as usual, or over the year when seasonal spending comes in bursts — the app suggests it and you confirm per category. Everything is saved on this computer only.'],
  ['Life events', 'Notes like a move, an illness or a new baby that explain unusual spending: a one-off spike (kept out of the projection baseline), a new normal (the baseline restarts there) or temporary higher spending. The assistant reads them without labels unless you share transaction descriptions.'],
  ['Possible bad decisions', 'Expenses of a discretionary category that look big (far above their usual cost, half the budget or more, or pushing the budget over the line) and that no life event, repeating charge or yearly allowance explains. You can ask the assistant why, turn one into a life event, or dismiss it for good.'],
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
        <li>Open <button class="link" @click="nav.go('settings', 'phone')">Settings → Phone and backups</button> and type the address the phone shows, for example <code>http://192.168.1.161:8080</code>.</li>
        <li>Keep the phone unlocked with Money Manager on screen. PC Manager stops when the phone locks or you switch apps.</li>
      </ol>
      <p class="muted">Without a phone the app opens with demo data, so you can look around safely.</p>
    </div>

    <h2 class="section">Screens</h2>
    <div class="grid">
      <button v-for="s in SCREENS" :key="s.id" class="card screen" @click="nav.go(s.id)">
        <strong>{{ s.title }}</strong>
        <span>{{ s.text }}</span>
      </button>
    </div>

    <h2 class="section">Analysis reports</h2>
    <div class="card">
      <p class="muted">Every figure is computed with fixed rules from your own data. The same data always gives the same result.</p>
      <dl>
        <template v-for="[term, text] in REPORTS" :key="term">
          <dt>{{ term }}</dt>
          <dd>{{ text }}</dd>
        </template>
      </dl>
      <p class="muted">No phone around? <b>Open backup…</b> in Analysis reads a <code>.mmbak</code> backup in memory for offline reports. Balances, debt and budgets still come from the phone connection.</p>
    </div>

    <h2 class="section">Spending tools</h2>
    <div class="card">
      <dl>
        <template v-for="[term, text] in SPENDING_TOOLS" :key="term">
          <dt>{{ term }}</dt>
          <dd>{{ text }}</dd>
        </template>
      </dl>
    </div>

    <h2 class="section">The assistant</h2>
    <div class="card">
      <p class="muted">Press <kbd>Ctrl K</kbd> anywhere to ask a question or jump to a screen. <b>Ask</b> opens a side panel that knows which screen you are on; <b>Explain</b> and <b>Why?</b> buttons ask about one chart or alert. The assistant only explains and suggests: figures come from the app's own calculations, and nothing changes on the phone without your confirmation. Without an assistant set up these buttons are hidden and everything else works the same.</p>
      <dl>
        <dt>Claude subscription</dt>
        <dd>Install Claude Code and run <code>claude</code> once to sign in. The app calls it without tools, saved sessions or plugins; usage counts against your Claude plan.</dd>
        <dt>ChatGPT subscription</dt>
        <dd>Install the Codex CLI and run <code>codex login</code>. The app runs it read-only and without saving the session; usage counts against your ChatGPT plan.</dd>
        <dt>API key (OpenCode Go)</dt>
        <dd>In Settings → Assistant, paste the key from your provider and choose a model. The default address is <code>https://opencode.ai/zen/go/v1</code>; any OpenAI-compatible service works. The key is stored on this computer, readable only by your user, and never shown again.</dd>
        <dt>Looking up data</dt>
        <dd>When the reports are not enough, the assistant can ask the app for specific data: movements filtered by category, account, dates or text, totals by month, category, account or weekday, and one day's detail. The app runs these read-only lookups on this computer, loads up to 24 months from the phone when needed, and shows which lookups were used under each answer. Nothing is ever changed.</dd>
        <dt>What is shared</dt>
        <dd>Totals, categories, dates and the same figures Analysis shows. Shop names and notes, and searching by them, are sent only if you turn on "Share transaction descriptions". The conversation, briefs and reports are not saved.</dd>
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
        <dd>Review <button class="link" @click="nav.go('settings', 'accounts')">Settings → Accounts</button>: which accounts count and their currency rates.</dd>
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
