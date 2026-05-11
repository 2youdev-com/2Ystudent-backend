import { PrismaClient, TraineeGroup, GroupMember, TrainerGroupAssignment } from '@prisma/client';

const prisma = new PrismaClient();

// Types for group operations
export interface CreateGroupInput {
  organizationId: string;
  name: string;
  description?: string;
  specialization?: string;
  maxStudents?: number;
  createdById: string;
  subjects?: { name: string }[];
}

export interface UpdateGroupInput {
  name?: string;
  description?: string;
  specialization?: string;
  maxStudents?: number;
  isActive?: boolean;
}

export interface GroupWithDetails extends TraineeGroup {
  members: {
    id: string;
    trainee: {
      id: string;
      firstName: string;
      lastName: string;
      email: string;
      role: string;
    };
    joinedAt: Date;
    isActive: boolean;
  }[];
  trainerAssignments: {
    id: string;
    trainer: {
      id: string;
      firstName: string;
      lastName: string;
      email: string;
    };
    assignedAt: Date;
    isActive: boolean;
  }[];
  _count: {
    members: number;
    trainerAssignments: number;
  };
}

export interface GroupListItem {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  createdAt: Date;
  memberCount: number;
  trainerCount: number;
  trainers: {
    id: string;
    firstName: string;
    lastName: string;
  }[];
}

export class GroupService {
  /**
   * Create a new group
   */
  async createGroup(input: CreateGroupInput): Promise<TraineeGroup> {
    // Check if group name already exists in organization
    const existing = await prisma.traineeGroup.findUnique({
      where: {
        organizationId_name: {
          organizationId: input.organizationId,
          name: input.name,
        },
      },
    });

    if (existing) {
      throw new Error('A group with this name already exists in your organization');
    }

    return prisma.traineeGroup.create({
      data: {
        organizationId: input.organizationId,
        name: input.name,
        description: input.description,
        specialization: input.specialization,
        maxStudents: input.maxStudents,
        createdById: input.createdById,
        subjects: input.subjects?.length ? {
          create: input.subjects.map((s, i) => ({
            name: s.name,
            order: i,
          })),
        } : undefined,
      },
      include: {
        subjects: {
          include: { materials: true },
          orderBy: { order: 'asc' },
        },
      },
    });
  }

  /**
   * Get all groups for an organization
   * If groupIds is provided, filter to only those groups (for trainers)
   */
  async getGroups(
    organizationId: string,
    groupIds?: string[] | 'all'
  ): Promise<GroupListItem[]> {
    const where: any = { organizationId };

    // If specific group IDs provided, filter to those
    if (groupIds && groupIds !== 'all') {
      where.id = { in: groupIds };
    }

    const groups = await prisma.traineeGroup.findMany({
      where,
      include: {
        members: {
          where: { isActive: true },
          select: { id: true },
        },
        trainerAssignments: {
          where: { isActive: true },
          include: {
            trainer: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return groups.map((group) => ({
      id: group.id,
      name: group.name,
      description: group.description,
      isActive: group.isActive,
      createdAt: group.createdAt,
      memberCount: group.members.length,
      trainerCount: group.trainerAssignments.length,
      trainers: group.trainerAssignments.map((a) => a.trainer),
    }));
  }

  /**
   * Get a group by ID with full details
   */
  async getGroupById(groupId: string, organizationId: string): Promise<GroupWithDetails | null> {
    const group = await prisma.traineeGroup.findFirst({
      where: {
        id: groupId,
        organizationId,
      },
      include: {
        members: {
          include: {
            trainee: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                role: true,
              },
            },
          },
          orderBy: { joinedAt: 'desc' },
        },
        trainerAssignments: {
          include: {
            trainer: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
          },
          orderBy: { assignedAt: 'desc' },
        },
        subjects: {
          include: {
            materials: {
              orderBy: { displayOrder: 'asc' },
            },
          },
          orderBy: { order: 'asc' },
        },
        courses: {
          include: {
            course: {
              select: {
                id: true,
                titleEn: true,
                titleAr: true,
                descriptionEn: true,
                category: true,
                difficulty: true,
                thumbnailUrl: true,
                estimatedDurationMinutes: true,
                _count: { select: { lectures: true } },
              },
            },
          },
          orderBy: { order: 'asc' },
        },
        aiTeacherAssignments: {
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
          orderBy: { assignedAt: 'desc' },
        },
        _count: {
          select: {
            members: true,
            trainerAssignments: true,
          },
        },
      },
    });

    return group as GroupWithDetails | null;
  }

  /**
   * Update a group
   */
  async updateGroup(
    groupId: string,
    organizationId: string,
    input: UpdateGroupInput
  ): Promise<TraineeGroup> {
    // Verify group belongs to organization
    const group = await prisma.traineeGroup.findFirst({
      where: { id: groupId, organizationId },
    });

    if (!group) {
      throw new Error('Group not found');
    }

    // Check for name conflict if name is being changed
    if (input.name && input.name !== group.name) {
      const existing = await prisma.traineeGroup.findUnique({
        where: {
          organizationId_name: {
            organizationId,
            name: input.name,
          },
        },
      });

      if (existing) {
        throw new Error('A group with this name already exists');
      }
    }

    return prisma.traineeGroup.update({
      where: { id: groupId },
      data: input,
    });
  }

  /**
   * Delete a group (hard delete - cascades to members, trainers, courses, subjects, materials)
   */
  async deleteGroup(groupId: string, organizationId: string): Promise<void> {
    const group = await prisma.traineeGroup.findFirst({
      where: { id: groupId, organizationId },
    });

    if (!group) {
      throw new Error('Group not found');
    }

    // Hard delete - all related records (GroupMember, TrainerGroupAssignment,
    // GroupCourse, GroupSubject, SubjectMaterial) are cascade-deleted by the DB
    await prisma.traineeGroup.delete({
      where: { id: groupId },
    });
  }

  /**
   * Add trainees to a group
   */
  async addMembers(
    groupId: string,
    traineeIds: string[],
    organizationId: string
  ): Promise<{ added: number; skipped: number }> {
    // Verify group belongs to organization
    const group = await prisma.traineeGroup.findFirst({
      where: { id: groupId, organizationId },
    });

    if (!group) {
      throw new Error('Group not found');
    }

    // Verify trainees belong to organization
    const trainees = await prisma.trainee.findMany({
      where: {
        id: { in: traineeIds },
        organizationId,
        role: 'student', // Only students can be added to groups
      },
      select: { id: true },
    });

    const validTraineeIds = trainees.map((t) => t.id);

    // Get existing members to avoid duplicates
    const existingMembers = await prisma.groupMember.findMany({
      where: {
        groupId,
        traineeId: { in: validTraineeIds },
      },
      select: { traineeId: true, isActive: true, id: true },
    });

    const existingMap = new Map(existingMembers.map((m) => [m.traineeId, m]));

    let added = 0;
    let skipped = 0;

    for (const traineeId of validTraineeIds) {
      const existing = existingMap.get(traineeId);

      if (existing) {
        if (!existing.isActive) {
          // Reactivate membership
          await prisma.groupMember.update({
            where: { id: existing.id },
            data: { isActive: true, joinedAt: new Date() },
          });
          added++;
        } else {
          skipped++;
        }
      } else {
        // Create new membership
        await prisma.groupMember.create({
          data: { groupId, traineeId },
        });
        added++;
      }
    }

    return { added, skipped };
  }

  /**
   * Remove a trainee from a group
   */
  async removeMember(
    groupId: string,
    traineeId: string,
    organizationId: string
  ): Promise<void> {
    const group = await prisma.traineeGroup.findFirst({
      where: { id: groupId, organizationId },
    });

    if (!group) {
      throw new Error('Group not found');
    }

    const member = await prisma.groupMember.findUnique({
      where: {
        groupId_traineeId: { groupId, traineeId },
      },
    });

    if (!member) {
      throw new Error('Trainee is not a member of this group');
    }

    // Soft delete
    await prisma.groupMember.update({
      where: { id: member.id },
      data: { isActive: false },
    });
  }

  /**
   * Assign a trainer to a group
   */
  async assignTrainer(
    groupId: string,
    trainerId: string,
    assignedById: string,
    organizationId: string
  ): Promise<TrainerGroupAssignment> {
    // Verify group belongs to organization
    const group = await prisma.traineeGroup.findFirst({
      where: { id: groupId, organizationId },
    });

    if (!group) {
      throw new Error('Group not found');
    }

    // Verify trainer belongs to organization and has trainer role
    const trainer = await prisma.trainee.findFirst({
      where: {
        id: trainerId,
        organizationId,
        role: 'supervisor',
      },
    });

    if (!trainer) {
      throw new Error('Supervisor not found or user is not a supervisor');
    }

    // Check for existing assignment
    const existing = await prisma.trainerGroupAssignment.findUnique({
      where: {
        groupId_trainerId: { groupId, trainerId },
      },
    });

    if (existing) {
      if (existing.isActive) {
        throw new Error('Trainer is already assigned to this group');
      }

      // Reactivate assignment
      return prisma.trainerGroupAssignment.update({
        where: { id: existing.id },
        data: { isActive: true, assignedAt: new Date(), assignedById },
      });
    }

    return prisma.trainerGroupAssignment.create({
      data: {
        groupId,
        trainerId,
        assignedById,
      },
    });
  }

  /**
   * Unassign a trainer from a group
   */
  async unassignTrainer(
    groupId: string,
    trainerId: string,
    organizationId: string
  ): Promise<void> {
    const group = await prisma.traineeGroup.findFirst({
      where: { id: groupId, organizationId },
    });

    if (!group) {
      throw new Error('Group not found');
    }

    const assignment = await prisma.trainerGroupAssignment.findUnique({
      where: {
        groupId_trainerId: { groupId, trainerId },
      },
    });

    if (!assignment || !assignment.isActive) {
      throw new Error('Trainer is not assigned to this group');
    }

    // Soft delete
    await prisma.trainerGroupAssignment.update({
      where: { id: assignment.id },
      data: { isActive: false },
    });
  }

  /**
   * Get groups assigned to a trainer
   */
  async getTrainerGroups(trainerId: string): Promise<GroupListItem[]> {
    const assignments = await prisma.trainerGroupAssignment.findMany({
      where: { trainerId, isActive: true },
      include: {
        group: {
          include: {
            members: {
              where: { isActive: true },
              select: { id: true },
            },
            trainerAssignments: {
              where: { isActive: true },
              include: {
                trainer: {
                  select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    return assignments.map((a) => ({
      id: a.group.id,
      name: a.group.name,
      description: a.group.description,
      isActive: a.group.isActive,
      createdAt: a.group.createdAt,
      memberCount: a.group.members.length,
      trainerCount: a.group.trainerAssignments.length,
      trainers: a.group.trainerAssignments.map((ta) => ta.trainer),
    }));
  }

  /**
   * Get available trainees (not in any active group) for adding to groups
   */
  async getAvailableTrainees(organizationId: string): Promise<{
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    groupCount: number;
  }[]> {
    const trainees = await prisma.trainee.findMany({
      where: {
        organizationId,
        role: 'student',
        status: 'active',
      },
      include: {
        groupMemberships: {
          where: { isActive: true },
          select: { id: true },
        },
      },
      orderBy: { lastName: 'asc' },
    });

    return trainees.map((t) => ({
      id: t.id,
      firstName: t.firstName,
      lastName: t.lastName,
      email: t.email,
      groupCount: t.groupMemberships.length,
    }));
  }

  /**
   * Get available trainers for assigning to groups
   */
  async getAvailableTrainers(organizationId: string): Promise<{
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    groupCount: number;
  }[]> {
    const trainers = await prisma.trainee.findMany({
      where: {
        organizationId,
        role: 'supervisor',
        status: 'active',
      },
      include: {
        trainerAssignments: {
          where: { isActive: true },
          select: { id: true },
        },
      },
      orderBy: { lastName: 'asc' },
    });

    return trainers.map((t) => ({
      id: t.id,
      firstName: t.firstName,
      lastName: t.lastName,
      email: t.email,
      groupCount: t.trainerAssignments.length,
    }));
  }
  // ========== Subject & Material Management ==========

  /**
   * Add a subject to a group
   */
  async addSubject(groupId: string, name: string, organizationId: string) {
    const group = await prisma.traineeGroup.findFirst({
      where: { id: groupId, organizationId },
      include: { subjects: { select: { order: true }, orderBy: { order: 'desc' }, take: 1 } },
    });
    if (!group) throw new Error('Group not found');

    const nextOrder = (group.subjects[0]?.order ?? -1) + 1;
    return prisma.groupSubject.create({
      data: { groupId, name, order: nextOrder },
      include: { materials: true },
    });
  }

  /**
   * Delete a subject and all its materials
   */
  async deleteSubject(groupId: string, subjectId: string, organizationId: string) {
    const group = await prisma.traineeGroup.findFirst({ where: { id: groupId, organizationId } });
    if (!group) throw new Error('Group not found');

    const subject = await prisma.groupSubject.findFirst({ where: { id: subjectId, groupId } });
    if (!subject) throw new Error('Subject not found');

    await prisma.groupSubject.delete({ where: { id: subjectId } });
  }

  /**
   * Add material (PDF or YouTube link) to a subject
   */
  async addMaterial(
    groupId: string,
    subjectId: string,
    organizationId: string,
    data: { type: 'pdf' | 'youtube'; title: string; url: string; fileName?: string; fileSize?: number }
  ) {
    const group = await prisma.traineeGroup.findFirst({ where: { id: groupId, organizationId } });
    if (!group) throw new Error('Group not found');

    const subject = await prisma.groupSubject.findFirst({
      where: { id: subjectId, groupId },
      include: { materials: { select: { displayOrder: true }, orderBy: { displayOrder: 'desc' }, take: 1 } },
    });
    if (!subject) throw new Error('Subject not found');

    const nextOrder = (subject.materials[0]?.displayOrder ?? -1) + 1;
    return prisma.subjectMaterial.create({
      data: {
        subjectId,
        type: data.type,
        title: data.title,
        url: data.url,
        fileName: data.fileName,
        fileSize: data.fileSize,
        displayOrder: nextOrder,
      },
    });
  }

  /**
   * Delete a material
   */
  async deleteMaterial(groupId: string, subjectId: string, materialId: string, organizationId: string) {
    const group = await prisma.traineeGroup.findFirst({ where: { id: groupId, organizationId } });
    if (!group) throw new Error('Group not found');

    const material = await prisma.subjectMaterial.findFirst({
      where: { id: materialId, subjectId },
      include: { subject: true },
    });
    if (!material || material.subject.groupId !== groupId) throw new Error('Material not found');

    await prisma.subjectMaterial.delete({ where: { id: materialId } });
  }

  // ========== Course Assignment Management ==========

  /**
   * Get courses assigned to a group
   */
  async getGroupCourses(groupId: string, organizationId: string) {
    const group = await prisma.traineeGroup.findFirst({ where: { id: groupId, organizationId } });
    if (!group) throw new Error('Group not found');

    const groupCourses = await prisma.groupCourse.findMany({
      where: { groupId },
      include: {
        course: {
          include: {
            lectures: {
              select: { id: true, titleEn: true, durationMinutes: true },
              orderBy: { orderInCourse: 'asc' },
            },
          },
        },
      },
      orderBy: { order: 'asc' },
    });

    return groupCourses.map((gc) => ({
      id: gc.course.id,
      titleEn: gc.course.titleEn,
      titleAr: gc.course.titleAr,
      descriptionEn: gc.course.descriptionEn,
      category: gc.course.category,
      difficulty: gc.course.difficulty,
      thumbnailUrl: gc.course.thumbnailUrl,
      estimatedDurationMinutes: gc.course.estimatedDurationMinutes,
      lessonCount: gc.course.lectures.length,
      order: gc.order,
    }));
  }

  /**
   * Assign courses to a group
   */
  async assignCourses(groupId: string, courseIds: string[], organizationId: string) {
    const group = await prisma.traineeGroup.findFirst({ where: { id: groupId, organizationId } });
    if (!group) throw new Error('Group not found');

    // Get existing assignments to skip duplicates
    const existing = await prisma.groupCourse.findMany({
      where: { groupId, courseId: { in: courseIds } },
      select: { courseId: true },
    });
    const existingIds = new Set(existing.map((e) => e.courseId));

    // Get max order
    const lastCourse = await prisma.groupCourse.findFirst({
      where: { groupId },
      orderBy: { order: 'desc' },
      select: { order: true },
    });
    let nextOrder = (lastCourse?.order ?? -1) + 1;

    const newCourseIds = courseIds.filter((id) => !existingIds.has(id));

    if (newCourseIds.length > 0) {
      await prisma.groupCourse.createMany({
        data: newCourseIds.map((courseId) => ({
          groupId,
          courseId,
          order: nextOrder++,
        })),
      });
    }

    return { added: newCourseIds.length, skipped: courseIds.length - newCourseIds.length };
  }

  /**
   * Unassign a course from a group
   */
  async unassignCourse(groupId: string, courseId: string, organizationId: string) {
    const group = await prisma.traineeGroup.findFirst({ where: { id: groupId, organizationId } });
    if (!group) throw new Error('Group not found');

    const gc = await prisma.groupCourse.findUnique({
      where: { groupId_courseId: { groupId, courseId } },
    });
    if (!gc) throw new Error('Course not assigned');

    await prisma.groupCourse.delete({ where: { id: gc.id } });
  }

  /**
   * Get group content for a student (by their active group membership)
   * Returns group info + assigned courses (not subjects/materials)
   */
  async getTraineeGroupContent(traineeId: string) {
    const membership = await prisma.groupMember.findFirst({
      where: { traineeId, isActive: true },
      include: {
        group: {
          include: {
            courses: {
              include: {
                course: {
                  include: {
                    lectures: {
                      orderBy: { orderInCourse: 'asc' },
                    },
                  },
                },
              },
              orderBy: { order: 'asc' },
            },
          },
        },
      },
      orderBy: { joinedAt: 'desc' },
    });

    if (!membership || !membership.group.isActive) return { group: null, courses: [] };

    const courses = membership.group.courses.filter((gc: any) => gc.course.isPublished).map((gc: any) => ({
      id: gc.course.id,
      title: gc.course.titleEn || gc.course.title,
      titleEn: gc.course.titleEn,
      titleAr: gc.course.titleAr,
      description: gc.course.descriptionEn || gc.course.description,
      descriptionEn: gc.course.descriptionEn,
      descriptionAr: gc.course.descriptionAr,
      category: gc.course.category,
      difficulty: gc.course.difficulty,
      thumbnailUrl: gc.course.thumbnailUrl,
      estimatedDurationMinutes: gc.course.estimatedDurationMinutes,
      objectivesEn: gc.course.objectivesEn,
      objectivesAr: gc.course.objectivesAr,
      recommendedSimulationType: gc.course.recommendedSimulationType,
      recommendedSimulationScenario: gc.course.recommendedSimulationScenario,
      recommendedSimulationDifficulty: gc.course.recommendedSimulationDifficulty,
      isPublished: gc.course.isPublished,
      lessons: gc.course.lectures.map((l: any) => ({
        id: l.id,
        titleEn: l.titleEn,
        titleAr: l.titleAr,
        descriptionEn: l.descriptionEn,
        descriptionAr: l.descriptionAr,
        videoUrl: l.videoUrl,
        durationMinutes: l.durationMinutes,
        orderInCourse: l.orderInCourse,
      })),
    }));

    return {
      group: {
        id: membership.group.id,
        name: membership.group.name,
        description: membership.group.description,
        specialization: membership.group.specialization,
      },
      courses,
    };
  }

  // ==========================================
  // Quiz Assignment
  // ==========================================

  async getGroupQuizzes(groupId: string, organizationId: string) {
    const group = await prisma.traineeGroup.findFirst({ where: { id: groupId, organizationId } });
    if (!group) throw new Error('Group not found');

    const groupQuizzes = await prisma.groupQuiz.findMany({
      where: { groupId },
      include: {
        quiz: {
          include: {
            _count: { select: { questions: true, attempts: true } },
          },
        },
      },
      orderBy: { order: 'asc' },
    });

    return groupQuizzes.map((gq) => ({
      id: gq.quiz.id,
      title: gq.quiz.title,
      titleAr: gq.quiz.titleAr,
      description: gq.quiz.description,
      difficulty: gq.quiz.difficulty,
      quizType: gq.quiz.quizType,
      isPublished: gq.quiz.isPublished,
      questionCount: gq.quiz._count.questions,
      attemptCount: gq.quiz._count.attempts,
      passingScore: gq.quiz.passingScore,
      timeLimit: gq.quiz.timeLimit,
      order: gq.order,
    }));
  }

  async assignQuizzes(groupId: string, quizIds: string[], organizationId: string) {
    const group = await prisma.traineeGroup.findFirst({ where: { id: groupId, organizationId } });
    if (!group) throw new Error('Group not found');

    const existing = await prisma.groupQuiz.findMany({
      where: { groupId, quizId: { in: quizIds } },
      select: { quizId: true },
    });
    const existingIds = new Set(existing.map((e) => e.quizId));

    const lastQuiz = await prisma.groupQuiz.findFirst({
      where: { groupId },
      orderBy: { order: 'desc' },
      select: { order: true },
    });
    let nextOrder = (lastQuiz?.order ?? -1) + 1;

    const newQuizIds = quizIds.filter((id) => !existingIds.has(id));

    if (newQuizIds.length > 0) {
      await prisma.groupQuiz.createMany({
        data: newQuizIds.map((quizId) => ({
          groupId,
          quizId,
          order: nextOrder++,
        })),
      });
    }

    return { added: newQuizIds.length, skipped: quizIds.length - newQuizIds.length };
  }

  async unassignQuiz(groupId: string, quizId: string, organizationId: string) {
    const group = await prisma.traineeGroup.findFirst({ where: { id: groupId, organizationId } });
    if (!group) throw new Error('Group not found');

    const gq = await prisma.groupQuiz.findUnique({
      where: { groupId_quizId: { groupId, quizId } },
    });
    if (!gq) throw new Error('Quiz not assigned');

    await prisma.groupQuiz.delete({ where: { id: gq.id } });
  }
}

export const groupService = new GroupService();
