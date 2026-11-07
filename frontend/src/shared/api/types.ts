export type Discipline = 'bouldering' | 'lead' | 'speed'

export type ExperienceId = 'lt1m' | 'm1to3' | 'm3to6' | 'm6to12' | 'gt1y'

export type GradeBandId = 'novice' | 'amateur' | 'advanced' | 'expert'

export type GenderId = 'male' | 'female'

export interface AthleteProfile {
  nickname: string
  heightCm: number | null
  weightKg: number | null
  ageYears: number | null
  experience: ExperienceId | null
  disciplines: Discipline[]
  maxGrade: GradeBandId | null
  gender: GenderId | null
  consentAccepted: boolean
}

export type AttemptResult = 'sent' | 'failed' | 'unknown'

export type AnalysisStatus = 'processing' | 'ready' | 'rejected'

export type AnalysisStage = 'holds' | 'movement' | 'rules' | 'done'

export interface RouteHold {
  id: string
  x: number
  y: number
}

export type MomentCategory = 'feet' | 'body' | 'sequence' | 'balance' | 'setup'

export interface AnalysisMoment {
  id: string
  category: MomentCategory
  title: string
  timeSec: number
  startSec: number
  endSec: number
  problem: string
  happened: string
  action: string
  primary: boolean
  improved?: boolean
}

export interface MovementChange {
  title: string
  before: string
  after: string
  improved: boolean
  note: string
}

export interface Attempt {
  id: string
  createdAt: string
  fileName: string
  gradeLabel: string
  discipline: Discipline
  result: AttemptResult
  durationSec: number
  status: AnalysisStatus
  stage: AnalysisStage
  rejectReason?: string
  wallVariant: number
  holds: RouteHold[]
  moments: AnalysisMoment[]
  primaryAction: string
  previousAttemptId?: string
  change?: MovementChange
}

export interface CreateAttemptInput {
  fileName?: string
  previousAttemptId?: string
  reject?: boolean
  gradeLabel: string
  discipline: Discipline
}

export interface ClimbApi {
  getProfile(): Promise<AthleteProfile | null>
  saveProfile(profile: AthleteProfile): Promise<void>
  listAttempts(): Promise<Attempt[]>
  getAttempt(id: string): Promise<Attempt | null>
  createAttempt(input: CreateAttemptInput): Promise<Attempt>
  loadDemo(): Promise<void>
  reset(): Promise<void>
  subscribe(listener: () => void): () => void
}
