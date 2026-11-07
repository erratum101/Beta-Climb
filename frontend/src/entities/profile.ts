import type { Discipline, ExperienceId, GradeBandId } from '../shared/api'

export const EXPERIENCE_OPTIONS: { value: ExperienceId; label: string }[] = [
  { value: 'lt1m', label: 'Меньше месяца' },
  { value: 'm1to3', label: '1–3 месяца' },
  { value: 'm3to6', label: '3–6 месяцев' },
  { value: 'm6to12', label: '6–12 месяцев' },
  { value: 'gt1y', label: 'Больше года' },
]

export const DISCIPLINE_OPTIONS: { value: Discipline; label: string }[] = [
  { value: 'bouldering', label: 'Болдеринг' },
  { value: 'lead', label: 'Трудность' },
  { value: 'speed', label: 'Скорость' },
]

export const GRADE_OPTIONS: { value: GradeBandId; label: string }[] = [
  { value: 'novice', label: 'Новичок (5a–5c)' },
  { value: 'amateur', label: 'Любитель (6a–6c)' },
  { value: 'advanced', label: 'Продвинутый (7a–8a)' },
  { value: 'expert', label: 'Опытный (8a+)' },
]

const GRADE_LABEL: Record<GradeBandId, string> = {
  novice: '5c',
  amateur: '6a',
  advanced: '7a',
  expert: '8a',
}

export function gradeLabelFromBand(band: GradeBandId | null): string {
  if (!band) return '6a'
  return GRADE_LABEL[band]
}

const EXPERIENCE_SHORT: Record<ExperienceId, string> = {
  lt1m: '<1м.',
  m1to3: '3м.',
  m3to6: '6м.',
  m6to12: '1г.',
  gt1y: '>1г.',
}

export function experienceShort(experience: ExperienceId | null): string {
  if (!experience) return '—'
  return EXPERIENCE_SHORT[experience]
}

export function experienceLabel(experience: ExperienceId | null): string {
  return EXPERIENCE_OPTIONS.find((item) => item.value === experience)?.label ?? 'Опыт не указан'
}
