import { injectable, inject } from 'tsyringe';
import { ILLMProvider } from '../../providers/llm/llm-provider.interface';
import { FallbackLLMProvider } from '../../providers/llm/fallback.provider';

// ─── Engineering AI Evaluation Service ───────────────────────────────────────
// Evaluates student performance in engineering training simulations.
// Assesses technical knowledge, problem-solving, safety awareness, and
// practical application skills for electromechanical engineering.

export interface ConversationMessage {
  speaker: 'student' | 'client';
  message: string;
  timestamp: Date;
}

export interface EvaluationResult {
  overallScore: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  summary: string;
  skillScores: {
    communication: SkillEvaluation;
    negotiation: SkillEvaluation;
    objectionHandling: SkillEvaluation;
    relationshipBuilding: SkillEvaluation;
    productKnowledge: SkillEvaluation;
    closingTechnique: SkillEvaluation;
  };
  conversationMetrics: {
    talkTimeRatio: number;
    averageResponseLength: number;
    questionsAsked: number;
    empathyStatements: number;
    activeListeningIndicators: number;
  };
  highlights: string[];
  improvementAreas: string[];
  recommendations: Recommendation[];
}

export interface SkillEvaluation {
  score: number;
  reasoning: string;
  evidence: string[];
  tips: string[];
}

export interface Recommendation {
  priority: 'high' | 'medium' | 'low';
  category: string;
  title: string;
  description: string;
  actionableSteps: string[];
}

export interface IAIEvaluationService {
  evaluateConversation(
    conversation: ConversationMessage[],
    scenarioType: string,
    difficulty: string,
    clientPersona: Record<string, unknown>
  ): Promise<EvaluationResult>;
}

@injectable()
export class AIEvaluationService implements IAIEvaluationService {
  private fallbackProvider: FallbackLLMProvider;

  constructor(
    @inject('LLMProvider') private llmProvider: ILLMProvider
  ) {
    this.fallbackProvider = new FallbackLLMProvider();
  }

  async evaluateConversation(
    conversation: ConversationMessage[],
    scenarioType: string,
    difficulty: string,
    clientPersona: Record<string, unknown>
  ): Promise<EvaluationResult> {
    // Build conversation transcript
    const transcript = conversation
      .map(msg => `${msg.speaker === 'student' ? 'STUDENT' : 'MENTOR'}: ${msg.message}`)
      .join('\n\n');

    const traineeMessages = conversation.filter(m => m.speaker === 'student');
    const clientMessages = conversation.filter(m => m.speaker === 'client');

    // Calculate basic metrics deterministically
    const questionsAsked = traineeMessages.filter(m => m.message.includes('?')).length;
    const avgResponseLength = traineeMessages.length > 0
      ? Math.round(traineeMessages.reduce((sum, m) => sum + m.message.length, 0) / traineeMessages.length)
      : 0;
    const talkTimeRatio = traineeMessages.length > 0 && clientMessages.length > 0
      ? parseFloat((traineeMessages.reduce((sum, m) => sum + m.message.length, 0) /
        (traineeMessages.reduce((sum, m) => sum + m.message.length, 0) +
         clientMessages.reduce((sum, m) => sum + m.message.length, 0))).toFixed(2))
      : 0.5;

    // Count technical engagement indicators
    const technicalWords = [
      'because', 'therefore', 'specifically', 'for example', 'in practice',
      'according to', 'the standard', 'calculation', 'design', 'specification',
      'efficiency', 'safety', 'compliance', 'tolerance', 'rating',
      'voltage', 'current', 'pressure', 'temperature', 'flow',
      'maintenance', 'reliability', 'failure', 'diagnosis', 'troubleshoot',
      'circuit', 'motor', 'pump', 'valve', 'sensor', 'controller',
      'hvac', 'plc', 'frequency', 'power', 'resistance', 'impedance',
    ];
    const technicalStatements = traineeMessages.filter(m =>
      technicalWords.some(word => m.message.toLowerCase().includes(word))
    ).length;

    // Count active engagement indicators
    const engagementWords = [
      'i think', 'i believe', 'in my experience', 'i would', 'let me explain',
      'you mentioned', 'earlier', 'building on', 'to clarify', 'could you explain',
      'that\'s because', 'the reason', 'if we consider', 'for instance',
    ];
    const activeEngagementIndicators = traineeMessages.filter(m =>
      engagementWords.some(word => m.message.toLowerCase().includes(word))
    ).length;

    // Build engineering-focused system prompt
    const systemPrompt = this.buildEngineeringSystemPrompt(scenarioType, difficulty, clientPersona);

    const prompt = `ENGINEERING TRAINING SESSION TRANSCRIPT:

${transcript}

---

Based on this ${conversation.length}-turn engineering training session, provide your evaluation as JSON:`;

    try {
      const response = await this.fallbackProvider.complete({
        systemPrompt,
        prompt,
        maxTokens: 1500,
        temperature: 0.3,
        responseFormat: 'json',
      });

      let evaluation: {
        overallScore: number;
        summary: string;
        skillScores: Record<string, { score: number; reasoning: string; evidence: string[]; tips: string[] }>;
        highlights: string[];
        improvementAreas: string[];
        recommendations: Recommendation[];
      };

      try {
        let cleanResponse = response.trim();
        if (cleanResponse.startsWith('```json')) {
          cleanResponse = cleanResponse.slice(7);
        }
        if (cleanResponse.startsWith('```')) {
          cleanResponse = cleanResponse.slice(3);
        }
        if (cleanResponse.endsWith('```')) {
          cleanResponse = cleanResponse.slice(0, -3);
        }

        evaluation = JSON.parse(cleanResponse.trim());
      } catch (parseError) {
        console.error('Failed to parse AI evaluation response:', parseError);
        console.error('Response was:', response);
        return this.generateFallbackEvaluation(
          conversation, questionsAsked, technicalStatements, activeEngagementIndicators, talkTimeRatio, avgResponseLength
        );
      }

      const clampScore = (score: number) => Math.min(100, Math.max(0, Math.round(score)));
      const grade = this.scoreToGrade(evaluation.overallScore);

      return {
        overallScore: clampScore(evaluation.overallScore),
        grade,
        summary: evaluation.summary || this.generateSummary(evaluation.overallScore),
        skillScores: {
          communication: this.normalizeSkillScore(evaluation.skillScores?.communication),
          negotiation: this.normalizeSkillScore(evaluation.skillScores?.negotiation),
          objectionHandling: this.normalizeSkillScore(evaluation.skillScores?.objectionHandling),
          relationshipBuilding: this.normalizeSkillScore(evaluation.skillScores?.relationshipBuilding),
          productKnowledge: this.normalizeSkillScore(evaluation.skillScores?.productKnowledge),
          closingTechnique: this.normalizeSkillScore(evaluation.skillScores?.closingTechnique),
        },
        conversationMetrics: {
          talkTimeRatio,
          averageResponseLength: avgResponseLength,
          questionsAsked,
          empathyStatements: technicalStatements,
          activeListeningIndicators: activeEngagementIndicators,
        },
        highlights: evaluation.highlights || [],
        improvementAreas: evaluation.improvementAreas || [],
        recommendations: evaluation.recommendations || [],
      };
    } catch (error) {
      console.error('AI evaluation failed:', error);
      return this.generateFallbackEvaluation(
        conversation, questionsAsked, technicalStatements, activeEngagementIndicators, talkTimeRatio, avgResponseLength
      );
    }
  }

  private normalizeSkillScore(skill: { score?: number; reasoning?: string; evidence?: string[]; tips?: string[] } | undefined): SkillEvaluation {
    const DEFAULT_BEGINNER_SCORE = 20;
    return {
      score: Math.min(100, Math.max(0, Math.round(skill?.score ?? DEFAULT_BEGINNER_SCORE))),
      reasoning: skill?.reasoning || 'Based on engineering knowledge assessment',
      evidence: skill?.evidence || [],
      tips: skill?.tips || [],
    };
  }

  private scoreToGrade(score: number): 'A' | 'B' | 'C' | 'D' | 'F' {
    if (score >= 90) return 'A';
    if (score >= 80) return 'B';
    if (score >= 70) return 'C';
    if (score >= 60) return 'D';
    return 'F';
  }

  private generateSummary(score: number): string {
    if (score >= 90) return 'Outstanding performance demonstrating mastery of engineering concepts and practical application.';
    if (score >= 80) return 'Strong technical knowledge with minor areas for deeper understanding.';
    if (score >= 70) return 'Competent engineering knowledge showing solid foundational understanding.';
    if (score >= 60) return 'Developing technical skills with room for significant improvement in depth and accuracy.';
    return 'This session highlighted important knowledge gaps requiring focused study and practice.';
  }

  private generateFallbackEvaluation(
    conversation: ConversationMessage[],
    questionsAsked: number,
    technicalStatements: number,
    activeEngagement: number,
    talkTimeRatio: number,
    avgResponseLength: number
  ): EvaluationResult {
    const traineeMessages = conversation.filter(m => m.speaker === 'student');
    const turnCount = conversation.length;

    // Base score starts at 15 (beginner level)
    let baseScore = 15;

    // Add points for conversation engagement
    if (turnCount >= 6) baseScore += 15;
    if (turnCount >= 10) baseScore += 10;
    if (turnCount >= 15) baseScore += 5;

    // Add points for asking questions (shows curiosity and critical thinking)
    baseScore += Math.min(20, questionsAsked * 6);

    // Add points for technical language use
    baseScore += Math.min(15, technicalStatements * 5);

    // Add points for active engagement
    baseScore += Math.min(15, activeEngagement * 5);

    // Balanced talk time
    if (talkTimeRatio >= 0.35 && talkTimeRatio <= 0.65) baseScore += 5;

    // Response depth
    if (avgResponseLength >= 50 && avgResponseLength <= 300) baseScore += 5;

    const overallScore = Math.min(100, Math.max(0, Math.round(baseScore)));
    const grade = this.scoreToGrade(overallScore);

    // Calculate individual engineering skill scores
    const communicationScore = Math.min(100, Math.max(0,
      15 + (avgResponseLength > 30 ? 20 : 0) + (questionsAsked * 8) + (turnCount > 5 ? 10 : 0)
    ));
    const knowledgeScore = Math.min(100, Math.max(0,
      15 + (technicalStatements * 10) + (avgResponseLength > 80 ? 15 : 0) + (turnCount > 8 ? 10 : 0)
    ));
    const problemSolvingScore = Math.min(100, Math.max(0,
      15 + (activeEngagement * 12) + (questionsAsked * 5) + (technicalStatements * 5)
    ));
    const safetyScore = Math.min(100, Math.max(0,
      15 + (technicalStatements * 8) + (turnCount > 6 ? 10 : 0) + (questionsAsked * 3)
    ));
    const practicalScore = Math.min(100, Math.max(0,
      15 + (avgResponseLength > 50 ? 15 : 0) + (technicalStatements * 8) + (turnCount > 6 ? 10 : 0)
    ));
    const criticalThinkingScore = Math.min(100, Math.max(0,
      15 + (questionsAsked * 10) + (activeEngagement * 8) + (turnCount > 10 ? 10 : 0)
    ));

    return {
      overallScore,
      grade,
      summary: this.generateSummary(overallScore),
      skillScores: {
        communication: {
          score: communicationScore,
          reasoning: 'Based on clarity and quality of technical explanations',
          evidence: traineeMessages.length > 0 ? [traineeMessages[0].message.substring(0, 100)] : [],
          tips: ['Use proper engineering terminology', 'Structure your explanations clearly'],
        },
        negotiation: {
          score: knowledgeScore,
          reasoning: 'Based on depth of technical knowledge demonstrated',
          evidence: [],
          tips: ['Reference specific standards and specifications', 'Provide quantitative data where possible'],
        },
        objectionHandling: {
          score: problemSolvingScore,
          reasoning: 'Based on analytical approach and problem-solving methodology',
          evidence: [],
          tips: ['Use systematic troubleshooting approaches', 'Consider multiple possible causes'],
        },
        relationshipBuilding: {
          score: safetyScore,
          reasoning: 'Based on safety awareness and compliance knowledge',
          evidence: [],
          tips: ['Always consider safety implications', 'Reference relevant safety standards'],
        },
        productKnowledge: {
          score: practicalScore,
          reasoning: 'Based on ability to apply engineering principles to real scenarios',
          evidence: [],
          tips: ['Connect theory to practical applications', 'Consider real-world constraints'],
        },
        closingTechnique: {
          score: criticalThinkingScore,
          reasoning: 'Based on critical analysis and questioning approach',
          evidence: [],
          tips: ['Ask probing questions', 'Challenge assumptions and verify with evidence'],
        },
      },
      conversationMetrics: {
        talkTimeRatio,
        averageResponseLength: avgResponseLength,
        questionsAsked,
        empathyStatements: technicalStatements,
        activeListeningIndicators: activeEngagement,
      },
      highlights: this.generateHighlights(questionsAsked, technicalStatements, turnCount),
      improvementAreas: this.generateImprovementAreas(questionsAsked, technicalStatements, talkTimeRatio),
      recommendations: this.generateFallbackRecommendations(overallScore),
    };
  }

  private generateHighlights(questions: number, technical: number, turns: number): string[] {
    const highlights: string[] = [];
    if (questions >= 3) highlights.push('Demonstrated curiosity through probing questions');
    if (technical >= 2) highlights.push('Used appropriate engineering terminology and concepts');
    if (turns >= 8) highlights.push('Maintained engagement throughout the technical discussion');
    if (highlights.length === 0) highlights.push('Completed the engineering training session');
    return highlights;
  }

  private generateImprovementAreas(questions: number, technical: number, talkRatio: number): string[] {
    const areas: string[] = [];
    if (questions < 2) areas.push('Ask more clarifying questions to deepen understanding');
    if (technical < 2) areas.push('Use more specific technical terminology in explanations');
    if (talkRatio > 0.7) areas.push('Listen more carefully to the mentor\'s guidance');
    if (talkRatio < 0.3) areas.push('Provide more detailed technical responses');
    if (areas.length === 0) areas.push('Continue building depth in specialised topics');
    return areas;
  }

  private generateFallbackRecommendations(score: number): Recommendation[] {
    const recommendations: Recommendation[] = [];

    if (score < 70) {
      recommendations.push({
        priority: 'high',
        category: 'technique',
        title: 'Strengthen Technical Fundamentals',
        description: 'Focus on core engineering principles and their practical applications',
        actionableSteps: [
          'Review fundamental engineering concepts for your specialty area',
          'Practice explaining technical concepts clearly and concisely',
          'Study relevant engineering standards and codes',
        ],
      });
    }

    if (score < 80) {
      recommendations.push({
        priority: 'medium',
        category: 'technique',
        title: 'Develop Problem-Solving Methodology',
        description: 'Build a systematic approach to engineering challenges',
        actionableSteps: [
          'Use structured troubleshooting frameworks',
          'Always consider safety implications first',
          'Practice root cause analysis techniques',
        ],
      });
    }

    recommendations.push({
      priority: 'low',
      category: 'practice',
      title: 'Expand Technical Knowledge',
      description: 'Broaden your engineering expertise across different areas',
      actionableSteps: [
        'Try sessions on different engineering topics',
        'Increase difficulty level gradually',
        'Focus on connecting theory to practical applications',
      ],
    });

    return recommendations;
  }

  // Engineering-focused evaluation system prompt
  private buildEngineeringSystemPrompt(scenarioType: string, difficulty: string, clientPersona: Record<string, unknown>): string {
    const scenarioLabels: Record<string, string> = {
      'property_showing': 'HVAC Systems & Refrigeration',
      'price_negotiation': 'Electrical Power Systems',
      'objection_handling': 'Safety & Compliance',
      'first_contact': 'PLC & Industrial Automation',
      'closing_deal': 'Industrial Maintenance & Reliability',
      'relationship_building': 'Motor Control Systems',
      'difficult_client': 'Advanced Troubleshooting',
      'closing': 'Industrial Maintenance',
      'cold_call': 'PLC & Automation',
      'follow_up': 'Engineering Fundamentals',
    };

    return `You are an expert engineering educator evaluating a student's performance in a simulated technical training session with an AI engineering mentor.

ENGINEERING TOPIC: ${scenarioLabels[scenarioType] || scenarioType.replace(/_/g, ' ')}
DIFFICULTY LEVEL: ${difficulty}
MENTOR TEACHING STYLE: ${(clientPersona as { personality?: string }).personality || 'analytical'}

Evaluate the student's engineering competency based on the conversation transcript. Be fair but rigorous.

The "STUDENT" messages are from the trainee being evaluated.
The "MENTOR" messages are from the AI engineering professor.

EVALUATION CRITERIA FOR ENGINEERING TRAINING:
- Technical Communication: Clarity of explanations, use of proper terminology, structured responses
- Knowledge Depth: Accuracy of technical knowledge, understanding of principles, awareness of standards
- Problem Solving: Systematic approach to challenges, consideration of multiple factors, practical solutions
- Safety Awareness: Recognition of safety implications, knowledge of safety standards and procedures
- Practical Application: Ability to connect theory to real-world scenarios, consideration of constraints
- Critical Thinking: Analytical reasoning, questioning assumptions, depth of analysis

You must respond with ONLY a valid JSON object (no markdown, no explanation) with this exact structure:
{
  "overallScore": <number 0-100>,
  "summary": "<2-3 sentence performance summary>",
  "skillScores": {
    "communication": {
      "score": <number 0-100>,
      "reasoning": "<why this score — based on technical communication quality>",
      "evidence": ["<specific quote or behaviour from transcript>"],
      "tips": ["<specific improvement tip for technical communication>"]
    },
    "negotiation": {
      "score": <number 0-100>,
      "reasoning": "<why this score — based on knowledge depth>",
      "evidence": ["<specific quote or behaviour>"],
      "tips": ["<improvement tip for deepening knowledge>"]
    },
    "objectionHandling": {
      "score": <number 0-100>,
      "reasoning": "<why this score — based on problem solving ability>",
      "evidence": ["<specific quote or behaviour>"],
      "tips": ["<improvement tip for problem solving>"]
    },
    "relationshipBuilding": {
      "score": <number 0-100>,
      "reasoning": "<why this score — based on safety awareness>",
      "evidence": ["<specific quote or behaviour>"],
      "tips": ["<improvement tip for safety awareness>"]
    },
    "productKnowledge": {
      "score": <number 0-100>,
      "reasoning": "<why this score — based on practical application>",
      "evidence": ["<specific quote or behaviour>"],
      "tips": ["<improvement tip for practical skills>"]
    },
    "closingTechnique": {
      "score": <number 0-100>,
      "reasoning": "<why this score — based on critical thinking>",
      "evidence": ["<specific quote or behaviour>"],
      "tips": ["<improvement tip for critical thinking>"]
    }
  },
  "highlights": ["<what the student did well — specific engineering strengths>"],
  "improvementAreas": ["<what needs work — specific technical gaps>"],
  "recommendations": [
    {
      "priority": "high|medium|low",
      "category": "technique|knowledge|mindset",
      "title": "<short title>",
      "description": "<what to improve>",
      "actionableSteps": ["<step 1>", "<step 2>"]
    }
  ]
}

IMPORTANT SCORING GUIDELINES:
- 90-100: Exceptional — student demonstrated mastery of engineering concepts
- 80-89: Strong — solid knowledge with minor gaps
- 70-79: Competent — good foundational understanding, needs more depth
- 60-69: Developing — significant gaps but shows potential
- Below 60: Needs work — fundamental concepts need development

Be specific with evidence from the actual transcript. Do not give high scores without justification. Evaluate ENGINEERING knowledge, not sales or communication skills.`;
  }
}
