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
  const { attempts, ready } = useSession()
  const attempt = attempts.find((item) => item.id === id)

  useEffect(() => {
    if (attempt?.status !== 'ready') return
    const timer = window.setTimeout(() => {
      navigate(`/attempt/${attempt.id}`, { replace: true })
    }, 450)
    return () => window.clearTimeout(timer)
  }, [attempt?.id, attempt?.status, navigate])

  if (!ready) return null
  if (!attempt) return <Navigate to="/climbs" replace />

  const current = stageIndex(attempt.stage)
  const rejected = attempt.status === 'rejected'

  return (
    <div className="screen">
      <ScreenHeader
        title={rejected ? 'Разбор не получился' : 'Разбор'}
        onBack={() => navigate('/climbs')}
      />
      <ol className="step-list stagger">
        {STEPS.map((step, index) => {
          const state = rejected && index === 0 ? 'failed' : index < current ? 'done' : index === current && !rejected ? 'active' : 'pending'
          return (
            <li key={step.id} className={`step is-${state}`}>
              <span className="step-mark" aria-hidden="true">
                {state === 'done' ? '✓' : state === 'failed' ? '!' : ''}
              </span>
              <span>{step.title}</span>
            </li>
          )
        })}
      </ol>
      {rejected ? (
        <article className="card fail-card">
          <div className="fail-art">
            <SvgIcon src="/male-falling.svg" size={72} />
          </div>
          <p className="card-kicker">Достоверный разбор не получился</p>
          <p>{attempt.rejectReason}</p>
          <button type="button" className="btn btn-orange" onClick={() => navigate('/attempt/new')}>
            Снять ещё раз
          </button>
        </article>
      ) : (
        <p className="template-note">Статус обновляется локально. Очередь и Python-обработчик в шаблон не входят.</p>
      )}
    </div>
  )
}
