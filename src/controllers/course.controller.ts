import { injectable, inject } from 'tsyringe';
import { Router, Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';
import { ICourseService } from '../services/interfaces/course.interface';
import { BrainService } from '../services/brain/brain.service';
import { authMiddleware, optionalAuthMiddleware } from '../middleware/auth.middleware';

@injectable()
export class CourseController {
  public router: Router;

  constructor(
    @inject('CourseService') private courseService: ICourseService,
    @inject('PrismaClient') private prisma: PrismaClient,
    @inject(BrainService) private brainService: BrainService
  ) {
    this.router = Router();
    this.initializeRoutes();
  }

  private initializeRoutes(): void {
    // Get all courses - must be before /:courseId to avoid matching 'search', 'program', 'level'
    this.router.get(
      '/',
      optionalAuthMiddleware(),
      this.getAllCourses.bind(this)
    );

    this.router.get(
      '/search',
      optionalAuthMiddleware(),
      this.searchCourses.bind(this)
    );

    this.router.get(
      '/program/:programId',
      optionalAuthMiddleware(),
      this.getCoursesByProgram.bind(this)
    );

    this.router.get(
      '/level/:levelId',
      optionalAuthMiddleware(),
      this.getCoursesByLevel.bind(this)
    );

    this.router.get(
      '/lectures/:lectureId',
      authMiddleware(['student', 'supervisor', 'admin']),
      this.getLectureById.bind(this)
    );

    // AI context for course-aware chat/voice — must be before /:courseId
    this.router.get(
      '/:courseId/ai-context',
      authMiddleware(['student', 'supervisor', 'admin']),
      this.getCourseAIContext.bind(this)
    );

    this.router.get(
      '/:courseId',
      optionalAuthMiddleware(),
      this.getCourseById.bind(this)
    );

    this.router.get(
      '/:courseId/progress',
      authMiddleware(['student', 'supervisor', 'admin']),
      this.getCourseProgress.bind(this)
    );
  }

  private async getAllCourses(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const courses = await this.courseService.getAllCourses();
      res.status(200).json(courses);
    } catch (error) {
      next(error);
    }
  }

  private async searchCourses(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { q, difficulty, category } = req.query;

      const courses = await this.courseService.searchCourses(
        (q as string) || '',
        {
          difficulty: difficulty as any,
          category: category as any,
        }
      );

      res.status(200).json(courses);
    } catch (error) {
      next(error);
    }
  }

  private async getCoursesByProgram(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { programId } = req.params;

      const courses = await this.courseService.getCoursesByProgram(programId);

      res.status(200).json(courses);
    } catch (error) {
      next(error);
    }
  }

  private async getCoursesByLevel(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { levelId } = req.params;

      const courses = await this.courseService.getCoursesByLevel(levelId);

      res.status(200).json(courses);
    } catch (error) {
      next(error);
    }
  }

  private async getCourseById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { courseId } = req.params;

      const course = await this.courseService.getCourseById(courseId);

      res.status(200).json(course);
    } catch (error) {
      if (error instanceof Error && error.message.includes('not found')) {
        res.status(404).json({ error: error.message });
        return;
      }
      next(error);
    }
  }

  private async getCourseProgress(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { courseId } = req.params;
      const studentId = req.user!.userId;

      const progress = await this.courseService.getStudentCourseProgress(studentId, courseId);

      res.status(200).json({ courseId, progress });
    } catch (error) {
      next(error);
    }
  }

  private async getLectureById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { lectureId } = req.params;

      const lecture = await this.courseService.getLectureById(lectureId);

      res.status(200).json(lecture);
    } catch (error) {
      if (error instanceof Error && error.message.includes('not found')) {
        res.status(404).json({ error: error.message });
        return;
      }
      next(error);
    }
  }

  /**
   * GET /api/courses/:courseId/ai-context
   * Returns enriched course context with Brain/RAG content for chat/voice practice.
   */
  private async getCourseAIContext(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { courseId } = req.params;
      const traineeId = req.user!.userId;

      // Fetch course with lectures
      const course = await this.courseService.getCourseById(courseId);

      // Build lesson topics string
      const lessonTopics = course.lectures
        .map((l) => l.title)
        .join(', ');

      // Query Brain/RAG for relevant documents
      let brainContext = '';
      try {
        const trainee = await this.prisma.trainee.findUnique({
          where: { id: traineeId },
          select: { organizationId: true },
        });

        if (trainee?.organizationId) {
          const query = `${course.title} ${course.category}`.trim().slice(0, 200);
          const result = await this.brainService.queryBrain({
            query,
            organizationId: trainee.organizationId,
            topK: 5,
            scoreThreshold: 0.3,
          });

          if (result.results && result.results.length > 0) {
            brainContext = result.results
              .map((r) => `[${r.documentTitle}]: ${r.content}`)
              .join('\n\n');
          }
        }
      } catch (brainError) {
        console.error('[CourseController] Brain query failed:', brainError);
        // Continue without brain context
      }

      // Build combined context string (truncated to ~2000 chars)
      const objectives = Array.isArray(course.objectives) ? course.objectives.join(', ') : '';
      let contextString = `Course: ${course.title}\nCategory: ${course.category}\nDifficulty: ${course.difficulty}\n`;
      if (objectives) contextString += `Objectives: ${objectives}\n`;
      contextString += `Lessons: ${lessonTopics}\n`;
      if (brainContext) {
        contextString += `\nRelevant Knowledge Base Content:\n${brainContext}`;
      }
      contextString = contextString.slice(0, 2000);

      res.status(200).json({
        courseTitle: course.title,
        courseCategory: course.category,
        courseDifficulty: course.difficulty,
        courseObjectives: course.objectives || [],
        lessonTopics,
        contextString,
        brainContext: brainContext.slice(0, 1500),
      });
    } catch (error) {
      if (error instanceof Error && error.message.includes('not found')) {
        res.status(404).json({ error: error.message });
        return;
      }
      next(error);
    }
  }
}
