import { promisify } from 'node:util'
import { randomBytes, scrypt as scryptCallback, timingSafeEqual, createHmac } from 'node:crypto'
import { cookies } from 'next/headers'
import { SessionPayload, UserRole } from './types'

const scrypt = promisify(scryptCallback)

const SESSION_COOKIE_NAME = 'careflow_session'
const SESSION_DURATION_SECONDS = 7 * 24 * 60 * 60 // 7 days
const SESSION_SECRET = process.env.SESSION_SECRET || 'careflow-super-secret-session-key-at-least-32-bytes'

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex')
  const derivedKey = (await scrypt(password, salt, 64)) as Buffer
  return `scrypt$${salt}$${derivedKey.toString('hex')}`
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  try {
    const parts = storedHash.split('$')
    if (parts.length !== 3 || parts[0] !== 'scrypt') {
      return false
    }
    const salt = parts[1]
    const originalKey = Buffer.from(parts[2], 'hex')
    const computedKey = (await scrypt(password, salt, 64)) as Buffer
    if (originalKey.length !== computedKey.length) {
      return false
    }
    return timingSafeEqual(originalKey, computedKey)
  } catch {
    return false
  }
}

function base64UrlEncode(str: string): string {
  return Buffer.from(str)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
}

function base64UrlDecode(str: string): string {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/')
  while (base64.length % 4) {
    base64 += '='
  }
  return Buffer.from(base64, 'base64').toString('utf8')
}

export function createSessionToken(payload: Omit<SessionPayload, 'exp' | 'iat'>): string {
  const iat = Math.floor(Date.now() / 1000)
  const exp = iat + SESSION_DURATION_SECONDS
  const fullPayload: SessionPayload = { ...payload, exp, iat }

  const header = { alg: 'HS256', typ: 'JWT' }
  const headerEncoded = base64UrlEncode(JSON.stringify(header))
  const payloadEncoded = base64UrlEncode(JSON.stringify(fullPayload))
  const dataToSign = `${headerEncoded}.${payloadEncoded}`

  const signature = createHmac('sha256', SESSION_SECRET)
    .update(dataToSign)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')

  return `${dataToSign}.${signature}`
}

export function verifySessionToken(token: string): SessionPayload | null {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null

    const [headerEncoded, payloadEncoded, signature] = parts
    const dataToSign = `${headerEncoded}.${payloadEncoded}`

    const expectedSignature = createHmac('sha256', SESSION_SECRET)
      .update(dataToSign)
      .digest('base64')
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')

    const sigBuf = Buffer.from(signature)
    const expectedSigBuf = Buffer.from(expectedSignature)
    if (sigBuf.length !== expectedSigBuf.length || !timingSafeEqual(sigBuf, expectedSigBuf)) {
      return null
    }

    const payloadJson = base64UrlDecode(payloadEncoded)
    const payload = JSON.parse(payloadJson) as SessionPayload

    const now = Math.floor(Date.now() / 1000)
    if (payload.exp && payload.exp < now) {
      return null
    }

    return payload
  } catch {
    return null
  }
}

export function getSessionCookieName(): string {
  return SESSION_COOKIE_NAME
}

export async function getSession(): Promise<SessionPayload | null> {
  try {
    const cookieStore = cookies()
    const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME)
    if (!sessionCookie?.value) return null
    return verifySessionToken(sessionCookie.value)
  } catch {
    return null
  }
}

export function getSessionFromRequest(req: Request): SessionPayload | null {
  try {
    const cookieHeader = req.headers.get('cookie')
    if (!cookieHeader) return null

    const cookiesArr = cookieHeader.split(';')
    for (const c of cookiesArr) {
      const [name, ...val] = c.trim().split('=')
      if (name === SESSION_COOKIE_NAME) {
        return verifySessionToken(val.join('='))
      }
    }
    return null
  } catch {
    return null
  }
}

export async function requireAuth(allowedRoles?: UserRole[]): Promise<SessionPayload> {
  const session = await getSession()
  if (!session) {
    throw new Error('UNAUTHORIZED')
  }
  if (allowedRoles && allowedRoles.length > 0 && !allowedRoles.includes(session.role)) {
    throw new Error('FORBIDDEN')
  }
  return session
}
