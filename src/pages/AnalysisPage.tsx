import { useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { useSession } from '../app/session'
import { RESULT_LABEL, formatSeconds, plural } from '../entities/attempt'
import { AttemptStage, usePlayback } from '../features/analysis/AttemptStage'
import type { AnalysisMoment } from '../shared/api'
import { ScreenHeader } from '../shared/ui/ScreenHeader'

export function AnalysisPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { attempts, ready } = useSession()
  const attempt = attempts.find((item) => item.id === id)
  const initial = attempt?.moments.find((moment) => moment.primary)?.timeSec ?? attempt?.moments[0]?.timeSec ?? 0
  const playback = usePlayback(attempt?.durationSec || 1, initial)
  const [opened, setOpened] = useState<string | null>(attempt?.moments.find((moment) => moment.primary)?.id ?? null)

  if (!ready) return null
  if (!attempt) return <Navigate to="/climbs" replace />
  if (attempt.status !== 'ready') return <Navigate to={`/attempt/${attempt.id}/processing`} replace />

  const primary = attempt.moments.find((moment) => moment.primary)
  const others = attempt.moments.filter((moment) => !moment.primary)

  function openMoment(moment: AnalysisMoment) {
    playback.seek(moment.timeSec)
    setOpened(moment.id)
  }

  return (
    <div className="screen">
      <ScreenHeader title="Разбор" onBack={() => navigate('/climbs')} />
      <AttemptStage
        attempt={attempt}
        time={playback.time}
        playing={playback.playing}
        onTime={playback.seek}
        onToggle={playback.toggle}
      />
      <div className="meta-row stagger">
        <span className="pill">Трасса {attempt.gradeLabel}</span>
        <span className="pill">{RESULT_LABEL[attempt.result]}</span>
        <span className="pill">{formatSeconds(attempt.durationSec)}</span>
      </div>
      <p className="section-label">
        Найдено {plural(attempt.moments.length, 'момент', 'момента', 'моментов')} для разбора
      </p>
      {primary ? (
        <article className="card">
          <p className="card-kicker">Главное в следующей попытке</p>
          <p className="lead">{attempt.primaryAction}</p>
        </article>
      ) : null}
      {attempt.change ? (
        <article className="card delta">
          <p className="card-kicker">Что изменилось</p>
          <p className="lead">{attempt.change.title}: {attempt.change.after.toLowerCase()}</p>
          <p>{attempt.change.note}</p>
        </article>
      ) : null}
      <div className="stack stagger">
        {primary ? <MomentCard moment={primary} current={playback.time} open={opened === primary.id} onOpen={() => openMoment(primary)} /> : null}
        {others.length > 0 ? <p className="section-label">Другие наблюдения</p> : null}
        {others.map((moment) => (
          <MomentCard
            key={moment.id}
            moment={moment}
            current={playback.time}
            open={opened === moment.id}
            onOpen={() => openMoment(moment)}
          />
        ))}
      </div>
      <div className="actions">
        <button type="button" className="btn btn-light" onClick={() => navigate(`/attempt/new?from=${attempt.id}`)}>
          Попробовать ещё раз
        </button>
        {attempt.previousAttemptId ? (
          <button type="button" className="btn btn-ghost" onClick={() => navigate(`/compare/${attempt.id}`)}>
            Сравнить попытки
          </button>
        ) : null}
      </div>
      <p className="template-note">
        Текст привязан к секундам как в готовом разборе. Это пример содержания, а не результат модели.
      </p>
    </div>
  )
}

function MomentCard({
  moment,
  current,
  open,
  onOpen,
}: {
  moment: AnalysisMoment
  current: number
  open: boolean
  onOpen: () => void
}) {
  const active = current >= moment.startSec && current <= moment.endSec
  return (
    <article className={['moment', active ? 'is-current' : '', open ? 'is-open' : ''].filter(Boolean).join(' ')}>
      <button type="button" className="moment-top" onClick={onOpen}>
        <span>
          <strong>{moment.title}</strong>
          {moment.improved ? <em>изменилось</em> : null}
        </span>
        <b>{formatSeconds(moment.timeSec)}</b>
      </button>
      <div className="moment-body" inert={open ? undefined : true}>
        <div className="moment-copy">
          <p><b>Что не так.</b> {moment.problem}</p>
          <p><b>Что произошло.</b> {moment.happened}</p>
          <p><b>Что сделать.</b> {moment.action}</p>
          <p className="moment-window">{formatSeconds(moment.startSec)} – {formatSeconds(moment.endSec)}</p>
        </div>
      </div>
    </article>
  )
}
