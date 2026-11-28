import type { Attempt } from '../shared/api'
import { ui } from '../shared/copy'
import { localeTag, type Lang } from '../shared/lang'

export function plural(count: number, one: string, few: string, many: string): string {
  const n10 = count % 10
  const n100 = count % 100
  if (n10 === 1 && n100 !== 11) return `${count} ${one}`
  if (n10 >= 2 && n10 <= 4 && (n100 < 12 || n100 > 14)) return `${count} ${few}`
  return `${count} ${many}`
}

export function rememberTrim(id: string, start: number, end: number) {
  try {
    sessionStorage.setItem(`beta-climb.trim.${id}`, JSON.stringify({ start, end }))
  } catch {
    /* private mode */
  }
}

export function clipOf(attempt: Attempt): Attempt {
  try {
    const raw = sessionStorage.getItem(`beta-climb.trim.${attempt.id}`)
    if (!raw) return attempt
    const clip = JSON.parse(raw) as { start?: number; end?: number }
    if (clip.start == null || clip.end == null || !(clip.end > clip.start)) return attempt
    return { ...attempt, trimStartSec: clip.start, trimEndSec: clip.end, durationSec: clip.end - clip.start }
  } catch {
    return attempt
  }
}

export function formatSeconds(value: number, lang: Lang): string {
  return ui(lang).seconds(value.toFixed(1))
}

export function dayKey(iso: string): string {
  const date = new Date(iso)
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

export function formatDayLabel(iso: string, lang: Lang): string {
  const date = new Date(iso)
  const today = new Date()
  const yesterday = new Date()
  yesterday.setDate(today.getDate() - 1)
  const copy = ui(lang)
  if (dayKey(iso) === dayKey(today.toISOString())) return copy.today
  if (dayKey(iso) === dayKey(yesterday.toISOString())) return copy.yesterday
  return date.toLocaleDateString(localeTag(lang), { day: 'numeric', month: 'long' })
}

export function groupByDay(attempts: Attempt[], lang: Lang) {
  const sorted = [...attempts].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const groups: { key: string; label: string; attempts: Attempt[] }[] = []
  for (const attempt of sorted) {
    const key = dayKey(attempt.createdAt)
    const last = groups.at(-1)
    if (!last || last.key !== key) {
      groups.push({ key, label: formatDayLabel(attempt.createdAt, lang), attempts: [attempt] })
    } else {
      last.attempts.push(attempt)
    }
  }
  return groups
}

export function attemptCount(count: number, lang: Lang): string {
  const copy = ui(lang)
  if (lang === 'en') return `${count} ${count === 1 ? copy.attemptOne : copy.attemptFew}`
  return plural(count, copy.attemptOne, copy.attemptFew, copy.attemptMany)
}

export function gradeGroup(label: string): string {
  return label.match(/\d/)?.[0] ?? ''
}

export function attemptNumber(attempt: Attempt, all: Attempt[]): number {
  const ordered = [...all].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  return ordered.findIndex((item) => item.id === attempt.id) + 1
}

export function attemptStatusLabel(attempt: Attempt, lang: Lang): string {
  const copy = ui(lang)
  if (attempt.status === 'processing') return copy.reviewing
  if (attempt.status === 'rejected') return copy.notReviewed
  if (attempt.status === 'failed') return copy.statusFailed
  if (attempt.status === 'limited') return copy.partialReview
  if (attempt.result === 'unknown') return copy.reviewReady
  if (attempt.result === 'sent') return copy.sent
  return copy.notSent
}

export function attemptHref(attempt: Attempt): string {
  if (attempt.status === 'ready' || attempt.status === 'limited') return `/attempt/${attempt.id}`
  return `/attempt/${attempt.id}/processing`
}
