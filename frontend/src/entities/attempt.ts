import type { Attempt, AttemptResult } from '../shared/api'

export const RESULT_LABEL: Record<AttemptResult, string> = {
  sent: 'Пройдена',
  failed: 'Не пройдена',
  unknown: 'Результат прохождения неизвестен',
}

export function plural(count: number, one: string, few: string, many: string): string {
  const n10 = count % 10
  const n100 = count % 100
  if (n10 === 1 && n100 !== 11) return `${count} ${one}`
  if (n10 >= 2 && n10 <= 4 && (n100 < 12 || n100 > 14)) return `${count} ${few}`
  return `${count} ${many}`
}

export function formatSeconds(value: number): string {
  return `${value.toFixed(1)} с`
}

export function dayKey(iso: string): string {
  const date = new Date(iso)
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

export function formatDayLabel(iso: string): string {
  const date = new Date(iso)
  const today = new Date()
  const yesterday = new Date()
  yesterday.setDate(today.getDate() - 1)
  if (dayKey(iso) === dayKey(today.toISOString())) return 'Сегодня'
  if (dayKey(iso) === dayKey(yesterday.toISOString())) return 'Вчера'
  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })
}

export function groupByDay(attempts: Attempt[]) {
  const sorted = [...attempts].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const groups: { key: string; label: string; attempts: Attempt[] }[] = []
  for (const attempt of sorted) {
    const key = dayKey(attempt.createdAt)
    const last = groups.at(-1)
    if (!last || last.key !== key) {
      groups.push({ key, label: formatDayLabel(attempt.createdAt), attempts: [attempt] })
    } else {
      last.attempts.push(attempt)
    }
  }
  return groups
}

export function gradeGroup(label: string): string {
  return label.match(/\d/)?.[0] ?? ''
}

export function attemptNumber(attempt: Attempt, all: Attempt[]): number {
  const ordered = [...all].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  return ordered.findIndex((item) => item.id === attempt.id) + 1
}

export function attemptStatusLabel(attempt: Attempt): string {
  if (attempt.status === 'processing') return 'Разбираем'
  if (attempt.status === 'rejected') return 'Не разобрана'
  if (attempt.status === 'failed') return 'Ошибка обработки'
  if (attempt.status === 'limited') return 'Частичный разбор'
  return attempt.result === 'unknown' ? 'Разбор готов' : RESULT_LABEL[attempt.result]
}

export function attemptHref(attempt: Attempt): string {
  if (attempt.status === 'ready' || attempt.status === 'limited') return `/attempt/${attempt.id}`
  return `/attempt/${attempt.id}/processing`
}
