const TOKEN_KEY = 'brandbuddy_token'
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'

export function getToken(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem(TOKEN_KEY)
}

export function getUserId(): string | null {
  const token = getToken()
  if (!token) return null
  try {
    // JWT uses base64url (- and _ instead of + and /, no padding) — convert before atob
    const b64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    const padded = b64 + '='.repeat((4 - b64.length % 4) % 4)
    const payload = JSON.parse(atob(padded))
    return payload.sub ?? null
  } catch {
    return null
  }
}

export function sessionsKey(): string {
  const uid = getUserId()
  return uid ? `brandbuddy_sessions_${uid}` : 'brandbuddy_sessions'
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token)
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY)
}

export function loginWithGoogle(): void {
  window.location.href = `${API_URL}/auth/google`
}
