import { useEffect } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { useSession } from '../app/session'
import type { AnalysisStage } from '../shared/api'
import { useUi } from '../shared/i18n'
import { ScreenHeader } from '../shared/ui/ScreenHeader'
import { SvgIcon } from '../shared/ui/SvgIcon'

const STEP_IDS = ['holds', 'movement', 'rules'] as const satisfies readonly Exclude<AnalysisStage, 'done'>[]

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
  const t = useUi()
  const steps = [
    { id: STEP_IDS[0], title: t.stepHolds },
    { id: STEP_IDS[1], title: t.stepMovement },
    { id: STEP_IDS[2], title: t.stepRules },
  ]
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
        title={stopped ? t.reviewFailedTitle : t.review}
        onBack={() => navigate('/climbs')}
      />
      {(!stopped || current < steps.length) && <ol className="step-list stagger">
        {steps.map((step, index) => {
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
          <p className="card-kicker">{rejected ? t.notEnoughData : t.processingError}</p>
          <p>{attempt.rejectReason || (rejected ? t.filmStill : t.processFailed)}</p>
          {attempt.limitations?.length ? <ul>{attempt.limitations.map((reason) => <li key={reason}>{reason}</li>)}</ul> : null}
          <button type="button" className="btn btn-orange" onClick={() => navigate('/attempt/new')}>
            {t.addAnotherVideo}
          </button>
        </article>
      ) : <p className="template-note" role="status">{statusError ? t.connectionDropped : t.canClose}</p>}
    </div>
  )
}
