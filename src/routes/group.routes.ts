import { Router, Request, Response } from 'express';
import multer from 'multer';
import { container } from 'tsyringe';
import { PrismaClient } from '@prisma/client';
import { authMiddleware } from '../middleware/auth.middleware';
import { orgIsolationMiddleware, getAccessibleGroupIds } from '../middleware/rbac.middleware';
import { groupService } from '../services/group/group.service';
import { UserRole } from '../services/interfaces/auth.interface';
import { ITraineeRepository } from '../repositories/interfaces/trainee.repository.interface';

const router = Router();

// Configure multer for PDF uploads (same pattern as admin-courses)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'));
    }
  },
});

// ========== Student endpoint (before admin middleware) ==========

/**
 * GET /api/groups/my-content
 * Get group content for the currently logged-in student
 */
router.get(
  '/my-content',
  authMiddleware(['student', 'supervisor', 'admin']),
  async (req: Request, res: Response) => {
    try {
      const userId = req.user?.userId;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });

      const result = await groupService.getTraineeGroupContent(userId);
      return res.json(result);
    } catch (error) {
      console.error('Error fetching group content:', error);
      return res.status(500).json({ error: 'Failed to fetch group content' });
    }
  }
);

/**
 * GET /api/groups/my-ai-teachers
 * Get AI teachers assigned to the student's groups
 */
router.get(
  '/my-ai-teachers',
  authMiddleware(['student', 'supervisor', 'admin']),
  async (req: Request, res: Response) => {
    try {
      const userId = req.user?.userId;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });

      const prisma = container.resolve<PrismaClient>('PrismaClient');

      // Find student's active group memberships
      const memberships = await prisma.groupMember.findMany({
        where: { traineeId: userId, isActive: true },
        select: { groupId: true },
      });

      if (memberships.length === 0) {
        return res.json({ aiTeachers: [] });
      }

      const groupIds = memberships.map((m) => m.groupId);

      // Get AI teachers assigned to those groups
      const groupAITeachers = await prisma.groupAITeacher.findMany({
        where: { groupId: { in: groupIds } },
        include: {
          aiTeacher: {
            select: {
              id: true,
              name: true,
              displayNameEn: true,
              displayNameAr: true,
              descriptionEn: true,
              descriptionAr: true,
              avatarUrl: true,
              voiceId: true,
              personality: true,
              level: true,
              isActive: true,
              systemPromptEn: true,
              systemPromptAr: true,
              welcomeMessageEn: true,
              welcomeMessageAr: true,
              contextSource: true,
              brainQueryPrefix: true,
              sortOrder: true,
            },
          },
        },
      });

      // Deduplicate by aiTeacherId and filter active only
      const seen = new Set<string>();
      const uniqueTeachers = groupAITeachers
        .filter((gat) => gat.aiTeacher.isActive)
        .filter((gat) => {
          if (seen.has(gat.aiTeacherId)) return false;
          seen.add(gat.aiTeacherId);
          return true;
        })
        .map((gat) => gat.aiTeacher);

      return res.json({ aiTeachers: uniqueTeachers });
    } catch (error) {
      console.error('Error fetching group AI teachers:', error);
      return res.status(500).json({ error: 'Failed to fetch AI teachers' });
    }
  }
);

// All remaining routes require supervisor/admin auth and org isolation
router.use(authMiddleware(['supervisor', 'admin']));
router.use(orgIsolationMiddleware());

/**
 * GET /api/groups
 * List all groups (filtered by access for trainers)
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const { organizationId, user } = req;

    if (!organizationId || !user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Get accessible groups based on role
    const accessibleGroupIds = await getAccessibleGroupIds(
      user.userId,
      user.role as UserRole,
      organizationId
    );

    const groups = await groupService.getGroups(organizationId, accessibleGroupIds);

    return res.json({ groups });
  } catch (error) {
    console.error('Error fetching groups:', error);
    return res.status(500).json({ error: 'Failed to fetch groups' });
  }
});

/**
 * GET /api/groups/available-trainees
 * Get trainees available to add to groups
 */
router.get('/available-trainees', async (req: Request, res: Response) => {
  try {
    const { organizationId } = req;

    if (!organizationId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const trainees = await groupService.getAvailableTrainees(organizationId);

    return res.json({ trainees });
  } catch (error) {
    console.error('Error fetching available trainees:', error);
    return res.status(500).json({ error: 'Failed to fetch trainees' });
  }
});

/**
 * GET /api/groups/available-trainers
 * Get trainers available to assign to groups
 */
router.get('/available-trainers', async (req: Request, res: Response) => {
  try {
    const { organizationId } = req;

    if (!organizationId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const trainers = await groupService.getAvailableTrainers(organizationId);

    return res.json({ trainers });
  } catch (error) {
    console.error('Error fetching available trainers:', error);
    return res.status(500).json({ error: 'Failed to fetch trainers' });
  }
});

/**
 * GET /api/groups/available-ai-teachers
 * Get AI teachers available to assign to groups
 */
router.get('/available-ai-teachers', async (req: Request, res: Response) => {
  try {
    const { organizationId } = req;

    if (!organizationId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const prisma = container.resolve<PrismaClient>('PrismaClient');
    const aiTeachers = await prisma.aITeacher.findMany({
      where: { organizationId, isActive: true },
      select: {
        id: true,
        name: true,
        displayNameAr: true,
        displayNameEn: true,
        avatarUrl: true,
        personality: true,
        level: true,
      },
      orderBy: { sortOrder: 'asc' },
    });

    return res.json({ aiTeachers });
  } catch (error) {
    console.error('Error fetching available AI teachers:', error);
    return res.status(500).json({ error: 'Failed to fetch AI teachers' });
  }
});

/**
 * GET /api/groups/:id
 * Get group details
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { organizationId, user } = req;
    const { id } = req.params;

    if (!organizationId || !user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // For trainers, verify they have access to this group
    if (user.role === 'supervisor') {
      const accessibleGroupIds = await getAccessibleGroupIds(
        user.userId,
        'supervisor',
        organizationId
      );

      if (accessibleGroupIds !== 'all' && !accessibleGroupIds.includes(id)) {
        return res.status(403).json({ error: 'Access denied to this group' });
      }
    }

    const group = await groupService.getGroupById(id, organizationId);

    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }

    return res.json({ group });
  } catch (error) {
    console.error('Error fetching group:', error);
    return res.status(500).json({ error: 'Failed to fetch group' });
  }
});

/**
 * POST /api/groups
 * Create a new group (org_admin only)
 */
router.post('/', authMiddleware(['admin']), async (req: Request, res: Response) => {
  try {
    const { organizationId, user } = req;
    const { name, description, specialization, maxStudents, subjects } = req.body;

    if (!organizationId || !user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ error: 'Group name is required' });
    }

    const group = await groupService.createGroup({
      organizationId,
      name: name.trim(),
      description: description?.trim(),
      specialization: specialization?.trim(),
      maxStudents: maxStudents ? parseInt(maxStudents) : undefined,
      createdById: user.userId,
      subjects: Array.isArray(subjects) ? subjects.filter((s: any) => s?.name?.trim()) : undefined,
    });

    return res.status(201).json({ group });
  } catch (error: any) {
    console.error('Error creating group:', error);
    if (error.message?.includes('already exists')) {
      return res.status(409).json({ error: error.message });
    }
    return res.status(500).json({ error: 'Failed to create group' });
  }
});

/**
 * PATCH /api/groups/:id
 * Update a group (org_admin only)
 */
router.patch('/:id', authMiddleware(['admin']), async (req: Request, res: Response) => {
  try {
    const { organizationId } = req;
    const { id } = req.params;
    const { name, description, specialization, maxStudents, isActive } = req.body;

    if (!organizationId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const updateData: any = {};
    if (name !== undefined) updateData.name = name.trim();
    if (description !== undefined) updateData.description = description?.trim() || null;
    if (specialization !== undefined) updateData.specialization = specialization?.trim() || null;
    if (maxStudents !== undefined) updateData.maxStudents = maxStudents ? parseInt(maxStudents) : null;
    if (isActive !== undefined) updateData.isActive = isActive;

    const group = await groupService.updateGroup(id, organizationId, updateData);

    return res.json({ group });
  } catch (error: any) {
    console.error('Error updating group:', error);
    if (error.message === 'Group not found') {
      return res.status(404).json({ error: error.message });
    }
    if (error.message?.includes('already exists')) {
      return res.status(409).json({ error: error.message });
    }
    return res.status(500).json({ error: 'Failed to update group' });
  }
});

/**
 * DELETE /api/groups/:id
 * Delete a group (org_admin only)
 */
router.delete('/:id', authMiddleware(['admin']), async (req: Request, res: Response) => {
  try {
    const { organizationId } = req;
    const { id } = req.params;

    if (!organizationId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    await groupService.deleteGroup(id, organizationId);

    return res.json({ success: true, message: 'Group deleted successfully' });
  } catch (error: any) {
    console.error('Error deleting group:', error);
    if (error.message === 'Group not found') {
      return res.status(404).json({ error: error.message });
    }
    return res.status(500).json({ error: 'Failed to delete group' });
  }
});

/**
 * POST /api/groups/:id/members
 * Add trainees to a group (org_admin only)
 */
router.post('/:id/members', authMiddleware(['admin']), async (req: Request, res: Response) => {
  try {
    const { organizationId } = req;
    const { id } = req.params;
    const { traineeIds } = req.body;

    if (!organizationId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!Array.isArray(traineeIds) || traineeIds.length === 0) {
      return res.status(400).json({ error: 'traineeIds must be a non-empty array' });
    }

    const result = await groupService.addMembers(id, traineeIds, organizationId);

    return res.json({
      success: true,
      message: `Added ${result.added} members, skipped ${result.skipped} duplicates`,
      ...result,
    });
  } catch (error: any) {
    console.error('Error adding members:', error);
    if (error.message === 'Group not found') {
      return res.status(404).json({ error: error.message });
    }
    return res.status(500).json({ error: 'Failed to add members' });
  }
});

/**
 * DELETE /api/groups/:id/members/:memberId
 * Remove a trainee from a group (org_admin only)
 */
router.delete(
  '/:id/members/:memberId',
  authMiddleware(['admin']),
  async (req: Request, res: Response) => {
    try {
      const { organizationId } = req;
      const { id, memberId } = req.params;

      if (!organizationId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      await groupService.removeMember(id, memberId, organizationId);

      return res.json({ success: true, message: 'Member removed successfully' });
    } catch (error: any) {
      console.error('Error removing member:', error);
      if (error.message === 'Group not found' || error.message?.includes('not a member')) {
        return res.status(404).json({ error: error.message });
      }
      return res.status(500).json({ error: 'Failed to remove member' });
    }
  }
);

/**
 * POST /api/groups/:id/trainers
 * Assign a trainer to a group (org_admin only)
 */
router.post('/:id/trainers', authMiddleware(['admin']), async (req: Request, res: Response) => {
  try {
    const { organizationId, user } = req;
    const { id } = req.params;
    const { trainerId } = req.body;

    if (!organizationId || !user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!trainerId) {
      return res.status(400).json({ error: 'trainerId is required' });
    }

    const assignment = await groupService.assignTrainer(
      id,
      trainerId,
      user.userId,
      organizationId
    );

    return res.status(201).json({ assignment });
  } catch (error: any) {
    console.error('Error assigning trainer:', error);
    if (error.message === 'Group not found' || error.message?.includes('not found')) {
      return res.status(404).json({ error: error.message });
    }
    if (error.message?.includes('already assigned')) {
      return res.status(409).json({ error: error.message });
    }
    return res.status(500).json({ error: 'Failed to assign trainer' });
  }
});

/**
 * DELETE /api/groups/:id/trainers/:trainerId
 * Unassign a trainer from a group (org_admin only)
 */
router.delete(
  '/:id/trainers/:trainerId',
  authMiddleware(['admin']),
  async (req: Request, res: Response) => {
    try {
      const { organizationId } = req;
      const { id, trainerId } = req.params;

      if (!organizationId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      await groupService.unassignTrainer(id, trainerId, organizationId);

      return res.json({ success: true, message: 'Trainer unassigned successfully' });
    } catch (error: any) {
      console.error('Error unassigning trainer:', error);
      if (error.message === 'Group not found' || error.message?.includes('not assigned')) {
        return res.status(404).json({ error: error.message });
      }
      return res.status(500).json({ error: 'Failed to unassign trainer' });
    }
  }
);

// ========== Course Assignment Routes ==========

/**
 * GET /api/groups/:id/courses
 * Get courses assigned to a group
 */
router.get('/:id/courses', async (req: Request, res: Response) => {
  try {
    const { organizationId } = req;
    const { id } = req.params;
    if (!organizationId) return res.status(401).json({ error: 'Unauthorized' });

    const courses = await groupService.getGroupCourses(id, organizationId);
    return res.json({ courses });
  } catch (error: any) {
    console.error('Error fetching group courses:', error);
    if (error.message === 'Group not found') return res.status(404).json({ error: error.message });
    return res.status(500).json({ error: 'Failed to fetch group courses' });
  }
});

/**
 * POST /api/groups/:id/courses
 * Assign courses to a group (org_admin only)
 * Body: { courseIds: string[] }
 */
router.post('/:id/courses', authMiddleware(['admin']), async (req: Request, res: Response) => {
  try {
    const { organizationId } = req;
    const { id } = req.params;
    const { courseIds } = req.body;

    if (!organizationId) return res.status(401).json({ error: 'Unauthorized' });
    if (!Array.isArray(courseIds) || courseIds.length === 0) {
      return res.status(400).json({ error: 'courseIds must be a non-empty array' });
    }

    const result = await groupService.assignCourses(id, courseIds, organizationId);
    return res.json({ success: true, ...result });
  } catch (error: any) {
    console.error('Error assigning courses:', error);
    if (error.message === 'Group not found') return res.status(404).json({ error: error.message });
    return res.status(500).json({ error: 'Failed to assign courses' });
  }
});

/**
 * DELETE /api/groups/:id/courses/:courseId
 * Unassign a course from a group (org_admin only)
 */
router.delete('/:id/courses/:courseId', authMiddleware(['admin']), async (req: Request, res: Response) => {
  try {
    const { organizationId } = req;
    const { id, courseId } = req.params;

    if (!organizationId) return res.status(401).json({ error: 'Unauthorized' });

    await groupService.unassignCourse(id, courseId, organizationId);
    return res.json({ success: true, message: 'Course unassigned successfully' });
  } catch (error: any) {
    console.error('Error unassigning course:', error);
    if (error.message === 'Group not found' || error.message === 'Course not assigned') {
      return res.status(404).json({ error: error.message });
    }
    return res.status(500).json({ error: 'Failed to unassign course' });
  }
});

// ========== Quiz Assignment Routes ==========

/**
 * GET /api/groups/:id/quizzes
 * Get quizzes assigned to a group
 */
router.get('/:id/quizzes', async (req: Request, res: Response) => {
  try {
    const { organizationId } = req;
    const { id } = req.params;
    if (!organizationId) return res.status(401).json({ error: 'Unauthorized' });

    const quizzes = await groupService.getGroupQuizzes(id, organizationId);
    return res.json({ quizzes });
  } catch (error: any) {
    console.error('Error fetching group quizzes:', error);
    if (error.message === 'Group not found') return res.status(404).json({ error: error.message });
    return res.status(500).json({ error: 'Failed to fetch group quizzes' });
  }
});

/**
 * POST /api/groups/:id/quizzes
 * Assign quizzes to a group (org_admin only)
 * Body: { quizIds: string[] }
 */
router.post('/:id/quizzes', authMiddleware(['admin']), async (req: Request, res: Response) => {
  try {
    const { organizationId } = req;
    const { id } = req.params;
    const { quizIds } = req.body;

    if (!organizationId) return res.status(401).json({ error: 'Unauthorized' });
    if (!Array.isArray(quizIds) || quizIds.length === 0) {
      return res.status(400).json({ error: 'quizIds must be a non-empty array' });
    }

    const result = await groupService.assignQuizzes(id, quizIds, organizationId);
    return res.json({ success: true, ...result });
  } catch (error: any) {
    console.error('Error assigning quizzes:', error);
    if (error.message === 'Group not found') return res.status(404).json({ error: error.message });
    return res.status(500).json({ error: 'Failed to assign quizzes' });
  }
});

/**
 * DELETE /api/groups/:id/quizzes/:quizId
 * Unassign a quiz from a group (org_admin only)
 */
router.delete('/:id/quizzes/:quizId', authMiddleware(['admin']), async (req: Request, res: Response) => {
  try {
    const { organizationId } = req;
    const { id, quizId } = req.params;

    if (!organizationId) return res.status(401).json({ error: 'Unauthorized' });

    await groupService.unassignQuiz(id, quizId, organizationId);
    return res.json({ success: true, message: 'Quiz unassigned successfully' });
  } catch (error: any) {
    console.error('Error unassigning quiz:', error);
    if (error.message === 'Group not found' || error.message === 'Quiz not assigned') {
      return res.status(404).json({ error: error.message });
    }
    return res.status(500).json({ error: 'Failed to unassign quiz' });
  }
});

// ========== Subject & Material Routes ==========

/**
 * POST /api/groups/:id/subjects
 * Add a subject to a group
 */
router.post('/:id/subjects', authMiddleware(['admin']), async (req: Request, res: Response) => {
  try {
    const { organizationId } = req;
    const { id } = req.params;
    const { name } = req.body;

    if (!organizationId) return res.status(401).json({ error: 'Unauthorized' });
    if (!name?.trim()) return res.status(400).json({ error: 'Subject name is required' });

    const subject = await groupService.addSubject(id, name.trim(), organizationId);
    return res.status(201).json({ subject });
  } catch (error: any) {
    console.error('Error adding subject:', error);
    if (error.message === 'Group not found') return res.status(404).json({ error: error.message });
    return res.status(500).json({ error: 'Failed to add subject' });
  }
});

/**
 * DELETE /api/groups/:id/subjects/:subjectId
 * Delete a subject and all its materials
 */
router.delete('/:id/subjects/:subjectId', authMiddleware(['admin']), async (req: Request, res: Response) => {
  try {
    const { organizationId } = req;
    const { id, subjectId } = req.params;

    if (!organizationId) return res.status(401).json({ error: 'Unauthorized' });

    await groupService.deleteSubject(id, subjectId, organizationId);
    return res.json({ success: true, message: 'Subject deleted successfully' });
  } catch (error: any) {
    console.error('Error deleting subject:', error);
    if (error.message === 'Group not found' || error.message === 'Subject not found') {
      return res.status(404).json({ error: error.message });
    }
    return res.status(500).json({ error: 'Failed to delete subject' });
  }
});

/**
 * POST /api/groups/:id/subjects/:subjectId/materials
 * Add material (PDF upload or YouTube link) to a subject
 */
router.post(
  '/:id/subjects/:subjectId/materials',
  authMiddleware(['admin']),
  upload.single('file'),
  async (req: Request, res: Response) => {
    try {
      const { organizationId } = req;
      const { id, subjectId } = req.params;

      if (!organizationId) return res.status(401).json({ error: 'Unauthorized' });

      // Check if this is a PDF upload or a YouTube link
      if (req.file) {
        // PDF upload
        const base64 = req.file.buffer.toString('base64');
        const fileUrl = `data:${req.file.mimetype};base64,${base64}`;

        const material = await groupService.addMaterial(id, subjectId, organizationId, {
          type: 'pdf',
          title: req.body.title || req.file.originalname,
          url: fileUrl,
          fileName: req.file.originalname,
          fileSize: req.file.size,
        });
        return res.status(201).json({ material });
      } else {
        // YouTube link
        const { type, title, url } = req.body;
        if (type !== 'youtube' || !url?.trim()) {
          return res.status(400).json({ error: 'Either upload a PDF file or provide type=youtube with url' });
        }

        const material = await groupService.addMaterial(id, subjectId, organizationId, {
          type: 'youtube',
          title: title?.trim() || 'YouTube Video',
          url: url.trim(),
        });
        return res.status(201).json({ material });
      }
    } catch (error: any) {
      console.error('Error adding material:', error);
      if (error.message === 'Group not found' || error.message === 'Subject not found') {
        return res.status(404).json({ error: error.message });
      }
      return res.status(500).json({ error: 'Failed to add material' });
    }
  }
);

/**
 * DELETE /api/groups/:id/subjects/:subjectId/materials/:materialId
 * Delete a material
 */
router.delete(
  '/:id/subjects/:subjectId/materials/:materialId',
  authMiddleware(['admin']),
  async (req: Request, res: Response) => {
    try {
      const { organizationId } = req;
      const { id, subjectId, materialId } = req.params;

      if (!organizationId) return res.status(401).json({ error: 'Unauthorized' });

      await groupService.deleteMaterial(id, subjectId, materialId, organizationId);
      return res.json({ success: true, message: 'Material deleted successfully' });
    } catch (error: any) {
      console.error('Error deleting material:', error);
      if (error.message === 'Group not found' || error.message === 'Material not found') {
        return res.status(404).json({ error: error.message });
      }
      return res.status(500).json({ error: 'Failed to delete material' });
    }
  }
);

// ========== AI Teacher Assignment Routes ==========

/**
 * POST /api/groups/:id/ai-teachers
 * Assign an AI teacher to a group (org_admin only)
 */
router.post('/:id/ai-teachers', authMiddleware(['admin']), async (req: Request, res: Response) => {
  try {
    const { organizationId } = req;
    const { id } = req.params;
    const { aiTeacherId } = req.body;

    if (!organizationId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!aiTeacherId) {
      return res.status(400).json({ error: 'aiTeacherId is required' });
    }

    const prisma = container.resolve<PrismaClient>('PrismaClient');

    // Verify group exists and belongs to org
    const group = await prisma.traineeGroup.findFirst({
      where: { id, organizationId },
    });

    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }

    // Verify AI teacher exists and belongs to org
    const aiTeacher = await prisma.aITeacher.findFirst({
      where: { id: aiTeacherId, organizationId },
    });

    if (!aiTeacher) {
      return res.status(404).json({ error: 'AI Teacher not found' });
    }

    // Replace any existing AI teacher (only 1 allowed per group)
    const assignment = await prisma.$transaction(async (tx) => {
      // Remove any existing AI teacher for this group
      await tx.groupAITeacher.deleteMany({ where: { groupId: id } });
      // Assign the new one
      return tx.groupAITeacher.create({
        data: { groupId: id, aiTeacherId },
        include: {
          aiTeacher: {
            select: {
              id: true,
              name: true,
              displayNameEn: true,
              displayNameAr: true,
              avatarUrl: true,
              personality: true,
              level: true,
            },
          },
        },
      });
    });

    return res.status(201).json({ assignment });
  } catch (error: any) {
    console.error('Error assigning AI teacher:', error);
    return res.status(500).json({ error: 'Failed to assign AI teacher' });
  }
});

/**
 * DELETE /api/groups/:id/ai-teachers/:aiTeacherId
 * Remove an AI teacher from a group (org_admin only)
 */
router.delete(
  '/:id/ai-teachers/:aiTeacherId',
  authMiddleware(['admin']),
  async (req: Request, res: Response) => {
    try {
      const { organizationId } = req;
      const { id, aiTeacherId } = req.params;

      if (!organizationId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const prisma = container.resolve<PrismaClient>('PrismaClient');

      // Verify group exists
      const group = await prisma.traineeGroup.findFirst({
        where: { id, organizationId },
      });

      if (!group) {
        return res.status(404).json({ error: 'Group not found' });
      }

      // Delete assignment
      const deleted = await prisma.groupAITeacher.deleteMany({
        where: { groupId: id, aiTeacherId },
      });

      if (deleted.count === 0) {
        return res.status(404).json({ error: 'AI Teacher is not assigned to this group' });
      }

      return res.json({ success: true, message: 'AI Teacher removed from group' });
    } catch (error) {
      console.error('Error removing AI teacher from group:', error);
      return res.status(500).json({ error: 'Failed to remove AI teacher' });
    }
  }
);

export default router;
