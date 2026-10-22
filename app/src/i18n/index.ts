import { ref } from 'vue'

/**
 * App language. English text in the source is the key; Spanish catalogs in `./es/*.ts` map it
 * to the translation, and anything missing falls back to the English source.
 */

export type Locale = 'en' | 'es'

const KEY = 'mm.locale'
/** Region locale for numbers and dates; es-GT keeps the comma thousands and period decimals of the phone app. */
const INTL: Record<Locale, string> = { en: 'en-US', es: 'es-GT' }

function initial(): Locale {
  try {
    const saved = localStorage.getItem(KEY)
    if (saved === 'en' || saved === 'es') return saved
  } catch { /* storage unavailable */ }
  const system = typeof navigator !== 'undefined' ? navigator.language : 'en'
  return system?.toLowerCase().startsWith('es') ? 'es' : 'en'
}

export const locale = ref<Locale>(initial())

const spanish: Record<string, string> = {}
const catalogs = import.meta.glob<{ default: Record<string, string> }>('./es/*.ts', { eager: true })
for (const c of Object.values(catalogs)) Object.assign(spanish, c.default)

/** Adds Spanish entries at runtime; catalogs in `./es` are loaded already. */
export const addMessages = (entries: Record<string, string>) => { Object.assign(spanish, entries) }
export const hasSpanish = (source: string) => Object.prototype.hasOwnProperty.call(spanish, source)

export function setLocale(next: Locale) {
  locale.value = next
  try { localStorage.setItem(KEY, next) } catch { /* not remembered */ }
  if (typeof document !== 'undefined') document.documentElement.lang = next
}

/** Translates English source text and fills `{name}` placeholders. */
export function t(source: string, params?: Record<string, string | number>): string {
  const text = locale.value === 'es' ? (spanish[source] ?? source) : source
  return params ? text.replace(/\{(\w+)\}/g, (all, k: string) => (k in params ? String(params[k]) : all)) : text
}

/** BCP 47 locale for Intl formatting in the chosen language. */
export const intlLocale = () => INTL[locale.value]

/** Name of the chosen language, for prompts sent to the assistant. */
export const languageName = () => (locale.value === 'es' ? 'Spanish' : 'English')
