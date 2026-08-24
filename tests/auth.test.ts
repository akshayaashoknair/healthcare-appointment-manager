import test, { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { hashPassword, verifyPassword, createSessionToken, verifySessionToken } from '../lib/auth'
import { UserRole } from '../lib/types'

describe('Authentication & Session Security Tests', () => {
  it('should securely hash password with scrypt and random salt', async () => {
    const password = 'TestSecurePassword123!'
    const hash = await hashPassword(password)

    assert.ok(hash.startsWith('scrypt$'), 'Hash should start with scrypt$')
    const parts = hash.split('$')
    assert.equal(parts.length, 3, 'Hash should contain format scrypt$salt$derivedKey')
    assert.ok(parts[1].length >= 16, 'Salt should be at least 16 hex chars')
    assert.ok(parts[2].length >= 64, 'Derived key should be at least 64 hex chars')
  })

  it('should verify correct password against scrypt hash', async () => {
    const password = 'CareFlowDev123!'
    const hash = await hashPassword(password)

    const isValid = await verifyPassword(password, hash)
    assert.equal(isValid, true, 'Valid password must be verified successfully')
  })

  it('should reject incorrect password', async () => {
    const hash = await hashPassword('CorrectPassword123!')

    const isValid = await verifyPassword('WrongPassword999!', hash)
    assert.equal(isValid, false, 'Incorrect password must be rejected')
  })

  it('should create and verify signed session JWT token', () => {
    const payload = {
      userId: 'user_patient_123',
      email: 'patient@careflow.test',
      role: UserRole.PATIENT,
      firstName: 'Priya',
      lastName: 'Shah',
    }

    const token = createSessionToken(payload)
    assert.ok(typeof token === 'string' && token.includes('.'), 'Token must be a valid signed string')

    const verified = verifySessionToken(token)
    assert.ok(verified !== null, 'Session token must be verified')
    assert.equal(verified?.userId, payload.userId)
    assert.equal(verified?.email, payload.email)
    assert.equal(verified?.role, UserRole.PATIENT)
    assert.equal(verified?.firstName, 'Priya')
  })

  it('should reject tampered session tokens', () => {
    const payload = {
      userId: 'user_patient_123',
      email: 'patient@careflow.test',
      role: UserRole.PATIENT,
    }

    const token = createSessionToken(payload)
    const parts = token.split('.')
    // Tamper with signature
    const tamperedToken = `${parts[0]}.${parts[1]}.tamperedSignature12345`

    const verified = verifySessionToken(tamperedToken)
    assert.equal(verified, null, 'Tampered token must fail verification')
  })
})
