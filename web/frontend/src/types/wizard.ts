/**
 * Type definitions for the Game Prompt Enhancement Wizard
 */

export interface GamePrompt {
  id: string;
  rawText: string;
  enhancedText?: string;
  audioDescription?: string;
  enhancedAudioDescription?: string;
  version: number;
  timestamp: number;
  metadata: PromptMetadata;
}

export interface PromptMetadata {
  genre?: string;
  targetPlatform?: string[];
  artStyle?: string;
  difficulty?: string;
  gameLength?: string;
  multiplayer?: boolean;
  controls?: string[];
  themes?: string[];
  mechanics?: string[];
  audioMetadata?: AudioMetadata;
}

export interface AudioMetadata {
  musicStyle?: string[];
  soundEffects?: string[];
  moodProgression?: string;
  integration?: string[];
  technicalNeeds?: string[];
  accessibility?: string[];
  volumeBalance?: number; // 0-100
  tempoAdjustment?: number; // 0-100
  audioLength?: string;
  licensing?: string;
  voiceActing?: boolean;
}

export interface QuestionStep {
  id: string;
  category: string;
  question: string;
  description?: string;
  type: 'single-choice' | 'multi-choice' | 'text' | 'slider' | 'toggle';
  options?: QuestionOption[];
  defaultValue?: any;
  importance: 'critical' | 'high' | 'medium' | 'low';
  skip: boolean;
}

export interface QuestionOption {
  label: string;
  value: string;
  description?: string;
  icon?: string;
}

export interface WizardState {
  step: 'input' | 'enhance' | 'review' | 'audio' | 'audio-review' | 'customize' | 'generate';
  currentPrompt: GamePrompt;
  promptHistory: GamePrompt[];
  currentQuestionIndex: number;
  questions: QuestionStep[];
  audioQuestions: QuestionStep[];
  currentAudioQuestionIndex: number;
  answers: Record<string, any>;
  audioAnswers: Record<string, any>;
  isEnhancing: boolean;
  isEnhancingAudio: boolean;
  isGenerating: boolean;
  error?: string;
}

export interface GameTemplate {
  id: string;
  name: string;
  category: string;
  description: string;
  examplePrompt: string;
  thumbnail?: string;
  tags: string[];
  metadata: PromptMetadata;
}

export interface EnhancementRequest {
  rawPrompt: string;
  context?: PromptMetadata;
  enhancementLevel: 'basic' | 'detailed' | 'comprehensive';
}

export interface EnhancementResponse {
  original: string;
  enhanced: string;
  suggestions: string[];
  detectedMetadata: PromptMetadata;
  improvements: Enhancement[];
}

export interface Enhancement {
  category: string;
  original: string;
  improved: string;
  reason: string;
}

export interface GenerationConfig {
  prompt: string;
  metadata: PromptMetadata;
  answers: Record<string, any>;
  template?: string;
}

export interface GenerationResult {
  success: boolean;
  doorName: string;
  doorPath: string;
  message: string;
  errors?: string[];
}

export interface AudioEnhancementRequest {
  rawAudioDescription: string;
  context?: PromptMetadata;
  enhancementLevel: 'basic' | 'detailed' | 'comprehensive';
}

export interface AudioEnhancementResponse {
  original: string;
  enhanced: string;
  suggestions: string[];
  detectedMetadata: AudioMetadata;
  improvements: AudioImprovement[];
}

export interface AudioImprovement {
  category: string;
  original: string;
  improved: string;
  reason: string;
}

export interface AudioPreview {
  id: string;
  name: string;
  description: string;
  category: 'music' | 'sfx' | 'ambient';
  duration: number; // in seconds
  approved: boolean;
  synthesisParams?: any; // Tone.js parameters
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
