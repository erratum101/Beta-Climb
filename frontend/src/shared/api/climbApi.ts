import { endpoints } from './endpoints'
import type { AthleteProfile, ClimbApi } from './types'

const PROFILE_ID_KEY = 'beta-climb.profile-id'

interface SavedProfile {
  id: string
  profile: AthleteProfile
}

async function request(url: string, options?: RequestInit): Promise<Response> {
  try {
    return await fetch(url, { credentials: 'same-origin', ...options })
  } catch {
    throw new Error('Не удалось связаться с сервером. Проверь соединение и попробуй ещё раз.')
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
    if (!response.ok) throw new Error('Не удалось загрузить профиль. Попробуй ещё раз.')
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
      throw new Error(response.status === 400
        ? 'Проверь данные профиля и попробуй ещё раз.'
        : 'Не удалось сохранить профиль. Попробуй ещё раз.')
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
    if (!response.ok) throw new Error('Не удалось загрузить историю попыток.')
    return response.json()
  },
  async getAttempt(id) {
    const profileId = localStorage.getItem(PROFILE_ID_KEY)
    if (!profileId) return null
    const response = await request(forProfile(endpoints.attempt(id), profileId))
    if (response.status === 404) return null
    if (!response.ok) throw new Error('Не удалось обновить разбор.')
    return response.json()
  },
  async createAttempt({ file, idempotencyKey }) {
    const profileId = localStorage.getItem(PROFILE_ID_KEY)
    if (!profileId) throw new Error('Для загрузки видео нужен профиль.')
    const body = new FormData()
    body.append('profileId', profileId)
    body.append('file', file)
    const response = await request(endpoints.attempts, {
      method: 'POST', headers: { 'Idempotency-Key': idempotencyKey }, body,
    })
    if (response.status === 413) throw new Error('Видео слишком большое. Выбери более короткую запись.')
    if ([400, 415, 422].includes(response.status)) throw new Error('Сервер не принял файл. Проверь, что выбрано видео попытки.')
    if (!response.ok) throw new Error('Загрузить видео не удалось. Попробуй ещё раз.')
    return response.json()
  },
}
