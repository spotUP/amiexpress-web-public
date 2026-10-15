/**
 * Wizard Types for Game/Audio Template Generation
 */

// Game Template Types
export interface GameMetadata {
  genre: string;
  targetPlatform: string[];
  artStyle: string;
  difficulty: string;
  gameLength: string;
  multiplayer: boolean;
  controls: string[];
  themes: string[];
  mechanics: string[];
}

export interface GameTemplate {
  id: string;
  name: string;
  category: string;
  description: string;
  examplePrompt: string;
  tags: string[];
  metadata: GameMetadata;
}

// Audio Template Types
export interface AudioMetadata {
  musicStyle: string[];
  soundEffects: string[];
  moodProgression: string;
  integration: string[];
  technicalNeeds: string[];
  accessibility: string[];
  volumeBalance: number;
  tempoAdjustment: number;
  audioLength: string;
  licensing: string;
  voiceActing: boolean;
}

export interface AudioTemplate {
  id: string;
  name: string;
  category: string;
  description: string;
  exampleDescription: string;
  tags: string[];
  metadata: AudioMetadata;
}

// Question Step Types for Wizard
export interface QuestionOption {
  label: string;
  value: string;
  description?: string;
}

export interface QuestionStep {
  id: string;
  category: string;
  question: string;
  description: string;
  type: 'multi-choice' | 'single-choice' | 'text' | 'number' | 'range';
  options?: QuestionOption[];
  importance: 'critical' | 'high' | 'medium' | 'low';
  skip: boolean;
  defaultValue?: string | number | string[];
  min?: number;
  max?: number;
}
