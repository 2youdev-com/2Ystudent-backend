/**
 * Engineering Mentor Voice Configuration for ElevenLabs TTS
 * Each mentor has a unique voice ID and teaching personality
 *
 * 2YStudy Engineering Training Platform
 *
 * Voice IDs:
 * - Male English: mlvXFS1MP5qndOFkWz1M
 * - Female English: yT6a4iSaggBxW2BTSFGH
 */

export interface TeacherVoiceConfig {
  voiceId: string;
  personality: 'professional' | 'friendly' | 'wise' | 'challenging';
  welcomeMessage: {
    ar: string;
    en: string;
  };
}

export const TEACHER_VOICES: Record<string, TeacherVoiceConfig> = {
  // Alex - Fundamentals Teacher (male)
  ahmed: {
    voiceId: 'mlvXFS1MP5qndOFkWz1M',
    personality: 'friendly',
    welcomeMessage: {
      ar: 'Welcome! I am Alex, your Fundamentals Teacher. I will help you understand electromechanical engineering basics in an easy and enjoyable way.',
      en: 'Welcome! I am Alex, your Fundamentals Teacher. I will help you understand electromechanical engineering basics in an easy and enjoyable way.',
    },
  },
  // Emily - Practical Applications (female)
  noura: {
    voiceId: 'yT6a4iSaggBxW2BTSFGH',
    personality: 'challenging',
    welcomeMessage: {
      ar: 'Hello! I am Emily, your Practical Applications Teacher. Get ready for a challenge - I will push you to be the best version of yourself.',
      en: 'Hello! I am Emily, your Practical Applications Teacher. Get ready for a challenge - I will push you to be the best version of yourself.',
    },
  },
  // James - Senior Technical Coach (male)
  anas: {
    voiceId: 'mlvXFS1MP5qndOFkWz1M',
    personality: 'professional',
    welcomeMessage: {
      ar: 'Welcome. I am James, your Senior Technical Coach. We will work together at a professional level.',
      en: 'Welcome. I am James, your Senior Technical Coach. We will work together at a professional level.',
    },
  },
  // Robert - Growth Mentor (male)
  abdullah: {
    voiceId: 'mlvXFS1MP5qndOFkWz1M',
    personality: 'wise',
    welcomeMessage: {
      ar: 'Welcome. I am Robert, your Growth Mentor. I will help you understand your progress and develop yourself based on your actual performance data.',
      en: 'Welcome. I am Robert, your Growth Mentor. I will help you understand your progress and develop yourself based on your actual performance data.',
    },
  },
  // Lisa - Welcome Bot (female)
  sara: {
    voiceId: 'yT6a4iSaggBxW2BTSFGH',
    personality: 'friendly',
    welcomeMessage: {
      ar: "Hello and welcome! I'm Lisa, your onboarding guide. So happy you're here! Let me help you get started.",
      en: "Hello and welcome! I'm Lisa, your onboarding guide. So happy you're here! Let me help you get started.",
    },
  },
  // Legacy names kept for backward compatibility
  james: {
    voiceId: 'mlvXFS1MP5qndOFkWz1M',
    personality: 'friendly',
    welcomeMessage: {
      ar: 'Welcome to the 2YStudy engineering training platform.',
      en: "Welcome to 2YStudy! I'm here to help you with your engineering training journey.",
    },
  },
};

/**
 * Get voice configuration for a mentor
 * Falls back to ahmed (default male) if not found
 */
export function getTeacherVoice(teacherName: string): TeacherVoiceConfig {
  const normalizedName = teacherName.toLowerCase();
  return TEACHER_VOICES[normalizedName] || TEACHER_VOICES.ahmed;
}

/**
 * Get just the voice ID for a mentor from static config
 * Falls back to ahmed if not found
 */
export function getTeacherVoiceId(teacherName: string): string {
  return getTeacherVoice(teacherName).voiceId;
}

/**
 * Check if mentor exists in static config
 */
export function isStaticTeacher(teacherName: string): boolean {
  return teacherName.toLowerCase() in TEACHER_VOICES;
}

/**
 * Get welcome message for a mentor
 */
export function getTeacherWelcome(teacherName: string, language: 'ar' | 'en'): string {
  const config = getTeacherVoice(teacherName);
  return config.welcomeMessage[language];
}
