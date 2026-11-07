import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import type { AthleteProfile } from '../../shared/api'
import { ConsentField, GenderField, MultiSelectField, NumberField, SelectField } from '../../shared/ui/Fields'
import { DISCIPLINE_OPTIONS, EXPERIENCE_OPTIONS, GRADE_OPTIONS } from '../../entities/profile'

const EMPTY: AthleteProfile = {
  nickname: '',
  heightCm: null,
  weightKg: null,
  ageYears: null,
  experience: null,
  disciplines: [],
  maxGrade: null,
  gender: null,
  consentAccepted: false,
}

const FIELD_ERRORS = {
  nickname: 'Введи имя или ник',
  heightCm: 'Рост',
  weightKg: 'Вес',
  ageYears: 'Лет',
  experience: 'Выбери опыт',
  disciplines: 'Выбери тип трасс',
  maxGrade: 'Выбери категорию',
  gender: 'Укажи пол',
  consent: 'Нужно согласие на обработку персональных данных',
} as const

type FieldKey = keyof typeof FIELD_ERRORS

function collectErrors(profile: AthleteProfile): Partial<Record<FieldKey, string>> {
  const errors: Partial<Record<FieldKey, string>> = {}
  if (!profile.nickname.trim()) errors.nickname = FIELD_ERRORS.nickname
  if (profile.heightCm == null) errors.heightCm = FIELD_ERRORS.heightCm
  if (profile.weightKg == null) errors.weightKg = FIELD_ERRORS.weightKg
  if (profile.ageYears == null) errors.ageYears = FIELD_ERRORS.ageYears
  if (!profile.experience) errors.experience = FIELD_ERRORS.experience
  if (profile.disciplines.length === 0) errors.disciplines = FIELD_ERRORS.disciplines
  if (!profile.maxGrade) errors.maxGrade = FIELD_ERRORS.maxGrade
  if (!profile.gender) errors.gender = FIELD_ERRORS.gender
  if (!profile.consentAccepted) errors.consent = FIELD_ERRORS.consent
  return errors
}

function isComplete(profile: AthleteProfile): boolean {
  return Object.keys(collectErrors(profile)).length === 0
}

function themeMeta(): HTMLMetaElement | null {
  return document.querySelector('meta[name="theme-color"]')
}

function useFormChrome() {
  useEffect(() => {
    const previous = themeMeta()?.getAttribute('content') ?? null
    const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim()
    if (bg) themeMeta()?.setAttribute('content', bg)
    return () => {
      if (previous) themeMeta()?.setAttribute('content', previous)
    }
  }, [])
}

function clamp(value: number | null, min: number, max: number): number | null {
  if (value == null) return null
  return Math.min(max, Math.max(min, value))
}

export function ProfileForm({
  initial,
  submitLabel,
  onSubmit,
}: {
  initial: AthleteProfile | null
  submitLabel: string
  onSubmit: (profile: AthleteProfile) => Promise<void>
}) {
  const [profile, setProfile] = useState<AthleteProfile>(
    initial ? { ...EMPTY, ...initial, ageYears: initial.ageYears ?? null } : EMPTY,
  )
  const [errors, setErrors] = useState<Partial<Record<FieldKey, string>>>({})
  const [saving, setSaving] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  useFormChrome()

  function patch(next: Partial<AthleteProfile>) {
    setProfile((current) => ({ ...current, ...next }))
    setErrors((current) => {
      const copy = { ...current }
      if ('nickname' in next) delete copy.nickname
      if ('heightCm' in next) delete copy.heightCm
      if ('weightKg' in next) delete copy.weightKg
      if ('ageYears' in next) delete copy.ageYears
      if ('experience' in next) delete copy.experience
      if ('disciplines' in next) delete copy.disciplines
      if ('maxGrade' in next) delete copy.maxGrade
      if ('gender' in next) delete copy.gender
      if ('consentAccepted' in next) delete copy.consent
      return copy
    })
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (saving) return
    const nextErrors = collectErrors(profile)
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return
    setSaving(true)
    setSubmitError(null)
    try {
      await onSubmit({
        ...profile,
        nickname: profile.nickname.trim(),
        heightCm: clamp(profile.heightCm, 120, 250),
        weightKg: clamp(profile.weightKg, 35, 200),
        ageYears: clamp(profile.ageYears, 4, 101),
      })
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Не удалось сохранить профиль.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className="profile-form" onSubmit={handleSubmit} aria-busy={saving}>
      <label className="field">
        <span className="visually-hidden">Имя или ник</span>
        <input
          className={errors.nickname ? 'field-control is-invalid' : 'field-control'}
          placeholder={errors.nickname ?? 'Введи свое имя/никнейм'}
          maxLength={24}
          autoComplete="nickname"
          value={errors.nickname ? profile.nickname.trim() : profile.nickname}
          onChange={(event) => patch({ nickname: event.target.value })}
        />
      </label>

      <div className="field-row">
        <NumberField
          value={profile.heightCm}
          placeholder="Рост"
          invalid={Boolean(errors.heightCm)}
          onChange={(heightCm) => patch({ heightCm })}
        />
        <NumberField
          value={profile.weightKg}
          placeholder="Вес"
          invalid={Boolean(errors.weightKg)}
          onChange={(weightKg) => patch({ weightKg })}
        />
        <NumberField
          value={profile.ageYears}
          placeholder="Лет"
          invalid={Boolean(errors.ageYears)}
          onChange={(ageYears) => patch({ ageYears })}
        />
      </div>

      <SelectField
        value={profile.experience}
        placeholder="Опыт"
        error={errors.experience}
        options={EXPERIENCE_OPTIONS}
        onChange={(experience) => patch({ experience })}
      />
      <MultiSelectField
        value={profile.disciplines}
        placeholder="Тип трасс"
        error={errors.disciplines}
        options={DISCIPLINE_OPTIONS}
        onChange={(disciplines) => patch({ disciplines })}
      />
      <SelectField
        value={profile.maxGrade}
        placeholder="Макс. категория трасс"
        error={errors.maxGrade}
        options={GRADE_OPTIONS}
        onChange={(maxGrade) => patch({ maxGrade })}
      />
      <GenderField value={profile.gender} error={errors.gender} onChange={(gender) => patch({ gender })} />
      <ConsentField
        checked={profile.consentAccepted}
        error={errors.consent}
        onChange={(consentAccepted) => patch({ consentAccepted })}
      />
      {submitError && <p role="alert">{submitError}</p>}
      <button className={isComplete(profile) ? 'btn btn-light is-ready' : 'btn btn-light'} type="submit" disabled={saving}>
        {saving ? 'Сохраняем…' : submitLabel}
      </button>
    </form>
  )
}
