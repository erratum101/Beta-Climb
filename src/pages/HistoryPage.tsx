import { useNavigate } from 'react-router-dom'
import { useSession } from '../app/session'
import { attemptHref, attemptNumber, attemptStatusLabel, groupByDay, groupByGrade, plural } from '../entities/attempt'
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
      {groups.map((group) => {
        const routes = new Set(group.attempts.map((attempt) => attempt.gradeLabel)).size
        const followed = group.attempts.filter((attempt) => attempt.change?.improved).length
        return (
          <section key={group.key} className="history-block">
            <div className="history-head">
              <h2>{group.label}</h2>
              <p>
                {plural(group.attempts.length, 'попытка', 'попытки', 'попыток')}
                {' · '}
                {plural(routes, 'трасса', 'трассы', 'трасс')}
                {followed > 0
                  ? ` · ${plural(followed, 'рекомендация выполнена', 'рекомендации выполнены', 'рекомендаций выполнено')}`
                  : ''}
              </p>
            </div>
            {groupByGrade(group.attempts).map((route) => (
              <div key={route.grade} className="card route-card">
                <p className="card-kicker">Трасса {route.grade}</p>
                <div className="route-list stagger">
                  {route.attempts.map((attempt) => (
                    <button
                      key={attempt.id}
                      type="button"
                      className="route-item"
                      onClick={(event) => sharedNavigate(navigate, attemptHref(attempt), event.currentTarget)}
                    >
                      <span>Попытка {attemptNumber(attempt, attempts)}</span>
                      <em>{attemptStatusLabel(attempt)}</em>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </section>
        )
      })}
    </div>
  )
}
