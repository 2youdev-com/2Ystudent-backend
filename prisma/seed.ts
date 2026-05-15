import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // Create default organization
  const org = await prisma.organization.upsert({
    where: { id: 'default-org' },
    update: {},
    create: {
      id: 'default-org',
      name: 'Default Training Organization',
      type: 'training_company',
    },
  });
  console.log('Created organization:', org.name);

  // Create default program
  const program = await prisma.program.upsert({
    where: { id: 'default-program' },
    update: {},
    create: {
      id: 'default-program',
      title: 'Electromechanical Engineering Fundamentals',
      description: 'Complete training program for electromechanical engineering professionals',
      isActive: true,
    },
  });
  console.log('Created program:', program.title);

  // Create default level
  const level = await prisma.level.upsert({
    where: { id: 'default-level' },
    update: {},
    create: {
      id: 'default-level',
      programId: program.id,
      title: 'Beginner',
      orderInProgram: 1,
    },
  });
  console.log('Created level:', level.title);

  // Create all courses with their lectures (matching frontend data)
  const coursesData = [
    {
      id: 'engineering-fundamentals',
      title: 'أساسيات الهندسة الكهروميكانيكية / Engineering Fundamentals',
      description: 'Master the basics of electromechanical engineering',
      difficulty: 'beginner',
      category: 'fundamentals',
      estimatedDurationMinutes: 85,
      lessons: [
        { id: 'fund-1', title: 'مقدمة في الهندسة الكهروميكانيكية', duration: 15 },
        { id: 'fund-2', title: 'فهم الأنظمة الكهربائية', duration: 20 },
        { id: 'fund-3', title: 'أساسيات الأنظمة الميكانيكية', duration: 18 },
        { id: 'fund-4', title: 'أساسيات أنظمة التكييف', duration: 17 },
        { id: 'fund-5', title: 'مبادئ السلامة المهنية', duration: 15 },
      ],
    },
    {
      id: 'negotiation-mastery',
      title: 'إتقان التفاوض / Negotiation Mastery',
      description: 'Advanced negotiation techniques',
      difficulty: 'intermediate',
      category: 'hvac',
      estimatedDurationMinutes: 120,
      lessons: [
        { id: 'neg-1', title: 'علم نفس التفاوض', duration: 22 },
        { id: 'neg-2', title: 'استراتيجيات التفاوض على السعر', duration: 25 },
        { id: 'neg-3', title: 'التعامل مع الاعتراضات باحترافية', duration: 20 },
        { id: 'neg-4', title: 'إنشاء سيناريوهات الفوز للجميع', duration: 18 },
        { id: 'neg-5', title: 'تقنيات الإغلاق المتقدمة', duration: 20 },
        { id: 'neg-6', title: 'التعامل مع المفاوضات الصعبة', duration: 15 },
      ],
    },
    {
      id: 'client-psychology',
      title: 'علم نفس العميل / Client Psychology',
      description: 'Understand buyer behavior',
      difficulty: 'intermediate',
      category: 'safety',
      estimatedDurationMinutes: 90,
      lessons: [
        { id: 'psy-1', title: 'فهم سلوك العميل', duration: 20 },
        { id: 'psy-2', title: 'المحفزات العاطفية في التعامل مع العملاء', duration: 18 },
        { id: 'psy-3', title: 'بناء الألفة الفورية', duration: 17 },
        { id: 'psy-4', title: 'قراءة لغة الجسد', duration: 20 },
        { id: 'psy-5', title: 'توجيه اتخاذ القرار', duration: 15 },
      ],
    },
    {
      id: 'advanced-systems',
      title: 'أنظمة إدارة المباني المتقدمة / Advanced BMS',
      description: 'Specialized training for building management systems',
      difficulty: 'advanced',
      category: 'plc_automation',
      estimatedDurationMinutes: 105,
      lessons: [
        { id: 'lux-1', title: 'مقدمة في أنظمة إدارة المباني', duration: 22 },
        { id: 'lux-2', title: 'التكامل بين الأنظمة', duration: 20 },
        { id: 'lux-3', title: 'برمجة وحدات التحكم', duration: 23 },
        { id: 'lux-4', title: 'المراقبة والتحكم عن بعد', duration: 20 },
        { id: 'lux-5', title: 'تحسين كفاءة الطاقة', duration: 20 },
      ],
    },
    {
      id: 'plc-automation',
      title: 'أنظمة PLC والأتمتة / PLC & Automation',
      description: 'Master PLC programming and industrial automation',
      difficulty: 'beginner',
      category: 'maintenance',
      estimatedDurationMinutes: 75,
      lessons: [
        { id: 'dig-1', title: 'مقدمة في أنظمة PLC', duration: 18 },
        { id: 'dig-2', title: 'برمجة السلم المنطقي', duration: 15 },
        { id: 'dig-3', title: 'أجهزة الاستشعار والمشغلات', duration: 17 },
        { id: 'dig-4', title: 'أنظمة SCADA', duration: 15 },
        { id: 'dig-5', title: 'أساسيات الأتمتة الصناعية', duration: 10 },
      ],
    },
    {
      id: 'motor-controls',
      title: 'التحكم في المحركات / Motor Controls',
      description: 'Learn motor control systems and drives',
      difficulty: 'beginner',
      category: 'electrical',
      estimatedDurationMinutes: 80,
      lessons: [
        { id: 'ftb-1', title: 'أنواع المحركات الكهربائية', duration: 16 },
        { id: 'ftb-2', title: 'دوائر التحكم في المحركات', duration: 18 },
        { id: 'ftb-3', title: 'محولات التردد VFD', duration: 15 },
        { id: 'ftb-4', title: 'الحماية والصيانة', duration: 17 },
        { id: 'ftb-5', title: 'استكشاف الأعطال وإصلاحها', duration: 14 },
      ],
    },
  ];

  let orderInLevel = 1;
  for (const courseData of coursesData) {
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
        programId: program.id,
        levelId: level.id,
        title: courseData.title,
        description: courseData.description,
        objectives: JSON.stringify([]),
        prerequisites: JSON.stringify([]),
        estimatedDurationMinutes: courseData.estimatedDurationMinutes,
        difficulty: courseData.difficulty,
        category: courseData.category,
        isPublished: true,
        orderInLevel: orderInLevel++,
      },
    });
    console.log('Created/updated course:', course.title);

    // Create lectures for this course
    let orderInCourse = 1;
    for (const lesson of courseData.lessons) {
      await prisma.lecture.upsert({
        where: { id: lesson.id },
        update: {
          title: lesson.title,
          durationMinutes: lesson.duration,
          orderInCourse: orderInCourse,
        },
        create: {
          id: lesson.id,
          courseId: course.id,
          title: lesson.title,
          description: `Lecture: ${lesson.title}`,
          videoUrl: `https://youtube.com/watch?v=${lesson.id}`,
          durationMinutes: lesson.duration,
          orderInCourse: orderInCourse,
          triggerAssessmentOnComplete: true,
        },
      });
      orderInCourse++;
    }
    console.log(`  Created ${courseData.lessons.length} lectures`);
  }

  // Create MacSoft Engineering Organization
  const macsoftOrg = await prisma.organization.upsert({
    where: { id: 'macsoft-org' },
    update: {
      contactEmail: 'admin@macsoft.com',
    },
    create: {
      id: 'macsoft-org',
      name: 'MacSoft Engineering',
      type: 'training_company',
      contactEmail: 'admin@macsoft.com',
    },
  });
  console.log('Created MacSoft organization:', macsoftOrg.name);

  // Create only admin user for login - you will add other users manually
  const defaultPassword = await bcrypt.hash('Test1234', 10);

  const adminUser = await prisma.trainee.upsert({
    where: { email: 'admin@macsoft.com' },
    update: {
      role: 'admin',
      passwordHash: defaultPassword,
    },
    create: {
      id: 'admin-macsoft',
      email: 'admin@macsoft.com',
      firstName: 'James',
      lastName: 'Miller',
      organizationId: macsoftOrg.id,
      currentLevelId: level.id,
      passwordHash: defaultPassword,
      status: 'active',
      role: 'admin',
    },
  });
  console.log('Created admin user:', adminUser.email);

  const supervisorUser = await prisma.trainee.upsert({
    where: { email: 'abdullah@macsoft.com' },
    update: {
      role: 'supervisor',
      passwordHash: defaultPassword,
    },
    create: {
      email: 'abdullah@macsoft.com',
      firstName: 'Daniel',
      lastName: 'Roberts',
      organizationId: macsoftOrg.id,
      passwordHash: defaultPassword,
      status: 'active',
      role: 'supervisor',
    },
  });
  console.log('Created supervisor user:', supervisorUser.email);

  const learnerUser = await prisma.trainee.upsert({
    where: { email: 'fahad@macsoft.com' },
    update: {
      role: 'student',
      passwordHash: defaultPassword,
    },
    create: {
      email: 'fahad@macsoft.com',
      firstName: 'Ryan',
      lastName: 'Cooper',
      organizationId: macsoftOrg.id,
      currentLevelId: level.id,
      passwordHash: defaultPassword,
      status: 'active',
      role: 'student',
    },
  });
  console.log('Created learner user:', learnerUser.email);

  console.log('\n========================================');
  console.log('Seeding completed!');
  console.log('========================================');
  console.log('Admin:      admin@macsoft.com     / Test1234');
  console.log('Supervisor: abdullah@macsoft.com  / Test1234');
  console.log('Learner:    fahad@macsoft.com     / Test1234');
  console.log('========================================');
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
