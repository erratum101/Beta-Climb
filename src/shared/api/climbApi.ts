import { mockClimbApi } from './mockClient'
import type { ClimbApi } from './types'

/**
 * Единственная точка подключения сервера.
 * Сейчас здесь локальный mock. HTTP-клиент к Java API
 * должен реализовать тот же ClimbApi и занять эту строку.
 */
export const climbApi: ClimbApi = mockClimbApi
