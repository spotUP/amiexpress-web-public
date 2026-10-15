/**
 * Quest System - Player Progression & Achievements
 *
 * Manages quests, objectives, and achievements for RPG-style doors.
 *
 * Features:
 * - Quest tracking (active, completed, failed)
 * - Multi-step objectives
 * - Quest chains
 * - Rewards (items, experience, unlocks)
 * - Achievement system
 * - Progress tracking
 * - Quest journal/log
 *
 * @example Basic Quest
 * ```typescript
 * const quests = new QuestSystem();
 *
 * quests.registerQuest({
 *   id: 'rats_quest',
 *   name: 'Rat Problem',
 *   description: 'Clear the cellar of rats',
 *   objectives: [
 *     { id: 'kill_rats', description: 'Kill 10 rats', target: 10 }
 *   ],
 *   rewards: {
 *     gold: 100,
 *     experience: 50
 *   }
 * });
 *
 * quests.startQuest('rats_quest');
 * quests.updateProgress('rats_quest', 'kill_rats', 1); // increment
 * ```
 *
 * @example Quest Chain
 * ```typescript
 * quests.registerQuest({
 *   id: 'main_quest_1',
 *   name: 'The Beginning',
 *   description: 'Meet the village elder',
 *   onComplete: (rewards) => {
 *     quests.startQuest('main_quest_2'); // Auto-start next quest
 *   }
 * });
 * ```
 */

import { EventEmitter } from 'events';

/**
 * Quest objective
 */
export interface QuestObjective {
  /** Objective ID */
  id: string;
  /** Description */
  description: string;
  /** Current progress */
  progress: number;
  /** Target value */
  target: number;
  /** Is optional? */
  optional?: boolean;
  /** Hidden until revealed */
  hidden?: boolean;
}

/**
 * Quest rewards
 */
export interface QuestRewards {
  /** Gold/currency */
  gold?: number;
  /** Experience points */
  experience?: number;
  /** Item IDs */
  items?: string[];
  /** Unlocked features */
  unlocks?: string[];
  /** Custom rewards */
  custom?: Record<string, any>;
}

/**
 * Quest status
 */
export type QuestStatus = 'available' | 'active' | 'completed' | 'failed' | 'locked';

/**
 * Quest definition
 */
export interface Quest {
  /** Quest ID */
  id: string;
  /** Quest name */
  name: string;
  /** Description */
  description: string;
  /** Quest objectives */
  objectives: QuestObjective[];
  /** Quest rewards */
  rewards?: QuestRewards;
  /** Required level */
  requiredLevel?: number;
  /** Required quest completion */
  requiredQuest?: string;
  /** Quest giver NPC */
  questGiver?: string;
  /** Time limit (seconds) */
  timeLimit?: number;
  /** Repeatable quest? */
  repeatable?: boolean;
  /** Quest category */
  category?: string;
  /** On complete callback */
  onComplete?: (rewards: QuestRewards) => void;
  /** On fail callback */
  onFail?: () => void;
}

/**
 * Active quest state
 */
export interface ActiveQuest extends Quest {
  /** Current status */
  status: QuestStatus;
  /** Start time */
  startTime: Date;
  /** Complete time */
  completeTime?: Date;
  /** Times completed (for repeatable) */
  timesCompleted: number;
}

/**
 * Achievement definition
 */
export interface Achievement {
  /** Achievement ID */
  id: string;
  /** Achievement name */
  name: string;
  /** Description */
  description: string;
  /** Hidden achievement? */
  hidden?: boolean;
  /** Achievement points */
  points?: number;
  /** Icon/badge */
  icon?: string;
  /** Unlock condition */
  condition: (player: any) => boolean;
  /** Reward when unlocked */
  reward?: QuestRewards;
}

/**
 * Unlocked achievement
 */
export interface UnlockedAchievement extends Achievement {
  /** Unlock time */
  unlockedAt: Date;
  /** Reward claimed? */
  claimed: boolean;
}

/**
 * Quest System
 * Manages all quests and achievements
 */
export class QuestSystem extends EventEmitter {
  private quests: Map<string, Quest> = new Map();
  private activeQuests: Map<string, ActiveQuest> = new Map();
  private completedQuests: Set<string> = new Set();
  private failedQuests: Set<string> = new Set();
  private achievements: Map<string, Achievement> = new Map();
  private unlockedAchievements: Map<string, UnlockedAchievement> = new Map();

  constructor() {
    super();
  }

  /**
   * Register quest
   */
  registerQuest(quest: Quest): void {
    // Initialize objectives
    quest.objectives.forEach(obj => {
      obj.progress = 0;
    });

    this.quests.set(quest.id, quest);
    this.emit('quest-registered', quest);
  }

  /**
   * Get quest
   */
  getQuest(questId: string): Quest | undefined {
    return this.quests.get(questId);
  }

  /**
   * Start quest
   */
  startQuest(questId: string): boolean {
    const quest = this.quests.get(questId);
    if (!quest) {
      this.emit('quest-not-found', questId);
      return false;
    }

    // Check if already active
    if (this.activeQuests.has(questId)) {
      return false;
    }

    // Check if can start (requirements)
    if (!this.canStartQuest(questId)) {
      this.emit('quest-requirements-not-met', questId);
      return false;
    }

    // Create active quest
    const activeQuest: ActiveQuest = {
      ...quest,
      status: 'active',
      startTime: new Date(),
      timesCompleted: 0,
      objectives: quest.objectives.map(obj => ({ ...obj, progress: 0 }))
    };

    this.activeQuests.set(questId, activeQuest);
    this.emit('quest-started', activeQuest);

    // Start timer if time limit
    if (quest.timeLimit) {
      setTimeout(() => {
        if (this.activeQuests.has(questId)) {
          this.failQuest(questId, 'Time limit exceeded');
        }
      }, quest.timeLimit * 1000);
    }

    return true;
  }

  /**
   * Check if can start quest
   */
  canStartQuest(questId: string): boolean {
    const quest = this.quests.get(questId);
    if (!quest) return false;

    // Check required quest
    if (quest.requiredQuest && !this.isQuestCompleted(quest.requiredQuest)) {
      return false;
    }

    // Check if already completed (and not repeatable)
    if (!quest.repeatable && this.isQuestCompleted(questId)) {
      return false;
    }

    return true;
  }

  /**
   * Update quest objective progress
   */
  updateProgress(questId: string, objectiveId: string, amount: number = 1): boolean {
    const activeQuest = this.activeQuests.get(questId);
    if (!activeQuest) return false;

    const objective = activeQuest.objectives.find(obj => obj.id === objectiveId);
    if (!objective) return false;

    const oldProgress = objective.progress;
    objective.progress = Math.min(objective.progress + amount, objective.target);

    this.emit('objective-progress', questId, objectiveId, objective.progress, objective.target);

    // Check if objective completed
    if (objective.progress >= objective.target && oldProgress < objective.target) {
      this.emit('objective-completed', questId, objectiveId);
      objective.hidden = false; // Reveal if was hidden
    }

    // Check if all objectives completed
    this.checkQuestCompletion(questId);

    return true;
  }

  /**
   * Set objective progress directly
   */
  setProgress(questId: string, objectiveId: string, value: number): boolean {
    const activeQuest = this.activeQuests.get(questId);
    if (!activeQuest) return false;

    const objective = activeQuest.objectives.find(obj => obj.id === objectiveId);
    if (!objective) return false;

    objective.progress = Math.min(value, objective.target);
    this.emit('objective-progress', questId, objectiveId, objective.progress, objective.target);

    this.checkQuestCompletion(questId);
    return true;
  }

  /**
   * Check if quest is completed
   */
  private checkQuestCompletion(questId: string): void {
    const activeQuest = this.activeQuests.get(questId);
    if (!activeQuest) return;

    // Check all non-optional objectives
    const allCompleted = activeQuest.objectives
      .filter(obj => !obj.optional)
      .every(obj => obj.progress >= obj.target);

    if (allCompleted) {
      this.completeQuest(questId);
    }
  }

  /**
   * Complete quest
   */
  completeQuest(questId: string): boolean {
    const activeQuest = this.activeQuests.get(questId);
    if (!activeQuest) return false;

    activeQuest.status = 'completed';
    activeQuest.completeTime = new Date();
    activeQuest.timesCompleted++;

    this.completedQuests.add(questId);
    this.activeQuests.delete(questId);

    // Grant rewards
    if (activeQuest.rewards) {
      this.emit('quest-rewards', questId, activeQuest.rewards);
    }

    // Call completion callback
    if (activeQuest.onComplete) {
      activeQuest.onComplete(activeQuest.rewards || {});
    }

    this.emit('quest-completed', activeQuest);

    // Check achievements
    this.checkAchievements();

    return true;
  }

  /**
   * Fail quest
   */
  failQuest(questId: string, reason?: string): boolean {
    const activeQuest = this.activeQuests.get(questId);
    if (!activeQuest) return false;

    activeQuest.status = 'failed';
    this.failedQuests.add(questId);
    this.activeQuests.delete(questId);

    // Call failure callback
    if (activeQuest.onFail) {
      activeQuest.onFail();
    }

    this.emit('quest-failed', activeQuest, reason);
    return true;
  }

  /**
   * Abandon quest
   */
  abandonQuest(questId: string): boolean {
    const activeQuest = this.activeQuests.get(questId);
    if (!activeQuest) return false;

    this.activeQuests.delete(questId);
    this.emit('quest-abandoned', activeQuest);
    return true;
  }

  /**
   * Get active quests
   */
  getActiveQuests(): ActiveQuest[] {
    return Array.from(this.activeQuests.values());
  }

  /**
   * Get completed quests
   */
  getCompletedQuests(): string[] {
    return Array.from(this.completedQuests);
  }

  /**
   * Check if quest is completed
   */
  isQuestCompleted(questId: string): boolean {
    return this.completedQuests.has(questId);
  }

  /**
   * Check if quest is active
   */
  isQuestActive(questId: string): boolean {
    return this.activeQuests.has(questId);
  }

  /**
   * Get quest progress percentage
   */
  getQuestProgress(questId: string): number {
    const activeQuest = this.activeQuests.get(questId);
    if (!activeQuest) return 0;

    const totalTarget = activeQuest.objectives.reduce((sum, obj) => sum + obj.target, 0);
    const totalProgress = activeQuest.objectives.reduce((sum, obj) => sum + obj.progress, 0);

    return (totalProgress / totalTarget) * 100;
  }

  /**
   * Register achievement
   */
  registerAchievement(achievement: Achievement): void {
    this.achievements.set(achievement.id, achievement);
    this.emit('achievement-registered', achievement);
  }

  /**
   * Check all achievements
   */
  checkAchievements(player?: any): void {
    for (const achievement of this.achievements.values()) {
      if (this.unlockedAchievements.has(achievement.id)) continue;

      if (achievement.condition(player)) {
        this.unlockAchievement(achievement.id);
      }
    }
  }

  /**
   * Unlock achievement
   */
  unlockAchievement(achievementId: string): boolean {
    const achievement = this.achievements.get(achievementId);
    if (!achievement) return false;

    if (this.unlockedAchievements.has(achievementId)) return false;

    const unlocked: UnlockedAchievement = {
      ...achievement,
      unlockedAt: new Date(),
      claimed: false
    };

    this.unlockedAchievements.set(achievementId, unlocked);
    this.emit('achievement-unlocked', unlocked);

    return true;
  }

  /**
   * Claim achievement reward
   */
  claimAchievementReward(achievementId: string): QuestRewards | null {
    const unlocked = this.unlockedAchievements.get(achievementId);
    if (!unlocked || unlocked.claimed) return null;

    unlocked.claimed = true;

    if (unlocked.reward) {
      this.emit('achievement-reward-claimed', achievementId, unlocked.reward);
      return unlocked.reward;
    }

    return null;
  }

  /**
   * Get unlocked achievements
   */
  getUnlockedAchievements(): UnlockedAchievement[] {
    return Array.from(this.unlockedAchievements.values());
  }

  /**
   * Get achievement progress
   */
  getAchievementProgress(): { unlocked: number; total: number; percentage: number } {
    const total = this.achievements.size;
    const unlocked = this.unlockedAchievements.size;

    return {
      unlocked,
      total,
      percentage: (unlocked / total) * 100
    };
  }

  /**
   * Get available quests (can be started)
   */
  getAvailableQuests(): Quest[] {
    return Array.from(this.quests.values()).filter(quest => this.canStartQuest(quest.id));
  }

  /**
   * Get quests by category
   */
  getQuestsByCategory(category: string): Quest[] {
    return Array.from(this.quests.values()).filter(quest => quest.category === category);
  }

  /**
   * Export quest state to JSON
   */
  exportState(): string {
    return JSON.stringify({
      activeQuests: Array.from(this.activeQuests.entries()),
      completedQuests: Array.from(this.completedQuests),
      failedQuests: Array.from(this.failedQuests),
      unlockedAchievements: Array.from(this.unlockedAchievements.entries())
    }, null, 2);
  }

  /**
   * Import quest state from JSON
   */
  importState(json: string): void {
    const data = JSON.parse(json);

    this.activeQuests = new Map(data.activeQuests);
    this.completedQuests = new Set(data.completedQuests);
    this.failedQuests = new Set(data.failedQuests);
    this.unlockedAchievements = new Map(data.unlockedAchievements);

    this.emit('state-imported');
  }

  /**
   * Reset all quest progress
   */
  reset(): void {
    this.activeQuests.clear();
    this.completedQuests.clear();
    this.failedQuests.clear();
    this.unlockedAchievements.clear();

    this.emit('reset');
  }

  /**
   * Cleanup
   */
  dispose(): void {
    this.quests.clear();
    this.activeQuests.clear();
    this.completedQuests.clear();
    this.failedQuests.clear();
    this.achievements.clear();
    this.unlockedAchievements.clear();
    this.removeAllListeners();
  }
}
