/**
 * Data Migration Script: Multi-Tenant RBAC Role Migration
 *
 * This script migrates the existing role system to the new multi-tenant RBAC system:
 * - 'admin' -> 'admin' (no change needed)
 * - 'user' -> 'student'
 * - 'org_admin' -> 'admin'
 * - 'trainee' -> 'student'
 *
 * It also creates a default "All Trainees" group for each organization.
 *
 * Usage: npx ts-node scripts/migrate-roles.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function migrateRoles() {
  console.log('Starting role migration...\n');

  // 1. Update roles: org_admin -> admin
  const orgAdminResult = await prisma.trainee.updateMany({
    where: { role: 'org_admin' },
    data: { role: 'admin' },
  });
  console.log(`Updated ${orgAdminResult.count} org_admin users to admin`);

  // 2. Update roles: trainee -> student
  const traineeResult = await prisma.trainee.updateMany({
    where: { role: 'trainee' },
    data: { role: 'student' },
  });
  console.log(`Updated ${traineeResult.count} trainee accounts to student`);

  // 3. Update roles: trainer -> supervisor
  const trainerResult = await prisma.trainee.updateMany({
    where: { role: 'trainer' },
    data: { role: 'supervisor' },
  });
  console.log(`Updated ${trainerResult.count} trainer accounts to supervisor`);

  // 4. Update roles: user -> student (legacy)
  const userResult = await prisma.trainee.updateMany({
    where: { role: 'user' },
    data: { role: 'student' },
  });
  console.log(`Updated ${userResult.count} legacy user accounts to student`);

  console.log('\nRole migration completed!');
}

async function createDefaultGroups() {
  console.log('\nCreating default groups for each organization...\n');

  const organizations = await prisma.organization.findMany();

  for (const org of organizations) {
    console.log(`Processing organization: ${org.name} (${org.id})`);

    // Check if default group already exists
    const existingGroup = await prisma.traineeGroup.findUnique({
      where: {
        organizationId_name: {
          organizationId: org.id,
          name: 'All Trainees',
        },
      },
    });

    if (existingGroup) {
      console.log(`  - Default group already exists, skipping`);
      continue;
    }

    // Find an admin to be the creator
    const admin = await prisma.trainee.findFirst({
      where: {
        organizationId: org.id,
        role: 'admin',
      },
    });

    if (!admin) {
      console.log(`  - No admin found, skipping group creation`);
      continue;
    }

    // Create the default group
    const group = await prisma.traineeGroup.create({
      data: {
        organizationId: org.id,
        name: 'All Trainees',
        description: 'Default group containing all students',
        createdById: admin.id,
      },
    });
    console.log(`  - Created default group: ${group.id}`);

    // Add all students to this group
    const students = await prisma.trainee.findMany({
      where: {
        organizationId: org.id,
        role: 'student',
      },
      select: { id: true },
    });

    if (students.length > 0) {
      // Add students one by one to handle duplicates gracefully
      let addedCount = 0;
      for (const student of students) {
        try {
          await prisma.groupMember.create({
            data: {
              groupId: group.id,
              traineeId: student.id,
            },
          });
          addedCount++;
        } catch (e) {
          // Ignore duplicate errors
        }
      }
      console.log(`  - Added ${addedCount} students to the default group`);
    }
  }

  console.log('\nDefault group creation completed!');
}

async function printSummary() {
  console.log('\n=== Migration Summary ===\n');

  const roleStats = await prisma.trainee.groupBy({
    by: ['role'],
    _count: true,
  });

  console.log('User counts by role:');
  for (const stat of roleStats) {
    console.log(`  - ${stat.role}: ${stat._count}`);
  }

  const groupCount = await prisma.traineeGroup.count();
  console.log(`\nTotal groups: ${groupCount}`);

  const memberCount = await prisma.groupMember.count({ where: { isActive: true as boolean } });
  console.log(`Total group memberships: ${memberCount}`);

  const trainerAssignments = await prisma.trainerGroupAssignment.count({ where: { isActive: true as boolean } });
  console.log(`Total trainer assignments: ${trainerAssignments}`);
}

async function main() {
  console.log('=================================================');
  console.log('Multi-Tenant RBAC Migration Script');
  console.log('=================================================\n');

  try {
    await migrateRoles();
    await createDefaultGroups();
    await printSummary();

    console.log('\n=================================================');
    console.log('Migration completed successfully!');
    console.log('=================================================');
  } catch (error) {
    console.error('\nMigration failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
