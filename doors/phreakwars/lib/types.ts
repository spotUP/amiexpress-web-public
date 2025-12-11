/**
 * PhreakWars Game Types and Interfaces
 *
 * All type definitions for the PhreakWars game.
 */

// Game state interface
export interface PhreakWarsGameState {
  player: {
    handle: string;
    skillLevel: number;
    money: number;
    phoneBills: number;
    computer: {
      ram: number; // KB
      storage: number; // KB
      modemSpeed: number; // baud
      hasBlueBox: boolean;
      hasRedBox: boolean;
    };
    skills: {
      phreaking: number;
      programming: number;
      hacking: number;
    };
    inventory: string[];
    achievements: string[];
  };
  bbs: {
    name: string;
    security: number;
    users: number;
    messages: Array<{
      subject: string;
      body: string;
      author: string;
      timestamp: Date;
    }>;
    files: Array<{
      name: string;
      description: string;
      size: number;
      uploader: string;
    }>;
  };
  ownBbs?: {
    name: string;
    security: number;
    users: number;
    messages: Array<{
      subject: string;
      body: string;
      author: string;
      timestamp: Date;
    }>;
    files: Array<{
      name: string;
      description: string;
      size: number;
      uploader: string;
    }>;
  };
  shadow: {
    relationship: number; // 0-100
    messages: string[];
    lastContact: Date;
    pendingReplies: Array<{
      subject: string;
      body: string;
      timestamp: Date;
    }>;
  };
  dailyLimits: {
    lastReset: Date;
    phreakingAttempts: number;
    hackingAttempts: number;
    programmingSessions: number;
    tradingVisits: number;
    chatMessages: number;
    downloads: number;
    posts: number;
    bbsHacks: number;
  };
  currentMode: string;
  previousMode: string;
  inputBuffer: string;
  postingSubject?: string;
  postingBody?: string;
  minigameType?: string;
  minigameState?: any;
}

// Minigame types
export type MinigameType = 'redbox' | 'bluebox' | 'tonegen' | 'hack' | 'program' | 'bbs_hack';

// Message template for Shadow romance
export interface MessageTemplate {
  subject: string;
  body: string;
  relationshipBoost: number;
  replyChance: number;
  replySubject: string;
  replyBody: string;
}

// Daily limits configuration
export const DAILY_LIMITS = {
  PHREAKING_ATTEMPTS: 10,
  HACKING_ATTEMPTS: 8,
  PROGRAMMING_SESSIONS: 6,
  TRADING_VISITS: 5,
  CHAT_MESSAGES: 15,
  DOWNLOADS: 5,
  POSTS: 3,
  BBS_HACKS: 3
} as const;
