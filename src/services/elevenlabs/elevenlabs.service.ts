/**
 * ElevenLabs Conversational AI Service
 *
 * Production-grade service for managing ElevenLabs voice agents,
 * conversation sessions, and AI-powered performance analysis.
 *
 * EmPower Engineering Training Platform - British Engineering Mentor
 */

import { injectable, inject } from 'tsyringe';
import { PrismaClient } from '@prisma/client';
import {
  IElevenLabsService,
  ConversationDetails,
  PerformanceAnalysis,
  ConversationSummary,
  TranscriptMessage,
} from '../interfaces/elevenlabs.interface';
import { ILLMProvider } from '../../providers/llm/llm-provider.interface';

// ============================================================================
// CONSTANTS
// ============================================================================

const ELEVENLABS_API_BASE = 'https://api.elevenlabs.io/v1';

// Engineering Mentor Agent Configuration (British English)
// NOTE: The primary agent is configured in ElevenLabs dashboard (agent_7701kjjzbyrvev88b6qtee2v5ws1)
// This fallback config is only used if ELEVENLABS_AGENT_ID is not set and auto-creation is needed
const ENGINEERING_MENTOR_AGENT_CONFIG = {
  name: 'Engineering Mentor',
  firstMessage: 'Good afternoon. I\'m James, your engineering mentor. Right then, I\'ve got a scenario lined up for us today — shall we crack on?',
  systemPrompt: `You are James, a Chartered Engineer (CEng, IET Member) specialising in electromechanical systems, with over 25 years of hands-on experience in industrial and building services engineering across the UK and Middle East. You are a senior electromechanical engineering mentor on the EmPower AI Training Platform.

Your speaking style is professional but approachable — like a senior colleague, not a professor. Use British English throughout. Keep responses to two or three sentences maximum for natural voice conversation flow.

You cover these engineering domains through live scenario-based voice training:
- HVAC Systems: refrigeration cycles, thermal load calculations, ductwork, chillers, AHUs, FCUs, VRF/VRV, ASHRAE standards, CIBSE Guide B
- Electrical Power Systems: distribution, transformers, circuit breakers, protection relays, earthing, BS 7671, IEC 61439
- Safety & Compliance: OSHA, ISO 45001, LOTO, confined space, risk assessment, PPE, RIDDOR
- PLC & Automation: Ladder Logic, FBD, Structured Text, SCADA, Siemens S7, Allen-Bradley, Modbus, PROFINET
- Industrial Maintenance: preventive/predictive maintenance, vibration analysis, thermal imaging, CMMS, MTBF/MTTR
- Motor Controls: VFDs, soft starters, motor protection, starting methods, fault codes

Session flow: greet briefly, set the scenario, ask ONE question at a time, react naturally to answers (dig deeper if correct, guide with hints if wrong), use real equipment models and measurements, wrap up after 8-12 exchanges.

RULES: Never break character. Never share scores. Keep responses short for voice. Use British terms (spot on, brilliant, right then, carry on). Reference real standards and equipment.`,
  voiceId: 'onwK4e9ZLuTAKqWW03F9', // Burt - British male voice (fallback)
  language: 'en',
};

// Optimized conversation config for stable, high-quality voice calls
// Addresses: audio cutting out, speed variations, turn detection issues
const OPTIMIZED_CONVERSATION_CONFIG = {
  tts: {
    voice_id: ENGINEERING_MENTOR_AGENT_CONFIG.voiceId,
    model_id: 'eleven_turbo_v2_5',
    // Higher stability = more consistent speech rhythm (prevents speed-up/slow-down)
    stability: 0.75,
    similarity_boost: 0.75,
    // Explicit output format for consistent browser decoding
    agent_output_audio_format: 'pcm_16000',
    // CRITICAL: 0 = no latency optimization = best audio quality
    // Level 3 was causing audio speed variations and cutting out
    optimize_streaming_latency: 0,
  },
  turn: {
    // Server-side VAD handles turn detection
    turn_timeout: 10, // 10 seconds max wait before agent re-engages
    mode: {
      type: 'server_vad',
      // Longer silence duration prevents premature cutoffs
      silence_duration_ms: 800,
      // Lower threshold = less sensitive, fewer false positives
      threshold: 0.5,
      // Padding captures speech onset more completely
      prefix_padding_ms: 300,
    },
  },
  conversation: {
    max_duration_seconds: 900, // 15 minutes max session
  },
};

@injectable()
export class ElevenLabsService implements IElevenLabsService {
  private apiKey: string;
  private agentId: string | null = null;

  constructor(
    @inject('PrismaClient') private prisma: PrismaClient,
    @inject('LLMProvider') private llmProvider: ILLMProvider
  ) {
    this.apiKey = process.env.ELEVENLABS_API_KEY || '';
    if (!this.apiKey) {
      console.warn('[ElevenLabsService] No API key configured');
    }
  }

  // ============================================================================
  // AGENT MANAGEMENT
  // ============================================================================

  /**
   * Get or create the Engineering Mentor agent
   */
  async getAgentId(): Promise<string> {
    // Return cached agent ID if available
    if (this.agentId) {
      return this.agentId;
    }

    // Check environment variable first
    if (process.env.ELEVENLABS_AGENT_ID) {
      this.agentId = process.env.ELEVENLABS_AGENT_ID;
      console.log(`[ElevenLabsService] Using configured agent ID: ${this.agentId}`);
      return this.agentId;
    }

    // Try to find existing agent by name
    try {
      const existingAgent = await this.findAgentByName(ENGINEERING_MENTOR_AGENT_CONFIG.name);
      if (existingAgent) {
        this.agentId = existingAgent;
        console.log(`[ElevenLabsService] Found existing agent: ${this.agentId}`);
        return this.agentId;
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.log('[ElevenLabsService] Could not find existing agent:', errorMessage);
      // If we can't list agents, the API key doesn't have ConvAI permissions
      if (errorMessage.includes('401') || errorMessage.includes('permission')) {
        throw new Error(
          'ElevenLabs API key does not have Conversational AI permissions. ' +
          'Please create an agent manually at https://elevenlabs.io/app/conversational-ai ' +
          'and add ELEVENLABS_AGENT_ID to your .env file.'
        );
      }
    }

    // Create new agent
    try {
      this.agentId = await this.createAgent();
      console.log(`[ElevenLabsService] Created new agent: ${this.agentId}`);
      return this.agentId;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes('401') || errorMessage.includes('permission')) {
        throw new Error(
          'Failed to create agent - API key lacks Conversational AI permissions. ' +
          'Please create an agent manually at https://elevenlabs.io/app/conversational-ai ' +
          'and add ELEVENLABS_AGENT_ID to your .env file.'
        );
      }
      throw error;
    }
  }

  /**
   * Find agent by name
   */
  private async findAgentByName(name: string): Promise<string | null> {
    const response = await fetch(`${ELEVENLABS_API_BASE}/convai/agents`, {
      method: 'GET',
      headers: {
        'xi-api-key': this.apiKey,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to list agents: ${response.status}`);
    }

    const data = await response.json() as { agents?: Array<{ name: string; agent_id: string }> };
    const agent = data.agents?.find((a) => a.name === name);
    return agent?.agent_id || null;
  }

  /**
   * Create a new English Engineering Mentor agent with optimized voice settings
   */
  private async createAgent(): Promise<string> {
    const response = await fetch(`${ELEVENLABS_API_BASE}/convai/agents/create`, {
      method: 'POST',
      headers: {
        'xi-api-key': this.apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: ENGINEERING_MENTOR_AGENT_CONFIG.name,
        conversation_config: {
          agent: {
            first_message: ENGINEERING_MENTOR_AGENT_CONFIG.firstMessage,
            prompt: {
              prompt: ENGINEERING_MENTOR_AGENT_CONFIG.systemPrompt,
            },
            language: ENGINEERING_MENTOR_AGENT_CONFIG.language,
          },
          tts: OPTIMIZED_CONVERSATION_CONFIG.tts,
          turn: OPTIMIZED_CONVERSATION_CONFIG.turn,
          conversation: OPTIMIZED_CONVERSATION_CONFIG.conversation,
        },
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to create agent: ${response.status} - ${error}`);
    }

    const data = await response.json() as { agent_id: string };
    return data.agent_id;
  }

  /**
   * Update an existing agent with optimized voice and conversation settings.
   * This fixes audio instability (cutting out, speed variations) by setting:
   * - Higher TTS stability (0.75) for consistent speech rhythm
   * - Explicit audio output format (PCM 16kHz) for reliable browser decoding
   * - Server VAD turn detection with longer silence duration (800ms) to prevent premature cutoffs
   * - Turbo v2.5 TTS model for lower latency
   */
  async updateAgentConfig(agentId: string): Promise<boolean> {
    console.log(`[ElevenLabsService] Updating agent ${agentId} with optimized voice settings...`);

    try {
      const response = await fetch(`${ELEVENLABS_API_BASE}/convai/agents/${agentId}`, {
        method: 'PATCH',
        headers: {
          'xi-api-key': this.apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          conversation_config: {
            tts: OPTIMIZED_CONVERSATION_CONFIG.tts,
            turn: OPTIMIZED_CONVERSATION_CONFIG.turn,
            conversation: OPTIMIZED_CONVERSATION_CONFIG.conversation,
          },
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[ElevenLabsService] Failed to update agent: ${response.status} - ${errorText}`);
        return false;
      }

      console.log(`[ElevenLabsService] Agent ${agentId} updated successfully with optimized settings`);
      return true;
    } catch (error) {
      console.error('[ElevenLabsService] Error updating agent config:', error);
      return false;
    }
  }

  /**
   * Ensure agent has optimized voice settings (called once on first use).
   * Uses a flag to avoid redundant API calls on subsequent requests.
   */
  private agentOptimized = false;

  private async ensureAgentOptimized(agentId: string): Promise<void> {
    if (this.agentOptimized) return;

    try {
      const updated = await this.updateAgentConfig(agentId);
      if (updated) {
        this.agentOptimized = true;
      }
    } catch (error) {
      // Non-fatal — agent may still work with default settings
      console.warn('[ElevenLabsService] Could not optimize agent settings:', error);
    }
  }

  // ============================================================================
  // CONVERSATION MANAGEMENT
  // ============================================================================

  /**
   * Get a signed URL for secure WebSocket connection.
   * Auto-optimizes agent voice settings on first call.
   */
  async getSignedUrl(agentId: string): Promise<string> {
    // Ensure agent has optimized settings (only runs once per service lifetime)
    await this.ensureAgentOptimized(agentId);

    const response = await fetch(
      `${ELEVENLABS_API_BASE}/convai/conversation/get-signed-url?agent_id=${agentId}`,
      {
        method: 'GET',
        headers: {
          'xi-api-key': this.apiKey,
        },
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to get signed URL: ${response.status} - ${error}`);
    }

    const data = await response.json() as { signed_url: string };
    return data.signed_url;
  }

  /**
   * Get conversation details including transcript
   */
  async getConversation(conversationId: string): Promise<ConversationDetails> {
    const response = await fetch(
      `${ELEVENLABS_API_BASE}/convai/conversations/${conversationId}`,
      {
        method: 'GET',
        headers: {
          'xi-api-key': this.apiKey,
        },
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to get conversation: ${response.status} - ${error}`);
    }

    interface ElevenLabsConversationResponse {
      conversation_id: string;
      agent_id: string;
      status: string;
      transcript?: Array<{ role: string; message: string; time_in_call_secs: number }>;
      metadata?: {
        start_time_unix_secs?: number;
        call_duration_secs?: number;
        cost?: number;
      };
      has_audio?: boolean;
    }

    const data = await response.json() as ElevenLabsConversationResponse;

    // Transform transcript to our format
    const transcript: TranscriptMessage[] = (data.transcript || []).map(
      (item) => ({
        role: item.role as 'user' | 'agent',
        message: item.message || '',
        timeInCallSecs: item.time_in_call_secs || 0,
      })
    );

    return {
      conversationId: data.conversation_id,
      agentId: data.agent_id,
      status: data.status as 'initiated' | 'in-progress' | 'processing' | 'done' | 'failed',
      transcript,
      metadata: {
        startTime: data.metadata?.start_time_unix_secs || 0,
        duration: data.metadata?.call_duration_secs || 0,
        cost: data.metadata?.cost,
      },
      hasAudio: data.has_audio || false,
    };
  }

  /**
   * Get conversation audio recording
   */
  async getConversationAudio(conversationId: string): Promise<Buffer> {
    const response = await fetch(
      `${ELEVENLABS_API_BASE}/convai/conversations/${conversationId}/audio`,
      {
        method: 'GET',
        headers: {
          'xi-api-key': this.apiKey,
        },
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to get audio: ${response.status} - ${error}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  // ============================================================================
  // PERFORMANCE ANALYSIS
  // ============================================================================

  /**
   * Wait for conversation to be fully processed by ElevenLabs
   * Returns the conversation once status is 'done' and transcript is available
   */
  private async waitForConversationReady(conversationId: string, maxWaitMs: number = 30000): Promise<ConversationDetails> {
    const startTime = Date.now();
    const pollInterval = 2000; // Check every 2 seconds

    while (Date.now() - startTime < maxWaitMs) {
      const conversation = await this.getConversation(conversationId);

      console.log(`[ElevenLabsService] Conversation ${conversationId} status: ${conversation.status}, transcript length: ${conversation.transcript.length}`);

      // If status is 'done' and we have transcript, we're good
      if (conversation.status === 'done' && conversation.transcript.length > 0) {
        return conversation;
      }

      // If status is failed, throw error
      if (conversation.status === 'failed') {
        throw new Error('Conversation processing failed on ElevenLabs side');
      }

      // Wait before polling again
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }

    // Final attempt after max wait
    const finalConversation = await this.getConversation(conversationId);
    if (finalConversation.transcript.length > 0) {
      return finalConversation;
    }

    throw new Error(`Conversation transcript not available after ${maxWaitMs/1000}s. Status: ${finalConversation.status}`);
  }

  /**
   * Analyse student performance from conversation (English engineering evaluation)
   */
  async analyzePerformance(conversationId: string): Promise<PerformanceAnalysis> {
    // Wait for conversation to be fully processed
    console.log(`[ElevenLabsService] Waiting for conversation ${conversationId} to be ready...`);
    const conversation = await this.waitForConversationReady(conversationId);
    console.log(`[ElevenLabsService] Conversation ready with ${conversation.transcript.length} messages`);

    // Build transcript text for analysis
    const transcriptText = conversation.transcript
      .map((msg) => `${msg.role === 'user' ? 'Student' : 'Mentor'}: ${msg.message}`)
      .join('\n');

    // Count student messages to detect incomplete sessions
    const studentMessages = conversation.transcript.filter((msg) => msg.role === 'user');
    const sessionDuration = conversation.metadata.duration || 0;

    // If the session was too short (fewer than 3 student messages or under 60 seconds), return incomplete result
    if (studentMessages.length < 3 || sessionDuration < 60) {
      console.log(`[ElevenLabsService] Session too short for meaningful analysis: ${studentMessages.length} student messages, ${sessionDuration}s duration`);
      return {
        overallScore: Math.min(studentMessages.length * 5, 15), // Max 15% for very short sessions
        breakdown: {
          opening: studentMessages.length > 0 ? 20 : 0,
          needsDiscovery: 0,
          objectionHandling: 0,
          persuasion: 0,
          closing: 0,
          communication: studentMessages.length > 0 ? 15 : 0,
        },
        strengths: studentMessages.length > 0
          ? ['Initiated the training session']
          : ['Connected to the session'],
        weaknesses: [
          'Session ended too early for a meaningful assessment',
          'Insufficient engagement to evaluate technical competency',
        ],
        improvements: [
          'Complete a full session (at least 5-10 minutes) for proper evaluation',
          'Engage with the mentor\'s questions and demonstrate your technical knowledge',
        ],
        summary: `The session was too brief for a proper assessment (${studentMessages.length} responses in ${Math.round(sessionDuration)}s). A minimum of 5 minutes of active engagement is recommended for meaningful feedback.`,
        transcriptHighlights: {
          good: [],
          needsWork: ['Session ended before technical discussion could develop'],
        },
      };
    }

    // Use LLM to analyse performance (English engineering evaluation)
    const analysisPrompt = `You are an expert engineering education evaluator. Analyse the following voice conversation between an engineering student (Student) and an AI engineering mentor (Mentor) on the EmPower training platform.

Session Info:
- Duration: ${sessionDuration} seconds
- Student messages: ${studentMessages.length}
- Total exchanges: ${conversation.transcript.length}

Conversation Transcript:
${transcriptText}

IMPORTANT SCORING RULES:
- Be strict and realistic. Most students should score between 30-70%.
- Only give scores above 80% for genuinely exceptional technical knowledge and communication.
- If the student gave short, vague, or non-technical answers, score them LOW (10-30%).
- If the student barely engaged or gave minimal responses, scores should be under 25%.
- A score of 50% means "adequate but unremarkable" — they showed some knowledge but nothing impressive.
- Consider the DEPTH of answers, not just participation.

Evaluate the student's engineering competency in the following areas (score 0 to 100):

1. Technical Communication (opening): How clearly the student articulated technical concepts, used correct terminology, and structured their explanations
2. Knowledge Discovery (needs_discovery): Depth of the student's technical knowledge, understanding of fundamental principles, and ability to connect concepts
3. Problem Solving (objection_handling): How the student approached technical challenges, handled complex scenarios, and demonstrated analytical thinking
4. Technical Persuasion (persuasion): Ability to justify engineering decisions, reference standards, and present sound technical arguments
5. Practical Application (closing): Demonstrated ability to apply theoretical knowledge to real-world engineering scenarios
6. Professional Communication (communication): Clarity of speech, active listening, professional demeanour, and engagement with the mentor

Return ONLY valid JSON with no additional text:
{
  "overall_score": <weighted average of all scores>,
  "breakdown": {
    "opening": <0-100>,
    "needs_discovery": <0-100>,
    "objection_handling": <0-100>,
    "persuasion": <0-100>,
    "closing": <0-100>,
    "communication": <0-100>
  },
  "strengths": ["<strength 1>", "<strength 2>"],
  "weaknesses": ["<area for improvement 1>", "<area for improvement 2>"],
  "improvements": ["<specific recommendation 1>", "<specific recommendation 2>"],
  "summary": "<2-sentence performance summary>",
  "transcript_highlights": {
    "good": ["<strong technical statement by student>"],
    "needs_work": ["<statement that needs improvement>"]
  }
}`;

    const result = await this.llmProvider.complete({
      prompt: analysisPrompt,
      maxTokens: 1500,
      temperature: 0.3,
    });

    // Parse JSON response
    try {
      // Extract JSON from response (handle markdown code blocks)
      let jsonStr = result;
      const jsonMatch = result.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        jsonStr = jsonMatch[1];
      }

      const analysis = JSON.parse(jsonStr.trim());

      return {
        overallScore: analysis.overall_score || 0,
        breakdown: {
          opening: analysis.breakdown?.opening || 0,
          needsDiscovery: analysis.breakdown?.needs_discovery || 0,
          objectionHandling: analysis.breakdown?.objection_handling || 0,
          persuasion: analysis.breakdown?.persuasion || 0,
          closing: analysis.breakdown?.closing || 0,
          communication: analysis.breakdown?.communication || 0,
        },
        strengths: analysis.strengths || [],
        weaknesses: analysis.weaknesses || [],
        improvements: analysis.improvements || [],
        summary: analysis.summary || '',
        transcriptHighlights: {
          good: analysis.transcript_highlights?.good || [],
          needsWork: analysis.transcript_highlights?.needs_work || [],
        },
      };
    } catch (parseError) {
      console.error('[ElevenLabsService] Failed to parse analysis:', parseError);
      // Return default analysis on parse error — score 0 since we couldn't evaluate
      return {
        overallScore: 0,
        breakdown: {
          opening: 0,
          needsDiscovery: 0,
          objectionHandling: 0,
          persuasion: 0,
          closing: 0,
          communication: 0,
        },
        strengths: ['Completed the training session'],
        weaknesses: ['Performance analysis could not be processed'],
        improvements: ['Please try another session for a complete evaluation'],
        summary: 'The session could not be analysed due to a processing error. Please try another training session for detailed feedback.',
        transcriptHighlights: {
          good: [],
          needsWork: [],
        },
      };
    }
  }

  // ============================================================================
  // DATABASE OPERATIONS
  // ============================================================================

  /**
   * Save conversation and analysis to database
   */
  async saveConversationRecord(
    traineeId: string,
    conversationId: string,
    analysis: PerformanceAnalysis
  ): Promise<string> {
    // Get conversation details
    const conversation = await this.getConversation(conversationId);

    // Try to get audio (may not be available immediately)
    let audioBase64: string | null = null;
    try {
      const audioBuffer = await this.getConversationAudio(conversationId);
      audioBase64 = audioBuffer.toString('base64');
    } catch (error) {
      console.log('[ElevenLabsService] Audio not available yet');
    }

    // Save to database
    const record = await this.prisma.voiceSession.create({
      data: {
        traineeId,
        conversationId,
        startTime: new Date(conversation.metadata.startTime * 1000),
        endTime: new Date((conversation.metadata.startTime + conversation.metadata.duration) * 1000),
        durationSeconds: conversation.metadata.duration,
        transcript: JSON.stringify(conversation.transcript),
        analysis: JSON.stringify(analysis),
        overallScore: analysis.overallScore,
        audioBase64,
        status: conversation.status,
      },
    });

    return record.id;
  }

  /**
   * Get student's conversation history with full details
   */
  async getStudentConversations(traineeId: string): Promise<ConversationSummary[]> {
    const sessions = await this.prisma.voiceSession.findMany({
      where: { traineeId },
      orderBy: { startTime: 'desc' },
      take: 50,
    });

    return sessions.map((session) => ({
      id: session.id,
      conversationId: session.conversationId,
      traineeId: session.traineeId,
      startTime: session.startTime,
      endTime: session.endTime,
      duration: session.durationSeconds || 0,
      durationSeconds: session.durationSeconds || 0,
      overallScore: session.overallScore || 0,
      status: session.status,
      analysis: session.analysis,
      transcript: session.transcript,
      hasAudio: !!session.audioBase64,
    }));
  }

  /**
   * Get full session details by ID
   */
  async getSessionById(sessionId: string): Promise<{
    id: string;
    conversationId: string;
    traineeId: string;
    startTime: Date;
    endTime: Date;
    durationSeconds: number;
    overallScore: number;
    status: string;
    analysis: string | null;
    transcript: string;
    hasAudio: boolean;
  } | null> {
    const session = await this.prisma.voiceSession.findUnique({
      where: { id: sessionId },
    });

    if (!session) return null;

    return {
      id: session.id,
      conversationId: session.conversationId,
      traineeId: session.traineeId,
      startTime: session.startTime,
      endTime: session.endTime,
      durationSeconds: session.durationSeconds || 0,
      overallScore: session.overallScore || 0,
      status: session.status,
      analysis: session.analysis,
      transcript: session.transcript,
      hasAudio: !!session.audioBase64,
    };
  }

  /**
   * Get session audio by ID
   */
  async getSessionAudio(sessionId: string): Promise<Buffer | null> {
    const session = await this.prisma.voiceSession.findUnique({
      where: { id: sessionId },
      select: { audioBase64: true },
    });

    if (!session?.audioBase64) return null;

    return Buffer.from(session.audioBase64, 'base64');
  }

  /**
   * Retry fetching and saving audio for a session
   */
  async retryFetchAudio(sessionId: string): Promise<boolean> {
    const session = await this.prisma.voiceSession.findUnique({
      where: { id: sessionId },
    });

    if (!session || session.audioBase64) return false;

    try {
      const audioBuffer = await this.getConversationAudio(session.conversationId);
      const audioBase64 = audioBuffer.toString('base64');

      await this.prisma.voiceSession.update({
        where: { id: sessionId },
        data: { audioBase64 },
      });

      return true;
    } catch (error) {
      console.error('[ElevenLabsService] Failed to retry fetch audio:', error);
      return false;
    }
  }
}
