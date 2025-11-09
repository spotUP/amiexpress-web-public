/**
 * Type definitions for the Game Prompt Enhancement Wizard
 */

export interface GamePrompt {
  id: string;
  rawText: string;
  enhancedText?: string;
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
  step: 'input' | 'enhance' | 'review' | 'customize' | 'generate';
  currentPrompt: GamePrompt;
  promptHistory: GamePrompt[];
  currentQuestionIndex: number;
  questions: QuestionStep[];
  answers: Record<string, any>;
  isEnhancing: boolean;
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
