import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🚀 Seeding demo data...\n');

  const defaultPassword = await bcrypt.hash('Test1234', 10);

  // ==========================================
  // 1. Create Users
  // ==========================================
  console.log('👤 Creating users...');

  const users = [
    {
      id: 'abdullah-macsoft',
      email: 'abdullah@macsoft.com',
      firstName: 'Abdullah',
      lastName: 'Al-Rashidi',
      role: 'admin',
      organizationId: 'macsoft-org',
      currentLevelId: 'default-level',
    },
    {
      id: 'fahad-macsoft',
      email: 'fahad@macsoft.com',
      firstName: 'Fahad',
      lastName: 'Hassan',
      role: 'admin',
      organizationId: 'macsoft-org',
      currentLevelId: 'default-level',
    },
    {
      id: 'omar-trainee',
      email: 'omar@macsoft.com',
      firstName: 'Omar',
      lastName: 'Khalil',
      role: 'student',
      organizationId: 'macsoft-org',
      currentLevelId: 'default-level',
    },
    {
      id: 'ahmed-trainee',
      email: 'ahmed@macsoft.com',
      firstName: 'Ahmed',
      lastName: 'Mostafa',
      role: 'student',
      organizationId: 'macsoft-org',
      currentLevelId: 'default-level',
    },
    {
      id: 'youssef-trainee',
      email: 'youssef@macsoft.com',
      firstName: 'Youssef',
      lastName: 'Ibrahim',
      role: 'student',
      organizationId: 'macsoft-org',
      currentLevelId: 'default-level',
    },
    {
      id: 'khaled-trainee',
      email: 'khaled@macsoft.com',
      firstName: 'Khaled',
      lastName: 'Nasser',
      role: 'student',
      organizationId: 'macsoft-org',
      currentLevelId: 'default-level',
    },
    {
      id: 'ali-trainee',
      email: 'ali@macsoft.com',
      firstName: 'Ali',
      lastName: 'Saeed',
      role: 'student',
      organizationId: 'macsoft-org',
      currentLevelId: 'default-level',
    },
    {
      id: 'hassan-trainee',
      email: 'hassan@macsoft.com',
      firstName: 'Hassan',
      lastName: 'Mahmoud',
      role: 'student',
      organizationId: 'macsoft-org',
      currentLevelId: 'default-level',
    },
    {
      id: 'tariq-supervisor',
      email: 'tariq@macsoft.com',
      firstName: 'Tariq',
      lastName: 'Zayed',
      role: 'supervisor',
      organizationId: 'macsoft-org',
      currentLevelId: 'default-level',
    },
    {
      id: 'samir-supervisor',
      email: 'samir@macsoft.com',
      firstName: 'Samir',
      lastName: 'Abdel-Fattah',
      role: 'supervisor',
      organizationId: 'macsoft-org',
      currentLevelId: 'default-level',
    },
  ];

  for (const user of users) {
    await prisma.trainee.upsert({
      where: { email: user.email },
      update: {
        role: user.role,
        passwordHash: defaultPassword,
      },
      create: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        organizationId: user.organizationId,
        currentLevelId: user.currentLevelId,
        passwordHash: defaultPassword,
        status: 'active',
        role: user.role,
      },
    });
    console.log(`   ✓ ${user.firstName} ${user.lastName} (${user.email}) — ${user.role}`);
  }

  // ==========================================
  // 2. Create Additional Courses & Lectures
  // ==========================================
  console.log('\n📚 Creating additional courses...');

  // Create an intermediate level
  const intermediateLevel = await prisma.level.upsert({
    where: { id: 'intermediate-level' },
    update: {},
    create: {
      id: 'intermediate-level',
      programId: 'default-program',
      title: 'Intermediate',
      orderInProgram: 2,
    },
  });

  // Create an advanced level
  const advancedLevel = await prisma.level.upsert({
    where: { id: 'advanced-level' },
    update: {},
    create: {
      id: 'advanced-level',
      programId: 'default-program',
      title: 'Advanced',
      orderInProgram: 3,
    },
  });

  const newCourses = [
    {
      id: 'hvac-systems',
      title: 'HVAC Systems Design & Maintenance',
      description: 'Comprehensive training on heating, ventilation, and air conditioning systems including design principles, installation, and troubleshooting',
      difficulty: 'intermediate',
      category: 'hvac',
      levelId: 'intermediate-level',
      estimatedDurationMinutes: 120,
      lessons: [
        { id: 'hvac-1', title: 'Fundamentals of Thermodynamics for HVAC', duration: 20 },
        { id: 'hvac-2', title: 'Air Distribution Systems & Ductwork', duration: 22 },
        { id: 'hvac-3', title: 'Refrigeration Cycles & Components', duration: 25 },
        { id: 'hvac-4', title: 'Chiller Systems & Cooling Towers', duration: 18 },
        { id: 'hvac-5', title: 'HVAC Controls & Automation', duration: 20 },
        { id: 'hvac-6', title: 'Preventive Maintenance Strategies', duration: 15 },
      ],
    },
    {
      id: 'electrical-power-dist',
      title: 'Electrical Power Distribution',
      description: 'Learn electrical power distribution systems from transformers to switchgear, including load calculations and protection schemes',
      difficulty: 'intermediate',
      category: 'electrical',
      levelId: 'intermediate-level',
      estimatedDurationMinutes: 110,
      lessons: [
        { id: 'epd-1', title: 'Power System Fundamentals & Single Line Diagrams', duration: 20 },
        { id: 'epd-2', title: 'Transformers: Types, Ratings & Connections', duration: 22 },
        { id: 'epd-3', title: 'Switchgear & Circuit Breakers', duration: 18 },
        { id: 'epd-4', title: 'Load Calculations & Power Factor Correction', duration: 20 },
        { id: 'epd-5', title: 'Grounding & Lightning Protection', duration: 15 },
        { id: 'epd-6', title: 'Arc Flash Analysis & Safety', duration: 15 },
      ],
    },
    {
      id: 'instrumentation-control',
      title: 'Instrumentation & Process Control',
      description: 'Master industrial instrumentation including sensors, transmitters, controllers, and control valves',
      difficulty: 'advanced',
      category: 'plc_automation',
      levelId: 'advanced-level',
      estimatedDurationMinutes: 130,
      lessons: [
        { id: 'ins-1', title: 'Measurement Principles & Sensor Technologies', duration: 22 },
        { id: 'ins-2', title: 'Pressure, Flow & Level Measurement', duration: 25 },
        { id: 'ins-3', title: 'Temperature Measurement & Calibration', duration: 20 },
        { id: 'ins-4', title: 'PID Control Theory & Loop Tuning', duration: 23 },
        { id: 'ins-5', title: 'Control Valves & Final Elements', duration: 20 },
        { id: 'ins-6', title: 'Distributed Control Systems (DCS)', duration: 20 },
      ],
    },
    {
      id: 'fire-alarm-systems',
      title: 'Fire Alarm & Safety Systems',
      description: 'Design, installation, and maintenance of fire detection and alarm systems according to NFPA standards',
      difficulty: 'intermediate',
      category: 'safety',
      levelId: 'intermediate-level',
      estimatedDurationMinutes: 95,
      lessons: [
        { id: 'fas-1', title: 'Fire Detection Principles & Detector Types', duration: 18 },
        { id: 'fas-2', title: 'Fire Alarm Control Panels & Wiring', duration: 20 },
        { id: 'fas-3', title: 'Notification Appliances & Circuits', duration: 16 },
        { id: 'fas-4', title: 'NFPA 72 Code Requirements', duration: 18 },
        { id: 'fas-5', title: 'System Testing & Commissioning', duration: 23 },
      ],
    },
    {
      id: 'industrial-maintenance',
      title: 'Predictive & Preventive Maintenance',
      description: 'Strategies and techniques for industrial equipment maintenance including vibration analysis, thermography, and oil analysis',
      difficulty: 'beginner',
      category: 'maintenance',
      levelId: 'default-level',
      estimatedDurationMinutes: 90,
      lessons: [
        { id: 'mnt-1', title: 'Maintenance Strategies Overview: Reactive vs Proactive', duration: 15 },
        { id: 'mnt-2', title: 'Vibration Analysis Fundamentals', duration: 20 },
        { id: 'mnt-3', title: 'Infrared Thermography for Electrical Systems', duration: 18 },
        { id: 'mnt-4', title: 'Lubrication & Oil Analysis', duration: 17 },
        { id: 'mnt-5', title: 'CMMS Implementation & Work Order Management', duration: 20 },
      ],
    },
    {
      id: 'energy-management',
      title: 'Energy Management & Efficiency',
      description: 'Energy auditing, efficiency optimization, and sustainable practices for industrial and commercial facilities',
      difficulty: 'advanced',
      category: 'plc_automation',
      levelId: 'advanced-level',
      estimatedDurationMinutes: 100,
      lessons: [
        { id: 'eng-1', title: 'Energy Auditing Methodology', duration: 20 },
        { id: 'eng-2', title: 'Lighting Efficiency & LED Retrofits', duration: 16 },
        { id: 'eng-3', title: 'Motor Efficiency & Variable Speed Drives', duration: 22 },
        { id: 'eng-4', title: 'HVAC Energy Optimization', duration: 20 },
        { id: 'eng-5', title: 'Energy Monitoring Systems & KPIs', duration: 22 },
      ],
    },
    {
      id: 'safety-compliance',
      title: 'Workplace Safety & Compliance',
      description: 'OSHA regulations, lockout/tagout procedures, PPE requirements, and safety management systems',
      difficulty: 'beginner',
      category: 'safety',
      levelId: 'default-level',
      estimatedDurationMinutes: 85,
      lessons: [
        { id: 'saf-1', title: 'OSHA Standards & Regulations Overview', duration: 18 },
        { id: 'saf-2', title: 'Lockout/Tagout (LOTO) Procedures', duration: 20 },
        { id: 'saf-3', title: 'Personal Protective Equipment (PPE)', duration: 15 },
        { id: 'saf-4', title: 'Confined Space Entry', duration: 17 },
        { id: 'saf-5', title: 'Incident Investigation & Reporting', duration: 15 },
      ],
    },
    {
      id: 'vfd-advanced',
      title: 'Advanced VFD Programming & Troubleshooting',
      description: 'Deep dive into variable frequency drive configuration, parameter optimization, and fault diagnosis',
      difficulty: 'advanced',
      category: 'electrical',
      levelId: 'advanced-level',
      estimatedDurationMinutes: 115,
      lessons: [
        { id: 'vfd-1', title: 'VFD Architecture & Operating Principles', duration: 20 },
        { id: 'vfd-2', title: 'Parameter Configuration & Motor Setup', duration: 25 },
        { id: 'vfd-3', title: 'Multi-speed & Process Control Applications', duration: 22 },
        { id: 'vfd-4', title: 'Communication Protocols: Modbus & Profibus', duration: 23 },
        { id: 'vfd-5', title: 'Fault Codes Diagnosis & Troubleshooting', duration: 25 },
      ],
    },
  ];

  let orderInLevel = 7; // After existing 6 courses
  for (const courseData of newCourses) {
    const course = await prisma.course.upsert({
      where: { id: courseData.id },
      update: {
        title: courseData.title,
        description: courseData.description,
        difficulty: courseData.difficulty,
        category: courseData.category,
        estimatedDurationMinutes: courseData.estimatedDurationMinutes,
        isPublished: true,
      },
      create: {
        id: courseData.id,
        programId: 'default-program',
        levelId: courseData.levelId,
        title: courseData.title,
        titleEn: courseData.title,
        description: courseData.description,
        descriptionEn: courseData.description,
        objectives: JSON.stringify([]),
        prerequisites: JSON.stringify([]),
        estimatedDurationMinutes: courseData.estimatedDurationMinutes,
        difficulty: courseData.difficulty,
        category: courseData.category,
        isPublished: true,
        orderInLevel: orderInLevel++,
      },
    });
    console.log(`   ✓ ${course.title}`);

    let orderInCourse = 1;
    for (const lesson of courseData.lessons) {
      await prisma.lecture.upsert({
        where: { id: lesson.id },
        update: {
          title: lesson.title,
          durationMinutes: lesson.duration,
          orderInCourse,
        },
        create: {
          id: lesson.id,
          courseId: course.id,
          title: lesson.title,
          titleEn: lesson.title,
          description: `Lecture: ${lesson.title}`,
          descriptionEn: `Lecture: ${lesson.title}`,
          videoUrl: `https://youtube.com/watch?v=${lesson.id}`,
          durationMinutes: lesson.duration,
          orderInCourse,
          triggerAssessmentOnComplete: true,
        },
      });
      orderInCourse++;
    }
    console.log(`     → ${courseData.lessons.length} lectures`);
  }

  // ==========================================
  // 3. Create Groups
  // ==========================================
  console.log('\n👥 Creating groups...');

  const groups = [
    {
      id: 'grp-hvac-team',
      name: 'HVAC Engineering Team',
      description: 'Team focused on HVAC systems design, installation, and maintenance',
      members: ['omar-trainee', 'ahmed-trainee', 'youssef-trainee'],
      trainer: 'tariq-supervisor',
    },
    {
      id: 'grp-electrical-team',
      name: 'Electrical Power Team',
      description: 'Specialists in electrical power distribution and motor control systems',
      members: ['khaled-trainee', 'ali-trainee', 'hassan-trainee'],
      trainer: 'samir-supervisor',
    },
    {
      id: 'grp-automation-team',
      name: 'Automation & Controls',
      description: 'PLC programming, SCADA systems, and industrial automation engineers',
      members: ['omar-trainee', 'khaled-trainee', 'ali-trainee', 'ahmed-trainee'],
      trainer: 'tariq-supervisor',
    },
    {
      id: 'grp-safety-team',
      name: 'Safety & Compliance',
      description: 'Safety officers and engineers responsible for workplace compliance',
      members: ['youssef-trainee', 'hassan-trainee', 'ahmed-trainee'],
      trainer: 'samir-supervisor',
    },
    {
      id: 'grp-maintenance-team',
      name: 'Maintenance Crew A',
      description: 'First shift maintenance team for industrial equipment',
      members: ['omar-trainee', 'ali-trainee', 'youssef-trainee', 'hassan-trainee'],
      trainer: 'tariq-supervisor',
    },
  ];

  for (const groupData of groups) {
    const group = await prisma.traineeGroup.upsert({
      where: { id: groupData.id },
      update: {
        name: groupData.name,
        description: groupData.description,
      },
      create: {
        id: groupData.id,
        organizationId: 'macsoft-org',
        name: groupData.name,
        description: groupData.description,
        createdById: 'admin-macsoft',
        isActive: true,
      },
    });
    console.log(`   ✓ ${group.name}`);

    // Add members
    for (const memberId of groupData.members) {
      await prisma.groupMember.upsert({
        where: {
          groupId_traineeId: {
            groupId: groupData.id,
            traineeId: memberId,
          },
        },
        update: {},
        create: {
          groupId: groupData.id,
          traineeId: memberId,
          isActive: true,
        },
      });
    }
    console.log(`     → ${groupData.members.length} members`);

    // Assign trainer
    await prisma.trainerGroupAssignment.upsert({
      where: {
        groupId_trainerId: {
          groupId: groupData.id,
          trainerId: groupData.trainer,
        },
      },
      update: {},
      create: {
        groupId: groupData.id,
        trainerId: groupData.trainer,
        assignedById: 'admin-macsoft',
        isActive: true,
      },
    });
    console.log(`     → Trainer assigned`);
  }

  console.log('\n═══════════════════════════════════════════════════════');
  console.log('✅ Demo data seeded successfully!');
  console.log('═══════════════════════════════════════════════════════');
  console.log('\n📋 User Accounts (all use password: Test1234):');
  console.log('   Admins:');
  console.log('   • abdullah@macsoft.com');
  console.log('   • fahad@macsoft.com');
  console.log('   Supervisors:');
  console.log('   • tariq@macsoft.com');
  console.log('   • samir@macsoft.com');
  console.log('   Students:');
  console.log('   • omar@macsoft.com');
  console.log('   • ahmed@macsoft.com');
  console.log('   • youssef@macsoft.com');
  console.log('   • khaled@macsoft.com');
  console.log('   • ali@macsoft.com');
  console.log('   • hassan@macsoft.com');
  console.log('\n📚 New Courses: 8 courses with 45 lectures');
  console.log('👥 Groups: 5 groups with assigned trainers');
  console.log('═══════════════════════════════════════════════════════');
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error('❌ Error:', e);
    await prisma.$disconnect();
    process.exit(1);
  });
