import { useNavigate } from 'react-router-dom'
import { useSession } from '../app/session'
import { attemptCount, attemptHref, attemptStatusLabel, groupByDay } from '../entities/attempt'
import { useLang, useUi } from '../shared/i18n'
import { sharedNavigate } from '../shared/ui/motion'

export function HistoryPage() {
  const navigate = useNavigate()
  const { attempts } = useSession()
  const lang = useLang()
  const t = useUi()
  const groups = groupByDay(attempts, lang)

  if (attempts.length === 0) {
    return (
      <div className="screen with-nav">
        <h1 className="page-title">{t.history}</h1>
        <div className="empty-copy">
          <p>{t.historyEmpty}</p>
          <button type="button" className="btn btn-light" onClick={() => navigate('/attempt/new')}>
            {t.addClimb}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="screen with-nav">
      <h1 className="page-title">{t.history}</h1>
      {groups.map((group) => (
        <section key={group.key} className="history-block">
          <div className="history-head">
            <h2>{group.label}</h2>
            <p>{attemptCount(group.attempts.length, lang)}</p>
          </div>
          <div className="card route-card">
            <div className="route-list stagger">
              {group.attempts.map((attempt) => (
                <button
                  key={attempt.id}
                  type="button"
                  className="route-item"
                  onClick={(event) => sharedNavigate(navigate, attemptHref(attempt), event.currentTarget)}
                >
                  <span>{attempt.fileName}</span>
                  <em>{attemptStatusLabel(attempt, lang)}</em>
                </button>
              ))}
            </div>
          </div>
        </section>
      ))}
    </div>
  )
}
