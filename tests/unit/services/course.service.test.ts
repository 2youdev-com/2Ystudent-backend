import 'reflect-metadata';
import { describe, it, expect, beforeEach, vi, Mock } from 'vitest';
import { CourseService } from '../../../src/services/course/course.service';
import { ICourseRepository } from '../../../src/repositories/interfaces/course.repository.interface';
import { ITraineeRepository } from '../../../src/repositories/interfaces/trainee.repository.interface';

describe('CourseService', () => {
  let courseService: CourseService;
  let mockCourseRepo: Record<string, Mock>;
  let mockTraineeRepo: Record<string, Mock>;

  const mockCourse = {
    id: 'course-1',
    title: 'HVAC Fundamentals',
    titleAr: 'أساسيات التكييف',
    titleEn: 'HVAC Fundamentals',
    description: 'Learn HVAC basics',
    descriptionAr: 'تعلم أساسيات التكييف',
    descriptionEn: 'Learn HVAC basics',
    difficulty: 'beginner',
    category: 'hvac',
    estimatedDurationMinutes: 120,
    isPublished: true,
    orderInLevel: 1,
    programId: 'prog-1',
    levelId: 'level-1',
    objectives: '["Understand HVAC systems","Identify components"]',
    prerequisites: '["Basic physics"]',
    lectures: [
      {
        id: 'lec-1',
        courseId: 'course-1',
        title: 'Introduction',
        description: 'Intro to HVAC',
        videoUrl: 'https://youtube.com/watch?v=123',
        durationMinutes: 30,
        orderInCourse: 1,
        triggerAssessmentOnComplete: false,
      },
      {
        id: 'lec-2',
        courseId: 'course-1',
        title: 'Components',
        description: 'HVAC Components',
        videoUrl: 'https://youtube.com/watch?v=456',
        durationMinutes: 45,
        orderInCourse: 2,
        triggerAssessmentOnComplete: true,
      },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockCourseRepo = {
      findAll: vi.fn(),
      findByIdWithLectures: vi.fn(),
      findByLevel: vi.fn(),
      findByProgram: vi.fn(),
      findLectureById: vi.fn(),
      getTraineeCompletedLectures: vi.fn(),
      search: vi.fn(),
    };

    mockTraineeRepo = {
      findById: vi.fn(),
      findByEmail: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      findByOrganization: vi.fn(),
      getWithProgress: vi.fn(),
    };

    courseService = new CourseService(
      mockCourseRepo as unknown as ICourseRepository,
      mockTraineeRepo as unknown as ITraineeRepository
    );
  });

  describe('getAllCourses', () => {
    it('should return all courses as list items', async () => {
      mockCourseRepo.findAll.mockResolvedValue([mockCourse, { ...mockCourse, id: 'course-2', title: 'Electrical' }]);

      const result = await courseService.getAllCourses();

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('course-1');
      expect(result[0].title).toBe('HVAC Fundamentals');
      expect(result[0].difficulty).toBe('beginner');
      expect(result[0].category).toBe('hvac');
    });

    it('should return empty array when no courses exist', async () => {
      mockCourseRepo.findAll.mockResolvedValue([]);

      const result = await courseService.getAllCourses();
      expect(result).toHaveLength(0);
    });

    it('should include bilingual fields', async () => {
      mockCourseRepo.findAll.mockResolvedValue([mockCourse]);

      const result = await courseService.getAllCourses();

      expect(result[0].titleAr).toBe('أساسيات التكييف');
      expect(result[0].titleEn).toBe('HVAC Fundamentals');
    });
  });

  describe('getCourseById', () => {
    it('should return full course details with lectures', async () => {
      mockCourseRepo.findByIdWithLectures.mockResolvedValue(mockCourse);

      const result = await courseService.getCourseById('course-1');

      expect(result.id).toBe('course-1');
      expect(result.lectures).toHaveLength(2);
      expect(result.lectures[0].title).toBe('Introduction');
      expect(result.lectures[1].orderInCourse).toBe(2);
      expect(result.objectives).toEqual(['Understand HVAC systems', 'Identify components']);
      expect(result.prerequisites).toEqual(['Basic physics']);
    });

    it('should throw when course not found', async () => {
      mockCourseRepo.findByIdWithLectures.mockResolvedValue(null);

      await expect(courseService.getCourseById('nonexistent')).rejects.toThrow('Course not found');
    });

    it('should handle objectives as array', async () => {
      mockCourseRepo.findByIdWithLectures.mockResolvedValue({
        ...mockCourse,
        objectives: ['Already', 'An Array'],
        prerequisites: ['Also Array'],
      });

      const result = await courseService.getCourseById('course-1');
      expect(result.objectives).toEqual(['Already', 'An Array']);
    });

    it('should handle malformed JSON objectives gracefully', async () => {
      mockCourseRepo.findByIdWithLectures.mockResolvedValue({
        ...mockCourse,
        objectives: 'not valid json',
        prerequisites: '',
      });

      const result = await courseService.getCourseById('course-1');
      expect(result.objectives).toEqual([]);
      expect(result.prerequisites).toEqual([]);
    });
  });

  describe('getCoursesByLevel', () => {
    it('should return courses for a given level', async () => {
      mockCourseRepo.findByLevel.mockResolvedValue([mockCourse]);

      const result = await courseService.getCoursesByLevel('level-1');

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('course-1');
    });
  });

  describe('getCoursesByProgram', () => {
    it('should return courses for a given program', async () => {
      mockCourseRepo.findByProgram.mockResolvedValue([mockCourse]);

      const result = await courseService.getCoursesByProgram('prog-1');

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('course-1');
    });
  });

  describe('getLectureById', () => {
    it('should return lecture details', async () => {
      const mockLecture = mockCourse.lectures[0];
      mockCourseRepo.findLectureById.mockResolvedValue(mockLecture);

      const result = await courseService.getLectureById('lec-1');

      expect(result.id).toBe('lec-1');
      expect(result.title).toBe('Introduction');
      expect(result.videoUrl).toBe('https://youtube.com/watch?v=123');
    });

    it('should throw when lecture not found', async () => {
      mockCourseRepo.findLectureById.mockResolvedValue(null);

      await expect(courseService.getLectureById('nonexistent')).rejects.toThrow('Lecture not found');
    });
  });

  describe('getStudentCourseProgress', () => {
    it('should calculate progress percentage', async () => {
      mockCourseRepo.findByIdWithLectures.mockResolvedValue(mockCourse);
      mockCourseRepo.getTraineeCompletedLectures.mockResolvedValue(['lec-1']);

      const result = await courseService.getStudentCourseProgress('trainee-1', 'course-1');

      expect(result).toBe(50); // 1 out of 2 lectures
    });

    it('should return 100 for course with no lectures', async () => {
      mockCourseRepo.findByIdWithLectures.mockResolvedValue({ ...mockCourse, lectures: [] });

      const result = await courseService.getStudentCourseProgress('trainee-1', 'course-1');

      expect(result).toBe(100);
    });

    it('should return 0 when no lectures completed', async () => {
      mockCourseRepo.findByIdWithLectures.mockResolvedValue(mockCourse);
      mockCourseRepo.getTraineeCompletedLectures.mockResolvedValue([]);

      const result = await courseService.getStudentCourseProgress('trainee-1', 'course-1');

      expect(result).toBe(0);
    });

    it('should return 100 when all lectures completed', async () => {
      mockCourseRepo.findByIdWithLectures.mockResolvedValue(mockCourse);
      mockCourseRepo.getTraineeCompletedLectures.mockResolvedValue(['lec-1', 'lec-2']);

      const result = await courseService.getStudentCourseProgress('trainee-1', 'course-1');

      expect(result).toBe(100);
    });

    it('should throw when course not found', async () => {
      mockCourseRepo.findByIdWithLectures.mockResolvedValue(null);

      await expect(
        courseService.getStudentCourseProgress('trainee-1', 'nonexistent')
      ).rejects.toThrow('Course not found');
    });
  });

  describe('searchCourses', () => {
    it('should return matching courses', async () => {
      mockCourseRepo.search.mockResolvedValue([mockCourse]);

      const result = await courseService.searchCourses('HVAC');

      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('HVAC Fundamentals');
    });

    it('should pass filters to repository', async () => {
      mockCourseRepo.search.mockResolvedValue([]);

      await courseService.searchCourses('test', { difficulty: 'advanced' as any, category: 'electrical' as any });

      expect(mockCourseRepo.search).toHaveBeenCalledWith('test', {
        difficulty: 'advanced',
        category: 'electrical',
      });
    });

    it('should return empty array for no matches', async () => {
      mockCourseRepo.search.mockResolvedValue([]);

      const result = await courseService.searchCourses('nonexistent');
      expect(result).toHaveLength(0);
    });
  });
});
