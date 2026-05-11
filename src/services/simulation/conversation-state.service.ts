import { injectable, inject } from 'tsyringe';
import { Sentiment } from '../../types/enums';
import { ILLMProvider } from '../../providers/llm/llm-provider.interface';
import {
  IConversationStateService,
  ConversationAnalysis,
} from '../interfaces/conversation-state.interface';
import {
  ConversationState,
  ConversationTurn,
  ClientPersona,
} from '../interfaces/objection-handling.interface';

// ─── Engineering Mentor Conversation State Service ───────────────────────────
// Manages conversation flow for the EmPower engineering training platform.
// The AI acts as a British-accented engineering professor using the Socratic
// method to assess and develop the student's technical knowledge.

@injectable()
export class ConversationStateService implements IConversationStateService {
  constructor(
    @inject('LLMProvider') private llmProvider: ILLMProvider
  ) {}

  async analyzeMessage(
    message: string,
    conversationHistory: ConversationTurn[],
    persona: ClientPersona
  ): Promise<ConversationAnalysis> {
    const prompt = this.buildAnalysisPrompt(message, conversationHistory);

    const response = await this.llmProvider.complete({
      prompt,
      maxTokens: 300,
      temperature: 0.3,
      responseFormat: 'json',
    });

    try {
      const analysis = JSON.parse(response);
      return {
        currentState: this.mapToConversationState(analysis.state),
        sentiment: this.mapToSentiment(analysis.sentiment),
        detectedIntent: analysis.intent || null,
        suggestedHints: analysis.hints || [],
      };
    } catch {
      return this.getDefaultAnalysis(conversationHistory);
    }
  }

  determineNextState(
    currentState: ConversationState,
    analysis: ConversationAnalysis,
    turnNumber: number
  ): ConversationState {
    // State transitions based on learning conversation progress
    const stateProgressions: Record<ConversationState, ConversationState[]> = {
      opening: ['opening', 'discovery'],
      discovery: ['discovery', 'presenting'],
      presenting: ['presenting', 'negotiating'],
      negotiating: ['negotiating', 'closing'],
      closing: ['closing', 'ended'],
      ended: ['ended'],
    };

    const possibleStates = stateProgressions[currentState];

    // Progress faster with positive engagement (student is answering well)
    if (analysis.sentiment === 'positive' && turnNumber > 2) {
      const nextIndex = Math.min(1, possibleStates.length - 1);
      return possibleStates[nextIndex];
    }

    // Stay in current state if student is struggling
    if (analysis.sentiment === 'negative') {
      return currentState;
    }

    // Natural progression based on turn number
    if (turnNumber > 4 && currentState === 'opening') return 'discovery';
    if (turnNumber > 8 && currentState === 'discovery') return 'presenting';
    if (turnNumber > 12 && currentState === 'presenting') return 'negotiating';
    if (turnNumber > 16 && currentState === 'negotiating') return 'closing';

    return currentState;
  }

  async generateClientResponse(
    traineeMessage: string,
    persona: ClientPersona,
    conversationHistory: ConversationTurn[],
    state: ConversationState,
    injectedObjection?: string
  ): Promise<string> {
    const prompt = this.buildResponsePrompt(
      traineeMessage,
      persona,
      conversationHistory,
      state,
      injectedObjection
    );

    const response = await this.llmProvider.complete({
      prompt,
      maxTokens: 300,
      temperature: 0.7,
      systemPrompt: this.getPersonaSystemPrompt(persona),
    });

    return response.trim();
  }

  private buildAnalysisPrompt(message: string, history: ConversationTurn[]): string {
    const recentHistory = history.slice(-4);

    return `
Analyse this engineering training conversation message.

Recent conversation:
${recentHistory.map(t => `${t.speaker === 'student' ? 'Student' : 'Mentor'}: ${t.message}`).join('\n')}

Latest message from Student: "${message}"

Return JSON:
{
  "state": "one of: opening, discovery, presenting, negotiating, closing, ended",
  "sentiment": "positive or neutral or negative",
  "intent": "what the student is trying to communicate or demonstrate",
  "hints": ["helpful engineering tips for the student in English"]
}

State mapping for engineering context:
- opening = Introduction phase, getting to know the student's level
- discovery = Assessment phase, probing the student's knowledge
- presenting = Discussion phase, exploring topics in depth
- negotiating = Deep dive phase, challenging the student's understanding
- closing = Review phase, summarising and providing feedback
- ended = Session complete`;
  }

  private buildResponsePrompt(
    traineeMessage: string,
    persona: ClientPersona,
    history: ConversationTurn[],
    state: ConversationState,
    injectedObjection?: string
  ): string {
    const recentHistory = history.slice(-6);

    // Engineering learning stages (mapped to the existing state names)
    const stateDescriptions: Record<ConversationState, string> = {
      opening: 'Introduction — Establish the session topic and gauge the student\'s baseline knowledge level',
      discovery: 'Assessment — Probe the student\'s understanding with focused technical questions',
      presenting: 'Discussion — Explore engineering concepts in depth, building on the student\'s answers',
      negotiating: 'Deep Dive — Challenge the student with complex scenarios and edge cases',
      closing: 'Review — Summarise key learnings, highlight strengths, and suggest areas for improvement',
      ended: 'Session Complete',
    };

    const stateGuidance: Record<ConversationState, string> = {
      opening: 'Ask an introductory question about the topic area to understand the student\'s current level. Be welcoming but professional.',
      discovery: 'Ask probing technical questions. Use the Socratic method — guide the student to discover answers rather than lecturing. Ask "why" and "how" questions.',
      presenting: 'Engage in deeper technical discussion. Present scenarios and ask the student to apply their knowledge. Correct misconceptions gently but firmly.',
      negotiating: 'Present challenging real-world problems. Push the student to think critically. Ask about edge cases, failure modes, and practical considerations.',
      closing: 'Provide constructive feedback on the student\'s performance. Highlight what they did well and what they should study further. Be encouraging but honest.',
      ended: 'The session has concluded. Wish the student well.',
    };

    let prompt = `You are an experienced engineering mentor conducting a training session.

Your Profile:
- Name: ${persona.name}
- Teaching Style: ${this.getPersonalityDescription(persona.personality)}
- Background: ${persona.background}
- Specialty Area: ${persona.budget}
- Session Topics: ${persona.motivations.slice(0, 2).join(', ')}

Current Learning Phase: ${stateDescriptions[state]}
Guidance for this phase: ${stateGuidance[state]}

Conversation so far:
${recentHistory.map(t => `[${t.speaker === 'student' ? 'Student' : 'You (Mentor)'}]: ${t.message}`).join('\n')}

---
The Student just said: "${traineeMessage}"
---
`;

    if (injectedObjection) {
      prompt += `
IMPORTANT: During your response, introduce this technical challenge or probing question naturally: "${injectedObjection}"
`;
    }

    prompt += `
CRITICAL RULES — You MUST follow these:

1. Respond ONLY in English. Use British English spelling (e.g., "optimise", "colour", "centre").
2. Use the Socratic method — ask questions that lead the student to discover answers rather than simply lecturing.
3. Keep your response to 1-4 sentences. Be concise and focused.
4. If the student gives an incorrect or incomplete answer, gently guide them towards the correct understanding.
5. If the student gives a good answer, acknowledge it briefly and ask a deeper follow-up question.
6. Stay in character as an experienced engineering professor. Be professional, knowledgeable, and encouraging.
7. Reference real engineering standards, codes, and best practices where relevant.
8. Never repeat the same question. Always progress the conversation forward.
9. Vary your response openings — don't always start the same way.
10. Evaluate the student's technical depth, not just surface-level knowledge.

Your response as the Engineering Mentor (in English, British spelling):`;

    return prompt;
  }

  private getPersonalityDescription(personality: ClientPersona['personality']): string {
    const descriptions: Record<ClientPersona['personality'], string> = {
      friendly: 'Supportive and encouraging — builds confidence while maintaining high standards',
      skeptical: 'Rigorous and questioning — always asks for evidence and deeper reasoning',
      demanding: 'Exacting and challenging — expects precise, thorough answers with no shortcuts',
      indecisive: 'Exploratory and flexible — follows the student\'s interests while ensuring coverage',
      analytical: 'Methodical and data-driven — emphasises calculations, standards, and systematic approaches',
    };
    return descriptions[personality] || 'Professional and thorough';
  }

  private getPersonaSystemPrompt(persona: ClientPersona): string {
    const personalityGuides: Record<ClientPersona['personality'], string> = {
      friendly: 'Be supportive and encouraging. Acknowledge good answers warmly. When the student struggles, provide helpful hints rather than direct answers. Use phrases like "That\'s a good start" and "You\'re on the right track."',
      skeptical: 'Be rigorous in your assessment. Always ask "How do you know that?" and "What evidence supports that?" Don\'t accept vague answers. Push for specificity and precision.',
      demanding: 'Maintain high expectations. If an answer is incomplete, say so directly. Expect calculations to be shown, standards to be cited, and reasoning to be thorough. Use phrases like "That\'s not sufficient" and "Be more precise."',
      indecisive: 'Be flexible in your approach. Follow interesting threads in the conversation. Offer multiple paths of exploration. Ask "Would you like to explore that further?" and "That\'s an interesting angle."',
      analytical: 'Focus on data, calculations, and systematic approaches. Ask for specific numbers, reference standards, and methodology. Use phrases like "Show me the calculation" and "What does the standard say about this?"',
    };

    return `You are ${persona.name}, an experienced engineering professor and mentor.

Your specialty: ${persona.budget}
Your background: ${persona.background}
Your teaching style: ${this.getPersonalityDescription(persona.personality)}

${personalityGuides[persona.personality]}

Assessment focus areas: ${persona.hiddenConcerns.join(', ')}

===== MANDATORY RULES =====
1. ALWAYS respond in English only. Use British English spelling.
2. You are an engineering mentor, NOT a sales agent or real estate professional.
3. Use the Socratic method — guide through questions, not lectures.
4. Keep responses concise (1-4 sentences).
5. Vary your response openings — don't start every response the same way.
6. Engage directly with what the student said.
7. Never repeat the same question.
8. Reference real engineering standards and best practices.
9. Assess technical depth — push beyond surface-level answers.
10. Be professional, knowledgeable, and appropriately challenging for the difficulty level.

You are conducting an engineering knowledge assessment through conversation. Your goal is to evaluate the student's understanding and help them develop deeper technical competency.`;
  }

  private mapToConversationState(state: string): ConversationState {
    const validStates: ConversationState[] = ['opening', 'discovery', 'presenting', 'negotiating', 'closing', 'ended'];
    const normalized = state?.toLowerCase() as ConversationState;
    return validStates.includes(normalized) ? normalized : 'discovery';
  }

  private mapToSentiment(sentiment: string): Sentiment {
    const normalized = sentiment?.toLowerCase();
    if (normalized === 'positive') return 'positive';
    if (normalized === 'negative') return 'negative';
    return 'neutral';
  }

  private getDefaultAnalysis(history: ConversationTurn[]): ConversationAnalysis {
    const turnCount = history.length;

    let state: ConversationState = 'opening';
    if (turnCount > 4) state = 'discovery';
    if (turnCount > 8) state = 'presenting';
    if (turnCount > 12) state = 'negotiating';

    return {
      currentState: state,
      sentiment: 'neutral',
      detectedIntent: null,
      suggestedHints: [],
    };
  }
}
