import { injectable, inject } from 'tsyringe';
import { Router, Request, Response, NextFunction } from 'express';
import { IQuizService } from '../services/interfaces/quiz.interface';
import { validateRequest } from '../middleware/validation.middleware';
import {
  CreateQuizSchema,
  UpdateQuizSchema,
  PublishQuizSchema,
  SubmitAttemptSchema,
  GenerateQuizSchema,
} from '../dtos/validation/quiz.validation';
import { authMiddleware } from '../middleware/auth.middleware';

@injectable()
export class QuizController {
  public router: Router;

  constructor(
    @inject('QuizService') private quizService: IQuizService
  ) {
    this.router = Router();
    this.initializeRoutes();
  }

  private initializeRoutes(): void {
    // ==========================================
    // Student routes (must come before :quizId)
    // ==========================================

    // GET /api/quizzes/available — List published quizzes for student
    this.router.get(
      '/available',
      authMiddleware(['student', 'supervisor', 'admin']),
      this.getAvailableQuizzes.bind(this)
    );

    // GET /api/quizzes/history — Student's attempt history
    this.router.get(
      '/history',
      authMiddleware(['student', 'supervisor', 'admin']),
      this.getStudentHistory.bind(this)
    );

    // GET /api/quizzes/attempts/:attemptId/result — View attempt result
    this.router.get(
      '/attempts/:attemptId/result',
      authMiddleware(['student', 'supervisor', 'admin']),
      this.getAttemptResult.bind(this)
    );

    // POST /api/quizzes/attempts/:attemptId/submit — Submit attempt responses
    this.router.post(
      '/attempts/:attemptId/submit',
      authMiddleware(['student', 'supervisor', 'admin']),
      validateRequest(SubmitAttemptSchema),
      this.submitAttempt.bind(this)
    );

    // ==========================================
    // Admin routes (must come before :quizId)
    // ==========================================

    // GET /api/quizzes/manage — List all quizzes (admin view with stats)
    this.router.get(
      '/manage',
      authMiddleware(['supervisor', 'admin']),
      this.listQuizzesForAdmin.bind(this)
    );

    // POST /api/quizzes/generate — AI-generate quiz (students can generate for themselves)
    this.router.post(
      '/generate',
      authMiddleware(['student', 'supervisor', 'admin']),
      validateRequest(GenerateQuizSchema),
      this.generateQuiz.bind(this)
    );

    // POST /api/quizzes — Create quiz with questions & options
    this.router.post(
      '/',
      authMiddleware(['supervisor', 'admin']),
      validateRequest(CreateQuizSchema),
      this.createQuiz.bind(this)
    );

    // ==========================================
    // Parameterized :quizId routes
    // ==========================================

    // GET /api/quizzes/:quizId/take — Get quiz for taking (correct answers stripped)
    this.router.get(
      '/:quizId/take',
      authMiddleware(['student', 'supervisor', 'admin']),
      this.getQuizForTaking.bind(this)
    );

    // POST /api/quizzes/:quizId/start — Start a new attempt
    this.router.post(
      '/:quizId/start',
      authMiddleware(['student', 'supervisor', 'admin']),
      this.startAttempt.bind(this)
    );

    // GET /api/quizzes/:quizId/admin — Full quiz detail with correct answers (admin)
    this.router.get(
      '/:quizId/admin',
      authMiddleware(['supervisor', 'admin']),
      this.getQuizForAdmin.bind(this)
    );

    // GET /api/quizzes/:quizId/attempts — All attempts for a quiz (admin view)
    this.router.get(
      '/:quizId/attempts',
      authMiddleware(['supervisor', 'admin']),
      this.getQuizAttempts.bind(this)
    );

    // PATCH /api/quizzes/:quizId/publish — Toggle publish status
    this.router.patch(
      '/:quizId/publish',
      authMiddleware(['supervisor', 'admin']),
      validateRequest(PublishQuizSchema),
      this.publishQuiz.bind(this)
    );

    // PUT /api/quizzes/:quizId — Update quiz
    this.router.put(
      '/:quizId',
      authMiddleware(['supervisor', 'admin']),
      validateRequest(UpdateQuizSchema),
      this.updateQuiz.bind(this)
    );

    // DELETE /api/quizzes/:quizId — Delete quiz (students can delete their own AI-generated quizzes)
    this.router.delete(
      '/:quizId',
      authMiddleware(['student', 'supervisor', 'admin']),
      this.deleteQuiz.bind(this)
    );
  }

  // ==========================================
  // Student handlers
  // ==========================================

  private async getAvailableQuizzes(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const courseId = req.query.courseId as string | undefined;
      const traineeId = req.user!.userId;
      const quizzes = await this.quizService.getAvailableQuizzes(courseId, traineeId);
      res.status(200).json({ quizzes });
    } catch (error) {
      next(error);
    }
  }

  private async getStudentHistory(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const studentId = req.user!.userId;
      const history = await this.quizService.getStudentHistory(studentId);
      res.status(200).json({ history });
    } catch (error) {
      next(error);
    }
  }

  private async getQuizForTaking(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { quizId } = req.params;
      const studentId = req.user!.userId;
      const quiz = await this.quizService.getQuizForTaking(quizId, studentId);
      res.status(200).json(quiz);
    } catch (error) {
      next(error);
    }
  }

  private async startAttempt(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { quizId } = req.params;
      const studentId = req.user!.userId;
      const result = await this.quizService.startAttempt(studentId, quizId);
      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  }

  private async submitAttempt(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { attemptId } = req.params;
      const studentId = req.user!.userId;
      const { responses } = req.body;
      const result = await this.quizService.submitAttempt(attemptId, studentId, responses);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  private async getAttemptResult(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { attemptId } = req.params;
      const studentId = req.user!.userId;
      const result = await this.quizService.getAttemptResult(attemptId, studentId);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  // ==========================================
  // Admin handlers
  // ==========================================

  private async listQuizzesForAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const orgId = req.organizationId || null;
      const userId = req.user!.userId;
      const userRole = req.user!.role;
      const quizzes = await this.quizService.listQuizzesForAdmin(orgId, userId, userRole);
      res.status(200).json({ quizzes });
    } catch (error) {
      next(error);
    }
  }

  private async createQuiz(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const creatorId = req.user!.userId;
      const orgId = req.organizationId || null;
      const quiz = await this.quizService.createQuiz(creatorId, orgId, req.body);
      res.status(201).json(quiz);
    } catch (error) {
      next(error);
    }
  }

  private async getQuizForAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { quizId } = req.params;
      const quiz = await this.quizService.getQuizForAdmin(quizId);
      res.status(200).json(quiz);
    } catch (error) {
      next(error);
    }
  }

  private async updateQuiz(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { quizId } = req.params;
      const quiz = await this.quizService.updateQuiz(quizId, req.body);
      res.status(200).json(quiz);
    } catch (error) {
      next(error);
    }
  }

  private async deleteQuiz(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { quizId } = req.params;
      const userId = req.user!.userId;
      const userRole = req.user!.role;
      await this.quizService.deleteQuiz(quizId, userId, userRole);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }

  private async publishQuiz(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { quizId } = req.params;
      const { publish } = req.body;
      await this.quizService.publishQuiz(quizId, publish);
      res.status(200).json({ message: publish ? 'Quiz published' : 'Quiz unpublished' });
    } catch (error) {
      next(error);
    }
  }

  private async getQuizAttempts(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { quizId } = req.params;
      const attempts = await this.quizService.getQuizAttempts(quizId);
      res.status(200).json({ attempts });
    } catch (error) {
      next(error);
    }
  }

  private async generateQuiz(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const creatorId = req.user!.userId;
      const orgId = req.organizationId || null;
      const studentId = req.user!.userId;
      const quiz = await this.quizService.generateQuiz(creatorId, orgId, req.body, studentId);
      res.status(201).json(quiz);
    } catch (error) {
      next(error);
    }
  }
}
