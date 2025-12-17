
export type Language = {
  code: string;
  name: string;
  nativeName: string;
};

export type PersonaType = 'Inquisitor' | 'Ancient Deity' | 'Commander' | 'Merciful' | 'Chaos Weaver';
export type NarrativePath = 'Negotiator' | 'Trickster' | 'Rebel';
export type Ability = 'Synonym Swap' | 'Grammar Shield';

export interface Persona {
  id: PersonaType;
  name: string;
  description: string;
  voice: 'Charon' | 'Puck' | 'Fenrir' | 'Kore' | 'Zephyr';
  systemInstruction: string;
}

export type Difficulty = 'Apprentice' | 'Diplomat' | 'Elite';

export interface Message {
  role: 'user' | 'ai';
  content: string;
  isError?: boolean;
  explanation?: string;
  timestamp: number;
}

export interface GameSettings {
  primaryColor: string;
  theme: 'dark' | 'light';
  baseTime: number;
  xp: number;
  unlockedAbilities: Ability[];
}

export interface GameState {
  status: 'start' | 'difficulty' | 'playing' | 'gameover' | 'victory' | 'surrender' | 'path_selection';
  lives: number;
  turn: number;
  targetLanguage: Language | null;
  difficulty: Difficulty;
  persona: PersonaType;
  timeLeft: number;
  hasSeenTutorial: boolean;
  tension: number; // 0 to 100
  path: NarrativePath;
  isSettingsOpen: boolean;
  isSkillTreeOpen: boolean;
  scavengeTarget: string | null;
}

export interface AIResponse {
  reply: string;
  mistakeFound: boolean;
  explanation: string;
  languageViolation: boolean;
  tensionIncrease: number;
}
