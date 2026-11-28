import type { Discipline, ExperienceId, GradeBandId } from '../shared/api'
import { ui } from '../shared/copy'
import type { Lang } from '../shared/lang'

export function experienceOptions(lang: Lang): { value: ExperienceId; label: string }[] {
  const copy = ui(lang)
  return [
    { value: 'lt1m', label: copy.expLt1m },
    { value: 'm1to3', label: copy.exp1to3 },
    { value: 'm3to6', label: copy.exp3to6 },
    { value: 'm6to12', label: copy.exp6to12 },
    { value: 'gt1y', label: copy.expGt1y },
  ]
}

export function disciplineOptions(lang: Lang): { value: Discipline; label: string }[] {
  const copy = ui(lang)
  return [
    { value: 'bouldering', label: copy.boulder },
    { value: 'lead', label: copy.lead },
    { value: 'speed', label: copy.speed },
  ]
}

export function gradeOptions(lang: Lang): { value: GradeBandId; label: string }[] {
  const copy = ui(lang)
  return [
    { value: 'novice', label: copy.gradeNovice },
    { value: 'amateur', label: copy.gradeAmateur },
    { value: 'advanced', label: copy.gradeAdvanced },
    { value: 'expert', label: copy.gradeExpert },
  ]
}

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

export function experienceShort(experience: ExperienceId | null, lang: Lang): string {
  if (!experience) return '—'
  const copy = ui(lang)
  const labels: Record<ExperienceId, string> = {
    lt1m: copy.expShortLt1m,
    m1to3: copy.expShort1to3,
    m3to6: copy.expShort3to6,
    m6to12: copy.expShort6to12,
    gt1y: copy.expShortGt1y,
  }
  return labels[experience]
}

export function experienceLabel(experience: ExperienceId | null, lang: Lang): string {
  return experienceOptions(lang).find((item) => item.value === experience)?.label ?? ui(lang).expMissing
}
