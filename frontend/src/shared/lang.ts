export type Lang = 'ru' | 'en'

/** Russian when the browser's preferred language is Russian. Every other language opens in English. */
export function detectLang(): Lang {
  const tag = (navigator.languages?.[0] || navigator.language || '').toLowerCase()
  return tag.startsWith('ru') ? 'ru' : 'en'
}

export function applyDocumentLang(lang: Lang) {
  document.documentElement.lang = lang
}

export function localeTag(lang: Lang): string {
  return lang === 'ru' ? 'ru-RU' : 'en-US'
}
