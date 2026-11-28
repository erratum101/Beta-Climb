import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import type { AthleteProfile } from '../../shared/api'
import { ConsentField, GenderField, MultiSelectField, NumberField, SelectField } from '../../shared/ui/Fields'
import { disciplineOptions, experienceOptions, gradeOptions } from '../../entities/profile'
import { useLang, useUi } from '../../shared/i18n'
import type { Ui } from '../../shared/copy'

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

type FieldKey = 'nickname' | 'heightCm' | 'weightKg' | 'ageYears' | 'experience' | 'disciplines' | 'maxGrade' | 'gender' | 'consent'

function collectErrors(profile: AthleteProfile, copy: Ui): Partial<Record<FieldKey, string>> {
  const errors: Partial<Record<FieldKey, string>> = {}
  if (!profile.nickname.trim()) errors.nickname = copy.errNickname
  if (profile.heightCm == null) errors.heightCm = copy.height
  if (profile.weightKg == null) errors.weightKg = copy.weight
  if (profile.ageYears == null) errors.ageYears = copy.years
  if (!profile.experience) errors.experience = copy.errExperience
  if (profile.disciplines.length === 0) errors.disciplines = copy.errDisciplines
  if (!profile.maxGrade) errors.maxGrade = copy.errGrade
  if (!profile.gender) errors.gender = copy.errGender
  if (!profile.consentAccepted) errors.consent = copy.errConsent
  return errors
}

function isComplete(profile: AthleteProfile, copy: Ui): boolean {
  return Object.keys(collectErrors(profile, copy)).length === 0
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
  const lang = useLang()
  const copy = useUi()
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
    const nextErrors = collectErrors(profile, copy)
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
      setSubmitError(error instanceof Error ? error.message : copy.saveProfileFailed)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className="profile-form stagger" onSubmit={handleSubmit} aria-busy={saving}>
      <label className="field">
        <span className="visually-hidden">{copy.nameOrNick}</span>
        <input
          className={errors.nickname ? 'field-control is-invalid' : 'field-control'}
          placeholder={errors.nickname ?? copy.namePlaceholder}
          maxLength={24}
          autoComplete="nickname"
          value={errors.nickname ? profile.nickname.trim() : profile.nickname}
          onChange={(event) => patch({ nickname: event.target.value })}
        />
      </label>

      <div className="field-row">
        <NumberField
          value={profile.heightCm}
          placeholder={copy.height}
          invalid={Boolean(errors.heightCm)}
          onChange={(heightCm) => patch({ heightCm })}
        />
        <NumberField
          value={profile.weightKg}
          placeholder={copy.weight}
          invalid={Boolean(errors.weightKg)}
          onChange={(weightKg) => patch({ weightKg })}
        />
        <NumberField
          value={profile.ageYears}
          placeholder={copy.years}
          invalid={Boolean(errors.ageYears)}
          onChange={(ageYears) => patch({ ageYears })}
        />
      </div>

      <SelectField
        value={profile.experience}
        placeholder={copy.experience}
        error={errors.experience}
        options={experienceOptions(lang)}
        onChange={(experience) => patch({ experience })}
      />
      <MultiSelectField
        value={profile.disciplines}
        placeholder={copy.routeTypes}
        error={errors.disciplines}
        options={disciplineOptions(lang)}
        onChange={(disciplines) => patch({ disciplines })}
      />
      <SelectField
        value={profile.maxGrade}
        placeholder={copy.maxRouteGrade}
        error={errors.maxGrade}
        options={gradeOptions(lang)}
        onChange={(maxGrade) => patch({ maxGrade })}
      />
      <GenderField value={profile.gender} error={errors.gender} onChange={(gender) => patch({ gender })} />
      <ConsentField
        checked={profile.consentAccepted}
        error={errors.consent}
        onChange={(consentAccepted) => patch({ consentAccepted })}
      />
      {submitError && <p role="alert">{submitError}</p>}
      <button className={isComplete(profile, copy) ? 'btn btn-light is-ready' : 'btn btn-light'} type="submit" disabled={saving}>
        {saving ? copy.saving : submitLabel}
      </button>
    </form>
  )
}
