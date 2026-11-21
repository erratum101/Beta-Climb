import { useNavigate } from 'react-router-dom'
import { useSession } from '../app/session'
import { attemptHref, attemptStatusLabel, groupByDay, plural } from '../entities/attempt'
import { sharedNavigate } from '../shared/ui/motion'

export function HistoryPage() {
  const navigate = useNavigate()
  const { attempts } = useSession()
  const groups = groupByDay(attempts)

  if (attempts.length === 0) {
    return (
      <div className="screen with-nav">
        <h1 className="page-title">История</h1>
        <div className="empty-copy">
          <p>История появится после первой попытки</p>
          <button type="button" className="btn btn-light" onClick={() => navigate('/attempt/new')}>
            Добавить запись
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="screen with-nav">
      <h1 className="page-title">История</h1>
      {groups.map((group) => (
        <section key={group.key} className="history-block">
          <div className="history-head">
            <h2>{group.label}</h2>
            <p>{plural(group.attempts.length, 'попытка', 'попытки', 'попыток')}</p>
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
                  <em>{attemptStatusLabel(attempt)}</em>
                </button>
              ))}
            </div>
          </div>
        </section>
      ))}
    </div>
  )
}
