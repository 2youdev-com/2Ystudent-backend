/**
 * Super Admin Seed Script
 *
 * This script creates:
 * 1. Default subscription plans (Starter, Professional, Enterprise)
 * 2. Platform organization for super admin
 * 3. Super admin user account
 *
 * Usage: npx ts-node prisma/seed-super-admin.ts
 */

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function seedSuperAdmin() {
  console.log('🚀 Starting Super Admin seed...\n');

  // 1. Create default subscription plans
  console.log('📦 Creating subscription plans...');

  const plans = [
    {
      name: 'starter',
      displayName: 'Starter',
      description: 'Perfect for small teams getting started with AI training',
      monthlyPrice: 99,
      annualPrice: 999,
      seatLimit: 5,
      simulationLimit: 100,
      voiceMinutesLimit: 60,
      features: JSON.stringify([
        'Basic simulations',
        'Email support',
        'Standard reports',
        'Up to 5 users',
      ]),
      isActive: true,
    },
    {
      name: 'professional',
      displayName: 'Professional',
      description: 'For growing teams with advanced training needs',
      monthlyPrice: 199,
      annualPrice: 1999,
      seatLimit: 25,
      simulationLimit: 500,
      voiceMinutesLimit: 300,
      features: JSON.stringify([
        'Advanced simulations',
        'Voice training',
        'Priority support',
        'Custom scenarios',
        'Analytics dashboard',
        'Up to 25 users',
      ]),
      isActive: true,
    },
    {
      name: 'enterprise',
      displayName: 'Enterprise',
      description: 'Unlimited access for large organizations',
      monthlyPrice: 499,
      annualPrice: 4999,
      seatLimit: null, // unlimited
      simulationLimit: null, // unlimited
      voiceMinutesLimit: null, // unlimited
      features: JSON.stringify([
        'Unlimited simulations',
        'Unlimited voice training',
        'Dedicated support',
        'Custom scenarios',
        'Full analytics',
        'API access',
        'SSO integration',
        'Custom branding',
        'Unlimited users',
      ]),
      isActive: true,
    },
  ];

  for (const plan of plans) {
    const existingPlan = await prisma.subscriptionPlan.findUnique({
      where: { name: plan.name },
    });

    if (existingPlan) {
      await prisma.subscriptionPlan.update({
        where: { name: plan.name },
        data: plan,
      });
      console.log(`   ✓ Updated plan: ${plan.displayName}`);
    } else {
      await prisma.subscriptionPlan.create({
        data: plan,
      });
      console.log(`   ✓ Created plan: ${plan.displayName}`);
    }
  }

  console.log('');

  // 2. Create platform organization for super admin
  console.log('🏢 Creating platform organization...');

  let platformOrg = await prisma.organization.findFirst({
    where: { name: '__platform__' },
  });

  if (!platformOrg) {
    platformOrg = await prisma.organization.create({
      data: {
        name: '__platform__',
        type: 'platform',
        contactEmail: 'platform@2ystudy.com',
        settings: JSON.stringify({
          isPlatformOrg: true,
          description: 'Platform administration organization',
        }),
      },
    });
    console.log('   ✓ Created platform organization');
  } else {
    console.log('   ✓ Platform organization already exists');
  }

  console.log('');

  // 3. Create super admin user
  console.log('👤 Creating super admin user...');

  const superAdminEmail = 'superadmin@2ystudy.com';
  const superAdminPassword = 'SuperAdmin@123!';
  const hashedPassword = await bcrypt.hash(superAdminPassword, 10);

  const existingSuperAdmin = await prisma.trainee.findUnique({
    where: { email: superAdminEmail },
  });

  if (existingSuperAdmin) {
    await prisma.trainee.update({
      where: { email: superAdminEmail },
      data: {
        role: 'saas_super_admin',
        passwordHash: hashedPassword,
        status: 'active',
      },
    });
    console.log('   ✓ Updated super admin user');
  } else {
    await prisma.trainee.create({
      data: {
        email: superAdminEmail,
        firstName: 'Super',
        lastName: 'Admin',
        role: 'saas_super_admin',
        passwordHash: hashedPassword,
        organizationId: platformOrg.id,
        status: 'active',
      },
    });
    console.log('   ✓ Created super admin user');
  }

  console.log('');
  console.log('═══════════════════════════════════════════════════════');
  console.log('');
  console.log('✅ Super Admin seed completed successfully!');
  console.log('');
  console.log('📋 Super Admin Credentials:');
  console.log(`   Email:    ${superAdminEmail}`);
  console.log(`   Password: ${superAdminPassword}`);
  console.log('');
  console.log('📦 Subscription Plans Created:');
  for (const plan of plans) {
    console.log(`   - ${plan.displayName}: $${plan.monthlyPrice}/month`);
  }
  console.log('');
  console.log('⚠️  IMPORTANT: Change the super admin password after first login!');
  console.log('');
  console.log('═══════════════════════════════════════════════════════');
}

// Run the seed
seedSuperAdmin()
  .then(() => {
    console.log('\n🎉 Done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Error during seed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
