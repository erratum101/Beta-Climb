import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSession } from '../app/session'
import { experienceLabel, experienceShort, gradeLabelFromBand } from '../entities/profile'
import type { Attempt } from '../shared/api'
import { clearCaptureGuide } from '../features/capture/CaptureGuide'
import { ProfileForm } from '../features/onboarding/ProfileForm'
import { ScreenHeader } from '../shared/ui/ScreenHeader'
import { IconPlus } from '../shared/ui/icons'
import { SvgIcon } from '../shared/ui/SvgIcon'

export function OnboardingPage() {
  const navigate = useNavigate()
  const { saveProfile } = useSession()
  return (
    <div className="screen profile-screen">
      <h1 className="profile-title">Расскажи о себе</h1>
      <ProfileForm
        initial={null}
        submitLabel="Полезли!"
        onSubmit={(profile) => {
          void saveProfile(profile).then(() => navigate('/welcome', { replace: true }))
        }}
      />
    </div>
  )
}

function sendRate(attempts: Attempt[]): number {
  const scored = attempts.filter((item) => item.result === 'sent' || item.result === 'failed')
  if (scored.length === 0) return 0
  const sent = scored.filter((item) => item.result === 'sent').length
  return Math.round((sent / scored.length) * 100)
}

function withUnit(value: number | null, unit: string): string {
  if (value == null) return `—${unit}`
  return `${value}${unit}`
}

export function ProfilePage() {
  const navigate = useNavigate()
  const { profile, attempts, saveProfile, resetLocal, night, setNight } = useSession()
  const [editing, setEditing] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)
  const [soundOn, setSoundOn] = useState(true)

  if (!profile || editing) {
    return (
      <div className="screen profile-screen with-nav">
        <ScreenHeader title="Профиль" onBack={profile ? () => setEditing(false) : undefined} />
        <ProfileForm
          initial={profile}
          submitLabel="Сохранить"
          onSubmit={(next) => {
            void saveProfile(next).then(() => setEditing(false))
          }}
        />
        <button
          type="button"
          className="btn-text reset-btn"
          onClick={() => {
            if (!confirmReset) {
              setConfirmReset(true)
              return
            }
            clearCaptureGuide()
            void resetLocal().then(() => navigate('/onboarding', { replace: true }))
          }}
        >
          {confirmReset ? 'Точно сбросить данные' : 'Сбросить локальные данные'}
        </button>
      </div>
    )
  }

  const grade = gradeLabelFromBand(profile.maxGrade)
  const rate = sendRate(attempts)

  return (
    <div className={night ? 'profile-view is-night' : 'profile-view'}>
      <h1>Профиль</h1>
      <div className="profile-cluster">
        <div className="profile-bubble profile-rate" aria-label={`Доля удачных пролазов ${rate}%`}>
          <SvgIcon src="/male-climbing-icon.svg" size={28} />
          <span>{rate}%</span>
        </div>
        <button type="button" className="profile-bubble profile-info" aria-label="Изменить профиль" onClick={() => setEditing(true)}>
          <InfoMark />
        </button>
        <div className="profile-bubble profile-grade" aria-label={`Максимальная категория ${grade}`}>
          {grade}
        </div>
        <div className="profile-bubble profile-height" aria-label={`Рост ${profile.heightCm ?? 'не указан'} сантиметров`}>
          {withUnit(profile.heightCm, 'см.')}
        </div>
        <div className="profile-avatar" aria-label="Аватар не добавлен">
          <IconPlus />
        </div>
        <button
          type="button"
          className={soundOn ? 'profile-bubble profile-sound' : 'profile-bubble profile-sound is-muted'}
          aria-pressed={soundOn}
          aria-label={soundOn ? 'Выключить вибрацию' : 'Включить вибрацию'}
          onClick={() => setSoundOn((current) => !current)}
        >
          <span className="icon-swap">
            <span className={soundOn ? 'icon-swap-layer is-shown' : 'icon-swap-layer'}>
              <SvgIcon src="/vibro.svg" size={28} />
            </span>
            <span className={soundOn ? 'icon-swap-layer' : 'icon-swap-layer is-shown'}>
              <SvgIcon src="/vibro-off.svg" size={28} />
            </span>
          </span>
        </button>
        <button
          type="button"
          className="profile-bubble profile-theme"
          aria-pressed={night}
          aria-label={night ? 'Светлая тема' : 'Тёмная тема'}
          onClick={() => setNight((current) => !current)}
        >
          <span className="icon-swap">
            <span className={night ? 'icon-swap-layer' : 'icon-swap-layer is-shown'}>
              <MoonIcon />
            </span>
            <span className={night ? 'icon-swap-layer is-shown' : 'icon-swap-layer'}>
              <SvgIcon src="/light-mode.svg" size={28} />
            </span>
          </span>
        </button>
        <div className="profile-bubble profile-experience" aria-label={`Опыт ${experienceLabel(profile.experience)}`}>
          {experienceShort(profile.experience)}
        </div>
        <div className="profile-bubble profile-weight" aria-label={`Вес ${profile.weightKg ?? 'не указан'} килограмм`}>
          {withUnit(profile.weightKg, 'кг.')}
        </div>
        <button type="button" className="profile-bubble profile-name" onClick={() => setEditing(true)}>
          {profile.nickname}
        </button>
      </div>
    </div>
  )
}

function InfoMark() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <circle cx="12" cy="6.6" r="1.7" fill="currentColor" />
      <rect x="10.6" y="10" width="2.8" height="8.2" rx="1.4" fill="currentColor" />
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg viewBox="5.6 2 17 17" width="40" height="40" aria-hidden="true">
      <path fill="currentColor" d="M14.4 3.1a7.4 7.4 0 1 0 6.7 10.8A5.7 5.7 0 0 1 14.4 3.1z" />
    </svg>
  )
}
