import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { AttemptStage } from '../features/analysis/AttemptStage'
import { climbApi, type AnalysisMoment, type Attempt } from '../shared/api'
import { ScreenHeader } from '../shared/ui/ScreenHeader'
import { ChipButton } from '../shared/ui/ChipButton'
import { IconChevron, IconEye, IconPlus } from '../shared/ui/icons'
import '../features/analysis/review.css'

export function AnalysisPage() {
  const { id } = useParams()
  return id ? <AnalysisDetail key={id} id={id} /> : <Navigate to="/climbs" replace />
}

function AnalysisDetail({ id }: { id: string }) {
  const [attempt, setAttempt] = useState<Attempt | null>()
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    let active = true
    setError('')
    void climbApi.getAttempt(id).then((data) => { if (active) setAttempt(data) }).catch((reason) => {
      if (active) setError(reason instanceof Error ? reason.message : 'Не удалось загрузить разбор.')
    })
    return () => { active = false }
  }, [id, retry])
  if (error) return (
    <div className="screen screen-center">
      <p role="alert">{error}</p>
      <button className="btn btn-light" onClick={() => setRetry((value) => value + 1)}>Попробовать снова</button>
    </div>
  )
  if (attempt === undefined) return <div className="screen screen-center" role="status">Загружаем разбор…</div>
  if (attempt === null) return <Navigate to="/climbs" replace />
  if (attempt.status !== 'ready' && attempt.status !== 'limited') return <Navigate to={`/attempt/${id}/processing`} replace />
  return <Analysis attempt={attempt} />
}

const ROUTE_COLORS: Record<string, [string, string]> = {
  red: ['Красный', 'var(--hold-red)'], orange: ['Оранжевый', 'var(--accent)'], yellow: ['Жёлтый', '#f5c83e'],
  green: ['Зелёный', 'var(--hold-green)'], cyan: ['Голубой', '#51c4da'], blue: ['Синий', '#427be4'],
  purple: ['Фиолетовый', '#a16bda'], pink: ['Розовый', 'var(--hold-pink)'],
}

function timestamp(seconds: number) {
  const tenths = Math.round(seconds * 10)
  const whole = Math.floor(tenths / 10)
  const fraction = tenths % 10
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}${fraction ? ',' + fraction : ''}`
}

function Analysis({ attempt }: { attempt: Attempt }) {
  const navigate = useNavigate()
  const moments = [...attempt.moments].sort((a, b) => a.startSec - b.startSec)
  const initial = moments.find((moment) => moment.primary) ?? moments[0]
  const [selectedId, setSelectedId] = useState(initial?.id)
  const selected = moments.find((moment) => moment.id === selectedId)
  const [time, setTime] = useState(initial?.timeSec ?? 0)
  const [routePreview, setRoutePreview] = useState(false)
  const [mediaReady, setMediaReady] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const seekTarget = useRef(time)
  const episodeEnd = useRef<number | null>(null)
  const previousTime = useRef(0)
  const route = attempt.route?.status === 'hypothesis' ? attempt.route : undefined
  const routeColor = route?.color ? ROUTE_COLORS[route.color] : undefined
  const current = moments.find((m) => m.id === selectedId && time >= m.startSec && time < m.endSec)
    ?? moments.find((m) => time >= m.startSec && time < m.endSec)
  const holdIds = (routePreview && time <= 0.05 ? route?.holdIds : current?.holdIds) ?? []

  function seek(seconds: number) {
    seekTarget.current = seconds
    const player = videoRef.current
    if (player && player.readyState >= 1) {
      player.currentTime = Number.isFinite(player.duration) ? Math.min(player.duration, seconds) : seconds
    }
    setTime(seconds)
  }

  function openMoment(moment: AnalysisMoment) {
    setRoutePreview(false)
    setSelectedId(moment.id)
    episodeEnd.current = moment.endSec
    seek(moment.timeSec)
    const player = videoRef.current
    if (player) {
      revealVideo(player)
      void player.play().catch(() => { episodeEnd.current = null })
    }
  }

  function playbackTime(seconds: number) {
    setTime(seconds)
    if (episodeEnd.current !== null || routePreview || videoRef.current?.paused) return
    const next = moments.find((m) => seconds >= m.startSec && seconds < m.endSec)
    if (next) setSelectedId(next.id)
  }

  function scrub(seconds: number) {
    setRoutePreview(false)
    episodeEnd.current = null
    seek(seconds)
    const next = moments.find((m) => seconds >= m.startSec && seconds < m.endSec)
    if (next) setSelectedId(next.id)
  }

  function toggleRoute() {
    const player = videoRef.current
    if (!player || player.readyState < 1) return
    episodeEnd.current = null
    player.pause()
    if (routePreview) {
      seek(previousTime.current)
    } else {
      previousTime.current = player.currentTime
      seek(0)
      revealVideo(player)
    }
    setRoutePreview(!routePreview)
  }

  const limits = attempt.limitations?.length ? attempt.limitations
    : attempt.status === 'limited' ? ['Данных хватило для частичного разбора.'] : []
  const colorStyle = routeColor ? { '--review-route-color': routeColor[1] } as CSSProperties : undefined

  return (
    <main className="screen review-screen" style={colorStyle}>
      <div className="review-content">
        <ScreenHeader title="Разбор попытки" onBack={() => navigate('/climbs')} trailing={
          <button type="button" className="icon-btn" onClick={() => navigate('/attempt/new')}
            aria-label="Добавить попытку" title="Добавить попытку"><IconPlus size={20} /></button>
        } />
        <div className="card review-sheet">
          <AttemptStage attempt={attempt} videoRef={videoRef} episodeEnd={episodeEnd} time={time} holdIds={holdIds}
            onTime={playbackTime} onResume={() => setRoutePreview(false)} onScrub={scrub}
            onMediaReady={(ready) => {
              setMediaReady(ready)
              if (ready) seek(seekTarget.current)
              else setRoutePreview(false)
            }}>
            <section className="review-panel" aria-label="Разбор эпизодов">
              {selected ? <>
                <div className="review-checkpoints" role="group" aria-label="Эпизоды по времени">
                  <span aria-hidden="true">Эпизоды</span>
                  {moments.map((moment) => (
                    <ChipButton key={moment.id} className="review-checkpoint"
                      selected={selected.id === moment.id} aria-controls="review-note"
                      aria-label={`Эпизод ${timestamp(moment.timeSec)}. ${moment.title}`}
                      onClick={() => openMoment(moment)}>
                      {timestamp(moment.timeSec)}
                    </ChipButton>
                  ))}
                </div>
                <article className="review-note" id="review-note" key={selected.id}>
                  <h2>{selected.title}</h2>
                  {selected.action && <div className="review-action">
                    <h3>Что попробовать</h3>
                    <p>{selected.action}</p>
                  </div>}
                  {(selected.happened || selected.problem) && <details className="review-evidence">
                    <summary>Разобрать движение <IconChevron /></summary>
                    {selected.happened && <div><h3>Что видно на записи</h3><p>{selected.happened}</p></div>}
                    {selected.problem && <div><h3>Возможное объяснение</h3><p>{selected.problem}</p></div>}
                  </details>}
                </article>
              </> : <p className="review-empty">На этой записи не удалось уверенно выделить эпизод для совета.</p>}
              {routeColor && <div className="review-route">
                <div><span>Вероятный цвет трассы</span>
                  <strong><i aria-hidden="true" />{routeColor[0]}</strong>
                </div>
                {Boolean(route?.holdIds?.length) && <button type="button" className="filter-btn review-route-button"
                  disabled={!mediaReady} aria-pressed={routePreview} onClick={toggleRoute}
                  aria-label={routePreview ? 'Скрыть зацепки и вернуться к эпизоду' : 'Показать зацепки на первом кадре'}
                  title={routePreview ? 'Скрыть зацепки' : 'Показать зацепки на первом кадре'}>
                  <IconEye crossed={routePreview} />
                </button>}
              </div>}
            </section>
          </AttemptStage>
          {attempt.previousAttemptId && attempt.change && <button type="button" className="review-compare"
            onClick={() => navigate(`/compare/${attempt.id}`)}>Сравнить попытки</button>}
          {limits.length > 0 && <details className="review-limits">
            <summary>Ограничения разбора <IconChevron /></summary>
            <ul>{limits.map((reason) => <li key={reason}>{reason}</li>)}</ul>
          </details>}
        </div>
      </div>
    </main>
  )
}

function revealVideo(player: HTMLVideoElement) {
  const picture = player.getBoundingClientRect()
  if (picture.top < 0 || picture.bottom > window.innerHeight) player.scrollIntoView({ block: 'nearest' })
}
