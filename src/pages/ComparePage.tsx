import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { useSession } from '../app/session'
import { attemptNumber } from '../entities/attempt'
import { ScreenHeader } from '../shared/ui/ScreenHeader'

export function ComparePage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { attempts, ready } = useSession()
  const attempt = attempts.find((item) => item.id === id)
  const previous = attempts.find((item) => item.id === attempt?.previousAttemptId)

  if (!ready) return null
  if (!attempt) return <Navigate to="/history" replace />

  return (
    <div className="screen">
      <ScreenHeader title="Сравнение" onBack={() => navigate(`/attempt/${attempt.id}`)} />
      {!previous || !attempt.change ? (
        <article className="card">
          <p className="card-kicker">Пока не с чем сравнить</p>
          <p className="lead">Снимите следующую попытку на эту трассу.</p>
          <button type="button" className="btn btn-orange" onClick={() => navigate(`/attempt/new?from=${attempt.id}`)}>
            Попробовать ещё раз
          </button>
        </article>
      ) : (
        <article className="card">
          <p className="card-kicker">Наблюдаемое изменение</p>
          <p className="lead">{attempt.change.title}</p>
          <div className="compare-grid">
            <div>
              <span>Попытка {attemptNumber(previous, attempts)}</span>
              <strong>{attempt.change.before}</strong>
            </div>
            <div>
              <span>Попытка {attemptNumber(attempt, attempts)}</span>
              <strong>{attempt.change.after}</strong>
            </div>
          </div>
          <p>{attempt.change.note}</p>
        </article>
      )}
      <p className="template-note">
        Это сравнение одного движения между двумя попытками. Общей оценки техники здесь нет.
      </p>
    </div>
  )
}
