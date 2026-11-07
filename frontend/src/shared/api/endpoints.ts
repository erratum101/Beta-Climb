export const endpoints = {
  profiles: '/api/profiles',
  profile: (id: string) => `/api/profiles/${encodeURIComponent(id)}`,
  attempts: '/api/attempts',
  attempt: (id: string) => `/api/attempts/${id}`,
} as const
