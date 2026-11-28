import { ui } from '../copy'
import { detectLang } from '../lang'
import { endpoints } from './endpoints'
import type { AthleteProfile, ClimbApi } from './types'

function say() {
  return ui(detectLang())
}

const PROFILE_ID_KEY = 'beta-climb.profile-id'

interface SavedProfile {
  id: string
  profile: AthleteProfile
}

async function request(url: string, options?: RequestInit): Promise<Response> {
  try {
    return await fetch(url, { credentials: 'same-origin', ...options })
  } catch {
    throw new Error(say().apiOffline)
  }
}

function forProfile(url: string, profileId: string) {
  return `${url}?${new URLSearchParams({ profileId })}`
}

export function attemptMediaUrl(id: string) {
  const profileId = localStorage.getItem(PROFILE_ID_KEY)
  return profileId ? forProfile(`${endpoints.attempt(id)}/media`, profileId) : undefined
}

export const climbApi: ClimbApi = {
  async getProfile() {
    const id = localStorage.getItem(PROFILE_ID_KEY)
    if (!id) return null
    const response = await request(endpoints.profile(id))
    if (response.status === 404) {
      localStorage.removeItem(PROFILE_ID_KEY)
      return null
    }
    if (!response.ok) throw new Error(say().apiProfileLoad)
    const saved: SavedProfile = await response.json()
    return saved.profile
  },
  async saveProfile(profile) {
    const id = localStorage.getItem(PROFILE_ID_KEY)
    const response = await request(id ? endpoints.profile(id) : endpoints.profiles, {
      method: id ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(profile),
    })
    if (!response.ok) {
      throw new Error(response.status === 400 ? say().apiProfileCheck : say().apiProfileSave)
    }
    const saved: SavedProfile = await response.json()
    localStorage.setItem(PROFILE_ID_KEY, saved.id)
  },
  async reset() {
    localStorage.removeItem(PROFILE_ID_KEY)
  },
  async listAttempts() {
    const id = localStorage.getItem(PROFILE_ID_KEY)
    if (!id) return []
    const response = await request(forProfile(endpoints.attempts, id))
    if (!response.ok) throw new Error(say().apiHistory)
    return response.json()
  },
  async getAttempt(id) {
    const profileId = localStorage.getItem(PROFILE_ID_KEY)
    if (!profileId) return null
    const response = await request(forProfile(endpoints.attempt(id), profileId))
    if (response.status === 404) return null
    if (!response.ok) throw new Error(say().apiReview)
    return response.json()
  },
  async createAttempt({ file, idempotencyKey, frame, durationSec }) {
    const profileId = localStorage.getItem(PROFILE_ID_KEY)
    if (!profileId) throw new Error(say().apiNeedProfile)
    const body = new FormData()
    body.append('profileId', profileId)
    body.append('file', file)
    body.append('review', 'true')
    if (frame) body.append('frame', frame, 'frame.jpg')
    if (durationSec && Number.isFinite(durationSec)) body.append('durationSec', String(durationSec))
    const response = await request(endpoints.attempts, {
      method: 'POST', headers: { 'Idempotency-Key': idempotencyKey }, body,
    })
    if (response.status === 413) throw new Error(say().apiTooBig)
    if ([400, 415, 422].includes(response.status)) throw new Error(say().apiRejected)
    if (!response.ok) throw new Error(say().apiUpload)
    return response.json()
  },
}
