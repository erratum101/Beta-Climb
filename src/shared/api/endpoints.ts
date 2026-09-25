export const endpoints = {
  profile: '/api/profile',
  attempts: '/api/attempts',
  attempt: (id: string) => `/api/attempts/${id}`,
} as const
