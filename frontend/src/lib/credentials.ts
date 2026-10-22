import type { Credentials } from './types'

// localStorage 在無痕模式或被封鎖時可能丟例外，一律包起來
const PREFIX = 'gudong:cred:'
const NAME_KEY = 'gudong:name'
const LAST_KEY = 'gudong:last-room'

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function safeSet(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    /* 無法保存時只是少了自動重連 */
  }
}

export function loadCredentials(code: string): Credentials | null {
  const raw = safeGet(PREFIX + code.toUpperCase())
  if (!raw) return null
  try {
    return JSON.parse(raw) as Credentials
  } catch {
    return null
  }
}

export function saveCredentials(cred: Credentials): void {
  safeSet(PREFIX + cred.code.toUpperCase(), JSON.stringify(cred))
  safeSet(LAST_KEY, cred.code.toUpperCase())
}

export function clearCredentials(code: string): void {
  safeSet(PREFIX + code.toUpperCase(), null)
  if (safeGet(LAST_KEY) === code.toUpperCase()) safeSet(LAST_KEY, null)
}

export function lastRoom(): string | null {
  const code = safeGet(LAST_KEY)
  return code && loadCredentials(code) ? code : null
}

export const savedName = {
  get: () => safeGet(NAME_KEY) ?? '',
  set: (name: string) => safeSet(NAME_KEY, name),
}
