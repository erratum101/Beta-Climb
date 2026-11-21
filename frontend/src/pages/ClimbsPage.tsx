import { useContext, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSession } from '../app/session'
import { HomeGuideContext } from '../features/capture/CaptureGuide'
import { ClimbCover } from '../features/climbs/ClimbCover'
import { attemptHref, attemptStatusLabel, gradeGroup } from '../entities/attempt'
import { attemptMediaUrl } from '../shared/api'
import { IconFilter } from '../shared/ui/icons'
import { sharedNavigate } from '../shared/ui/motion'
import { Wordmark } from '../shared/ui/Wordmark'
import { ChipButton } from '../shared/ui/ChipButton'

const FILTERS = [
  { id: 'all', label: 'Все' },
  { id: '5', label: '5' },
  { id: '6', label: '6' },
  { id: '7', label: '7' },
  { id: '8', label: '8' },
] as const

type FilterId = (typeof FILTERS)[number]['id']

const climbDate = new Intl.DateTimeFormat('ru-RU', { dateStyle: 'long', timeStyle: 'short' })

function gradeTone(label: string): string {
  const value = label.toLowerCase()
  if (value.startsWith('7') || value.startsWith('8')) return 'is-red'
  if (value.startsWith('6b') || value.startsWith('6c')) return 'is-green'
  if (value.startsWith('5')) return 'is-pink'
  return 'is-plain'
}

export function ClimbsPage() {
  const navigate = useNavigate()
  const guide = useContext(HomeGuideContext)
  const { attempts } = useSession()
  const [filter, setFilter] = useState<FilterId>('all')
  const [open, setOpen] = useState(false)
  const sorted = useMemo(
    () => [...attempts].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [attempts],
  )
  const visible = sorted.filter((attempt) => filter === 'all' || gradeGroup(attempt.gradeLabel || '') === filter)

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
    <div className="screen climbs-screen with-nav">
      <div className="climbs-head">
        <h1>Все пролазы</h1>
        {sorted.some((attempt) => attempt.gradeLabel) ? <button
          type="button"
          className={filter === 'all' ? 'filter-btn' : 'filter-btn is-on'}
          aria-expanded={open}
          aria-label="Фильтр по категории"
          onClick={() => setOpen((current) => !current)}
        >
          <IconFilter />
        </button> : null}
      </div>
      <div className={open ? 'chip-row is-open' : 'chip-row'} role="listbox" aria-label="Категория" inert={open ? undefined : true}>
        {FILTERS.map((item) => (
          <ChipButton
            key={item.id}
            selected={filter === item.id}
            onClick={() => {
              setFilter(item.id)
              setOpen(false)
            }}
          >
            {item.label}
          </ChipButton>
        ))}
      </div>

      {visible.length === 0 ? (
        <div className="empty-copy">
          <p>Нет пролазов этой категории</p>
        </div>
      ) : (
        <div className="climbs-grid stagger">
          {visible.map((attempt) => (
            <button
              key={attempt.id}
              type="button"
              className="climb-card"
              onClick={(event) => sharedNavigate(navigate, attemptHref(attempt), event.currentTarget)}
            >
              <span className="visually-hidden">Открыть пролаз от {climbDate.format(new Date(attempt.createdAt))}. </span>
              <ClimbCover thumbnailUrl={attempt.thumbnailUrl} mediaUrl={attempt.mediaUrl || attemptMediaUrl(attempt.id)} />
              {attempt.gradeLabel && <span className={`climb-grade ${gradeTone(attempt.gradeLabel)}`}>{attempt.gradeLabel}</span>}
              <span className="climb-status">{attemptStatusLabel(attempt)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
