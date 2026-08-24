const { PrismaClient, UserRole } = require("@prisma/client");
const { promisify } = require("node:util");
const { randomBytes, scrypt: scryptCallback } = require("node:crypto");

const prisma = new PrismaClient();
const scrypt = promisify(scryptCallback);

async function hashDevelopmentPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const derivedKey = await scrypt(password, salt, 64);
  return `scrypt$${salt}$${derivedKey.toString("hex")}`;
}

async function upsertUser({ email, role, firstName, lastName, profile }) {
  const passwordHash = await hashDevelopmentPassword("CareFlowDev123!");

  return prisma.user.upsert({
    where: { email },
    update: { role, passwordHash },
    create: {
      email,
      passwordHash,
      role,
      ...(role === UserRole.DOCTOR
        ? { doctorProfile: { create: { firstName, lastName, ...profile } } }
        : role === UserRole.PATIENT
          ? { patientProfile: { create: { firstName, lastName, phone: profile.phone } } }
          : {}),
    },
    include: { doctorProfile: true },
  });
}

async function main() {
  await upsertUser({
    email: "admin@careflow.test",
    role: UserRole.ADMIN,
    firstName: "Development",
    lastName: "Admin",
    profile: {},
  });

  const doctors = await Promise.all([
    upsertUser({
      email: "dr.mehta@careflow.test",
      role: UserRole.DOCTOR,
      firstName: "Anika",
      lastName: "Mehta",
      profile: { specialisation: "Cardiology", slotDurationMinutes: 30, isActive: true },
    }),
    upsertUser({
      email: "dr.iyer@careflow.test",
      role: UserRole.DOCTOR,
      firstName: "Rohan",
      lastName: "Iyer",
      profile: { specialisation: "Dermatology", slotDurationMinutes: 20, isActive: true },
    }),
    upsertUser({
      email: "dr.khan@careflow.test",
      role: UserRole.DOCTOR,
      firstName: "Sara",
      lastName: "Khan",
      profile: { specialisation: "General Medicine", slotDurationMinutes: 30, isActive: true },
    }),
  ]);

  await Promise.all(
    doctors.flatMap((doctor) =>
      [1, 2, 3, 4, 5].map((weekday) =>
        prisma.doctorWorkingHours.upsert({
          where: {
            doctorId_weekday_startTime_endTime: {
              doctorId: doctor.doctorProfile.id,
              weekday,
              startTime: "09:00",
              endTime: "17:00",
            },
          },
          update: {},
          create: { doctorId: doctor.doctorProfile.id, weekday, startTime: "09:00", endTime: "17:00" },
        }),
      ),
    ),
  );

  await Promise.all([
    upsertUser({
      email: "patient.one@careflow.test",
      role: UserRole.PATIENT,
      firstName: "Priya",
      lastName: "Shah",
      profile: { phone: "+15550000001" },
    }),
    upsertUser({
      email: "patient.two@careflow.test",
      role: UserRole.PATIENT,
      firstName: "Arjun",
      lastName: "Rao",
      profile: { phone: "+15550000002" },
    }),
  ]);

  console.log("Seeded development-only CareFlow accounts. Password: CareFlowDev123!");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
