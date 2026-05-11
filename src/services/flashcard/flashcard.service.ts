import { injectable, inject } from 'tsyringe';
import {
  IFlashcardService,
  DeckDetail,
  DeckListItem,
  DeckListItemWithProgress,
  CardDetail,
  StudyCard,
  ReviewResult,
  FlashcardProgress,
} from '../interfaces/flashcard.interface';
import {
  IFlashcardRepository,
  DeckWithCards,
  DeckWithCount,
} from '../../repositories/interfaces/flashcard.repository.interface';
import {
  CreateDeckInput,
  UpdateDeckInput,
  CreateCardInput,
  UpdateCardInput,
  GenerateDeckInput,
} from '../../dtos/validation/flashcard.validation';
import { ILLMProvider } from '../../providers/llm/llm-provider.interface';
import { ICourseRepository } from '../../repositories/interfaces/course.repository.interface';
import { calculateSM2, getMasteryLevel } from './sm2';

@injectable()
export class FlashcardService implements IFlashcardService {
  constructor(
    @inject('FlashcardRepository') private flashcardRepo: IFlashcardRepository,
    @inject('LLMProvider') private llmProvider: ILLMProvider,
    @inject('CourseRepository') private courseRepository: ICourseRepository
  ) {}

  // ==========================================
  // Deck Management (Admin/Trainer)
  // ==========================================

  async createDeck(creatorId: string, orgId: string | null, data: CreateDeckInput): Promise<DeckDetail> {
    // Create the deck record
    const deck = await this.flashcardRepo.createDeck({
      createdById: creatorId,
      organizationId: orgId,
      courseId: data.courseId || null,
      title: data.title,
      titleAr: data.titleAr,
      description: data.description,
      descriptionAr: data.descriptionAr,
      category: data.category,
      generationType: 'manual',
      cardCount: data.cards.length,
    });

    // Create cards
    for (const cardInput of data.cards) {
      await this.flashcardRepo.createCard({
        deckId: deck.id,
        front: cardInput.front,
        frontAr: cardInput.frontAr,
        back: cardInput.back,
        backAr: cardInput.backAr,
        hint: cardInput.hint,
        hintAr: cardInput.hintAr,
        orderInDeck: cardInput.orderInDeck,
      });
    }

    return this.getDeckForAdmin(deck.id);
  }

  async updateDeck(deckId: string, data: UpdateDeckInput): Promise<DeckDetail> {
    const existing = await this.flashcardRepo.findDeckById(deckId);
    if (!existing) throw new Error('Deck not found');

    await this.flashcardRepo.updateDeck(deckId, {
      title: data.title ?? existing.title,
      titleAr: data.titleAr !== undefined ? data.titleAr : existing.titleAr,
      description: data.description !== undefined ? data.description : existing.description,
      descriptionAr: data.descriptionAr !== undefined ? data.descriptionAr : existing.descriptionAr,
      courseId: data.courseId !== undefined ? data.courseId : existing.courseId,
      category: data.category !== undefined ? data.category : existing.category,
    });

    return this.getDeckForAdmin(deckId);
  }

  async deleteDeck(deckId: string): Promise<void> {
    const existing = await this.flashcardRepo.findDeckById(deckId);
    if (!existing) throw new Error('Deck not found');
    await this.flashcardRepo.deleteDeck(deckId);
  }

  async publishDeck(deckId: string, publish: boolean): Promise<void> {
    const existing = await this.flashcardRepo.findDeckById(deckId);
    if (!existing) throw new Error('Deck not found');

    if (publish) {
      const cardCount = await this.flashcardRepo.countCardsByDeck(deckId);
      if (cardCount === 0) {
        throw new Error('Cannot publish deck with no cards');
      }
    }

    await this.flashcardRepo.updateDeck(deckId, { isPublished: publish } as any);
  }

  async getDeckForAdmin(deckId: string): Promise<DeckDetail> {
    const deck = await this.flashcardRepo.findDeckByIdWithCards(deckId);
    if (!deck) throw new Error('Deck not found');
    return this.mapDeckToDetail(deck);
  }

  async listDecksForAdmin(orgId: string | null, userId: string, userRole: string): Promise<DeckListItem[]> {
    let decks: DeckWithCount[];

    if (orgId) {
      decks = await this.flashcardRepo.findDecksByOrganization(orgId);
    } else {
      decks = await this.flashcardRepo.findDecksByCreator(userId);
    }

    return decks.map(d => this.mapDeckToListItem(d));
  }

  // ==========================================
  // Card Management (Admin/Trainer)
  // ==========================================

  async addCardToDeck(deckId: string, data: CreateCardInput): Promise<CardDetail> {
    const deck = await this.flashcardRepo.findDeckById(deckId);
    if (!deck) throw new Error('Deck not found');

    const card = await this.flashcardRepo.createCard({
      deckId,
      front: data.front,
      frontAr: data.frontAr,
      back: data.back,
      backAr: data.backAr,
      hint: data.hint,
      hintAr: data.hintAr,
      orderInDeck: data.orderInDeck,
    });

    // Update card count
    const count = await this.flashcardRepo.countCardsByDeck(deckId);
    await this.flashcardRepo.updateDeck(deckId, { cardCount: count } as any);

    return {
      id: card.id,
      front: card.front,
      frontAr: card.frontAr,
      back: card.back,
      backAr: card.backAr,
      hint: card.hint,
      hintAr: card.hintAr,
      orderInDeck: card.orderInDeck,
    };
  }

  async updateCard(cardId: string, data: UpdateCardInput): Promise<CardDetail> {
    const existing = await this.flashcardRepo.findCardById(cardId);
    if (!existing) throw new Error('Card not found');

    const card = await this.flashcardRepo.updateCard(cardId, {
      front: data.front ?? existing.front,
      frontAr: data.frontAr !== undefined ? data.frontAr : existing.frontAr,
      back: data.back ?? existing.back,
      backAr: data.backAr !== undefined ? data.backAr : existing.backAr,
      hint: data.hint !== undefined ? data.hint : existing.hint,
      hintAr: data.hintAr !== undefined ? data.hintAr : existing.hintAr,
      orderInDeck: data.orderInDeck ?? existing.orderInDeck,
    });

    return {
      id: card.id,
      front: card.front,
      frontAr: card.frontAr,
      back: card.back,
      backAr: card.backAr,
      hint: card.hint,
      hintAr: card.hintAr,
      orderInDeck: card.orderInDeck,
    };
  }

  async deleteCard(cardId: string): Promise<void> {
    const existing = await this.flashcardRepo.findCardById(cardId);
    if (!existing) throw new Error('Card not found');

    await this.flashcardRepo.deleteCard(cardId);

    // Update card count
    const count = await this.flashcardRepo.countCardsByDeck(existing.deckId);
    await this.flashcardRepo.updateDeck(existing.deckId, { cardCount: count } as any);
  }

  // ==========================================
  // Study (Trainee)
  // ==========================================

  async getAvailableDecks(traineeId: string, courseId?: string): Promise<DeckListItemWithProgress[]> {
    const decks = await this.flashcardRepo.findPublishedDecks(courseId);

    const result: DeckListItemWithProgress[] = [];
    for (const deck of decks) {
      const progress = await this.flashcardRepo.findDeckProgress(deck.id, traineeId);
      result.push({
        ...this.mapDeckToListItem(deck),
        progress,
      });
    }

    return result;
  }

  async getStudyCards(deckId: string, traineeId: string): Promise<StudyCard[]> {
    const deck = await this.flashcardRepo.findDeckById(deckId);
    if (!deck) throw new Error('Deck not found');
    if (!deck.isPublished) throw new Error('Deck is not available');

    const dueCards = await this.flashcardRepo.findDueCards(deckId, traineeId, 20);

    return dueCards.map(card => ({
      id: card.id,
      front: card.front,
      frontAr: card.frontAr,
      back: card.back,
      backAr: card.backAr,
      hint: card.hint,
      hintAr: card.hintAr,
      proficiency: card.proficiencies.length > 0
        ? {
            easeFactor: card.proficiencies[0].easeFactor,
            interval: card.proficiencies[0].interval,
            repetitions: card.proficiencies[0].repetitions,
            quality: card.proficiencies[0].quality,
            lastReviewedAt: card.proficiencies[0].lastReviewedAt,
          }
        : null,
    }));
  }

  async submitReview(cardId: string, traineeId: string, quality: number): Promise<ReviewResult> {
    const card = await this.flashcardRepo.findCardById(cardId);
    if (!card) throw new Error('Card not found');

    // Get existing proficiency or use defaults
    const existing = await this.flashcardRepo.findProficiency(cardId, traineeId);

    const sm2Result = calculateSM2({
      quality,
      easeFactor: existing?.easeFactor ?? 2.5,
      interval: existing?.interval ?? 0,
      repetitions: existing?.repetitions ?? 0,
    });

    // Upsert proficiency
    await this.flashcardRepo.upsertProficiency({
      cardId,
      traineeId,
      easeFactor: sm2Result.easeFactor,
      interval: sm2Result.interval,
      repetitions: sm2Result.repetitions,
      quality,
      nextReviewDate: sm2Result.nextReviewDate,
      lastReviewedAt: new Date(),
    });

    return {
      cardId,
      newEaseFactor: sm2Result.easeFactor,
      newInterval: sm2Result.interval,
      newRepetitions: sm2Result.repetitions,
      nextReviewDate: sm2Result.nextReviewDate,
      masteryLevel: getMasteryLevel(sm2Result.repetitions, sm2Result.easeFactor),
    };
  }

  async getProgress(traineeId: string): Promise<FlashcardProgress> {
    return this.flashcardRepo.findTraineeProgress(traineeId);
  }

  // ==========================================
  // AI Generation
  // ==========================================

  async generateDeck(creatorId: string, orgId: string | null, input: GenerateDeckInput, traineeId: string): Promise<DeckDetail> {
    const numCards = input.numberOfCards || 10;
    const isPreview = input.preview === true;

    // Resolve course name for titles/fallback
    let resolvedTopic = input.topic || 'General Engineering';
    if (input.courseId) {
      try {
        const course = await this.courseRepository.findById(input.courseId);
        if (course) resolvedTopic = course.titleAr || course.title || resolvedTopic;
      } catch { /* keep default */ }
    }

    let generatedCards: CreateCardInput[] = [];
    let topicLabel = resolvedTopic;

    try {
      // Gather context from course lectures
      const context = await this.gatherFlashcardContext(traineeId, input.courseId);

      if (context.length > 0) {
        const aiCards = await this.generateCardsWithLLM(context, numCards);

        if (aiCards.length > 0) {
          topicLabel = input.courseId
            ? (context[0]?.courseName || resolvedTopic)
            : resolvedTopic;
          generatedCards = aiCards;
        }
      }
    } catch (error) {
      console.warn('[FlashcardService] AI generation failed, falling back to sample cards:', error);
    }

    // Fallback: use sample cards if AI generation failed
    if (generatedCards.length === 0) {
      generatedCards = this.generateSampleCards(resolvedTopic, numCards);
    }

    const deckData: CreateDeckInput = {
      title: `AI: ${topicLabel}`,
      titleAr: `بطاقات ذكية: ${topicLabel}`,
      description: `AI-generated flashcards based on ${topicLabel}`,
      descriptionAr: `بطاقات تعليمية ذكية مبنية على ${topicLabel}`,
      courseId: input.courseId || null,
      category: 'ai_generated',
      cards: generatedCards,
    };

    // Preview mode: return data without saving to DB
    if (isPreview) {
      return {
        id: 'preview',
        title: deckData.title,
        titleAr: deckData.titleAr || null,
        description: deckData.description || null,
        descriptionAr: deckData.descriptionAr || null,
        category: deckData.category || null,
        courseId: deckData.courseId || null,
        isPublished: false,
        generationType: 'ai_generated',
        cards: generatedCards.map((c, i) => ({
          id: `preview-${i}`,
          front: c.front,
          frontAr: c.frontAr || null,
          back: c.back,
          backAr: c.backAr || null,
          hint: c.hint || null,
          hintAr: c.hintAr || null,
          orderInDeck: c.orderInDeck ?? i,
        })),
        cardCount: generatedCards.length,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as DeckDetail;
    }

    // Non-preview: save to DB (used by trainee-facing generate)
    const deck = await this.createDeck(creatorId, orgId, deckData);

    await this.flashcardRepo.updateDeck(deck.id, {
      generationType: 'ai_generated',
      isPublished: true,
    } as any);

    return { ...deck, generationType: 'ai_generated', isPublished: true };
  }

  // ==========================================
  // AI Context Gathering
  // ==========================================

  private async gatherFlashcardContext(
    traineeId: string,
    courseId?: string
  ): Promise<{ courseName: string; content: string }[]> {
    const contextParts: { courseName: string; content: string }[] = [];

    try {
      if (courseId) {
        // Specific course: get lectures content
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
        }
      } else {
        // Auto mode: gather from all courses with progress
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
      }
    } catch (error) {
      console.warn('[FlashcardService] Error gathering flashcard context:', error);
    }

    return contextParts;
  }

  // ==========================================
  // LLM Card Generation
  // ==========================================

  private async generateCardsWithLLM(
    context: { courseName: string; content: string }[],
    numCards: number
  ): Promise<CreateDeckInput['cards']> {
    const contextText = context.map(c => c.content).join('\n\n---\n\n');

    const systemPrompt = `You are an expert flashcard generator for a professional training platform.
Generate bilingual (Arabic + English) flashcards based on the provided learning content.

RULES:
- Cards should test understanding of key concepts, not trivial facts
- Each card MUST have Arabic and English versions for front, back, and hint
- Front: A clear question or prompt
- Back: A concise, accurate answer
- Hint: A brief clue to help recall (1 short sentence)
- Focus on practical knowledge relevant to the course content
- Vary question types: definitions, comparisons, applications, procedures

Respond with valid JSON only, no markdown. Format:
{
  "cards": [
    {
      "front": "English question?",
      "frontAr": "السؤال بالعربي؟",
      "back": "English answer",
      "backAr": "الإجابة بالعربي",
      "hint": "English hint",
      "hintAr": "تلميح بالعربي"
    }
  ]
}`;

    const prompt = `Based on the following learning content, generate exactly ${numCards} bilingual flashcards:

${contextText}

Generate ${numCards} bilingual flashcards as JSON.`;

    const response = await this.llmProvider.complete({
      prompt,
      systemPrompt,
      maxTokens: 3000,
      temperature: 0.7,
      responseFormat: 'json',
    });

    return this.parseLLMFlashcardResponse(response, numCards);
  }

  private parseLLMFlashcardResponse(response: string, expectedCount: number): CreateDeckInput['cards'] {
    // Clean potential markdown wrapper
    let cleaned = response.trim();
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
    }

    const parsed = JSON.parse(cleaned);
    const cards = parsed.cards || parsed;

    if (!Array.isArray(cards) || cards.length === 0) {
      throw new Error('No cards array in LLM response');
    }

    return cards.slice(0, expectedCount).map((c: any, index: number) => ({
      front: c.front || `Card ${index + 1}`,
      frontAr: c.frontAr || null,
      back: c.back || 'Answer',
      backAr: c.backAr || null,
      hint: c.hint || null,
      hintAr: c.hintAr || null,
      orderInDeck: index,
    }));
  }

  // ==========================================
  // Private Helpers
  // ==========================================

  private mapDeckToDetail(deck: DeckWithCards): DeckDetail {
    return {
      id: deck.id,
      title: deck.title,
      titleAr: deck.titleAr,
      description: deck.description,
      descriptionAr: deck.descriptionAr,
      courseId: deck.courseId,
      category: deck.category,
      isPublished: deck.isPublished,
      generationType: deck.generationType,
      cardCount: deck.cards.length,
      createdAt: deck.createdAt,
      cards: deck.cards.map(c => ({
        id: c.id,
        front: c.front,
        frontAr: c.frontAr,
        back: c.back,
        backAr: c.backAr,
        hint: c.hint,
        hintAr: c.hintAr,
        orderInDeck: c.orderInDeck,
      })),
    };
  }

  private mapDeckToListItem(deck: DeckWithCount): DeckListItem {
    return {
      id: deck.id,
      title: deck.title,
      titleAr: deck.titleAr,
      description: deck.description,
      descriptionAr: deck.descriptionAr,
      courseId: deck.courseId,
      category: deck.category,
      isPublished: deck.isPublished,
      generationType: deck.generationType,
      cardCount: deck._count.cards,
      createdAt: deck.createdAt,
    };
  }

  private generateSampleCards(topic: string, count: number) {
    const samplePool = [
      {
        front: 'What is a heat load calculation?',
        frontAr: 'ما هو حساب الحمل الحراري؟',
        back: 'A heat load calculation determines the heating and cooling requirements of a building based on factors like size, insulation, and climate.',
        backAr: 'حساب الحمل الحراري يحدد متطلبات التدفئة والتبريد للمبنى بناءً على عوامل مثل الحجم والعزل والمناخ.',
        hint: 'Think: how much heating/cooling a building needs',
        hintAr: 'فكر: كم يحتاج المبنى من تدفئة/تبريد',
      },
      {
        front: 'What does ROI stand for in engineering projects?',
        frontAr: 'ماذا يعني ROI في المشاريع الهندسية؟',
        back: 'Return on Investment - the ratio of net profit to total investment cost, expressed as a percentage.',
        backAr: 'العائد على الاستثمار - نسبة صافي الربح إلى إجمالي تكلفة الاستثمار.',
        hint: 'Profit / Cost x 100',
        hintAr: 'الربح / التكلفة x 100',
      },
      {
        front: 'What is a PLC (Programmable Logic Controller)?',
        frontAr: 'ما هو المتحكم المنطقي القابل للبرمجة PLC؟',
        back: 'A digital computer used for automation of industrial electromechanical processes, such as control of machinery on assembly lines.',
        backAr: 'حاسوب رقمي يُستخدم لأتمتة العمليات الكهروميكانيكية الصناعية مثل التحكم في الآلات على خطوط التجميع.',
        hint: 'Industrial automation brain',
        hintAr: 'عقل الأتمتة الصناعية',
      },
      {
        front: 'What is the difference between AC and DC motors?',
        frontAr: 'ما الفرق بين محركات التيار المتردد والتيار المستمر؟',
        back: 'AC motors run on alternating current and are used for constant speed applications. DC motors run on direct current and offer precise speed control.',
        backAr: 'محركات التيار المتردد تعمل على التيار المتناوب وتُستخدم للسرعة الثابتة. محركات التيار المستمر تعمل على التيار المباشر وتوفر تحكم دقيق بالسرعة.',
        hint: 'One alternates, one is direct',
        hintAr: 'واحد متناوب وواحد مباشر',
      },
      {
        front: 'What is a VFD (Variable Frequency Drive)?',
        frontAr: 'ما هو محول التردد VFD؟',
        back: 'An electronic device that controls motor speed by varying the frequency and voltage of the power supply to the motor.',
        backAr: 'جهاز إلكتروني يتحكم في سرعة المحرك عن طريق تغيير التردد والجهد المُزود للمحرك.',
        hint: 'Controls motor speed electronically',
        hintAr: 'يتحكم في سرعة المحرك إلكترونياً',
      },
      {
        front: 'What is preventive maintenance?',
        frontAr: 'ما هي الصيانة الوقائية؟',
        back: 'Scheduled maintenance performed on equipment to prevent unexpected failures and extend equipment lifespan.',
        backAr: 'صيانة مجدولة تُنفذ على المعدات لمنع الأعطال غير المتوقعة وإطالة عمر المعدات.',
        hint: 'Maintain before it breaks',
        hintAr: 'صيانة قبل أن يتعطل',
      },
      {
        front: 'What is a BMS (Building Management System)?',
        frontAr: 'ما هو نظام إدارة المباني BMS؟',
        back: 'A computer-based control system that monitors and manages a building\'s mechanical and electrical equipment such as HVAC, lighting, and power systems.',
        backAr: 'نظام تحكم حاسوبي يراقب ويدير المعدات الميكانيكية والكهربائية في المبنى مثل التكييف والإنارة وأنظمة الطاقة.',
        hint: 'Smart building control center',
        hintAr: 'مركز التحكم الذكي بالمبنى',
      },
      {
        front: 'What is LOTO (Lockout/Tagout)?',
        frontAr: 'ما هو إجراء القفل والعلامة LOTO؟',
        back: 'A safety procedure used to ensure that dangerous machines are properly shut off and not started up again before maintenance or repair work is completed.',
        backAr: 'إجراء سلامة يُستخدم لضمان إيقاف الآلات الخطرة بشكل صحيح وعدم تشغيلها مرة أخرى قبل إتمام أعمال الصيانة أو الإصلاح.',
        hint: 'Safety first during maintenance',
        hintAr: 'السلامة أولاً أثناء الصيانة',
      },
      {
        front: 'What is the commissioning process in engineering?',
        frontAr: 'ما هي عملية التشغيل التجريبي في الهندسة؟',
        back: 'The systematic process of verifying that all building systems are designed, installed, tested, and capable of being operated as intended.',
        backAr: 'العملية المنهجية للتحقق من أن جميع أنظمة المبنى مصممة ومركبة ومختبرة وقادرة على العمل كما هو مخطط.',
        hint: 'Testing everything works as designed',
        hintAr: 'التأكد من أن كل شيء يعمل كما صُمم',
      },
      {
        front: 'What is an electrical safety certificate?',
        frontAr: 'ما هي شهادة السلامة الكهربائية؟',
        back: 'A document certifying that electrical installations have been inspected and comply with safety standards and regulations.',
        backAr: 'وثيقة تشهد بأن التركيبات الكهربائية قد فُحصت وتتوافق مع معايير ولوائح السلامة.',
        hint: 'Proof of safe electrical work',
        hintAr: 'إثبات سلامة الأعمال الكهربائية',
      },
    ];

    const selected = samplePool.slice(0, Math.min(count, samplePool.length));

    return selected.map((card, index) => ({
      front: card.front,
      frontAr: card.frontAr,
      back: card.back,
      backAr: card.backAr,
      hint: card.hint,
      hintAr: card.hintAr,
      orderInDeck: index,
    }));
  }
}
