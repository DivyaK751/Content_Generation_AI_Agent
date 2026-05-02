const TOKEN_KEY = 'pulse_token'
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'

export function getToken(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem(TOKEN_KEY)
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
