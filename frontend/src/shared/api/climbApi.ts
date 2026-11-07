import { mockClimbApi } from './mockClient'
import { endpoints } from './endpoints'
import type { AthleteProfile, ClimbApi } from './types'

const PROFILE_ID_KEY = 'beta-climb.profile-id'

interface SavedProfile {
  id: string
  profile: AthleteProfile
}

async function request(url: string, options?: RequestInit): Promise<Response> {
  try {
    return await fetch(url, options)
  } catch {
    throw new Error('Не удалось связаться с сервером. Проверь соединение и попробуй ещё раз.')
  }
}

export const climbApi: ClimbApi = {
  ...mockClimbApi,
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
    await mockClimbApi.reset()
  },
}
