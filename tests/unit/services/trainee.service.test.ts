import 'reflect-metadata';
import { describe, it, expect, beforeEach, vi, Mock } from 'vitest';
import { TraineeService } from '../../../src/services/trainee/trainee.service';
import { ITraineeRepository } from '../../../src/repositories/interfaces/trainee.repository.interface';

describe('TraineeService', () => {
  let traineeService: TraineeService;
  let mockTraineeRepo: Record<string, Mock>;
  let mockPrisma: any;

  const mockTrainee = {
    id: 'trainee-1',
    email: 'student@example.com',
    firstName: 'Ahmed',
    lastName: 'Hassan',
    organizationId: 'org-1',
    currentLevelId: 'level-1',
    status: 'active',
    totalTimeOnPlatform: 120,
    currentStreak: 3,
    lastActiveAt: new Date('2026-03-04'),
    passwordHash: 'hash',
    completedLectures: [{ lectureId: 'lec-1' }, { lectureId: 'lec-2' }],
    completedAssessments: [{ assessmentId: 'assess-1' }],
    simulationSessions: [{ id: 'sim-1' }],
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockTraineeRepo = {
      findById: vi.fn(),
      findByEmail: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      findByOrganization: vi.fn(),
      getWithProgress: vi.fn(),
    };

    mockPrisma = {
      trainee: { findUnique: vi.fn() },
      program: { findUnique: vi.fn() },
      programEnrollment: {
        findUnique: vi.fn(),
        create: vi.fn(),
      },
      lectureCompletion: {
        findUnique: vi.fn(),
        create: vi.fn(),
      },
      assessmentCompletion: {
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      level: { findFirst: vi.fn() },
      course: { findMany: vi.fn() },
      voiceSession: { findMany: vi.fn() },
      aITeacher: { findFirst: vi.fn() },
    };

    traineeService = new TraineeService(
      mockTraineeRepo as unknown as ITraineeRepository,
      mockPrisma
    );
  });

  describe('getProfile', () => {
    it('should return trainee profile with progress', async () => {
      mockTraineeRepo.getWithProgress.mockResolvedValue(mockTrainee);

      const result = await traineeService.getProfile('trainee-1');

      expect(result.id).toBe('trainee-1');
      expect(result.email).toBe('student@example.com');
      expect(result.firstName).toBe('Ahmed');
      expect(result.progress.completedLectureIds).toEqual(['lec-1', 'lec-2']);
      expect(result.progress.completedAssessmentIds).toEqual(['assess-1']);
      expect(result.progress.completedSimulationIds).toEqual(['sim-1']);
      expect(result.metrics.totalTimeOnPlatform).toBe(120);
      expect(result.metrics.currentStreak).toBe(3);
    });

    it('should throw when trainee not found', async () => {
      mockTraineeRepo.getWithProgress.mockResolvedValue(null);

      await expect(traineeService.getProfile('nonexistent')).rejects.toThrow('Trainee not found');
    });
  });

  describe('updateProfile', () => {
    it('should update and return refreshed profile', async () => {
      mockTraineeRepo.findById.mockResolvedValue(mockTrainee);
      mockTraineeRepo.update.mockResolvedValue(mockTrainee);
      mockTraineeRepo.getWithProgress.mockResolvedValue({
        ...mockTrainee,
        firstName: 'Updated',
      });

      const result = await traineeService.updateProfile('trainee-1', { firstName: 'Updated' });

      expect(mockTraineeRepo.update).toHaveBeenCalledWith('trainee-1', { firstName: 'Updated' });
      expect(result.firstName).toBe('Updated');
    });

    it('should throw when trainee not found', async () => {
      mockTraineeRepo.findById.mockResolvedValue(null);

      await expect(
        traineeService.updateProfile('nonexistent', { firstName: 'Test' })
      ).rejects.toThrow('Trainee not found');
    });
  });

  describe('updateActivity', () => {
    it('should increment streak when last active yesterday', async () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      mockTraineeRepo.findById.mockResolvedValue({
        ...mockTrainee,
        lastActiveAt: yesterday,
        currentStreak: 5,
      });
      mockTraineeRepo.update.mockResolvedValue(mockTrainee);

      await traineeService.updateActivity('trainee-1', 30);

      expect(mockTraineeRepo.update).toHaveBeenCalledWith('trainee-1', expect.objectContaining({
        currentStreak: 6,
        totalTimeOnPlatform: 150, // 120 + 30
      }));
    });

    it('should reset streak when gap > 1 day', async () => {
      const threeDaysAgo = new Date();
      threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

      mockTraineeRepo.findById.mockResolvedValue({
        ...mockTrainee,
        lastActiveAt: threeDaysAgo,
        currentStreak: 10,
      });
      mockTraineeRepo.update.mockResolvedValue(mockTrainee);

      await traineeService.updateActivity('trainee-1', 15);

      expect(mockTraineeRepo.update).toHaveBeenCalledWith('trainee-1', expect.objectContaining({
        currentStreak: 1,
      }));
    });

    it('should set streak to 1 for first activity', async () => {
      mockTraineeRepo.findById.mockResolvedValue({
        ...mockTrainee,
        lastActiveAt: null,
        currentStreak: 0,
      });
      mockTraineeRepo.update.mockResolvedValue(mockTrainee);

      await traineeService.updateActivity('trainee-1', 10);

      expect(mockTraineeRepo.update).toHaveBeenCalledWith('trainee-1', expect.objectContaining({
        currentStreak: 1,
      }));
    });

    it('should throw when trainee not found', async () => {
      mockTraineeRepo.findById.mockResolvedValue(null);

      await expect(traineeService.updateActivity('nonexistent', 10)).rejects.toThrow('Trainee not found');
    });
  });

  describe('enrollInProgram', () => {
    it('should create enrollment and set first level', async () => {
      mockPrisma.programEnrollment.findUnique.mockResolvedValue(null);
      mockPrisma.programEnrollment.create.mockResolvedValue({});
      mockPrisma.level.findFirst.mockResolvedValue({ id: 'level-1' });
      mockTraineeRepo.update.mockResolvedValue(mockTrainee);

      await traineeService.enrollInProgram('trainee-1', 'prog-1');

      expect(mockPrisma.programEnrollment.create).toHaveBeenCalledWith({
        data: { traineeId: 'trainee-1', programId: 'prog-1' },
      });
      expect(mockTraineeRepo.update).toHaveBeenCalledWith('trainee-1', {
        currentLevelId: 'level-1',
      });
    });

    it('should throw when already enrolled', async () => {
      mockPrisma.programEnrollment.findUnique.mockResolvedValue({ id: 'existing' });

      await expect(
        traineeService.enrollInProgram('trainee-1', 'prog-1')
      ).rejects.toThrow('Already enrolled in this program');
    });

    it('should not update level when no levels exist', async () => {
      mockPrisma.programEnrollment.findUnique.mockResolvedValue(null);
      mockPrisma.programEnrollment.create.mockResolvedValue({});
      mockPrisma.level.findFirst.mockResolvedValue(null);

      await traineeService.enrollInProgram('trainee-1', 'prog-1');

      expect(mockTraineeRepo.update).not.toHaveBeenCalled();
    });
  });

  describe('completeLecture', () => {
    it('should create lecture completion and update activity', async () => {
      mockPrisma.lectureCompletion.findUnique.mockResolvedValue(null);
      mockPrisma.lectureCompletion.create.mockResolvedValue({});
      // updateActivity calls findById + update
      mockTraineeRepo.findById.mockResolvedValue({
        ...mockTrainee,
        lastActiveAt: new Date(),
      });
      mockTraineeRepo.update.mockResolvedValue(mockTrainee);

      await traineeService.completeLecture('trainee-1', 'lec-3', 25);

      expect(mockPrisma.lectureCompletion.create).toHaveBeenCalledWith({
        data: { traineeId: 'trainee-1', lectureId: 'lec-3', timeSpentMinutes: 25 },
      });
    });

    it('should skip if lecture already completed', async () => {
      mockPrisma.lectureCompletion.findUnique.mockResolvedValue({ id: 'existing' });

      await traineeService.completeLecture('trainee-1', 'lec-1', 10);

      expect(mockPrisma.lectureCompletion.create).not.toHaveBeenCalled();
    });
  });

  describe('completeAssessment', () => {
    it('should create assessment completion', async () => {
      mockPrisma.assessmentCompletion.findUnique.mockResolvedValue(null);
      mockPrisma.assessmentCompletion.create.mockResolvedValue({});

      await traineeService.completeAssessment('trainee-1', 'assess-2', 85);

      expect(mockPrisma.assessmentCompletion.create).toHaveBeenCalledWith({
        data: { traineeId: 'trainee-1', assessmentId: 'assess-2', score: 85 },
      });
    });

    it('should update score if assessment already completed', async () => {
      mockPrisma.assessmentCompletion.findUnique.mockResolvedValue({ id: 'existing-id' });
      mockPrisma.assessmentCompletion.update.mockResolvedValue({});

      await traineeService.completeAssessment('trainee-1', 'assess-1', 95);

      expect(mockPrisma.assessmentCompletion.update).toHaveBeenCalledWith({
        where: { id: 'existing-id' },
        data: { score: 95 },
      });
      expect(mockPrisma.assessmentCompletion.create).not.toHaveBeenCalled();
    });
  });

  describe('getAssignedTeacher', () => {
    it('should return teacher info from linked AITeacher record', async () => {
      mockPrisma.trainee.findUnique.mockResolvedValue({
        assignedTeacher: 'alex',
        assignedTeacherId: 'teacher-1',
        currentSkillLevel: 'intermediate',
        assignedTeacherRecord: {
          id: 'teacher-1',
          name: 'alex',
          displayNameAr: 'أليكس',
          displayNameEn: 'Alex',
          avatarUrl: 'https://example.com/avatar.png',
          voiceId: 'voice-123',
        },
      });

      const result = await traineeService.getAssignedTeacher('trainee-1');

      expect(result.hasAssignedTeacher).toBe(true);
      expect(result.teacherName).toBe('alex');
      expect(result.teacherId).toBe('teacher-1');
      expect(result.displayNameAr).toBe('أليكس');
      expect(result.voiceId).toBe('voice-123');
    });

    it('should fallback to name-based lookup for legacy records', async () => {
      mockPrisma.trainee.findUnique.mockResolvedValue({
        assignedTeacher: 'alex',
        assignedTeacherId: null,
        currentSkillLevel: null,
        assignedTeacherRecord: null,
      });
      mockPrisma.aITeacher.findFirst.mockResolvedValue({
        id: 'teacher-1',
        name: 'alex',
        displayNameAr: 'أليكس',
        displayNameEn: 'Alex',
        avatarUrl: null,
        voiceId: null,
      });

      const result = await traineeService.getAssignedTeacher('trainee-1');

      expect(result.hasAssignedTeacher).toBe(true);
      expect(result.teacherId).toBe('teacher-1');
    });

    it('should return partial info when legacy name has no AITeacher match', async () => {
      mockPrisma.trainee.findUnique.mockResolvedValue({
        assignedTeacher: 'old-teacher',
        assignedTeacherId: null,
        currentSkillLevel: 'beginner',
        assignedTeacherRecord: null,
      });
      mockPrisma.aITeacher.findFirst.mockResolvedValue(null);

      const result = await traineeService.getAssignedTeacher('trainee-1');

      expect(result.hasAssignedTeacher).toBe(true);
      expect(result.teacherName).toBe('old-teacher');
      expect(result.teacherId).toBeNull();
    });

    it('should return no teacher when none assigned', async () => {
      mockPrisma.trainee.findUnique.mockResolvedValue({
        assignedTeacher: null,
        assignedTeacherId: null,
        currentSkillLevel: 'beginner',
        assignedTeacherRecord: null,
      });

      const result = await traineeService.getAssignedTeacher('trainee-1');

      expect(result.hasAssignedTeacher).toBe(false);
      expect(result.teacherName).toBeNull();
    });

    it('should throw when trainee not found', async () => {
      mockPrisma.trainee.findUnique.mockResolvedValue(null);

      await expect(traineeService.getAssignedTeacher('nonexistent')).rejects.toThrow('Trainee not found');
    });
  });

  describe('getProgress', () => {
    it('should calculate progress across program levels', async () => {
      mockTraineeRepo.getWithProgress.mockResolvedValue({
        ...mockTrainee,
        completedLectures: [{ lectureId: 'lec-1' }],
        completedAssessments: [{ assessmentId: 'a1' }],
        simulationSessions: [{ id: 's1' }, { id: 's2' }],
      });

      mockPrisma.program.findUnique.mockResolvedValue({
        id: 'prog-1',
        levels: [
          {
            id: 'level-1',
            title: 'Level 1',
            courses: [
              {
                lectures: [{ id: 'lec-1' }, { id: 'lec-2' }],
              },
            ],
          },
        ],
      });

      const result = await traineeService.getProgress('trainee-1', 'prog-1');

      expect(result.lecturesCompleted).toBe(1);
      expect(result.lecturesTotal).toBe(2);
      expect(result.overallProgress).toBe(50);
      expect(result.simulationsCompleted).toBe(2);
    });

    it('should throw when trainee not found', async () => {
      mockTraineeRepo.getWithProgress.mockResolvedValue(null);

      await expect(traineeService.getProgress('nonexistent', 'prog-1')).rejects.toThrow('Trainee not found');
    });

    it('should throw when program not found', async () => {
      mockTraineeRepo.getWithProgress.mockResolvedValue(mockTrainee);
      mockPrisma.program.findUnique.mockResolvedValue(null);

      await expect(traineeService.getProgress('trainee-1', 'bad-prog')).rejects.toThrow('Program not found');
    });

    it('should return 0 progress when no lectures in program', async () => {
      mockTraineeRepo.getWithProgress.mockResolvedValue(mockTrainee);
      mockPrisma.program.findUnique.mockResolvedValue({
        id: 'prog-1',
        levels: [{ id: 'l1', title: 'Empty', courses: [] }],
      });

      const result = await traineeService.getProgress('trainee-1', 'prog-1');

      expect(result.overallProgress).toBe(0);
      expect(result.lecturesTotal).toBe(0);
    });
  });
});
