/**
 * Admin Courses Routes
 * Full CRUD for managing training courses
 * Multi-tenant: All operations scoped to organization
 */

import { Router, Request, Response } from 'express';
import { container } from 'tsyringe';
import { PrismaClient } from '@prisma/client';
import { authMiddleware } from '../middleware/auth.middleware';
import { ITraineeRepository } from '../repositories/interfaces/trainee.repository.interface';
import multer from 'multer';

const router = Router();

// All admin courses routes require authentication with admin/supervisor role
router.use(authMiddleware(['admin', 'supervisor']));

// Configure multer for file uploads (PDF, images)
// Note: For MVP, files are stored as base64 in database
// TODO: Migrate to GCS for production
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit for base64 storage
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/webp',
    ];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF, JPEG, PNG, and WebP files are allowed'));
    }
  },
});

// Helper function to get organization ID (supports impersonation)
async function getOrganizationId(req: Request): Promise<string | null> {
  if (req.organizationId) {
    return req.organizationId;
  }
  const traineeRepo = container.resolve<ITraineeRepository>('TraineeRepository');
  const user = await traineeRepo.findById(req.user!.userId);
  return user?.organizationId || null;
}

// Default categories — seeded into DB on first request per organization
const DEFAULT_CATEGORIES = [
  { value: 'fundamentals', labelAr: 'أساسيات الهندسة', labelEn: 'Engineering Fundamentals', sortOrder: 0 },
  { value: 'hvac', labelAr: 'أنظمة التكييف', labelEn: 'HVAC Systems', sortOrder: 1 },
  { value: 'electrical', labelAr: 'الأنظمة الكهربائية', labelEn: 'Electrical Systems', sortOrder: 2 },
  { value: 'plc_automation', labelAr: 'التحكم الآلي', labelEn: 'PLC & Automation', sortOrder: 3 },
  { value: 'maintenance', labelAr: 'الصيانة الصناعية', labelEn: 'Industrial Maintenance', sortOrder: 4 },
  { value: 'safety', labelAr: 'السلامة والامتثال', labelEn: 'Safety & Compliance', sortOrder: 5 },
];

const DEFAULT_DIFFICULTIES = [
  { value: 'beginner', labelAr: 'مبتدئ', labelEn: 'Beginner', sortOrder: 0 },
  { value: 'intermediate', labelAr: 'متوسط', labelEn: 'Intermediate', sortOrder: 1 },
  { value: 'advanced', labelAr: 'متقدم', labelEn: 'Advanced', sortOrder: 2 },
];

// Helper: get difficulties from DB, auto-seed defaults if empty
async function getOrSeedDifficulties(prisma: PrismaClient, organizationId: string) {
  try {
    let difficulties = await (prisma as any).courseDifficulty.findMany({
      where: { organizationId, isActive: true },
      orderBy: { sortOrder: 'asc' },
    });

    if (difficulties.length === 0) {
      await (prisma as any).courseDifficulty.createMany({
        data: DEFAULT_DIFFICULTIES.map((d) => ({
          organizationId,
          ...d,
        })),
        skipDuplicates: true,
      });
      difficulties = await (prisma as any).courseDifficulty.findMany({
        where: { organizationId, isActive: true },
        orderBy: { sortOrder: 'asc' },
      });
    }

    return difficulties.map((d: any) => ({
      id: d.id,
      value: d.value,
      labelAr: d.labelAr,
      labelEn: d.labelEn,
    }));
  } catch {
    return DEFAULT_DIFFICULTIES.map((d) => ({
      value: d.value,
      labelAr: d.labelAr,
      labelEn: d.labelEn,
    }));
  }
}

// Helper: get categories from DB, auto-seed defaults if empty
async function getOrSeedCategories(prisma: PrismaClient, organizationId: string) {
  try {
    let categories = await (prisma as any).courseCategory.findMany({
      where: { organizationId, isActive: true },
      orderBy: { sortOrder: 'asc' },
    });

    if (categories.length === 0) {
      // Seed default categories for this organization
      await (prisma as any).courseCategory.createMany({
        data: DEFAULT_CATEGORIES.map((cat) => ({
          organizationId,
          ...cat,
        })),
        skipDuplicates: true,
      });
      categories = await (prisma as any).courseCategory.findMany({
        where: { organizationId, isActive: true },
        orderBy: { sortOrder: 'asc' },
      });
    }

    return categories.map((c: any) => ({
      id: c.id,
      value: c.value,
      labelAr: c.labelAr,
      labelEn: c.labelEn,
    }));
  } catch {
    // Fallback to defaults if CourseCategory table doesn't exist yet
    return DEFAULT_CATEGORIES.map((cat) => ({
      value: cat.value,
      labelAr: cat.labelAr,
      labelEn: cat.labelEn,
    }));
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// CATEGORIES CRUD (must be before /:id to avoid route conflict)
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/admin/courses/categories - List categories for organization
router.get('/categories', async (req: Request, res: Response) => {
  try {
    const prisma = container.resolve<PrismaClient>('PrismaClient');
    const organizationId = await getOrganizationId(req);
    if (!organizationId) {
      return res.status(400).json({ error: 'Organization context required' });
    }

    const categories = await getOrSeedCategories(prisma, organizationId);
    res.json({ categories });
  } catch (error) {
    console.error('Error fetching categories:', error);
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

// POST /api/admin/courses/categories - Create new category (admin only)
router.post('/categories', async (req: Request, res: Response) => {
  try {
    if (req.user!.role !== 'admin') {
      return res.status(403).json({ error: 'Only admins can add categories' });
    }

    const prisma = container.resolve<PrismaClient>('PrismaClient');
    const organizationId = await getOrganizationId(req);
    if (!organizationId) {
      return res.status(400).json({ error: 'Organization context required' });
    }

    const { labelEn, labelAr } = req.body;
    if (!labelEn || !labelEn.trim()) {
      return res.status(400).json({ error: 'Category name is required' });
    }

    // Generate slug from English label
    const value = labelEn.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

    // Check for duplicate
    const existing = await (prisma as any).courseCategory.findUnique({
      where: { organizationId_value: { organizationId, value } },
    });
    if (existing) {
      return res.status(409).json({ error: 'Category already exists' });
    }

    // Get max sort order
    const maxSort = await (prisma as any).courseCategory.findFirst({
      where: { organizationId },
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    });

    const category = await (prisma as any).courseCategory.create({
      data: {
        organizationId,
        value,
        labelEn: labelEn.trim(),
        labelAr: (labelAr || labelEn).trim(),
        sortOrder: (maxSort?.sortOrder ?? -1) + 1,
      },
    });

    res.status(201).json({
      category: { id: category.id, value: category.value, labelEn: category.labelEn, labelAr: category.labelAr },
    });
  } catch (error) {
    console.error('Error creating category:', error);
    res.status(500).json({ error: 'Failed to create category' });
  }
});

// DELETE /api/admin/courses/categories/:id - Delete category (admin only)
router.delete('/categories/:id', async (req: Request, res: Response) => {
  try {
    if (req.user!.role !== 'admin') {
      return res.status(403).json({ error: 'Only admins can delete categories' });
    }

    const prisma = container.resolve<PrismaClient>('PrismaClient');
    await (prisma as any).courseCategory.delete({ where: { id: req.params.id } });
    res.json({ message: 'Category deleted' });
  } catch (error) {
    console.error('Error deleting category:', error);
    res.status(500).json({ error: 'Failed to delete category' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// DIFFICULTIES CRUD (must be before /:id to avoid route conflict)
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/admin/courses/difficulties - List difficulties for organization
router.get('/difficulties', async (req: Request, res: Response) => {
  try {
    const prisma = container.resolve<PrismaClient>('PrismaClient');
    const organizationId = await getOrganizationId(req);
    if (!organizationId) {
      return res.status(400).json({ error: 'Organization context required' });
    }

    const difficulties = await getOrSeedDifficulties(prisma, organizationId);
    res.json({ difficulties });
  } catch (error) {
    console.error('Error fetching difficulties:', error);
    res.status(500).json({ error: 'Failed to fetch difficulties' });
  }
});

// POST /api/admin/courses/difficulties - Create new difficulty (admin only)
router.post('/difficulties', async (req: Request, res: Response) => {
  try {
    if (req.user!.role !== 'admin') {
      return res.status(403).json({ error: 'Only admins can add difficulty levels' });
    }

    const prisma = container.resolve<PrismaClient>('PrismaClient');
    const organizationId = await getOrganizationId(req);
    if (!organizationId) {
      return res.status(400).json({ error: 'Organization context required' });
    }

    const { labelEn, labelAr } = req.body;
    if (!labelEn || !labelEn.trim()) {
      return res.status(400).json({ error: 'Difficulty name is required' });
    }

    // Generate slug from English label
    const value = labelEn.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

    // Check for duplicate
    const existing = await (prisma as any).courseDifficulty.findUnique({
      where: { organizationId_value: { organizationId, value } },
    });
    if (existing) {
      return res.status(409).json({ error: 'Difficulty level already exists' });
    }

    // Get max sort order
    const maxSort = await (prisma as any).courseDifficulty.findFirst({
      where: { organizationId },
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    });

    const difficulty = await (prisma as any).courseDifficulty.create({
      data: {
        organizationId,
        value,
        labelEn: labelEn.trim(),
        labelAr: (labelAr || labelEn).trim(),
        sortOrder: (maxSort?.sortOrder ?? -1) + 1,
      },
    });

    res.status(201).json({
      difficulty: { id: difficulty.id, value: difficulty.value, labelEn: difficulty.labelEn, labelAr: difficulty.labelAr },
    });
  } catch (error) {
    console.error('Error creating difficulty:', error);
    res.status(500).json({ error: 'Failed to create difficulty' });
  }
});

// DELETE /api/admin/courses/difficulties/:id - Delete difficulty (admin only)
router.delete('/difficulties/:id', async (req: Request, res: Response) => {
  try {
    if (req.user!.role !== 'admin') {
      return res.status(403).json({ error: 'Only admins can delete difficulty levels' });
    }

    const prisma = container.resolve<PrismaClient>('PrismaClient');
    await (prisma as any).courseDifficulty.delete({ where: { id: req.params.id } });
    res.json({ message: 'Difficulty deleted' });
  } catch (error) {
    console.error('Error deleting difficulty:', error);
    res.status(500).json({ error: 'Failed to delete difficulty' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// STATS (must be before /:id to avoid route conflict)
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/admin/courses/stats - Get course statistics
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const prisma = container.resolve<PrismaClient>('PrismaClient');
    const organizationId = await getOrganizationId(req);

    if (!organizationId) {
      return res.status(400).json({ error: 'Organization context required' });
    }

    const [totalCourses, publishedCourses, totalLectures] = await Promise.all([
      prisma.course.count({ where: { organizationId } }),
      prisma.course.count({ where: { organizationId, isPublished: true } }),
      prisma.lecture.count({
        where: { course: { organizationId } },
      }),
    ]);

    res.json({
      totalCourses,
      publishedCourses,
      draftCourses: totalCourses - publishedCourses,
      totalLectures,
    });
  } catch (error) {
    console.error('Error fetching course stats:', error);
    res.status(500).json({ error: 'Failed to fetch course statistics' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// LIST COURSES
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/admin/courses - List all courses for organization
router.get('/', async (req: Request, res: Response) => {
  try {
    const prisma = container.resolve<PrismaClient>('PrismaClient');
    const organizationId = await getOrganizationId(req);

    if (!organizationId) {
      return res.status(400).json({ error: 'Organization context required' });
    }

    // Query params for filtering
    const { category, difficulty, isPublished, search } = req.query;

    const where: any = {
      organizationId,
    };

    if (category && category !== 'all') {
      where.category = category;
    }

    if (difficulty && difficulty !== 'all') {
      where.difficulty = difficulty;
    }

    if (isPublished !== undefined) {
      where.isPublished = isPublished === 'true';
    }

    if (search) {
      where.OR = [
        { titleAr: { contains: search as string, mode: 'insensitive' } },
        { titleEn: { contains: search as string, mode: 'insensitive' } },
        { title: { contains: search as string, mode: 'insensitive' } },
      ];
    }

    const courses = await prisma.course.findMany({
      where,
      include: {
        _count: {
          select: {
            lectures: true,
            attachments: true,
          },
        },
      },
      orderBy: [
        { isPublished: 'desc' },
        { createdAt: 'desc' },
      ],
    });

    // Load categories and difficulties from DB (auto-seeds defaults if needed)
    const [categories, difficulties] = await Promise.all([
      getOrSeedCategories(prisma, organizationId),
      getOrSeedDifficulties(prisma, organizationId),
    ]);

    res.json({
      courses,
      categories,
      difficulties,
    });
  } catch (error) {
    console.error('Error fetching courses:', error);
    res.status(500).json({ error: 'Failed to fetch courses' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// GET SINGLE COURSE
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/admin/courses/:id - Get single course with lectures and attachments
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const prisma = container.resolve<PrismaClient>('PrismaClient');
    const organizationId = await getOrganizationId(req);
    const { id } = req.params;

    if (!organizationId) {
      return res.status(400).json({ error: 'Organization context required' });
    }

    const course = await prisma.course.findFirst({
      where: {
        id,
        organizationId,
      },
      include: {
        lectures: {
          orderBy: { orderInCourse: 'asc' },
        },
        attachments: {
          orderBy: { displayOrder: 'asc' },
        },
      },
    });

    if (!course) {
      return res.status(404).json({ error: 'Course not found' });
    }

    res.json({ course });
  } catch (error) {
    console.error('Error fetching course:', error);
    res.status(500).json({ error: 'Failed to fetch course' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// CREATE COURSE
// ═══════════════════════════════════════════════════════════════════════════

// POST /api/admin/courses - Create new course
router.post('/', async (req: Request, res: Response) => {
  try {
    const prisma = container.resolve<PrismaClient>('PrismaClient');
    const organizationId = await getOrganizationId(req);

    if (!organizationId) {
      return res.status(400).json({ error: 'Organization context required' });
    }

    const {
      titleAr,
      titleEn,
      descriptionAr,
      descriptionEn,
      category,
      difficulty,
      estimatedDurationMinutes,
      objectivesAr,
      objectivesEn,
      competencyTags,
      notesAr,
      notesEn,
      recommendedSimulationType,
      recommendedSimulationScenario,
      recommendedSimulationDifficulty,
    } = req.body;

    // Validation
    if (!titleAr || !titleEn) {
      return res.status(400).json({ error: 'Title (Arabic and English) is required' });
    }

    if (!category || !difficulty) {
      return res.status(400).json({ error: 'Category and difficulty are required' });
    }

    const course = await prisma.course.create({
      data: {
        organizationId,
        titleAr,
        titleEn,
        title: titleEn, // Legacy field
        descriptionAr: descriptionAr || '',
        descriptionEn: descriptionEn || '',
        description: descriptionEn || '', // Legacy field
        category,
        difficulty,
        estimatedDurationMinutes: estimatedDurationMinutes || 60,
        objectivesAr: JSON.stringify(objectivesAr || []),
        objectivesEn: JSON.stringify(objectivesEn || []),
        objectives: JSON.stringify(objectivesEn || []), // Legacy field
        competencyTags: competencyTags || [],
        notesAr,
        notesEn,
        recommendedSimulationType,
        recommendedSimulationScenario,
        recommendedSimulationDifficulty,
        isPublished: false,
        createdById: req.user!.userId,
      },
      include: {
        _count: {
          select: {
            lectures: true,
            attachments: true,
          },
        },
      },
    });

    res.status(201).json({ course });
  } catch (error) {
    console.error('Error creating course:', error);
    res.status(500).json({ error: 'Failed to create course' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// UPDATE COURSE
// ═══════════════════════════════════════════════════════════════════════════

// PATCH /api/admin/courses/:id - Update course
router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const prisma = container.resolve<PrismaClient>('PrismaClient');
    const organizationId = await getOrganizationId(req);
    const { id } = req.params;

    if (!organizationId) {
      return res.status(400).json({ error: 'Organization context required' });
    }

    // Verify course belongs to organization
    const existing = await prisma.course.findFirst({
      where: { id, organizationId },
    });

    if (!existing) {
      return res.status(404).json({ error: 'Course not found' });
    }

    const {
      titleAr,
      titleEn,
      descriptionAr,
      descriptionEn,
      category,
      difficulty,
      estimatedDurationMinutes,
      objectivesAr,
      objectivesEn,
      competencyTags,
      notesAr,
      notesEn,
      recommendedSimulationType,
      recommendedSimulationScenario,
      recommendedSimulationDifficulty,
      isPublished,
      thumbnailUrl,
    } = req.body;

    const updateData: any = {};

    if (titleAr !== undefined) {
      updateData.titleAr = titleAr;
    }
    if (titleEn !== undefined) {
      updateData.titleEn = titleEn;
      updateData.title = titleEn; // Keep legacy field in sync
    }
    if (descriptionAr !== undefined) {
      updateData.descriptionAr = descriptionAr;
    }
    if (descriptionEn !== undefined) {
      updateData.descriptionEn = descriptionEn;
      updateData.description = descriptionEn; // Keep legacy field in sync
    }
    if (category !== undefined) {
      updateData.category = category;
    }
    if (difficulty !== undefined) {
      updateData.difficulty = difficulty;
    }
    if (estimatedDurationMinutes !== undefined) {
      updateData.estimatedDurationMinutes = estimatedDurationMinutes;
    }
    if (objectivesAr !== undefined) {
      updateData.objectivesAr = JSON.stringify(objectivesAr);
    }
    if (objectivesEn !== undefined) {
      updateData.objectivesEn = JSON.stringify(objectivesEn);
      updateData.objectives = JSON.stringify(objectivesEn); // Keep legacy field in sync
    }
    if (competencyTags !== undefined) {
      updateData.competencyTags = competencyTags;
    }
    if (notesAr !== undefined) {
      updateData.notesAr = notesAr;
    }
    if (notesEn !== undefined) {
      updateData.notesEn = notesEn;
    }
    if (recommendedSimulationType !== undefined) {
      updateData.recommendedSimulationType = recommendedSimulationType;
    }
    if (recommendedSimulationScenario !== undefined) {
      updateData.recommendedSimulationScenario = recommendedSimulationScenario;
    }
    if (recommendedSimulationDifficulty !== undefined) {
      updateData.recommendedSimulationDifficulty = recommendedSimulationDifficulty;
    }
    if (isPublished !== undefined) {
      updateData.isPublished = isPublished;
    }
    if (thumbnailUrl !== undefined) {
      updateData.thumbnailUrl = thumbnailUrl;
    }

    const course = await prisma.course.update({
      where: { id },
      data: updateData,
      include: {
        lectures: {
          orderBy: { orderInCourse: 'asc' },
        },
        attachments: {
          orderBy: { displayOrder: 'asc' },
        },
        _count: {
          select: {
            lectures: true,
            attachments: true,
          },
        },
      },
    });

    res.json({ course });
  } catch (error) {
    console.error('Error updating course:', error);
    res.status(500).json({ error: 'Failed to update course' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// DELETE COURSE
// ═══════════════════════════════════════════════════════════════════════════

// DELETE /api/admin/courses/:id - Delete course
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const prisma = container.resolve<PrismaClient>('PrismaClient');
    const organizationId = await getOrganizationId(req);
    const { id } = req.params;

    if (!organizationId) {
      return res.status(400).json({ error: 'Organization context required' });
    }

    // Verify course belongs to organization
    const existing = await prisma.course.findFirst({
      where: { id, organizationId },
    });

    if (!existing) {
      return res.status(404).json({ error: 'Course not found' });
    }

    // Delete course (lectures and attachments will cascade)
    await prisma.course.delete({
      where: { id },
    });

    res.json({ message: 'Course deleted successfully' });
  } catch (error) {
    console.error('Error deleting course:', error);
    res.status(500).json({ error: 'Failed to delete course' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// LECTURE MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

// POST /api/admin/courses/:id/lectures - Add lecture to course
router.post('/:id/lectures', async (req: Request, res: Response) => {
  try {
    const prisma = container.resolve<PrismaClient>('PrismaClient');
    const organizationId = await getOrganizationId(req);
    const { id: courseId } = req.params;

    if (!organizationId) {
      return res.status(400).json({ error: 'Organization context required' });
    }

    // Verify course belongs to organization
    const course = await prisma.course.findFirst({
      where: { id: courseId, organizationId },
      include: { _count: { select: { lectures: true } } },
    });

    if (!course) {
      return res.status(404).json({ error: 'Course not found' });
    }

    const {
      titleAr,
      titleEn,
      descriptionAr,
      descriptionEn,
      videoUrl,
      durationMinutes,
    } = req.body;

    // Validation
    if (!titleAr || !titleEn) {
      return res.status(400).json({ error: 'Title (Arabic and English) is required' });
    }

    if (!videoUrl) {
      return res.status(400).json({ error: 'Video URL is required' });
    }

    // Determine video type from URL
    let videoType = 'direct';
    if (videoUrl.includes('youtube.com') || videoUrl.includes('youtu.be')) {
      videoType = 'youtube';
    } else if (videoUrl.includes('vimeo.com')) {
      videoType = 'vimeo';
    }

    const lecture = await prisma.lecture.create({
      data: {
        courseId,
        titleAr,
        titleEn,
        title: titleEn, // Legacy field
        descriptionAr: descriptionAr || '',
        descriptionEn: descriptionEn || '',
        description: descriptionEn || '', // Legacy field
        videoUrl,
        videoType,
        durationMinutes: durationMinutes || 15,
        orderInCourse: course._count.lectures + 1,
      },
    });

    // Update course estimated duration
    const totalDuration = await prisma.lecture.aggregate({
      where: { courseId },
      _sum: { durationMinutes: true },
    });

    await prisma.course.update({
      where: { id: courseId },
      data: { estimatedDurationMinutes: totalDuration._sum.durationMinutes || 0 },
    });

    res.status(201).json({ lecture });
  } catch (error) {
    console.error('Error creating lecture:', error);
    res.status(500).json({ error: 'Failed to create lecture' });
  }
});

// PATCH /api/admin/courses/:id/lectures/:lectureId - Update lecture
router.patch('/:id/lectures/:lectureId', async (req: Request, res: Response) => {
  try {
    const prisma = container.resolve<PrismaClient>('PrismaClient');
    const organizationId = await getOrganizationId(req);
    const { id: courseId, lectureId } = req.params;

    if (!organizationId) {
      return res.status(400).json({ error: 'Organization context required' });
    }

    // Verify lecture belongs to course in this organization
    const existing = await prisma.lecture.findFirst({
      where: { id: lectureId, courseId },
      include: { course: true },
    });

    if (!existing || existing.course.organizationId !== organizationId) {
      return res.status(404).json({ error: 'Lecture not found' });
    }

    const {
      titleAr,
      titleEn,
      descriptionAr,
      descriptionEn,
      videoUrl,
      durationMinutes,
    } = req.body;

    const updateData: any = {};

    if (titleAr !== undefined) updateData.titleAr = titleAr;
    if (titleEn !== undefined) {
      updateData.titleEn = titleEn;
      updateData.title = titleEn;
    }
    if (descriptionAr !== undefined) updateData.descriptionAr = descriptionAr;
    if (descriptionEn !== undefined) {
      updateData.descriptionEn = descriptionEn;
      updateData.description = descriptionEn;
    }
    if (videoUrl !== undefined) {
      updateData.videoUrl = videoUrl;
      // Update video type
      if (videoUrl.includes('youtube.com') || videoUrl.includes('youtu.be')) {
        updateData.videoType = 'youtube';
      } else if (videoUrl.includes('vimeo.com')) {
        updateData.videoType = 'vimeo';
      } else {
        updateData.videoType = 'direct';
      }
    }
    if (durationMinutes !== undefined) updateData.durationMinutes = durationMinutes;

    const lecture = await prisma.lecture.update({
      where: { id: lectureId },
      data: updateData,
    });

    // Update course estimated duration if duration changed
    if (durationMinutes !== undefined) {
      const totalDuration = await prisma.lecture.aggregate({
        where: { courseId },
        _sum: { durationMinutes: true },
      });

      await prisma.course.update({
        where: { id: courseId },
        data: { estimatedDurationMinutes: totalDuration._sum.durationMinutes || 0 },
      });
    }

    res.json({ lecture });
  } catch (error) {
    console.error('Error updating lecture:', error);
    res.status(500).json({ error: 'Failed to update lecture' });
  }
});

// DELETE /api/admin/courses/:id/lectures/:lectureId - Delete lecture
router.delete('/:id/lectures/:lectureId', async (req: Request, res: Response) => {
  try {
    const prisma = container.resolve<PrismaClient>('PrismaClient');
    const organizationId = await getOrganizationId(req);
    const { id: courseId, lectureId } = req.params;

    if (!organizationId) {
      return res.status(400).json({ error: 'Organization context required' });
    }

    // Verify lecture belongs to course in this organization
    const existing = await prisma.lecture.findFirst({
      where: { id: lectureId, courseId },
      include: { course: true },
    });

    if (!existing || existing.course.organizationId !== organizationId) {
      return res.status(404).json({ error: 'Lecture not found' });
    }

    await prisma.lecture.delete({
      where: { id: lectureId },
    });

    // Reorder remaining lectures
    const remainingLectures = await prisma.lecture.findMany({
      where: { courseId },
      orderBy: { orderInCourse: 'asc' },
    });

    await Promise.all(
      remainingLectures.map((l, index) =>
        prisma.lecture.update({
          where: { id: l.id },
          data: { orderInCourse: index + 1 },
        })
      )
    );

    // Update course duration
    const totalDuration = await prisma.lecture.aggregate({
      where: { courseId },
      _sum: { durationMinutes: true },
    });

    await prisma.course.update({
      where: { id: courseId },
      data: { estimatedDurationMinutes: totalDuration._sum.durationMinutes || 0 },
    });

    res.json({ message: 'Lecture deleted successfully' });
  } catch (error) {
    console.error('Error deleting lecture:', error);
    res.status(500).json({ error: 'Failed to delete lecture' });
  }
});

// POST /api/admin/courses/:id/lectures/reorder - Reorder lectures
router.post('/:id/lectures/reorder', async (req: Request, res: Response) => {
  try {
    const prisma = container.resolve<PrismaClient>('PrismaClient');
    const organizationId = await getOrganizationId(req);
    const { id: courseId } = req.params;
    const { lectureIds } = req.body;

    if (!organizationId) {
      return res.status(400).json({ error: 'Organization context required' });
    }

    if (!Array.isArray(lectureIds)) {
      return res.status(400).json({ error: 'lectureIds array is required' });
    }

    // Verify course belongs to organization
    const course = await prisma.course.findFirst({
      where: { id: courseId, organizationId },
    });

    if (!course) {
      return res.status(404).json({ error: 'Course not found' });
    }

    // Update order for each lecture
    await Promise.all(
      lectureIds.map((lectureId: string, index: number) =>
        prisma.lecture.update({
          where: { id: lectureId },
          data: { orderInCourse: index + 1 },
        })
      )
    );

    const lectures = await prisma.lecture.findMany({
      where: { courseId },
      orderBy: { orderInCourse: 'asc' },
    });

    res.json({ lectures });
  } catch (error) {
    console.error('Error reordering lectures:', error);
    res.status(500).json({ error: 'Failed to reorder lectures' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// ATTACHMENT MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

// POST /api/admin/courses/:id/attachments - Upload attachment
router.post('/:id/attachments', upload.single('file'), async (req: Request, res: Response) => {
  try {
    const prisma = container.resolve<PrismaClient>('PrismaClient');
    const organizationId = await getOrganizationId(req);
    const { id: courseId } = req.params;

    if (!organizationId) {
      return res.status(400).json({ error: 'Organization context required' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'File is required' });
    }

    // Verify course belongs to organization
    const course = await prisma.course.findFirst({
      where: { id: courseId, organizationId },
      include: { _count: { select: { attachments: true } } },
    });

    if (!course) {
      return res.status(404).json({ error: 'Course not found' });
    }

    const { titleAr, titleEn } = req.body;
    const file = req.file;

    // Determine file type
    let fileType = 'document';
    if (file.mimetype === 'application/pdf') {
      fileType = 'pdf';
    } else if (file.mimetype.startsWith('image/')) {
      fileType = 'image';
    }

    // Store as base64 data URL (MVP approach - for production migrate to GCS)
    const base64 = file.buffer.toString('base64');
    const fileUrl = `data:${file.mimetype};base64,${base64}`;

    const attachment = await prisma.courseAttachment.create({
      data: {
        courseId,
        titleAr: titleAr || file.originalname,
        titleEn: titleEn || file.originalname,
        fileName: file.originalname,
        fileType,
        fileSize: file.size,
        fileUrl,
        displayOrder: course._count.attachments + 1,
      },
    });

    res.status(201).json({ attachment });
  } catch (error) {
    console.error('Error uploading attachment:', error);
    res.status(500).json({ error: 'Failed to upload attachment' });
  }
});

// DELETE /api/admin/courses/:id/attachments/:attachmentId - Delete attachment
router.delete('/:id/attachments/:attachmentId', async (req: Request, res: Response) => {
  try {
    const prisma = container.resolve<PrismaClient>('PrismaClient');
    const organizationId = await getOrganizationId(req);
    const { id: courseId, attachmentId } = req.params;

    if (!organizationId) {
      return res.status(400).json({ error: 'Organization context required' });
    }

    // Verify attachment belongs to course in this organization
    const existing = await prisma.courseAttachment.findFirst({
      where: { id: attachmentId, courseId },
      include: { course: true },
    });

    if (!existing || existing.course.organizationId !== organizationId) {
      return res.status(404).json({ error: 'Attachment not found' });
    }

    // Delete from database (base64 stored - no external storage to clean up)
    await prisma.courseAttachment.delete({
      where: { id: attachmentId },
    });

    res.json({ message: 'Attachment deleted successfully' });
  } catch (error) {
    console.error('Error deleting attachment:', error);
    res.status(500).json({ error: 'Failed to delete attachment' });
  }
});

// POST /api/admin/courses/:id/thumbnail - Upload thumbnail
router.post('/:id/thumbnail', upload.single('file'), async (req: Request, res: Response) => {
  try {
    const prisma = container.resolve<PrismaClient>('PrismaClient');
    const organizationId = await getOrganizationId(req);
    const { id: courseId } = req.params;

    if (!organizationId) {
      return res.status(400).json({ error: 'Organization context required' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'Image file is required' });
    }

    // Verify course belongs to organization
    const course = await prisma.course.findFirst({
      where: { id: courseId, organizationId },
    });

    if (!course) {
      return res.status(404).json({ error: 'Course not found' });
    }

    const file = req.file;

    // Validate it's an image
    if (!file.mimetype.startsWith('image/')) {
      return res.status(400).json({ error: 'Only image files are allowed for thumbnails' });
    }

    // Store as base64 data URL (MVP approach - for production migrate to GCS)
    const base64 = file.buffer.toString('base64');
    const thumbnailUrl = `data:${file.mimetype};base64,${base64}`;

    const updatedCourse = await prisma.course.update({
      where: { id: courseId },
      data: { thumbnailUrl },
    });

    res.json({ course: updatedCourse, thumbnailUrl });
  } catch (error) {
    console.error('Error uploading thumbnail:', error);
    res.status(500).json({ error: 'Failed to upload thumbnail' });
  }
});

export default router;
