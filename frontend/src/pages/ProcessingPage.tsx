import { useEffect } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { useSession } from '../app/session'
import type { AnalysisStage } from '../shared/api'
import { ScreenHeader } from '../shared/ui/ScreenHeader'
import { SvgIcon } from '../shared/ui/SvgIcon'

const STEPS: { id: Exclude<AnalysisStage, 'done'>; title: string }[] = [
  { id: 'holds', title: 'Определяем зацепки и трассу' },
  { id: 'movement', title: 'Отслеживаем руки, ноги и корпус' },
  { id: 'rules', title: 'Собираем рекомендации' },
]

function stageIndex(stage: AnalysisStage): number {
  if (stage === 'holds') return 0
  if (stage === 'movement') return 1
  if (stage === 'rules') return 2
  return 3
}

export function ProcessingPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { attempts, ready, statusError } = useSession()
  const attempt = attempts.find((item) => item.id === id)

  useEffect(() => {
    if (attempt?.status !== 'ready' && attempt?.status !== 'limited') return
    const timer = window.setTimeout(() => {
      navigate(`/attempt/${attempt.id}`, { replace: true })
    }, 450)
    return () => window.clearTimeout(timer)
  }, [attempt?.id, attempt?.status, navigate])

  if (!ready) return null
  if (!attempt) return <Navigate to="/climbs" replace />

  const current = stageIndex(attempt.stage)
  const rejected = attempt.status === 'rejected'
  const stopped = rejected || attempt.status === 'failed'

  return (
    <div className="screen">
      <ScreenHeader
        title={stopped ? 'Разбор не получился' : 'Разбор'}
        onBack={() => navigate('/climbs')}
      />
      {(!stopped || current < STEPS.length) && <ol className="step-list stagger">
        {STEPS.map((step, index) => {
          if (stopped && index !== current) return null
          const state = stopped ? 'failed' : index < current ? 'done' : index === current ? 'active' : 'pending'
          return (
            <li key={step.id} className={`step is-${state}`}>
              <span className="step-mark" aria-hidden="true">
                {state === 'done' ? '✓' : state === 'failed' ? '!' : ''}
              </span>
              <span>{step.title}</span>
            </li>
          )
        })}
      </ol>}
      {stopped ? (
        <article className="card fail-card">
          <div className="fail-art">
            <SvgIcon src="/male-falling.svg" size={72} />
          </div>
          <p className="card-kicker">{rejected ? 'Данных для разбора недостаточно' : 'Ошибка обработки'}</p>
          <p>{attempt.rejectReason || (rejected ? 'Попробуй снять трассу целиком с неподвижной камеры.' : 'Не удалось завершить обработку видео.')}</p>
          {attempt.limitations?.length ? <ul>{attempt.limitations.map((reason) => <li key={reason}>{reason}</li>)}</ul> : null}
          <button type="button" className="btn btn-orange" onClick={() => navigate('/attempt/new')}>
            Добавить новое видео
          </button>
        </article>
      ) : <p className="template-note" role="status">{statusError ? 'Связь прервалась. Проверим статус снова.' : 'Можно закрыть приложение. Разбор сохранится в истории.'}</p>}
    </div>
  )
}
