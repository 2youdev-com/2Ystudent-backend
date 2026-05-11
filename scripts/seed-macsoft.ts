/**
 * MacSoft Engineering Seed Script
 *
 * Creates "MacSoft Engineering" organization with:
 * - 1 Admin account (org_admin)
 * - 2 Trainers: Daniel, Nathan
 * - 4 Trainees (2 per trainer)
 *
 * All accounts use password: Test1234
 *
 * Usage: npx ts-node scripts/seed-macsoft.ts
 */

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// Password for all accounts
const DEFAULT_PASSWORD = 'Test1234';
const SALT_ROUNDS = 10;

interface CreatedUser {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role: string;
}

async function seedMacSoft() {
  console.log('=================================================');
  console.log('MacSoft Engineering Seed Script');
  console.log('=================================================\n');

  // Hash the password once
  const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, SALT_ROUNDS);

  const createdUsers: CreatedUser[] = [];

  // 1. Create or find Organization
  console.log('Creating organization...');
  let organization = await prisma.organization.findFirst({
    where: { name: 'MacSoft Engineering' },
  });

  if (!organization) {
    organization = await prisma.organization.create({
      data: {
        name: 'MacSoft Engineering',
        type: 'training_company',
      },
    });
    console.log(`  ✓ Created organization: ${organization.name} (${organization.id})`);
  } else {
    console.log(`  ℹ Organization already exists: ${organization.name}`);
  }

  // 2. Create Admin Account
  console.log('\nCreating admin account...');
  const adminEmail = 'admin@macsoft.com';
  let admin = await prisma.trainee.findUnique({ where: { email: adminEmail } });

  if (!admin) {
    admin = await prisma.trainee.create({
      data: {
        email: adminEmail,
        firstName: 'James',
        lastName: 'Miller',
        organizationId: organization.id,
        role: 'admin',
        passwordHash,
        status: 'active',
      },
    });
    createdUsers.push({
      email: adminEmail,
      password: DEFAULT_PASSWORD,
      firstName: 'James',
      lastName: 'Miller',
      role: 'admin',
    });
    console.log(`  ✓ Created admin: ${admin.email}`);
  } else {
    console.log(`  ℹ Admin already exists: ${admin.email}`);
  }

  // 3. Create Trainers
  console.log('\nCreating trainers...');
  const trainers = [
    { email: 'abdullah@macsoft.com', firstName: 'Daniel', lastName: 'Roberts', firstNameEn: 'Daniel' },
    { email: 'ibrahim@macsoft.com', firstName: 'Nathan', lastName: 'Clark', firstNameEn: 'Nathan' },
  ];

  const createdTrainers: { id: string; email: string; firstName: string }[] = [];

  for (const trainerData of trainers) {
    let trainer = await prisma.trainee.findUnique({ where: { email: trainerData.email } });

    if (!trainer) {
      trainer = await prisma.trainee.create({
        data: {
          email: trainerData.email,
          firstName: trainerData.firstName,
          lastName: trainerData.lastName,
          organizationId: organization.id,
          role: 'supervisor',
          passwordHash,
          status: 'active',
        },
      });
      createdUsers.push({
        email: trainerData.email,
        password: DEFAULT_PASSWORD,
        firstName: trainerData.firstName,
        lastName: trainerData.lastName,
        role: 'supervisor',
      });
      console.log(`  ✓ Created trainer: ${trainer.email} (${trainerData.firstNameEn})`);
    } else {
      console.log(`  ℹ Trainer already exists: ${trainer.email}`);
    }

    createdTrainers.push({ id: trainer.id, email: trainer.email, firstName: trainerData.firstName });
  }

  // 4. Create Trainees (2 per trainer)
  console.log('\nCreating trainees...');
  const trainees = [
    // Trainees for Abdullah (trainer 1)
    { email: 'fahad@macsoft.com', firstName: 'Ryan', lastName: 'Cooper', trainerId: createdTrainers[0]?.id },
    { email: 'khalid@macsoft.com', firstName: 'Kevin', lastName: 'Hayes', trainerId: createdTrainers[0]?.id },
    // Trainees for Nathan (trainer 2)
    { email: 'ahmed@macsoft.com', firstName: 'Alex', lastName: 'Turner', trainerId: createdTrainers[1]?.id },
    { email: 'mohammad@macsoft.com', firstName: 'Mark', lastName: 'Evans', trainerId: createdTrainers[1]?.id },
  ];

  const createdTrainees: { id: string; trainerId?: string }[] = [];

  for (const traineeData of trainees) {
    let trainee = await prisma.trainee.findUnique({ where: { email: traineeData.email } });

    if (!trainee) {
      trainee = await prisma.trainee.create({
        data: {
          email: traineeData.email,
          firstName: traineeData.firstName,
          lastName: traineeData.lastName,
          organizationId: organization.id,
          role: 'student',
          passwordHash,
          status: 'active',
        },
      });
      createdUsers.push({
        email: traineeData.email,
        password: DEFAULT_PASSWORD,
        firstName: traineeData.firstName,
        lastName: traineeData.lastName,
        role: 'student',
      });
      console.log(`  ✓ Created trainee: ${trainee.email} (${traineeData.firstName})`);
    } else {
      console.log(`  ℹ Trainee already exists: ${trainee.email}`);
    }

    createdTrainees.push({ id: trainee.id, trainerId: traineeData.trainerId });
  }

  // 5. Create Groups and Assign Trainees/Trainers
  console.log('\nCreating groups...');

  // Create group for Daniel
  const group1Name = 'Engineering Team Alpha';
  let group1 = await prisma.traineeGroup.findFirst({
    where: { organizationId: organization.id, name: group1Name },
  });

  if (!group1 && admin) {
    group1 = await prisma.traineeGroup.create({
      data: {
        organizationId: organization.id,
        name: group1Name,
        description: 'Training group led by Daniel',
        createdById: admin.id,
        isActive: true,
      },
    });
    console.log(`  ✓ Created group: ${group1.name}`);

    // Assign trainer
    if (createdTrainers[0]) {
      await prisma.trainerGroupAssignment.create({
        data: {
          groupId: group1.id,
          trainerId: createdTrainers[0].id,
          assignedById: admin.id,
        },
      });
      console.log(`    - Assigned trainer: Daniel`);
    }

    // Add trainees (first 2)
    for (let i = 0; i < 2; i++) {
      if (createdTrainees[i]) {
        try {
          await prisma.groupMember.create({
            data: {
              groupId: group1.id,
              traineeId: createdTrainees[i].id,
            },
          });
        } catch {
          // Already exists
        }
      }
    }
    console.log(`    - Added 2 trainees to group`);
  } else if (group1) {
    console.log(`  ℹ Group already exists: ${group1.name}`);
  }

  // Create group for Nathan
  const group2Name = 'Engineering Team Beta';
  let group2 = await prisma.traineeGroup.findFirst({
    where: { organizationId: organization.id, name: group2Name },
  });

  if (!group2 && admin) {
    group2 = await prisma.traineeGroup.create({
      data: {
        organizationId: organization.id,
        name: group2Name,
        description: 'Training group led by Nathan',
        createdById: admin.id,
        isActive: true,
      },
    });
    console.log(`  ✓ Created group: ${group2.name}`);

    // Assign trainer
    if (createdTrainers[1]) {
      await prisma.trainerGroupAssignment.create({
        data: {
          groupId: group2.id,
          trainerId: createdTrainers[1].id,
          assignedById: admin.id,
        },
      });
      console.log(`    - Assigned trainer: Nathan`);
    }

    // Add trainees (last 2)
    for (let i = 2; i < 4; i++) {
      if (createdTrainees[i]) {
        try {
          await prisma.groupMember.create({
            data: {
              groupId: group2.id,
              traineeId: createdTrainees[i].id,
            },
          });
        } catch {
          // Already exists
        }
      }
    }
    console.log(`    - Added 2 trainees to group`);
  } else if (group2) {
    console.log(`  ℹ Group already exists: ${group2.name}`);
  }

  // 6. Print Credentials
  console.log('\n=================================================');
  console.log('✅ SEED COMPLETED SUCCESSFULLY');
  console.log('=================================================\n');

  console.log('📋 LOGIN CREDENTIALS');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Always print all accounts (both new and existing)
  console.log('🔐 ADMIN ACCOUNT');
  console.log(`   Email:    admin@macsoft.com`);
  console.log(`   Password: ${DEFAULT_PASSWORD}`);
  console.log(`   Role:     org_admin (Organization Admin)`);
  console.log('');

  console.log('👨‍🏫 TRAINER ACCOUNTS');
  console.log('');
  console.log('   Trainer 1 - Daniel Roberts');
  console.log(`   Email:    abdullah@macsoft.com`);
  console.log(`   Password: ${DEFAULT_PASSWORD}`);
  console.log(`   Role:     trainer`);
  console.log('');
  console.log('   Trainer 2 - Nathan Clark');
  console.log(`   Email:    ibrahim@macsoft.com`);
  console.log(`   Password: ${DEFAULT_PASSWORD}`);
  console.log(`   Role:     trainer`);
  console.log('');

  console.log('👨‍🎓 TRAINEE ACCOUNTS');
  console.log('');
  console.log('   Team Alpha (Daniel\'s trainees):');
  console.log('');
  console.log(`   Trainee 1 - Ryan Cooper`);
  console.log(`   Email:    fahad@macsoft.com`);
  console.log(`   Password: ${DEFAULT_PASSWORD}`);
  console.log('');
  console.log(`   Trainee 2 - Kevin Hayes`);
  console.log(`   Email:    khalid@macsoft.com`);
  console.log(`   Password: ${DEFAULT_PASSWORD}`);
  console.log('');
  console.log('   Team Beta (Nathan\'s trainees):');
  console.log('');
  console.log(`   Trainee 3 - Alex Turner`);
  console.log(`   Email:    ahmed@macsoft.com`);
  console.log(`   Password: ${DEFAULT_PASSWORD}`);
  console.log('');
  console.log(`   Trainee 4 - Mark Evans`);
  console.log(`   Email:    mohammad@macsoft.com`);
  console.log(`   Password: ${DEFAULT_PASSWORD}`);
  console.log('');

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🏢 Organization: MacSoft Engineering');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

async function main() {
  try {
    await seedMacSoft();
  } catch (error) {
    console.error('\n❌ Seed failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
