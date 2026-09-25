import { useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useSession } from '../app/session'
import { gradeLabelFromBand } from '../entities/profile'
import { ScreenHeader } from '../shared/ui/ScreenHeader'

const RULES = [
  'Один спортсмен в кадре',
  'Камера стоит неподвижно',
  'Весь нужный участок стены в кадре',
  'Цвета трасс хорошо различимы',
  'Изображение чёткое',
]

export function NewAttemptPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const from = params.get('from') ?? undefined
  const { profile, attempts, startAttempt } = useSession()
  const previous = attempts.find((attempt) => attempt.id === from)
  const inputRef = useRef<HTMLInputElement>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function begin(reject: boolean) {
    if (!profile || pending) return
    setPending(true)
    const attempt = await startAttempt({
      fileName: fileName ?? undefined,
      previousAttemptId: from,
      reject,
      gradeLabel: previous?.gradeLabel ?? gradeLabelFromBand(profile.maxGrade),
      discipline: previous?.discipline ?? profile.disciplines[0] ?? 'bouldering',
    })
    navigate(`/attempt/${attempt.id}/processing`)
  }

  return (
    <div className="screen">
      <ScreenHeader title="Новая попытка" onBack={() => navigate('/climbs')} />
      {previous ? <p className="summary">Повтор трассы {previous.gradeLabel} после рекомендации</p> : null}
      <ul className="rules">
        {RULES.map((rule) => (
          <li key={rule}>{rule}</li>
        ))}
      </ul>
      <button type="button" className="upload" onClick={() => inputRef.current?.click()}>
        <strong>{fileName ?? 'Выбрать видео'}</strong>
        <small>Файл остаётся на устройстве и никуда не отправляется</small>
      </button>
      <input
        ref={inputRef}
        className="visually-hidden"
        type="file"
        accept="video/*"
        onChange={(event) => setFileName(event.target.files?.[0]?.name ?? null)}
      />
      <div className="actions">
        <button type="button" className="btn btn-light" disabled={pending} onClick={() => void begin(false)}>
          Разобрать попытку
        </button>
        <button type="button" className="btn btn-ghost" disabled={pending} onClick={() => void begin(true)}>
          Кадр не подходит — показать отказ
        </button>
      </div>
      <p className="template-note">
        В этом шаблоне разбор имитируется на примере. Модели, сервер и база не подключены.
      </p>
    </div>
  )
}
