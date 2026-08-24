import { prisma } from '../prisma'
import { hashPassword, verifyPassword, createSessionToken } from '../auth'
import { UserRole } from '../types'
import { RegisterInput, LoginInput } from '../validations'

export class AuthService {
  static async registerPatient(data: RegisterInput) {
    const existing = await prisma.user.findUnique({
      where: { email: data.email.toLowerCase().trim() },
    })

    if (existing) {
      throw new Error('EMAIL_EXISTS')
    }

    const passwordHash = await hashPassword(data.password)

    const user = await prisma.user.create({
      data: {
        email: data.email.toLowerCase().trim(),
        passwordHash,
        role: UserRole.PATIENT,
        patientProfile: {
          create: {
            firstName: data.firstName.trim(),
            lastName: data.lastName.trim(),
            phone: data.phone?.trim() || null,
          },
        },
      },
      include: {
        patientProfile: true,
      },
    })

    const token = createSessionToken({
      userId: user.id,
      email: user.email,
      role: user.role,
      firstName: user.patientProfile?.firstName,
      lastName: user.patientProfile?.lastName,
    })

    return {
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        profile: user.patientProfile,
      },
      token,
    }
  }

  static async login(data: LoginInput) {
    const email = data.email.toLowerCase().trim()
    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        patientProfile: true,
        doctorProfile: true,
      },
    })

    if (!user) {
      throw new Error('INVALID_CREDENTIALS')
    }

    const isValid = await verifyPassword(data.password, user.passwordHash)
    if (!isValid) {
      throw new Error('INVALID_CREDENTIALS')
    }

    const firstName = user.patientProfile?.firstName || user.doctorProfile?.firstName
    const lastName = user.patientProfile?.lastName || user.doctorProfile?.lastName

    const token = createSessionToken({
      userId: user.id,
      email: user.email,
      role: user.role,
      firstName,
      lastName,
    })

    return {
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        patientProfile: user.patientProfile,
        doctorProfile: user.doctorProfile,
      },
      token,
    }
  }

  static async getCurrentUser(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        role: true,
        createdAt: true,
        patientProfile: true,
        doctorProfile: {
          include: {
            workingHours: true,
          },
        },
      },
    })

    return user
  }
}
