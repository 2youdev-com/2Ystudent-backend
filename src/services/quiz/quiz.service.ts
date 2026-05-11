import { PrismaClient } from '@prisma/client';
import { injectable, inject } from 'tsyringe';
import {
  IQuizService,
  QuizDetail,
  QuizListItem,
  QuestionDetail,
  OptionDetail,
  QuizAttemptResult,
  ResponseResult,
  TraineeAttemptHistoryItem,
  AdminAttemptItem,
} from '../interfaces/quiz.interface';
import { IQuizRepository, QuizWithQuestions, QuizWithCount } from '../../repositories/interfaces/quiz.repository.interface';
import { ICourseRepository } from '../../repositories/interfaces/course.repository.interface';
import { CreateQuizInput, UpdateQuizInput, SubmitResponseInput, GenerateQuizInput } from '../../dtos/validation/quiz.validation';
import { NotFoundError } from '../../middleware/error-handler.middleware';
import { ILLMProvider } from '../../providers/llm/llm-provider.interface';
import { BrainService } from '../brain/brain.service';

const prisma = new PrismaClient();

@injectable()
export class QuizService implements IQuizService {
  constructor(
    @inject('QuizRepository') private quizRepository: IQuizRepository,
    @inject('LLMProvider') private llmProvider: ILLMProvider,
    @inject(BrainService) private brainService: BrainService,
    @inject('CourseRepository') private courseRepository: ICourseRepository
  ) {}

  // ==========================================
  // Quiz Management (Admin/Trainer)
  // ==========================================

  async createQuiz(creatorId: string, orgId: string | null, data: CreateQuizInput): Promise<QuizDetail> {
    // Create the quiz record
    const quiz = await this.quizRepository.create({
      createdById: creatorId,
      organizationId: orgId,
      courseId: data.courseId || null,
      title: data.title,
      titleAr: data.titleAr,
      description: data.description,
      descriptionAr: data.descriptionAr,
      quizType: 'manual',
      difficulty: data.difficulty,
      timeLimit: data.timeLimit || null,
      passingScore: data.passingScore,
      shuffleQuestions: data.shuffleQuestions,
      showCorrectAnswers: data.showCorrectAnswers,
      maxAttempts: data.maxAttempts || null,
    });

    // Create questions and options
    for (const qInput of data.questions) {
      const question = await this.quizRepository.createQuestion({
        quizId: quiz.id,
        questionText: qInput.questionText,
        questionTextAr: qInput.questionTextAr,
        questionType: qInput.questionType,
        explanation: qInput.explanation,
        explanationAr: qInput.explanationAr,
        points: qInput.points,
        orderInQuiz: qInput.orderInQuiz,
      });

      for (const oInput of qInput.options) {
        await this.quizRepository.createOption({
          questionId: question.id,
          optionText: oInput.optionText,
          optionTextAr: oInput.optionTextAr,
          isCorrect: oInput.isCorrect,
          orderInQuestion: oInput.orderInQuestion,
        });
      }
    }

    // Fetch and return complete quiz
    return this.getQuizForAdmin(quiz.id);
  }

  async updateQuiz(quizId: string, data: UpdateQuizInput): Promise<QuizDetail> {
    const existing = await this.quizRepository.findById(quizId);
    if (!existing) throw new NotFoundError('Quiz not found');

    // Update quiz metadata
    await this.quizRepository.update(quizId, {
      title: data.title ?? existing.title,
      titleAr: data.titleAr !== undefined ? data.titleAr : existing.titleAr,
      description: data.description ?? existing.description,
      descriptionAr: data.descriptionAr !== undefined ? data.descriptionAr : existing.descriptionAr,
      courseId: data.courseId !== undefined ? data.courseId : existing.courseId,
      difficulty: data.difficulty ?? existing.difficulty,
      timeLimit: data.timeLimit !== undefined ? data.timeLimit : existing.timeLimit,
      passingScore: data.passingScore ?? existing.passingScore,
      shuffleQuestions: data.shuffleQuestions ?? existing.shuffleQuestions,
      showCorrectAnswers: data.showCorrectAnswers ?? existing.showCorrectAnswers,
      maxAttempts: data.maxAttempts !== undefined ? data.maxAttempts : existing.maxAttempts,
    });

    // If questions provided, replace all
    if (data.questions) {
      await this.quizRepository.deleteQuestionsByQuiz(quizId);
      for (const qInput of data.questions) {
        const question = await this.quizRepository.createQuestion({
          quizId,
          questionText: qInput.questionText,
          questionTextAr: qInput.questionTextAr,
          questionType: qInput.questionType,
          explanation: qInput.explanation,
          explanationAr: qInput.explanationAr,
          points: qInput.points,
          orderInQuiz: qInput.orderInQuiz,
        });

        for (const oInput of qInput.options) {
          await this.quizRepository.createOption({
            questionId: question.id,
            optionText: oInput.optionText,
            optionTextAr: oInput.optionTextAr,
            isCorrect: oInput.isCorrect,
            orderInQuestion: oInput.orderInQuestion,
          });
        }
      }
    }

    return this.getQuizForAdmin(quizId);
  }

  async deleteQuiz(quizId: string, userId: string, userRole: string): Promise<void> {
    const existing = await this.quizRepository.findById(quizId);
    if (!existing) throw new NotFoundError('Quiz not found');

    // Students can only delete their own AI-generated quizzes
    if (userRole === 'student') {
      if (existing.quizType !== 'ai_generated' || existing.createdById !== userId) {
        throw new Error('You can only delete your own AI-generated quizzes');
      }
    }

    await this.quizRepository.delete(quizId);
  }

  async publishQuiz(quizId: string, publish: boolean): Promise<void> {
    const existing = await this.quizRepository.findById(quizId);
    if (!existing) throw new NotFoundError('Quiz not found');

    if (publish) {
      // Validate quiz has at least 1 question with correct answer
      const full = await this.quizRepository.findByIdWithQuestions(quizId);
      if (!full || full.questions.length === 0) {
        throw new Error('Cannot publish quiz with no questions');
      }
      for (const q of full.questions) {
        const hasCorrect = q.options.some(o => o.isCorrect);
        if (!hasCorrect) {
          throw new Error(`Question "${q.questionText}" has no correct answer marked`);
        }
      }
    }

    await this.quizRepository.update(quizId, { isPublished: publish } as any);
  }

  async getQuizForAdmin(quizId: string): Promise<QuizDetail> {
    const quiz = await this.quizRepository.findByIdWithQuestions(quizId);
    if (!quiz) throw new NotFoundError('Quiz not found');
    return this.mapQuizToDetail(quiz, true);
  }

  async listQuizzesForAdmin(orgId: string | null, userId: string, userRole: string): Promise<QuizListItem[]> {
    let quizzes: QuizWithCount[];

    if (orgId) {
      quizzes = await this.quizRepository.findByOrganization(orgId);
    } else {
      quizzes = await this.quizRepository.findByCreator(userId);
    }

    return quizzes.map(q => this.mapQuizToListItem(q));
  }

  async getQuizAttempts(quizId: string): Promise<AdminAttemptItem[]> {
    const attempts = await this.quizRepository.findAttemptsByQuiz(quizId);
    return attempts.map(a => ({
      attemptId: a.id,
      traineeFirstName: a.trainee.firstName,
      traineeLastName: a.trainee.lastName,
      traineeEmail: a.trainee.email,
      score: a.score,
      passed: a.passed,
      status: a.status,
      startedAt: a.startedAt,
      completedAt: a.completedAt,
      timeSpentSeconds: a.timeSpentSeconds,
    }));
  }

  // ==========================================
  // Quiz Taking (Trainee)
  // ==========================================

  async getAvailableQuizzes(courseId?: string, traineeId?: string): Promise<QuizListItem[]> {
    // If trainee, only show quizzes assigned to their groups
    if (traineeId) {
      const assignedQuizIds = await prisma.groupQuiz.findMany({
        where: {
          group: {
            members: {
              some: { traineeId, isActive: true },
            },
          },
        },
        select: { quizId: true },
        distinct: ['quizId'],
      });

      if (assignedQuizIds.length === 0) return [];

      const quizIds = assignedQuizIds.map((a) => a.quizId);
      const quizzes = await prisma.quiz.findMany({
        where: {
          id: { in: quizIds },
          isPublished: true,
          ...(courseId ? { courseId } : {}),
        },
        include: {
          _count: { select: { questions: true, attempts: true } },
        },
        orderBy: { createdAt: 'desc' },
      });

      return quizzes.map((q) => this.mapQuizToListItem(q as QuizWithCount));
    }

    // Admin/supervisor: show all published quizzes
    const quizzes = await this.quizRepository.findPublished(courseId);
    return quizzes.map(q => this.mapQuizToListItem(q));
  }

  async getQuizForTaking(quizId: string, traineeId: string): Promise<QuizDetail> {
    const quiz = await this.quizRepository.findByIdWithQuestions(quizId);
    if (!quiz) throw new NotFoundError('Quiz not found');
    if (!quiz.isPublished) throw new Error('Quiz is not available');

    // Strip correct answers for trainee view
    return this.mapQuizToDetail(quiz, false);
  }

  async startAttempt(traineeId: string, quizId: string): Promise<{ attemptId: string }> {
    const quiz = await this.quizRepository.findById(quizId);
    if (!quiz) throw new NotFoundError('Quiz not found');
    if (!quiz.isPublished) throw new Error('Quiz is not available');

    // Resume existing in_progress attempt instead of creating a duplicate
    const existing = await this.quizRepository.findInProgressAttempt(traineeId, quizId);
    if (existing) {
      return { attemptId: existing.id };
    }

    // Check max attempts
    if (quiz.maxAttempts) {
      const count = await this.quizRepository.countAttemptsByTraineeAndQuiz(traineeId, quizId);
      if (count >= quiz.maxAttempts) {
        throw new Error(`Maximum attempts (${quiz.maxAttempts}) reached for this quiz`);
      }
    }

    const attempt = await this.quizRepository.createAttempt({ quizId, traineeId });
    return { attemptId: attempt.id };
  }

  async submitAttempt(
    attemptId: string,
    traineeId: string,
    responses: SubmitResponseInput[]
  ): Promise<QuizAttemptResult> {
    // Validate attempt ownership
    const attempt = await this.quizRepository.findAttemptById(attemptId);
    if (!attempt) throw new NotFoundError('Attempt not found');
    if (attempt.traineeId !== traineeId) throw new Error('Unauthorized');
    if (attempt.status === 'completed') throw new Error('Attempt already completed');

    // Get full quiz with answers
    const quiz = await this.quizRepository.findByIdWithQuestions(attempt.quizId);
    if (!quiz) throw new NotFoundError('Quiz not found');

    // Build answer map: questionId -> correct optionId
    const questionMap = new Map(
      quiz.questions.map(q => [q.id, q])
    );

    // Score each response
    let totalPoints = 0;
    let earnedPoints = 0;
    const responseData: { attemptId: string; questionId: string; selectedOptionId: string | null; isCorrect: boolean }[] = [];

    for (const q of quiz.questions) {
      totalPoints += q.points;
    }

    for (const resp of responses) {
      const question = questionMap.get(resp.questionId);
      if (!question) continue;

      const correctOption = question.options.find(o => o.isCorrect);
      const isCorrect = resp.selectedOptionId != null && resp.selectedOptionId === correctOption?.id;

      if (isCorrect) {
        earnedPoints += question.points;
      }

      responseData.push({
        attemptId,
        questionId: resp.questionId,
        selectedOptionId: resp.selectedOptionId || null,
        isCorrect,
      });
    }

    // Save responses
    await this.quizRepository.createManyResponses(responseData);

    // Calculate score
    const score = totalPoints > 0 ? Math.round((earnedPoints / totalPoints) * 100) : 0;
    const passed = score >= quiz.passingScore;
    const timeSpentSeconds = Math.floor((Date.now() - attempt.startedAt.getTime()) / 1000);

    // Update attempt
    await this.quizRepository.updateAttempt(attemptId, {
      status: 'completed',
      completedAt: new Date(),
      score,
      totalPoints,
      earnedPoints,
      passed,
      timeSpentSeconds,
    } as any);

    // Build result
    return this.buildAttemptResult(attemptId, quiz, responseData, score, totalPoints, earnedPoints, passed, timeSpentSeconds);
  }

  async getAttemptResult(attemptId: string, traineeId: string): Promise<QuizAttemptResult> {
    const attempt = await this.quizRepository.findAttemptById(attemptId);
    if (!attempt) throw new NotFoundError('Attempt not found');
    if (attempt.traineeId !== traineeId) throw new Error('Unauthorized');
    if (attempt.status !== 'completed') throw new Error('Attempt not completed yet');

    const quiz = await this.quizRepository.findByIdWithQuestions(attempt.quizId);
    if (!quiz) throw new NotFoundError('Quiz not found');

    const responses = await this.quizRepository.findResponsesByAttempt(attemptId);

    const responseResults: ResponseResult[] = responses.map(r => {
      const correctOption = r.question.options.find(o => o.isCorrect);
      return {
        questionId: r.questionId,
        questionText: r.question.questionText,
        questionTextAr: r.question.questionTextAr,
        selectedOptionId: r.selectedOptionId,
        correctOptionId: correctOption?.id || '',
        isCorrect: r.isCorrect,
        explanation: r.question.explanation,
        explanationAr: r.question.explanationAr,
        points: r.question.points,
        earnedPoints: r.isCorrect ? r.question.points : 0,
      };
    });

    return {
      attemptId: attempt.id,
      quizId: attempt.quizId,
      quizTitle: quiz.title,
      score: attempt.score || 0,
      totalPoints: attempt.totalPoints || 0,
      earnedPoints: attempt.earnedPoints || 0,
      passed: attempt.passed || false,
      timeSpentSeconds: attempt.timeSpentSeconds || 0,
      showCorrectAnswers: quiz.showCorrectAnswers,
      responses: responseResults,
    };
  }

  async getStudentHistory(traineeId: string): Promise<TraineeAttemptHistoryItem[]> {
    const attempts = await this.quizRepository.findAttemptsByStudent(traineeId);
    return attempts.map(a => ({
      attemptId: a.id,
      quizId: a.quizId,
      quizTitle: a.quiz.title,
      quizTitleAr: a.quiz.titleAr,
      score: a.score,
      passed: a.passed,
      passingScore: a.quiz.passingScore,
      status: a.status,
      startedAt: a.startedAt,
      completedAt: a.completedAt,
      timeSpentSeconds: a.timeSpentSeconds,
    }));
  }

  // ==========================================
  // AI Generation
  // ==========================================

  async generateQuiz(creatorId: string, orgId: string | null, input: GenerateQuizInput, traineeId: string): Promise<QuizDetail> {
    const mode = input.mode || 'auto';
    const numQuestions = input.numberOfQuestions || 5;
    const difficulty = input.difficulty || 'medium';
    const questionTypes = input.questionTypes || ['multiple_choice'];

    // Resolve course name early so fallback can use it too
    let resolvedTopic = input.topic || 'General Engineering';
    if (mode === 'course' && input.courseId) {
      try {
        const course = await this.courseRepository.findById(input.courseId);
        if (course) resolvedTopic = course.titleAr || course.title || resolvedTopic;
      } catch { /* keep default */ }
    }

    try {
      // Step 1: Gather context from Brain + Courses
      const context = await this.gatherQuizContext(traineeId, orgId, mode, input.courseId);

      // Step 2: Generate questions with LLM (use context if available, otherwise topic-only)
      let aiQuestions: CreateQuizInput['questions'] = [];
      if (context.length > 0) {
        aiQuestions = await this.generateQuestionsWithLLM(context, numQuestions, difficulty, questionTypes);
      } else {
        // No context available — generate using topic name only
        console.log(`[QuizService] No context found, generating from topic: ${resolvedTopic}`);
        const topicContext = [{
          courseName: resolvedTopic,
          content: `Topic: ${resolvedTopic}\nGenerate diverse engineering questions about this topic. Cover different sub-topics and aspects. Make each question unique and educational.`,
        }];
        aiQuestions = await this.generateQuestionsWithLLM(topicContext, numQuestions, difficulty, questionTypes);
      }

      if (aiQuestions.length > 0) {
        // Build quiz title from context
        const topicLabel = mode === 'course' && input.courseId
          ? (context[0]?.courseName || resolvedTopic)
          : resolvedTopic;

        const quizData: CreateQuizInput = {
          title: `AI: ${topicLabel}`,
          titleAr: `اختبار ذكي: ${topicLabel}`,
          description: `AI-generated quiz based on your learning progress`,
          descriptionAr: `اختبار ذكي مبني على تقدمك في التعلم`,
          courseId: input.courseId || null,
          difficulty,
          passingScore: 70,
          shuffleQuestions: true,
          showCorrectAnswers: true,
          questions: aiQuestions,
        };

        // Preview mode: return generated data without saving to DB (for admin form pre-fill)
        if (input.preview) {
          return this.buildPreviewQuizDetail(quizData);
        }

        const quiz = await this.createQuiz(creatorId, orgId, quizData);

        // Mark as AI generated AND auto-publish
        await this.quizRepository.update(quiz.id, {
          quizType: 'ai_generated',
          isPublished: true,
        } as any);

        return { ...quiz, quizType: 'ai_generated', isPublished: true };
      }
    } catch (error) {
      console.warn('[QuizService] AI generation failed, falling back to sample questions:', error);
    }

    // Fallback: use sample questions with resolved course name
    const topic = resolvedTopic;
    const sampleQuestions = this.generateSampleQuestions(topic, numQuestions, difficulty);

    const quizData: CreateQuizInput = {
      title: `AI Generated: ${topic}`,
      titleAr: `إنشاء تلقائي: ${topic}`,
      description: `Auto-generated quiz about ${topic}`,
      descriptionAr: `اختبار تلقائي حول ${topic}`,
      courseId: input.courseId || null,
      difficulty,
      passingScore: 70,
      shuffleQuestions: true,
      showCorrectAnswers: true,
      questions: sampleQuestions,
    };

    // Preview mode: return generated data without saving to DB (for admin form pre-fill)
    if (input.preview) {
      return this.buildPreviewQuizDetail(quizData);
    }

    const quiz = await this.createQuiz(creatorId, orgId, quizData);

    await this.quizRepository.update(quiz.id, {
      quizType: 'ai_generated',
      isPublished: true,
    } as any);

    return { ...quiz, quizType: 'ai_generated', isPublished: true };
  }

  // ==========================================
  // AI Context Gathering
  // ==========================================

  private async gatherQuizContext(
    traineeId: string,
    orgId: string | null,
    mode: string,
    courseId?: string
  ): Promise<{ courseName: string; content: string }[]> {
    const contextParts: { courseName: string; content: string }[] = [];

    try {
      if (mode === 'course' && courseId) {
        // Mode: course — get specific course lectures + Brain RAG
        const course = await this.courseRepository.findByIdWithLectures(courseId);
        if (course) {
          const completedIds = await this.courseRepository.getTraineeCompletedLectures(traineeId, courseId);
          const completedLectures = course.lectures.filter(l => completedIds.includes(l.id));
          const lecturesToUse = completedLectures.length > 0 ? completedLectures : course.lectures;

          const lectureContent = lecturesToUse.map(l =>
            `- ${l.titleAr || l.title}: ${l.descriptionAr || l.description}`
          ).join('\n');

          contextParts.push({
            courseName: course.titleAr || course.title,
            content: `Course: ${course.titleAr || course.title}\nDescription: ${course.descriptionAr || course.description}\n\nLectures:\n${lectureContent}`,
          });

          // Also query Brain for relevant content
          if (orgId) {
            try {
              const brainQuery = course.titleAr || course.title;
              const brainResults = await this.brainService.queryBrain({
                query: brainQuery,
                organizationId: orgId,
                topK: 5,
                scoreThreshold: 0.3,
              });

              if (brainResults.results.length > 0) {
                const brainContent = brainResults.results.map(r => r.content).join('\n\n');
                contextParts.push({
                  courseName: course.titleAr || course.title,
                  content: `Knowledge Base Content:\n${brainContent}`,
                });
              }
            } catch (brainError) {
              console.warn('[QuizService] Brain query failed for course mode:', brainError);
            }
          }
        }
      } else {
        // Mode: auto — gather from all courses with progress + Brain
        const allCourses = await this.courseRepository.findAll();

        for (const course of allCourses) {
          const completedIds = await this.courseRepository.getTraineeCompletedLectures(traineeId, course.id);
          if (completedIds.length === 0) continue;

          const courseWithLectures = await this.courseRepository.findByIdWithLectures(course.id);
          if (!courseWithLectures) continue;

          const completedLectures = courseWithLectures.lectures.filter(l => completedIds.includes(l.id));
          const lectureContent = completedLectures.map(l =>
            `- ${l.titleAr || l.title}: ${l.descriptionAr || l.description}`
          ).join('\n');

          contextParts.push({
            courseName: course.titleAr || course.title,
            content: `Course: ${course.titleAr || course.title}\nCompleted Lectures:\n${lectureContent}`,
          });
        }

        // Query Brain with general engineering topic
        if (orgId) {
          try {
            const brainResults = await this.brainService.queryBrain({
              query: 'الهندسة الكهروميكانيكية التدريب المهني',
              organizationId: orgId,
              topK: 5,
              scoreThreshold: 0.3,
            });

            if (brainResults.results.length > 0) {
              const brainContent = brainResults.results.map(r => r.content).join('\n\n');
              contextParts.push({
                courseName: 'Knowledge Base',
                content: `Knowledge Base Content:\n${brainContent}`,
              });
            }
          } catch (brainError) {
            console.warn('[QuizService] Brain query failed for auto mode:', brainError);
          }
        }
      }
    } catch (error) {
      console.warn('[QuizService] Error gathering quiz context:', error);
    }

    return contextParts;
  }

  // ==========================================
  // LLM Question Generation
  // ==========================================

  private async generateQuestionsWithLLM(
    context: { courseName: string; content: string }[],
    numQuestions: number,
    difficulty: string,
    questionTypes: string[]
  ): Promise<CreateQuizInput['questions']> {
    const contextText = context.map(c => c.content).join('\n\n---\n\n');

    const typesInstruction = questionTypes.includes('true_false')
      ? 'Mix of multiple choice (4 options) and true/false questions.'
      : 'All questions should be multiple choice with exactly 4 options.';

    const systemPrompt = `You are an expert quiz generator for an electromechanical engineering training platform.
Generate bilingual (Arabic + English) quiz questions based on the provided learning content.

RULES:
- Questions must test understanding, not memorization
- Each question MUST have Arabic (questionTextAr) and English (questionText) versions
- Each option MUST have Arabic (optionTextAr) and English (optionText) versions
- Each explanation MUST have Arabic (explanationAr) and English (explanation) versions
- Focus on practical electromechanical engineering knowledge
- ${typesInstruction}
- Difficulty level: ${difficulty}
- Exactly ONE option per question must be marked isCorrect: true
- For true/false questions, provide exactly 2 options: True/صح and False/خطأ

Respond with valid JSON only, no markdown. Format:
{
  "questions": [
    {
      "questionText": "English question?",
      "questionTextAr": "السؤال بالعربي؟",
      "questionType": "multiple_choice",
      "explanation": "English explanation",
      "explanationAr": "الشرح بالعربي",
      "options": [
        { "optionText": "Option A", "optionTextAr": "الخيار أ", "isCorrect": true },
        { "optionText": "Option B", "optionTextAr": "الخيار ب", "isCorrect": false },
        { "optionText": "Option C", "optionTextAr": "الخيار ج", "isCorrect": false },
        { "optionText": "Option D", "optionTextAr": "الخيار د", "isCorrect": false }
      ]
    }
  ]
}`;

    const randomSeed = Math.floor(Math.random() * 10000);
    const prompt = `Based on the following learning content, generate exactly ${numQuestions} quiz questions.
IMPORTANT: Generate completely NEW and UNIQUE questions each time. Variation seed: ${randomSeed}

${contextText}

Generate ${numQuestions} bilingual questions as JSON.`;

    const response = await this.llmProvider.complete({
      prompt,
      systemPrompt,
      maxTokens: 4000,
      temperature: 0.9,
      responseFormat: 'json',
    });

    return this.parseLLMQuizResponse(response, numQuestions);
  }

  private parseLLMQuizResponse(response: string, expectedCount: number): CreateQuizInput['questions'] {
    try {
      // Clean potential markdown wrapper
      let cleaned = response.trim();
      if (cleaned.startsWith('```')) {
        cleaned = cleaned.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
      }

      const parsed = JSON.parse(cleaned);
      const questions = parsed.questions || parsed;

      if (!Array.isArray(questions) || questions.length === 0) {
        throw new Error('No questions array in LLM response');
      }

      return questions.slice(0, expectedCount).map((q: any, index: number) => {
        // Validate and sanitize each question
        const options = (q.options || []).map((o: any, oIndex: number) => ({
          optionText: o.optionText || o.text || `Option ${oIndex + 1}`,
          optionTextAr: o.optionTextAr || o.textAr || null,
          isCorrect: !!o.isCorrect,
          orderInQuestion: oIndex,
        }));

        // Ensure exactly one correct answer
        const hasCorrect = options.some((o: any) => o.isCorrect);
        if (!hasCorrect && options.length > 0) {
          options[0].isCorrect = true;
        }

        const questionType = q.questionType === 'true_false' || options.length === 2
          ? 'true_false' as const
          : 'multiple_choice' as const;

        return {
          questionText: q.questionText || `Question ${index + 1}`,
          questionTextAr: q.questionTextAr || null,
          questionType,
          explanation: q.explanation || null,
          explanationAr: q.explanationAr || null,
          points: 1,
          orderInQuiz: index,
          options,
        };
      });
    } catch (error) {
      console.error('[QuizService] Failed to parse LLM quiz response:', error);
      throw new Error('Failed to parse AI-generated quiz questions');
    }
  }

  // ==========================================
  // Private Helpers
  // ==========================================

  private mapQuizToDetail(quiz: QuizWithQuestions, includeCorrectAnswers: boolean): QuizDetail {
    return {
      id: quiz.id,
      title: quiz.title,
      titleAr: quiz.titleAr,
      description: quiz.description,
      descriptionAr: quiz.descriptionAr,
      courseId: quiz.courseId,
      difficulty: quiz.difficulty,
      quizType: quiz.quizType,
      timeLimit: quiz.timeLimit,
      passingScore: quiz.passingScore,
      isPublished: quiz.isPublished,
      shuffleQuestions: quiz.shuffleQuestions,
      showCorrectAnswers: quiz.showCorrectAnswers,
      maxAttempts: quiz.maxAttempts,
      createdAt: quiz.createdAt,
      questions: quiz.questions.map(q => ({
        id: q.id,
        questionText: q.questionText,
        questionTextAr: q.questionTextAr,
        questionType: q.questionType,
        explanation: includeCorrectAnswers ? q.explanation : null,
        explanationAr: includeCorrectAnswers ? q.explanationAr : null,
        points: q.points,
        orderInQuiz: q.orderInQuiz,
        options: q.options.map(o => ({
          id: o.id,
          optionText: o.optionText,
          optionTextAr: o.optionTextAr,
          isCorrect: includeCorrectAnswers ? o.isCorrect : false,
          orderInQuestion: o.orderInQuestion,
        })),
      })),
    };
  }

  private mapQuizToListItem(quiz: QuizWithCount): QuizListItem {
    return {
      id: quiz.id,
      title: quiz.title,
      titleAr: quiz.titleAr,
      description: quiz.description,
      descriptionAr: quiz.descriptionAr,
      courseId: quiz.courseId,
      difficulty: quiz.difficulty,
      questionCount: quiz._count.questions,
      attemptCount: quiz._count.attempts,
      timeLimit: quiz.timeLimit,
      passingScore: quiz.passingScore,
      isPublished: quiz.isPublished,
      maxAttempts: quiz.maxAttempts,
      quizType: quiz.quizType,
      createdById: quiz.createdById,
      createdAt: quiz.createdAt,
    };
  }

  private buildAttemptResult(
    attemptId: string,
    quiz: QuizWithQuestions,
    responseData: { questionId: string; selectedOptionId: string | null; isCorrect: boolean }[],
    score: number,
    totalPoints: number,
    earnedPoints: number,
    passed: boolean,
    timeSpentSeconds: number
  ): QuizAttemptResult {
    const responseMap = new Map(responseData.map(r => [r.questionId, r]));

    const responses: ResponseResult[] = quiz.questions.map(q => {
      const resp = responseMap.get(q.id);
      const correctOption = q.options.find(o => o.isCorrect);
      return {
        questionId: q.id,
        questionText: q.questionText,
        questionTextAr: q.questionTextAr,
        selectedOptionId: resp?.selectedOptionId || null,
        correctOptionId: correctOption?.id || '',
        isCorrect: resp?.isCorrect || false,
        explanation: q.explanation,
        explanationAr: q.explanationAr,
        points: q.points,
        earnedPoints: resp?.isCorrect ? q.points : 0,
      };
    });

    return {
      attemptId,
      quizId: quiz.id,
      quizTitle: quiz.title,
      score,
      totalPoints,
      earnedPoints,
      passed,
      timeSpentSeconds,
      showCorrectAnswers: quiz.showCorrectAnswers,
      responses,
    };
  }

  private buildPreviewQuizDetail(data: CreateQuizInput): QuizDetail {
    return {
      id: 'preview',
      title: data.title,
      titleAr: data.titleAr || null,
      description: data.description,
      descriptionAr: data.descriptionAr || null,
      courseId: data.courseId || null,
      difficulty: data.difficulty,
      quizType: 'ai_generated',
      timeLimit: data.timeLimit || null,
      passingScore: data.passingScore,
      isPublished: false,
      shuffleQuestions: data.shuffleQuestions ?? true,
      showCorrectAnswers: data.showCorrectAnswers ?? true,
      maxAttempts: data.maxAttempts || null,
      createdAt: new Date(),
      questions: data.questions.map((q, qIdx) => ({
        id: `preview-q-${qIdx}`,
        questionText: q.questionText,
        questionTextAr: q.questionTextAr || null,
        questionType: q.questionType,
        explanation: q.explanation || null,
        explanationAr: q.explanationAr || null,
        points: q.points,
        orderInQuiz: q.orderInQuiz,
        options: q.options.map((o, oIdx) => ({
          id: `preview-o-${qIdx}-${oIdx}`,
          optionText: o.optionText,
          optionTextAr: o.optionTextAr || null,
          isCorrect: o.isCorrect,
          orderInQuestion: o.orderInQuestion,
        })),
      })),
    };
  }

  private generateSampleQuestions(topic: string, count: number, difficulty: string) {
    // Sample engineering questions for mock generation
    const samplePool = [
      {
        questionText: 'What is the most important factor when sizing an HVAC system?',
        questionTextAr: 'ما هو العامل الأهم عند تحديد حجم نظام التكييف؟',
        explanation: 'Heat load calculation is the most reliable method for proper HVAC sizing.',
        explanationAr: 'حساب الحمل الحراري هو الأسلوب الأكثر موثوقية لتحديد حجم نظام التكييف.',
        options: [
          { optionText: 'Heat load calculation', optionTextAr: 'حساب الحمل الحراري', isCorrect: true },
          { optionText: 'Building size only', optionTextAr: 'حجم المبنى فقط', isCorrect: false },
          { optionText: 'Equipment brand preference', optionTextAr: 'تفضيل ماركة المعدات', isCorrect: false },
          { optionText: 'Budget constraints', optionTextAr: 'القيود المالية', isCorrect: false },
        ],
      },
      {
        questionText: 'A buyer expresses concern about the price. What is the best approach?',
        questionTextAr: 'يعبر العميل عن قلقه بشأن التكلفة. ما هو أفضل نهج؟',
        explanation: 'Acknowledge concerns and justify value with data.',
        explanationAr: 'اعترف بالمخاوف وبرر القيمة بالبيانات.',
        options: [
          { optionText: 'Immediately offer a discount', optionTextAr: 'تقديم خصم فوري', isCorrect: false },
          { optionText: 'Acknowledge and justify with comparable data', optionTextAr: 'الاعتراف والتبرير ببيانات مقارنة', isCorrect: true },
          { optionText: 'Ignore the concern', optionTextAr: 'تجاهل القلق', isCorrect: false },
          { optionText: 'Pressure to decide quickly', optionTextAr: 'الضغط لاتخاذ قرار سريع', isCorrect: false },
        ],
      },
      {
        questionText: 'What is the purpose of preventive maintenance in electromechanical systems?',
        questionTextAr: 'ما هو الغرض من الصيانة الوقائية في الأنظمة الكهروميكانيكية؟',
        explanation: 'Preventive maintenance identifies potential failures before they cause system downtime.',
        explanationAr: 'الصيانة الوقائية تحدد الأعطال المحتملة قبل أن تسبب توقف النظام.',
        options: [
          { optionText: 'To identify potential failures before downtime', optionTextAr: 'لتحديد الأعطال المحتملة قبل التوقف', isCorrect: true },
          { optionText: 'To determine equipment value', optionTextAr: 'لتحديد قيمة المعدات', isCorrect: false },
          { optionText: 'To satisfy legal requirements only', optionTextAr: 'لتلبية المتطلبات القانونية فقط', isCorrect: false },
          { optionText: 'To reduce equipment purchase costs', optionTextAr: 'لتقليل تكاليف شراء المعدات', isCorrect: false },
        ],
      },
      {
        questionText: 'Which document certifies electrical installation safety?',
        questionTextAr: 'أي وثيقة تُصادق على سلامة التركيبات الكهربائية؟',
        explanation: 'An electrical safety certificate confirms installations meet safety standards.',
        explanationAr: 'شهادة السلامة الكهربائية تؤكد أن التركيبات تلبي معايير السلامة.',
        options: [
          { optionText: 'Purchase agreement', optionTextAr: 'اتفاقية الشراء', isCorrect: false },
          { optionText: 'Electrical safety certificate', optionTextAr: 'شهادة السلامة الكهربائية', isCorrect: true },
          { optionText: 'Warranty document', optionTextAr: 'وثيقة الضمان', isCorrect: false },
          { optionText: 'Insurance policy', optionTextAr: 'وثيقة التأمين', isCorrect: false },
        ],
      },
      {
        questionText: 'What is the first step in a client meeting?',
        questionTextAr: 'ما هي الخطوة الأولى في اجتماع العميل؟',
        explanation: 'Building rapport establishes trust before discussing business.',
        explanationAr: 'بناء العلاقة يؤسس الثقة قبل مناقشة الأعمال.',
        options: [
          { optionText: 'Present technical specifications', optionTextAr: 'عرض المواصفات الفنية', isCorrect: false },
          { optionText: 'Discuss pricing', optionTextAr: 'مناقشة التسعير', isCorrect: false },
          { optionText: 'Build rapport and understand needs', optionTextAr: 'بناء العلاقة وفهم الاحتياجات', isCorrect: true },
          { optionText: 'Sign paperwork', optionTextAr: 'توقيع الأوراق', isCorrect: false },
        ],
      },
      {
        questionText: 'True or False: An electromechanical engineer must always disclose known system defects.',
        questionTextAr: 'صح أم خطأ: يجب على المهندس الكهروميكانيكي الإفصاح دائمًا عن العيوب المعروفة في الأنظمة.',
        explanation: 'Disclosure of known defects is a legal requirement in most jurisdictions.',
        explanationAr: 'الإفصاح عن العيوب المعروفة هو متطلب قانوني في معظم الولايات القضائية.',
        options: [
          { optionText: 'True', optionTextAr: 'صح', isCorrect: true },
          { optionText: 'False', optionTextAr: 'خطأ', isCorrect: false },
        ],
      },
      {
        questionText: 'What is "ROI" in engineering project investment?',
        questionTextAr: 'ما هو "العائد على الاستثمار" في المشاريع الهندسية؟',
        explanation: 'ROI measures the profitability of an investment relative to its cost.',
        explanationAr: 'العائد على الاستثمار يقيس ربحية الاستثمار بالنسبة لتكلفته.',
        options: [
          { optionText: 'Return on Investment', optionTextAr: 'العائد على الاستثمار', isCorrect: true },
          { optionText: 'Rate of Interest', optionTextAr: 'معدل الفائدة', isCorrect: false },
          { optionText: 'Rental Operating Income', optionTextAr: 'دخل التشغيل الإيجاري', isCorrect: false },
          { optionText: 'Real Owner Interest', optionTextAr: 'فائدة المالك الحقيقي', isCorrect: false },
        ],
      },
    ];

    // Shuffle the pool to avoid returning the same questions every time
    const shuffled = [...samplePool].sort(() => Math.random() - 0.5);
    const selected = shuffled.slice(0, Math.min(count, shuffled.length));

    return selected.map((q, index) => ({
      questionText: q.questionText,
      questionTextAr: q.questionTextAr,
      questionType: q.options.length === 2 ? 'true_false' as const : 'multiple_choice' as const,
      explanation: q.explanation,
      explanationAr: q.explanationAr,
      points: 1,
      orderInQuiz: index,
      options: q.options.map((o, oIndex) => ({
        optionText: o.optionText,
        optionTextAr: o.optionTextAr,
        isCorrect: o.isCorrect,
        orderInQuestion: oIndex,
      })),
    }));
  }
}
