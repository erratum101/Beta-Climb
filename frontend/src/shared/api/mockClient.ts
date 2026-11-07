import type {
  AnalysisMoment,
  Attempt,
  AthleteProfile,
  ClimbApi,
  CreateAttemptInput,
  Discipline,
  MovementChange,
  RouteHold,
} from './types'

const STORAGE_KEY = 'beta-climb.v1'

const HOLDS: RouteHold[] = [
  { id: 'start', x: 32, y: 82 },
  { id: 'foot-low', x: 48, y: 70 },
  { id: 'hand-1', x: 64, y: 60 },
  { id: 'foot-high', x: 40, y: 48 },
  { id: 'hand-2', x: 58, y: 34 },
  { id: 'top', x: 46, y: 16 },
]

const REJECT_TEXT =
  'Не удалось надёжно определить трассу. Снимите попытку ещё раз: один спортсмен, неподвижная камера, весь участок стены в кадре, чёткая картинка и различимые цвета трасс.'

interface Script {
  primaryAction: string
  moments: AnalysisMoment[]
  change?: MovementChange
}

interface Store {
  profile: AthleteProfile | null
  attempts: Attempt[]
}

function fullScript(): Script {
  return {
    primaryAction: 'Перенеси вес на правую ногу перед движением правой рукой.',
    moments: [
      {
        id: 'feet',
        category: 'feet',
        title: 'Работа ног',
        timeSec: 18.2,
        startSec: 17.8,
        endSec: 19.5,
        problem: 'Правая нога остаётся на нижней зацепке во время движения правой рукой.',
        happened: 'Вес остаётся между двумя опорами, поэтому ты тянешься рукой, а не переносишь вес.',
        action: 'Поставь правую ногу на зацепку выше и перенеси на неё вес перед движением правой рукой.',
        primary: true,
      },
      {
        id: 'body',
        category: 'body',
        title: 'Положение корпуса',
        timeSec: 23.7,
        startSec: 23,
        endSec: 24.6,
        problem: 'Корпус слишком далеко от стены в момент выхода вверх.',
        happened: 'Таз уходит наружу, и руки забирают вес, который должны держать ноги.',
        action: 'Приблизь таз к стене до следующего перехвата.',
        primary: false,
      },
      {
        id: 'sequence',
        category: 'sequence',
        title: 'Последовательность',
        timeSec: 27.1,
        startSec: 26.4,
        endSec: 28,
        problem: 'Правая рука начинает движение раньше, чем стопа встала на опору.',
        happened: 'Следующий перехват идёт без паузы на стабилизацию.',
        action: 'Сначала зафиксируй ногу, потом двигай руку.',
        primary: false,
      },
    ],
  }
}

function improvedScript(): Script {
  return {
    primaryAction: 'Прижми таз ближе к стене перед следующим перехватом.',
    change: {
      title: 'Правая нога',
      before: 'Не использована',
      after: 'Использована',
      improved: true,
      note: 'В этом эпизоде вы изменили положение правой ноги согласно предыдущей рекомендации.',
    },
    moments: [
      {
        id: 'feet',
        category: 'feet',
        title: 'Работа ног',
        timeSec: 16.4,
        startSec: 15.8,
        endSec: 17.2,
        problem: 'Правая нога встала на более высокую зацепку до движения руки.',
        happened: 'Вес успел перейти на ногу, и перехват пошёл из более устойчивого положения.',
        action: 'Сохрани эту постановку на следующем движении.',
        primary: false,
        improved: true,
      },
      {
        id: 'body',
        category: 'body',
        title: 'Положение корпуса',
        timeSec: 21.5,
        startSec: 20.8,
        endSec: 22.4,
        problem: 'Таз всё ещё отходит от стены на выходе вверх.',
        happened: 'Нога уже работает, но корпус остаётся далеко, и руки снова забирают вес.',
        action: 'Прижми таз ближе к стене перед следующим перехватом.',
        primary: true,
      },
      {
        id: 'sequence',
        category: 'sequence',
        title: 'Последовательность',
        timeSec: 25.2,
        startSec: 24.6,
        endSec: 26.1,
        problem: 'Между постановкой ноги и движением руки почти нет паузы.',
        happened: 'Опора уже есть, но вес не успевает на неё сесть.',
        action: 'Сделай короткую паузу на ноге, затем двигай руку.',
        primary: false,
      },
    ],
  }
}

function shortScript(
  id: string,
  category: AnalysisMoment['category'],
  title: string,
  timeSec: number,
  problem: string,
  action: string,
): Script {
  return {
    primaryAction: action,
    moments: [
      {
        id,
        category,
        title,
        timeSec,
        startSec: Math.max(0.4, timeSec - 0.6),
        endSec: timeSec + 0.9,
        problem,
        happened: problem,
        action,
        primary: true,
      },
    ],
  }
}

function loadStore(): Store {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { profile: null, attempts: [] }
    const parsed = JSON.parse(raw) as Partial<Store>
    if (!parsed || !Array.isArray(parsed.attempts)) return { profile: null, attempts: [] }
    return {
      profile: parsed.profile ? { ...parsed.profile, ageYears: parsed.profile.ageYears ?? null } : null,
      attempts: parsed.attempts,
    }
  } catch {
    return { profile: null, attempts: [] }
  }
}

function stamp(attemptId: string, script: Script): Pick<Attempt, 'moments' | 'primaryAction' | 'change' | 'holds'> {
  return {
    holds: HOLDS,
    primaryAction: script.primaryAction,
    change: script.change,
    moments: script.moments.map((moment) => ({
      ...moment,
      id: `${attemptId}-${moment.id}`,
    })),
  }
}

function daysAgo(days: number, hours: number): string {
  const date = new Date()
  date.setDate(date.getDate() - days)
  date.setHours(hours, 12, 0, 0)
  return date.toISOString()
}

function readyAttempt(
  partial: Pick<Attempt, 'id' | 'createdAt' | 'fileName' | 'gradeLabel' | 'discipline' | 'result' | 'durationSec' | 'wallVariant' | 'previousAttemptId'>,
  script: Script,
): Attempt {
  return {
    ...partial,
    status: 'ready',
    stage: 'done',
    ...stamp(partial.id, script),
  }
}

function buildDemo(): Attempt[] {
  return [
    readyAttempt(
      {
        id: 'demo-1',
        createdAt: daysAgo(0, 17),
        fileName: 'попытка-6a.mp4',
        gradeLabel: '6a',
        discipline: 'bouldering',
        result: 'failed',
        durationSec: 31.4,
        wallVariant: 0,
      },
      fullScript(),
    ),
    readyAttempt(
      {
        id: 'demo-2',
        createdAt: daysAgo(0, 18),
        fileName: 'попытка-6a-повтор.mp4',
        gradeLabel: '6a',
        discipline: 'bouldering',
        result: 'failed',
        durationSec: 28.6,
        wallVariant: 1,
        previousAttemptId: 'demo-1',
      },
      improvedScript(),
    ),
    readyAttempt(
      {
        id: 'demo-3',
        createdAt: daysAgo(3, 19),
        fileName: 'попытка-7a.mp4',
        gradeLabel: '7a',
        discipline: 'bouldering',
        result: 'sent',
        durationSec: 24.2,
        wallVariant: 2,
      },
      shortScript(
        'feet',
        'feet',
        'Работа ног',
        12.6,
        'Левая нога снимается раньше, чем правая рука берёт следующую зацепку.',
        'Оставь левую ногу на опоре, пока рука не возьмёт зацепку.',
      ),
    ),
    readyAttempt(
      {
        id: 'demo-4',
        createdAt: daysAgo(3, 20),
        fileName: 'попытка-6b.mp4',
        gradeLabel: '6b',
        discipline: 'bouldering',
        result: 'sent',
        durationSec: 18.9,
        wallVariant: 3,
      },
      shortScript(
        'balance',
        'balance',
        'Баланс',
        9.4,
        'Перед движением вверх центр тела уходит слишком далеко от опорной ноги.',
        'Смести таз над стопой и только потом тянись вверх.',
      ),
    ),
    readyAttempt(
      {
        id: 'demo-5',
        createdAt: daysAgo(8, 16),
        fileName: 'попытка-5c.mp4',
        gradeLabel: '5c+',
        discipline: 'bouldering',
        result: 'failed',
        durationSec: 22.1,
        wallVariant: 4,
      },
      shortScript(
        'setup',
        'setup',
        'Подготовка движения',
        14.8,
        'Перед выходом вверх левая нога остаётся на нижней зацепке, хотя рядом есть опора выше.',
        'Переставь левую ногу выше до движения рукой.',
      ),
    ),
    readyAttempt(
      {
        id: 'demo-6',
        createdAt: daysAgo(8, 18),
        fileName: 'попытка-6c.mp4',
        gradeLabel: '6c',
        discipline: 'lead',
        result: 'sent',
        durationSec: 41.7,
        wallVariant: 5,
      },
      shortScript(
        'sequence',
        'sequence',
        'Последовательность',
        19.3,
        'Пропущена промежуточная зацепка, и следующее движение получается слишком длинным.',
        'Возьми промежуточную зацепку и укороти перехват.',
      ),
    ),
  ]
}

let store = loadStore()
let generation = 0
const listeners = new Set<() => void>()
const timers = new Set<number>()

function emit() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
  for (const listener of listeners) listener()
}

function later(ms: number, gen: number, task: () => void) {
  const id = window.setTimeout(() => {
    timers.delete(id)
    if (gen !== generation) return
    task()
  }, ms)
  timers.add(id)
}

function patch(id: string, gen: number, next: Partial<Attempt>) {
  if (gen !== generation) return
  store = {
    ...store,
    attempts: store.attempts.map((attempt) => (attempt.id === id ? { ...attempt, ...next } : attempt)),
  }
  emit()
}

function disciplineOrDefault(value: Discipline | undefined): Discipline {
  return value ?? 'bouldering'
}

export const mockClimbApi: ClimbApi = {
  async getProfile() {
    return store.profile
  },
  async saveProfile(profile) {
    store = { ...store, profile: { ...profile, nickname: profile.nickname.trim() } }
    emit()
  },
  async listAttempts() {
    return store.attempts
  },
  async getAttempt(id) {
    return store.attempts.find((attempt) => attempt.id === id) ?? null
  },
  async createAttempt(input: CreateAttemptInput) {
    const gen = generation
    const id = crypto.randomUUID()
    const attempt: Attempt = {
      id,
      createdAt: new Date().toISOString(),
      fileName: input.fileName?.trim() || 'пример-попытки.mp4',
      gradeLabel: input.gradeLabel,
      discipline: disciplineOrDefault(input.discipline),
      result: 'unknown',
      durationSec: 0,
      status: 'processing',
      stage: 'holds',
      wallVariant: store.attempts.length % 6,
      holds: [],
      moments: [],
      primaryAction: '',
      previousAttemptId: input.previousAttemptId,
    }
    store = { ...store, attempts: [attempt, ...store.attempts] }
    emit()

    if (input.reject) {
      later(1100, gen, () => {
        patch(id, gen, { status: 'rejected', stage: 'holds', rejectReason: REJECT_TEXT })
      })
      return attempt
    }

    later(800, gen, () => patch(id, gen, { stage: 'movement' }))
    later(1600, gen, () => patch(id, gen, { stage: 'rules' }))
    later(2500, gen, () => {
      const draft = store.attempts.find((item) => item.id === id)
      if (!draft) return
      const previous = draft.previousAttemptId
        ? store.attempts.find((item) => item.id === draft.previousAttemptId)
        : undefined
      const script = previous?.status === 'ready' ? improvedScript() : fullScript()
      patch(id, gen, {
        status: 'ready',
        stage: 'done',
        result: 'failed',
        durationSec: previous ? 28.6 : 31.4,
        ...stamp(id, script),
      })
    })

    return attempt
  },
  async loadDemo() {
    const known = new Set(store.attempts.map((attempt) => attempt.id))
    const fresh = buildDemo().filter((attempt) => !known.has(attempt.id))
    if (fresh.length === 0) return
    store = { ...store, attempts: [...store.attempts, ...fresh] }
    emit()
  },
  async reset() {
    generation += 1
    for (const id of timers) window.clearTimeout(id)
    timers.clear()
    store = { profile: null, attempts: [] }
    emit()
  },
  subscribe(listener) {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },
}
