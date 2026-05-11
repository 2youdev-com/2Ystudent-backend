import { Router, Request, Response } from 'express';
import { container } from 'tsyringe';
import { PrismaClient } from '@prisma/client';
import { authMiddleware } from '../middleware/auth.middleware';
import { ITraineeRepository } from '../repositories/interfaces/trainee.repository.interface';

const router = Router();

// Helper function to get organization ID (supports impersonation)
async function getOrganizationId(req: Request): Promise<string | null> {
  if (req.organizationId) {
    return req.organizationId;
  }
  const traineeRepo = container.resolve<ITraineeRepository>('TraineeRepository');
  const user = await traineeRepo.findById(req.user!.userId);
  return user?.organizationId || null;
}

// ========== Student endpoint (before admin middleware) ==========

/**
 * GET /api/simulation-topics/student
 * Get active simulation topics for student's organization (with course data)
 */
router.get('/student', authMiddleware(['student', 'supervisor', 'admin']), async (req: Request, res: Response) => {
  try {
    const prisma = container.resolve<PrismaClient>('PrismaClient');
    const organizationId = await getOrganizationId(req);

    if (!organizationId) {
      return res.status(400).json({ error: 'Organization context required' });
    }

    const topics = await prisma.simulationTopic.findMany({
      where: { organizationId, isActive: true },
      orderBy: { sortOrder: 'asc' },
      include: {
        course: {
          select: {
            id: true,
            titleEn: true,
            titleAr: true,
            descriptionEn: true,
            descriptionAr: true,
            objectivesEn: true,
            objectivesAr: true,
            category: true,
            difficulty: true,
            thumbnailUrl: true,
            lectures: {
              select: {
                id: true,
                titleEn: true,
                titleAr: true,
                descriptionEn: true,
                descriptionAr: true,
              },
            },
          },
        },
      },
    });

    return res.json({ topics });
  } catch (error) {
    console.error('Error fetching student topics:', error);
    return res.status(500).json({ error: 'Failed to fetch topics' });
  }
});

// ========== Admin endpoints ==========
router.use(authMiddleware(['admin']));

/**
 * GET /api/simulation-topics
 * List all simulation topics for the organization
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const prisma = container.resolve<PrismaClient>('PrismaClient');
    const organizationId = await getOrganizationId(req);

    if (!organizationId) {
      return res.status(400).json({ error: 'Organization context required' });
    }

    const topics = await prisma.simulationTopic.findMany({
      where: { organizationId },
      orderBy: { sortOrder: 'asc' },
      include: {
        course: {
          select: {
            id: true,
            titleEn: true,
            titleAr: true,
            thumbnailUrl: true,
          },
        },
      },
    });

    return res.json({ topics });
  } catch (error) {
    console.error('Error fetching topics:', error);
    return res.status(500).json({ error: 'Failed to fetch topics' });
  }
});

/**
 * POST /api/simulation-topics
 * Create a new simulation topic
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const prisma = container.resolve<PrismaClient>('PrismaClient');
    const organizationId = await getOrganizationId(req);

    if (!organizationId) {
      return res.status(400).json({ error: 'Organization context required' });
    }

    const { title, description, scenarioType, systemPrompt, courseId, isActive, sortOrder } = req.body;

    if (!title || !scenarioType) {
      return res.status(400).json({ error: 'title and scenarioType are required' });
    }

    // If courseId provided, verify it belongs to the same organization
    if (courseId) {
      const course = await prisma.course.findFirst({
        where: { id: courseId, organizationId },
      });
      if (!course) {
        return res.status(400).json({ error: 'Course not found in this organization' });
      }
    }

    const topic = await prisma.simulationTopic.create({
      data: {
        organizationId,
        title,
        description: description || null,
        scenarioType,
        systemPrompt: systemPrompt || null,
        courseId: courseId || null,
        isActive: isActive !== undefined ? isActive : true,
        sortOrder: sortOrder || 0,
      },
      include: {
        course: {
          select: { id: true, titleEn: true, titleAr: true, thumbnailUrl: true },
        },
      },
    });

    return res.status(201).json({ topic });
  } catch (error) {
    console.error('Error creating topic:', error);
    return res.status(500).json({ error: 'Failed to create topic' });
  }
});

/**
 * PATCH /api/simulation-topics/:id
 * Update a simulation topic
 */
router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const prisma = container.resolve<PrismaClient>('PrismaClient');
    const organizationId = await getOrganizationId(req);
    const { id } = req.params;

    if (!organizationId) {
      return res.status(400).json({ error: 'Organization context required' });
    }

    // Verify topic exists and belongs to org
    const existing = await prisma.simulationTopic.findFirst({
      where: { id, organizationId },
    });

    if (!existing) {
      return res.status(404).json({ error: 'Topic not found' });
    }

    const { title, description, scenarioType, systemPrompt, courseId, isActive, sortOrder } = req.body;

    // If courseId provided, verify it belongs to the same organization
    if (courseId) {
      const course = await prisma.course.findFirst({
        where: { id: courseId, organizationId },
      });
      if (!course) {
        return res.status(400).json({ error: 'Course not found in this organization' });
      }
    }

    const data: Record<string, any> = {};
    if (title !== undefined) data.title = title;
    if (description !== undefined) data.description = description;
    if (scenarioType !== undefined) data.scenarioType = scenarioType;
    if (systemPrompt !== undefined) data.systemPrompt = systemPrompt;
    if (courseId !== undefined) data.courseId = courseId || null;
    if (isActive !== undefined) data.isActive = isActive;
    if (sortOrder !== undefined) data.sortOrder = sortOrder;

    const topic = await prisma.simulationTopic.update({
      where: { id },
      data,
      include: {
        course: {
          select: { id: true, titleEn: true, titleAr: true, thumbnailUrl: true },
        },
      },
    });

    return res.json({ topic });
  } catch (error) {
    console.error('Error updating topic:', error);
    return res.status(500).json({ error: 'Failed to update topic' });
  }
});

/**
 * DELETE /api/simulation-topics/:id
 * Delete a simulation topic
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const prisma = container.resolve<PrismaClient>('PrismaClient');
    const organizationId = await getOrganizationId(req);
    const { id } = req.params;

    if (!organizationId) {
      return res.status(400).json({ error: 'Organization context required' });
    }

    // Verify topic exists and belongs to org
    const existing = await prisma.simulationTopic.findFirst({
      where: { id, organizationId },
    });

    if (!existing) {
      return res.status(404).json({ error: 'Topic not found' });
    }

    await prisma.simulationTopic.delete({ where: { id } });

    return res.json({ success: true, message: 'Topic deleted successfully' });
  } catch (error) {
    console.error('Error deleting topic:', error);
    return res.status(500).json({ error: 'Failed to delete topic' });
  }
});

/**
 * POST /api/simulation-topics/seed
 * Create default topics if none exist for the organization
 */
router.post('/seed', async (req: Request, res: Response) => {
  try {
    const prisma = container.resolve<PrismaClient>('PrismaClient');
    const organizationId = await getOrganizationId(req);

    if (!organizationId) {
      return res.status(400).json({ error: 'Organization context required' });
    }

    // Check if topics already exist
    const existing = await prisma.simulationTopic.count({
      where: { organizationId },
    });

    if (existing > 0) {
      return res.json({ message: 'Topics already exist', count: existing });
    }

    const defaultTopics = [
      { title: 'HVAC Systems & Troubleshooting', description: 'Learn HVAC system components, refrigeration cycles, and common troubleshooting techniques', scenarioType: 'hvac_systems', sortOrder: 1 },
      { title: 'Electrical Systems & Circuits', description: 'Discuss electrical circuit design, power distribution, and fault diagnosis methods', scenarioType: 'electrical_systems', sortOrder: 2 },
      { title: 'Safety Procedures & Compliance', description: 'Review OSHA standards, lockout/tagout procedures, and workplace safety protocols', scenarioType: 'safety_compliance', sortOrder: 3 },
      { title: 'PLC Programming Fundamentals', description: 'Explore PLC ladder logic, I/O configuration, and basic automation programming', scenarioType: 'plc_automation', sortOrder: 4 },
      { title: 'Industrial Maintenance Planning', description: 'Plan preventive maintenance schedules, equipment lifecycle, and reliability strategies', scenarioType: 'industrial_maintenance', sortOrder: 5 },
      { title: 'Advanced Troubleshooting', description: 'Tackle complex multi-system failures and root cause analysis techniques', scenarioType: 'advanced_troubleshooting', sortOrder: 6 },
    ];

    const created = await prisma.simulationTopic.createMany({
      data: defaultTopics.map((t) => ({
        ...t,
        organizationId,
        isActive: true,
      })),
    });

    return res.status(201).json({ message: `Created ${created.count} default topics`, count: created.count });
  } catch (error) {
    console.error('Error seeding topics:', error);
    return res.status(500).json({ error: 'Failed to seed topics' });
  }
});

export default router;
