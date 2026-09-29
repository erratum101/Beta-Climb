import { useRef, useState, type ChangeEvent } from 'react'
import { createPortal } from 'react-dom'
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

const AVATAR_KEY = 'beta-climb.avatar'

function readAvatar(): string | null {
  try {
    return localStorage.getItem(AVATAR_KEY)
  } catch {
    return null
  }
}

function storeAvatar(value: string | null) {
  try {
    if (value) localStorage.setItem(AVATAR_KEY, value)
    else localStorage.removeItem(AVATAR_KEY)
  } catch {
    /* private mode or quota */
  }
}

function cropAvatar(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      const size = 512
      const canvas = document.createElement('canvas')
      canvas.width = size
      canvas.height = size
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        URL.revokeObjectURL(url)
        reject(new Error('canvas'))
        return
      }
      const scale = Math.max(size / image.width, size / image.height)
      const width = image.width * scale
      const height = image.height * scale
      ctx.drawImage(image, (size - width) / 2, (size - height) / 2, width, height)
      URL.revokeObjectURL(url)
      resolve(canvas.toDataURL('image/jpeg', 0.86))
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('image'))
    }
    image.src = url
  })
}

export function ProfilePage() {
  const navigate = useNavigate()
  const { profile, attempts, saveProfile, resetLocal, night, setNight } = useSession()
  const [editing, setEditing] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)
  const [soundOn, setSoundOn] = useState(true)
  const [avatar, setAvatar] = useState(readAvatar)
  const fileRef = useRef<HTMLInputElement>(null)

  function onAvatarPick(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    void cropAvatar(file).then((next) => {
      setAvatar(next)
      storeAvatar(next)
    })
  }

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
            storeAvatar(null)
            setAvatar(null)
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
        <button
          type="button"
          className={avatar ? 'profile-avatar has-photo' : 'profile-avatar'}
          aria-label={avatar ? 'Сменить фото профиля' : 'Добавить фото профиля'}
          onClick={() => fileRef.current?.click()}
        >
          {avatar ? <img src={avatar} alt="" /> : <IconPlus />}
        </button>
        {createPortal(
          <input
            ref={fileRef}
            className="profile-avatar-input"
            type="file"
            accept="image/*"
            tabIndex={-1}
            aria-hidden="true"
            onChange={onAvatarPick}
          />,
          document.body,
        )}
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
              <SvgIcon src="/dark-mode.svg" size={28} />
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

