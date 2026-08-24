const fs = require('fs')
const path = require('path')

const envPath = path.join(__dirname, '..', '.env')
if (fs.existsSync(envPath)) {
  const envLines = fs.readFileSync(envPath, 'utf8').split('\n')
  for (const line of envLines) {
    const trimmed = line.trim()
    if (trimmed && !trimmed.startsWith('#')) {
      const idx = trimmed.indexOf('=')
      if (idx !== -1) {
        const key = trimmed.slice(0, idx).trim()
        const val = trimmed.slice(idx + 1).trim().replace(/^['"]|['"]$/g, '')
        if (!process.env[key]) {
          process.env[key] = val
        }
      }
    }
  }
}

const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function runRealPostgresVerification() {
  console.log('=== REAL POSTGRESQL & NEON DATABASE VERIFICATION ===\n')

  // 1. Verify Connection & Database Info (without printing secrets)
  const dbInfo = await prisma.$queryRaw`
    SELECT current_database() as db_name, version() as pg_version, current_user as current_role
  `
  console.log('1. Database Connection Verified:')
  console.log(`   Database Name: ${dbInfo[0].db_name}`)
  console.log(`   PostgreSQL Version: ${dbInfo[0].pg_version.split(' ')[0]} ${dbInfo[0].pg_version.split(' ')[1]}`)
  console.log(`   Current Role: ${dbInfo[0].current_role}\n`)

  // 2. Verify all expected CareFlow tables
  const tables = await prisma.$queryRaw`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name;
  `
  const tableNames = tables.map((t) => t.table_name)
  console.log(`2. CareFlow Tables in Public Schema (${tableNames.length} tables):`)
  console.log(`   ${tableNames.join(', ')}`)

  const expectedTables = [
    'User',
    'PatientProfile',
    'DoctorProfile',
    'DoctorWorkingHours',
    'DoctorLeave',
    'SlotReservation',
    'AppointmentHold',
    'Appointment',
    'SymptomSubmission',
    'PreVisitSummary',
    'Consultation',
    'Prescription',
    'Medication',
    'PostVisitSummary',
    'NotificationJob',
    'CalendarConnection',
    'CalendarEventMapping',
  ]

  const missingTables = expectedTables.filter((t) => !tableNames.includes(t))
  if (missingTables.length > 0) {
    throw new Error(`Missing expected tables: ${missingTables.join(', ')}`)
  }
  console.log('   -> All expected CareFlow tables exist.\n')

  // 3. Verify btree_gist extension
  const extensions = await prisma.$queryRaw`
    SELECT extname, extversion 
    FROM pg_extension 
    WHERE extname = 'btree_gist';
  `
  if (extensions.length === 0) {
    throw new Error('btree_gist extension is NOT installed in PostgreSQL!')
  }
  console.log('3. Extension Verification:')
  console.log(`   Extension: ${extensions[0].extname} (version ${extensions[0].extversion}) -> INSTALLED\n`)

  // 4. Verify Exclusion Constraint in pg_constraint catalog
  const constraints = await prisma.$queryRaw`
    SELECT 
      conname as constraint_name,
      contype as constraint_type,
      pg_get_constraintdef(oid) as constraint_definition
    FROM pg_constraint
    WHERE conname = 'SlotReservation_active_doctor_time_excl';
  `
  if (constraints.length === 0) {
    throw new Error('SlotReservation_active_doctor_time_excl exclusion constraint is NOT found in pg_constraint!')
  }
  console.log('4. Exclusion Constraint in pg_constraint Catalog:')
  console.log(`   Constraint Name: ${constraints[0].constraint_name}`)
  console.log(`   Constraint Type: ${constraints[0].constraint_type} (Exclusion)`)
  console.log(`   Definition: ${constraints[0].constraint_definition}\n`)

  // 5. Setup Temporary Test Users
  console.log('5. Setting up temporary test users for concurrency testing...')
  const testDoctorUser = await prisma.user.create({
    data: {
      email: `test.doctor.${Date.now()}@careflow-test.local`,
      passwordHash: 'dummy_hash',
      role: 'DOCTOR',
      doctorProfile: {
        create: {
          firstName: 'ConcurrencyTest',
          lastName: 'Doctor',
          specialisation: 'Cardiology',
          slotDurationMinutes: 30,
        },
      },
    },
  })

  const testPatient1 = await prisma.user.create({
    data: {
      email: `test.patient1.${Date.now()}@careflow-test.local`,
      passwordHash: 'dummy_hash',
      role: 'PATIENT',
      patientProfile: {
        create: {
          firstName: 'Patient',
          lastName: 'One',
        },
      },
    },
  })

  const testPatient2 = await prisma.user.create({
    data: {
      email: `test.patient2.${Date.now()}@careflow-test.local`,
      passwordHash: 'dummy_hash',
      role: 'PATIENT',
      patientProfile: {
        create: {
          firstName: 'Patient',
          lastName: 'Two',
        },
      },
    },
  })

  try {
    // 6. REAL Concurrency Test: Two concurrent database inserts with identical time intervals
    console.log('6. Executing REAL Concurrency Test (2 concurrent operations via separate connections)...')
    const startAt = new Date('2026-10-01T09:00:00.000Z')
    const endAt = new Date('2026-10-01T09:30:00.000Z')

    // Create 2 distinct PrismaClient instances to guarantee separate physical database client connections
    const client1 = new PrismaClient()
    const client2 = new PrismaClient()

    const results = await Promise.allSettled([
      client1.slotReservation.create({
        data: {
          doctorId: testDoctorUser.id,
          patientId: testPatient1.id,
          startAt,
          endAt,
          kind: 'HOLD',
          status: 'ACTIVE',
        },
      }),
      client2.slotReservation.create({
        data: {
          doctorId: testDoctorUser.id,
          patientId: testPatient2.id,
          startAt,
          endAt,
          kind: 'HOLD',
          status: 'ACTIVE',
        },
      }),
    ])

    await client1.$disconnect()
    await client2.$disconnect()

    const fulfilled = results.filter((r) => r.status === 'fulfilled')
    const rejected = results.filter((r) => r.status === 'rejected')

    console.log(`   Fulfilled Operations: ${fulfilled.length}`)
    console.log(`   Rejected Operations: ${rejected.length}`)

    if (fulfilled.length !== 1 || rejected.length !== 1) {
      throw new Error(
        `Concurrency test failed! Expected exactly 1 success and 1 rejection, got ${fulfilled.length} successes and ${rejected.length} rejections.`,
      )
    }

    const rejectionError = rejected[0].reason
    console.log(`   Rejection Error Code / Message: ${rejectionError.code || rejectionError.message}`)
    const isExclusionViolation =
      rejectionError.message.includes('SlotReservation_active_doctor_time_excl') ||
      rejectionError.message.includes('exclusion') ||
      rejectionError.code === 'P2002' ||
      rejectionError.code === 'P2010' ||
      rejectionError.code === '23P01'

    console.log(`   Rejection was triggered by Exclusion Constraint: ${isExclusionViolation}`)

    // Query database to verify exactly 1 reservation exists
    const activeReservations = await prisma.slotReservation.findMany({
      where: {
        doctorId: testDoctorUser.id,
        startAt,
        endAt,
        status: 'ACTIVE',
      },
    })
    console.log(`   Database count of active reservations: ${activeReservations.length}`)
    if (activeReservations.length !== 1) {
      throw new Error(`Expected exactly 1 active reservation in database, found ${activeReservations.length}`)
    }
    console.log('   -> REAL Concurrency Test PASSED: Exactly 1 reservation succeeded, duplicate aborted.\n')

    // 7. Adjacent Half-Open Interval Test: [10:00, 10:30) and [10:30, 11:00)
    console.log('7. Testing Adjacent Half-Open Intervals: [10:00, 10:30) & [10:30, 11:00)...')
    const slot1Start = new Date('2026-10-01T10:00:00.000Z')
    const slot1End = new Date('2026-10-01T10:30:00.000Z')
    const slot2Start = new Date('2026-10-01T10:30:00.000Z')
    const slot2End = new Date('2026-10-01T11:00:00.000Z')

    const res1 = await prisma.slotReservation.create({
      data: {
        doctorId: testDoctorUser.id,
        patientId: testPatient1.id,
        startAt: slot1Start,
        endAt: slot1End,
        kind: 'APPOINTMENT',
        status: 'ACTIVE',
      },
    })

    const res2 = await prisma.slotReservation.create({
      data: {
        doctorId: testDoctorUser.id,
        patientId: testPatient2.id,
        startAt: slot2Start,
        endAt: slot2End,
        kind: 'APPOINTMENT',
        status: 'ACTIVE',
      },
    })

    console.log(`   Slot 1 ID: ${res1.id} [${slot1Start.toISOString()} - ${slot1End.toISOString()})`)
    console.log(`   Slot 2 ID: ${res2.id} [${slot2Start.toISOString()} - ${slot2End.toISOString()})`)
    console.log('   -> Both adjacent half-open intervals ALLOWED successfully.\n')

    // 8. Overlapping Interval Test: [10:15, 10:45)
    console.log('8. Testing Overlapping Interval: [10:15, 10:45) against [10:00, 10:30)...')
    const overlapStart = new Date('2026-10-01T10:15:00.000Z')
    const overlapEnd = new Date('2026-10-01T10:45:00.000Z')

    let overlapRejected = false
    try {
      await prisma.slotReservation.create({
        data: {
          doctorId: testDoctorUser.id,
          patientId: testPatient1.id,
          startAt: overlapStart,
          endAt: overlapEnd,
          kind: 'HOLD',
          status: 'ACTIVE',
        },
      })
    } catch (err) {
      overlapRejected = true
      console.log(`   Overlapping insert rejected with error: ${err.code || 'Exclusion Error'}`)
    }

    if (!overlapRejected) {
      throw new Error('Overlapping interval [10:15, 10:45) was unexpectedly allowed!')
    }
    console.log('   -> Overlapping interval REJECTED successfully by PostgreSQL exclusion constraint.\n')
  } finally {
    // 9. Cleanup all test records
    console.log('9. Cleaning up test data from Neon PostgreSQL...')
    await prisma.slotReservation.deleteMany({
      where: {
        doctorId: testDoctorUser.id,
      },
    })
    await prisma.patientProfile.deleteMany({
      where: {
        userId: { in: [testPatient1.id, testPatient2.id] },
      },
    })
    await prisma.doctorProfile.deleteMany({
      where: {
        userId: testDoctorUser.id,
      },
    })
    await prisma.user.deleteMany({
      where: {
        id: { in: [testDoctorUser.id, testPatient1.id, testPatient2.id] },
      },
    })
    console.log('   -> All temporary test records cleaned up cleanly.\n')
  }

  console.log('=== ALL REAL POSTGRESQL VERIFICATION CHECKS COMPLETED SUCCESSFULLY ===')
}

runRealPostgresVerification()
  .catch((err) => {
    console.error('VERIFICATION ERROR:', err)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
