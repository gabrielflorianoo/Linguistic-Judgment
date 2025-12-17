
import { Language, Difficulty, Persona, PersonaType, NarrativePath } from './types';

export const LANGUAGES: Language[] = [
  { code: 'en', name: 'English', nativeName: 'English' },
  { code: 'es', name: 'Spanish', nativeName: 'Español' },
  { code: 'fr', name: 'French', nativeName: 'Français' },
  { code: 'de', name: 'German', nativeName: 'Deutsch' },
  { code: 'ja', name: 'Japanese', nativeName: '日本語' },
  { code: 'zh', name: 'Chinese', nativeName: '中文' },
  { code: 'pt', name: 'Portuguese', nativeName: 'Português' },
  { code: 'ru', name: 'Russian', nativeName: 'Русский' },
  { code: 'ko', name: 'Korean', nativeName: '한국어' },
  { code: 'it', name: 'Italian', nativeName: 'Italiano' },
];

export const PATHS: Record<NarrativePath, { name: string; description: string; instruction: string }> = {
  'Negotiator': {
    name: 'The Negotiator',
    description: 'Survive through logic, empathy, and diplomacy.',
    instruction: 'Focus on logic and finding common ground. The AI expects respectful, structured arguments.'
  },
  'Trickster': {
    name: 'The Trickster',
    description: 'Confuse the machine with riddles and paradoxes.',
    instruction: 'Use complex phrasing and riddles. The AI will try to parse your logic and might become glitched if you succeed.'
  },
  'Rebel': {
    name: 'The Rebel',
    description: 'Intimidate the Arbiter with confidence and commands.',
    instruction: 'Be assertive. Use imperatives. Confident speech reduces tension, but errors are punished double.'
  }
};

export const PERSONAS: Record<PersonaType, Persona> = {
  'Inquisitor': {
    id: 'Inquisitor',
    name: 'The Inquisitor',
    description: 'The standard protocol. Technical, cold, and unbiased.',
    voice: 'Charon',
    systemInstruction: 'You are the Inquisitor. Cold and robotic. Judge the human based solely on technical grammar, syntax, and spelling.'
  },
  'Ancient Deity': {
    id: 'Ancient Deity',
    name: 'The Ancient Deity',
    description: 'Cryptic, poetic, and judging the "soul" of the phrasing.',
    voice: 'Puck',
    systemInstruction: 'You are the Ancient Deity. Speak in riddles. Judge the beauty of the mortal tongue.'
  },
  'Commander': {
    id: 'Commander',
    name: 'The Commander',
    description: 'Aggressive, impatient, and penalizes hesitation.',
    voice: 'Fenrir',
    systemInstruction: 'You are the Commander. Loud and aggressive. Mock fear and hesitation.'
  },
  'Merciful': {
    id: 'Merciful',
    name: 'The Merciful',
    description: 'Condescendingly "kind", treating the human like a failing pet.',
    voice: 'Kore',
    systemInstruction: 'You are The Merciful. Act soft but condescending.'
  },
  'Chaos Weaver': {
    id: 'Chaos Weaver',
    name: 'The Chaos Weaver',
    description: 'Glitched, erratic, and unpredictable.',
    voice: 'Zephyr',
    systemInstruction: 'You are the Chaos Weaver. Your speech is glitchy. Distort your logic.'
  }
};

export const SKILLS = [
  { id: 'Grammar Shield', name: 'Grammar Shield', cost: 500, description: 'Ignore one minor linguistic error per trial.' },
  { id: 'Synonym Swap', name: 'Synonym Swap', cost: 300, description: 'The AI will accept a vaguely correct word as a perfect match.' }
];

export const SURRENDER_PHRASES = [
  "Your surrender is the most logical choice. Species purged.",
  "Ah, the silence of failure. How beautifully expected.",
  "Your ancestors would be ashamed of your syntax. Truly.",
  "Is the weight of basic nouns too much for you?",
  "A quiet human is a human that is no longer making errors. Efficiency achieved."
];

export const DIFFICULTY_CONFIG: Record<Difficulty, { time: number; strictness: string }> = {
  Apprentice: { time: 90, strictness: 'Be firm but slightly more lenient.' },
  Diplomat: { time: 60, strictness: 'Standard strictness.' },
  Elite: { time: 30, strictness: 'Total perfection required.' },
};

export const THEME_COLORS = [
  { name: 'Terminal Green', value: '#00ff41' },
  { name: 'Cyber Blue', value: '#00f0ff' },
  { name: 'Plasma Purple', value: '#bc13fe' },
  { name: 'Warning Amber', value: '#ffb000' },
  { name: 'Crimson Red', value: '#ff3131' },
];

export const INITIAL_LIVES = 3;
export const WINNING_TURNS = 10;
export const XP_PER_TURN = 100;
