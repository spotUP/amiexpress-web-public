export type UserLevel = 'lamer' | 'scener' | 'elite' | 'legend';

export interface UserStats {
  userId: string;
  handle: string;
  points: number;
  level: UserLevel;
  rank: number;
  tasksCompleted: number;
  projectsCreated: number;
  achievements: string[];
  joinedAt: string;
  lastActiveAt: string;
}

export type AchievementCategory = 'tasks' | 'projects' | 'parties' | 'social' | 'special';

export interface AchievementCondition {
  type: 'tasks-completed' | 'projects-created' | 'party-submissions' | 'tasks-per-day' |
        'tasks-near-deadline' | 'tasks-night' | 'tasks-weekend' | 'tasks-assigned' |
        'tasks-from-others' | 'project-collaborators' | 'days-active' | 'achievements-unlocked' |
        'level-reached' | 'tasks-per-category' | 'all-categories' | 'project-size' | 'project-released' |
        'specific-party';
  count?: number;
  category?: string;
  partyId?: string;
  timeframe?: number;
}

export interface Achievement {
  id: string;
  name: string;
  description: string;
  points: number;
  icon: string;
  category: AchievementCategory;
  condition: AchievementCondition;
}
