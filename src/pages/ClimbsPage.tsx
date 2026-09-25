import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSession } from '../app/session'
import { attemptHref, gradeGroup } from '../entities/attempt'
import { IconFilter } from '../shared/ui/icons'
import { WallThumb } from '../shared/ui/WallThumb'
import { Wordmark } from '../shared/ui/Wordmark'

const FILTERS = [
  { id: 'all', label: 'Все' },
  { id: '5', label: '5' },
  { id: '6', label: '6' },
  { id: '7', label: '7' },
  { id: '8', label: '8' },
] as const

type FilterId = (typeof FILTERS)[number]['id']

function gradeTone(label: string): string {
  const value = label.toLowerCase()
  if (value.startsWith('7') || value.startsWith('8')) return 'is-red'
  if (value.startsWith('6b') || value.startsWith('6c')) return 'is-green'
  if (value.startsWith('5')) return 'is-pink'
  return 'is-plain'
}

export function ClimbsPage() {
  const navigate = useNavigate()
  const { attempts } = useSession()
  const [filter, setFilter] = useState<FilterId>('all')
  const [open, setOpen] = useState(false)
  const sorted = useMemo(
    () => [...attempts].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [attempts],
  )
  const visible = sorted.filter((attempt) => filter === 'all' || gradeGroup(attempt.gradeLabel) === filter)

  if (attempts.length === 0) {
    return (
      <div className="screen screen-center empty-home">
        <button type="button" className="empty-mark" onClick={() => navigate('/attempt/new')}>
          <svg className="empty-plus-icon" viewBox="0 0 55 55" fill="none" aria-hidden="true">
            <path d="M27.5 5V50M5 27.5H50" stroke="currentColor" strokeWidth="10" strokeLinecap="round" />
          </svg>
          <Wordmark />
          <span className="visually-hidden">Добавить запись</span>
        </button>
      </div>
    )
  }

  return (
    <div className="screen climbs-screen with-nav">
      <div className="climbs-head">
        <h1>Все пролазы</h1>
        <button
          type="button"
          className={filter === 'all' ? 'filter-btn' : 'filter-btn is-on'}
          aria-expanded={open}
          aria-label="Фильтр по категории"
          onClick={() => setOpen((current) => !current)}
        >
          <IconFilter />
        </button>
      </div>
      {open ? (
        <div className="chip-row" role="listbox" aria-label="Категория">
          {FILTERS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={filter === item.id ? 'chip is-on' : 'chip'}
              onClick={() => {
                setFilter(item.id)
                setOpen(false)
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}

      {visible.length === 0 ? (
        <div className="empty-copy">
          <p>Нет пролазов этой категории</p>
        </div>
      ) : (
        <div className="climbs-grid">
          {visible.map((attempt) => (
            <button
              key={attempt.id}
              type="button"
              className="climb-card"
              onClick={() => navigate(attemptHref(attempt))}
            >
              <WallThumb variant={attempt.wallVariant} />
              <span className={`climb-grade ${gradeTone(attempt.gradeLabel)}`}>{attempt.gradeLabel}</span>
              {attempt.status !== 'ready' ? (
                <span className="climb-status">{attempt.status === 'rejected' ? 'отказ' : 'разбор'}</span>
              ) : null}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
