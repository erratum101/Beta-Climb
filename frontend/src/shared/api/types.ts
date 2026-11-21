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

export type AnalysisStatus = 'processing' | 'ready' | 'limited' | 'rejected' | 'failed'

export type AnalysisStage = 'holds' | 'movement' | 'rules' | 'done'

export interface RouteHold {
  id: string
  x: number
  y: number
  polygon?: [number, number][]
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
  holdIds?: string[]
  sources?: { title: string; url: string }[]
}

export interface Attempt {
  id: string
  createdAt: string
  fileName: string
  gradeLabel?: string | null
  discipline: Discipline
  result: AttemptResult
  durationSec: number
  status: AnalysisStatus
  stage: AnalysisStage
  rejectReason?: string
  mediaUrl?: string
  thumbnailUrl?: string
  limitations?: string[]
  holds: RouteHold[]
  route?: { status: 'unknown' | 'hypothesis'; color?: string | null; holdIds?: string[] }
  moments: AnalysisMoment[]
  primaryAction: string
  previousAttemptId?: string
  change?: MovementChange
}

export interface MovementChange {
  title: string
  before: string
  after: string
  improved: boolean
  note: string
}

export interface CreateAttemptInput {
  file: File
  idempotencyKey: string
}

export interface ClimbApi {
  getProfile(): Promise<AthleteProfile | null>
  saveProfile(profile: AthleteProfile): Promise<void>
  listAttempts(): Promise<Attempt[]>
  getAttempt(id: string): Promise<Attempt | null>
  createAttempt(input: CreateAttemptInput): Promise<Attempt>
  reset(): Promise<void>
}
