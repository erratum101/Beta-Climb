import { useContext } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSession } from '../app/session'
import { attemptHref, attemptStatusLabel, dayKey, formatSeconds, plural } from '../entities/attempt'
import { HomeGuideContext } from '../features/capture/CaptureGuide'
import { sharedNavigate } from '../shared/ui/motion'
import { WallThumb } from '../shared/ui/WallThumb'
import { Wordmark } from '../shared/ui/Wordmark'

export function HomePage() {
  const navigate = useNavigate()
  const { profile, attempts } = useSession()
  const recent = [...attempts].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 4)
  const todayKey = dayKey(new Date().toISOString())
  const today = attempts.filter((attempt) => dayKey(attempt.createdAt) === todayKey)
  const followed = today.filter((attempt) => attempt.change?.improved).length
  const routes = new Set(today.map((attempt) => attempt.gradeLabel)).size

  const guide = useContext(HomeGuideContext)

  if (attempts.length === 0) {
    return (
      <button type="button" className="screen screen-center empty-home" onClick={() => guide?.start()}>
        <span className="empty-mark">
          <svg className="empty-plus-icon" viewBox="0 0 55 55" fill="none" aria-hidden="true">
            <path d="M27.5 5V50M5 27.5H50" stroke="currentColor" strokeWidth="10" strokeLinecap="round" />
          </svg>
          <Wordmark />
          <span className="visually-hidden">Добавить запись</span>
        </span>
      </button>
    )
  }

  return (
    <div className="screen with-nav">
      <p className="hello">Привет, {profile?.nickname}</p>
      {today.length > 0 ? (
        <p className="summary">
          {plural(today.length, 'попытка', 'попытки', 'попыток')}
          {' · '}
          {plural(routes, 'трасса', 'трассы', 'трасс')}
          {followed > 0
            ? ` · ${plural(followed, 'рекомендация выполнена', 'рекомендации выполнены', 'рекомендаций выполнено')}`
            : ''}
        </p>
      ) : (
        <p className="summary">Сними попытку и получи разбор по моментам</p>
      )}
      <div className="list stagger">
        {recent.map((attempt) => (
          <button
            key={attempt.id}
            type="button"
            className="list-row"
            onClick={(event) => sharedNavigate(navigate, attemptHref(attempt), event.currentTarget)}
          >
            <span className="thumb-slot">
              <WallThumb variant={attempt.wallVariant} />
            </span>
            <span>
              <strong>
                {attempt.gradeLabel} · {attemptStatusLabel(attempt)}
              </strong>
              <em>
                {attempt.status === 'processing'
                  ? 'Определяем трассу и движение'
                  : attempt.status === 'rejected'
                    ? 'Кадр не подошёл для разбора'
                    : attempt.primaryAction}
              </em>
            </span>
            {attempt.durationSec > 0 ? <small>{formatSeconds(attempt.durationSec)}</small> : null}
          </button>
        ))}
      </div>
    </div>
  )
}
