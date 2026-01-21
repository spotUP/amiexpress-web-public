import type { Achievement, AchievementCondition, UserStats } from '../types/user';
import type { Task, Project } from '../types/project';
import type { DataManager } from './data-manager';

export function getDefaultAchievements(): Record<string, Achievement> {
  return {
    // Tasks Category (8 achievements)
    'first-release': {
      id: 'first-release',
      name: 'First Release',
      description: 'Complete your first task',
      points: 10,
      icon: '[X]',
      category: 'tasks',
      condition: { type: 'tasks-completed', count: 1 }
    },
    'getting-started': {
      id: 'getting-started',
      name: 'Getting Started',
      description: 'Complete 5 tasks',
      points: 25,
      icon: '[*]',
      category: 'tasks',
      condition: { type: 'tasks-completed', count: 5 }
    },
    'productive': {
      id: 'productive',
      name: 'Productive',
      description: 'Complete 25 tasks',
      points: 100,
      icon: '[!]',
      category: 'tasks',
      condition: { type: 'tasks-completed', count: 25 }
    },
    'unstoppable': {
      id: 'unstoppable',
      name: 'Unstoppable',
      description: 'Complete 100 tasks',
      points: 500,
      icon: '[+]',
      category: 'tasks',
      condition: { type: 'tasks-completed', count: 100 }
    },
    'code-wizard': {
      id: 'code-wizard',
      name: 'Code Wizard',
      description: 'Complete 10 coding tasks',
      points: 50,
      icon: '[C]',
      category: 'tasks',
      condition: { type: 'tasks-per-category', count: 10, category: 'code' }
    },
    'pixel-perfectionist': {
      id: 'pixel-perfectionist',
      name: 'Pixel Perfectionist',
      description: 'Complete 10 graphics tasks',
      points: 50,
      icon: '[G]',
      category: 'tasks',
      condition: { type: 'tasks-per-category', count: 10, category: 'gfx' }
    },
    'beat-master': {
      id: 'beat-master',
      name: 'Beat Master',
      description: 'Complete 10 music tasks',
      points: 50,
      icon: '[M]',
      category: 'tasks',
      condition: { type: 'tasks-per-category', count: 10, category: 'music' }
    },
    'swiss-army-knife': {
      id: 'swiss-army-knife',
      name: 'Swiss Army Knife',
      description: 'Complete tasks in all 7 categories',
      points: 100,
      icon: '[A]',
      category: 'tasks',
      condition: { type: 'all-categories' }
    },

    // Projects Category (5 achievements)
    'project-starter': {
      id: 'project-starter',
      name: 'Project Starter',
      description: 'Create your first project',
      points: 10,
      icon: '[P]',
      category: 'projects',
      condition: { type: 'projects-created', count: 1 }
    },
    'organizer': {
      id: 'organizer',
      name: 'Organizer',
      description: 'Create 5 projects',
      points: 50,
      icon: '[O]',
      category: 'projects',
      condition: { type: 'projects-created', count: 5 }
    },
    'production-house': {
      id: 'production-house',
      name: 'Production House',
      description: 'Create 10 projects',
      points: 150,
      icon: '[H]',
      category: 'projects',
      condition: { type: 'projects-created', count: 10 }
    },
    '64k-hero': {
      id: '64k-hero',
      name: '64k Hero',
      description: 'Complete a 64k intro project',
      points: 200,
      icon: '[6]',
      category: 'projects',
      condition: { type: 'project-size', count: 65536 }
    },
    '4k-legend': {
      id: '4k-legend',
      name: '4k Legend',
      description: 'Complete a 4k intro project',
      points: 300,
      icon: '[4]',
      category: 'projects',
      condition: { type: 'project-size', count: 4096 }
    },

    // Parties Category (6 achievements)
    'party-animal': {
      id: 'party-animal',
      name: 'Party Animal',
      description: 'Submit to your first demoparty',
      points: 200,
      icon: '[D]',
      category: 'parties',
      condition: { type: 'party-submissions', count: 1 }
    },
    'the-real-thing': {
      id: 'the-real-thing',
      name: 'The Real Thing',
      description: 'Submit to 5 different parties',
      points: 500,
      icon: '[R]',
      category: 'parties',
      condition: { type: 'party-submissions', count: 5 }
    },
    'competition-winner': {
      id: 'competition-winner',
      name: 'Competition Winner',
      description: 'Mark project as released',
      points: 100,
      icon: '[W]',
      category: 'parties',
      condition: { type: 'project-released' }
    },
    'revision-regular': {
      id: 'revision-regular',
      name: 'Revision Regular',
      description: 'Submit to Revision party',
      points: 150,
      icon: '[V]',
      category: 'parties',
      condition: { type: 'specific-party', partyId: 'revision' }
    },
    'assembly-attendee': {
      id: 'assembly-attendee',
      name: 'Assembly Attendee',
      description: 'Submit to Assembly party',
      points: 150,
      icon: '[S]',
      category: 'parties',
      condition: { type: 'specific-party', partyId: 'assembly' }
    },
    'evoke-enthusiast': {
      id: 'evoke-enthusiast',
      name: 'Evoke Enthusiast',
      description: 'Submit to Evoke party',
      points: 150,
      icon: '[E]',
      category: 'parties',
      condition: { type: 'specific-party', partyId: 'evoke' }
    },

    // Speed & Crunch Category (5 achievements)
    'speed-demon': {
      id: 'speed-demon',
      name: 'Speed Demon',
      description: 'Complete 5 tasks in one day',
      points: 100,
      icon: '[F]',
      category: 'special',
      condition: { type: 'tasks-per-day', count: 5 }
    },
    'crunch-master': {
      id: 'crunch-master',
      name: 'Crunch Master',
      description: 'Complete 10 tasks within 48h of party deadline',
      points: 200,
      icon: '[U]',
      category: 'special',
      condition: { type: 'tasks-near-deadline', count: 10, timeframe: 48 * 60 * 60 * 1000 }
    },
    'all-nighter': {
      id: 'all-nighter',
      name: 'All-Nighter',
      description: 'Complete 3 tasks between midnight and 6am',
      points: 150,
      icon: '[N]',
      category: 'special',
      condition: { type: 'tasks-night', count: 3 }
    },
    'weekend-warrior': {
      id: 'weekend-warrior',
      name: 'Weekend Warrior',
      description: 'Complete 10 tasks on weekends',
      points: 100,
      icon: '[K]',
      category: 'special',
      condition: { type: 'tasks-weekend', count: 10 }
    },
    'deadline-dodger': {
      id: 'deadline-dodger',
      name: 'Deadline Dodger',
      description: 'Complete project with <24h to party',
      points: 250,
      icon: '[L]',
      category: 'special',
      condition: { type: 'tasks-near-deadline', count: 1, timeframe: 24 * 60 * 60 * 1000 }
    },

    // Social & Collaboration Category (3 achievements)
    'team-player': {
      id: 'team-player',
      name: 'Team Player',
      description: 'Assign 10 tasks to other users',
      points: 50,
      icon: '[T]',
      category: 'social',
      condition: { type: 'tasks-assigned', count: 10 }
    },
    'helpful': {
      id: 'helpful',
      name: 'Helpful',
      description: 'Complete 5 tasks assigned by others',
      points: 75,
      icon: '[Y]',
      category: 'social',
      condition: { type: 'tasks-from-others', count: 5 }
    },
    'crew-leader': {
      id: 'crew-leader',
      name: 'Crew Leader',
      description: 'Have 3+ users with tasks in your project',
      points: 100,
      icon: '[Q]',
      category: 'social',
      condition: { type: 'project-collaborators', count: 3 }
    },

    // Special Category (3 achievements)
    'scene-veteran': {
      id: 'scene-veteran',
      name: 'Scene Veteran',
      description: 'Active for 365 days',
      points: 500,
      icon: '[Z]',
      category: 'special',
      condition: { type: 'days-active', count: 365 }
    },
    'completionist': {
      id: 'completionist',
      name: 'Completionist',
      description: 'Unlock 25 other achievements',
      points: 1000,
      icon: '[J]',
      category: 'special',
      condition: { type: 'achievements-unlocked', count: 25 }
    },
    'legend-status': {
      id: 'legend-status',
      name: 'Legend Status',
      description: 'Reach Legend level (2000 pts total)',
      points: 0,
      icon: '[B]',
      category: 'special',
      condition: { type: 'level-reached' }
    }
  };
}

export class AchievementManager {
  constructor(private dataManager: DataManager) {}

  async checkAchievements(user: UserStats): Promise<string[]> {
    const newlyUnlocked: string[] = [];
    const achievements = await this.dataManager.loadAchievements();
    const allTasks = await this.dataManager.loadTasks();
    const allProjects = await this.dataManager.loadProjects();

    for (const [id, achievement] of Object.entries(achievements)) {
      if (user.achievements.includes(id)) continue;

      if (await this.meetsCondition(user, allTasks, allProjects, achievement.condition)) {
        user.achievements.push(id);
        user.points += achievement.points;
        newlyUnlocked.push(id);
      }
    }

    if (newlyUnlocked.length > 0) {
      await this.dataManager.updateUser(user);
      await this.dataManager.updateRankings();
    }

    return newlyUnlocked;
  }

  private async meetsCondition(
    user: UserStats,
    allTasks: Task[],
    allProjects: Project[],
    condition: AchievementCondition
  ): Promise<boolean> {
    const userTasks = allTasks.filter(t => t.assignedTo === user.userId && t.status === 'done');
    const userProjects = allProjects.filter(p => p.createdBy === user.userId);

    switch (condition.type) {
      case 'tasks-completed':
        return user.tasksCompleted >= (condition.count ?? 0);

      case 'projects-created':
        return user.projectsCreated >= (condition.count ?? 0);

      case 'party-submissions': {
        const projectsWithParties = userProjects.filter(p => p.partyId && p.status === 'released');
        const uniqueParties = new Set(projectsWithParties.map(p => p.partyId));
        return uniqueParties.size >= (condition.count ?? 0);
      }

      case 'tasks-per-day': {
        const today = new Date().toDateString();
        const tasksToday = userTasks.filter(t =>
          t.completedAt && new Date(t.completedAt).toDateString() === today
        );
        return tasksToday.length >= (condition.count ?? 0);
      }

      case 'tasks-near-deadline': {
        const projectsWithDeadlines = userProjects.filter(p => p.partyId);
        let tasksNearDeadline = 0;

        for (const project of projectsWithDeadlines) {
          const parties = await this.dataManager.loadParties();
          const party = parties.find(p => p.id === project.partyId);
          if (!party) continue;

          const partyDate = new Date(party.date).getTime();
          const projectTasks = userTasks.filter(t => t.projectId === project.id);

          for (const task of projectTasks) {
            if (task.completedAt) {
              const completedTime = new Date(task.completedAt).getTime();
              const timeToDeadline = partyDate - completedTime;
              if (timeToDeadline > 0 && timeToDeadline <= (condition.timeframe ?? 0)) {
                tasksNearDeadline++;
              }
            }
          }
        }

        return tasksNearDeadline >= (condition.count ?? 0);
      }

      case 'tasks-night': {
        const nightTasks = userTasks.filter(t => {
          if (!t.completedAt) return false;
          const hour = new Date(t.completedAt).getHours();
          return hour >= 0 && hour < 6;
        });
        return nightTasks.length >= (condition.count ?? 0);
      }

      case 'tasks-weekend': {
        const weekendTasks = userTasks.filter(t => {
          if (!t.completedAt) return false;
          const day = new Date(t.completedAt).getDay();
          return day === 0 || day === 6;
        });
        return weekendTasks.length >= (condition.count ?? 0);
      }

      case 'tasks-assigned': {
        const tasksAssignedByUser = allTasks.filter(
          t => t.assignedTo && t.assignedTo !== user.userId
        );
        return tasksAssignedByUser.length >= (condition.count ?? 0);
      }

      case 'tasks-from-others': {
        const tasksFromOthers = userTasks.filter(t => {
          const project = allProjects.find(p => p.id === t.projectId);
          return project && project.createdBy !== user.userId;
        });
        return tasksFromOthers.length >= (condition.count ?? 0);
      }

      case 'project-collaborators': {
        const userProjectIds = userProjects.map(p => p.id);
        const collaborators = new Set<string>();

        for (const task of allTasks) {
          if (userProjectIds.includes(task.projectId) && task.assignedTo && task.assignedTo !== user.userId) {
            collaborators.add(task.assignedTo);
          }
        }

        return collaborators.size >= (condition.count ?? 0);
      }

      case 'days-active': {
        const joinDate = new Date(user.joinedAt).getTime();
        const now = Date.now();
        const daysActive = Math.floor((now - joinDate) / (24 * 60 * 60 * 1000));
        return daysActive >= (condition.count ?? 0);
      }

      case 'achievements-unlocked':
        return user.achievements.length >= (condition.count ?? 0);

      case 'level-reached':
        return user.level === 'legend';

      case 'tasks-per-category': {
        const categoryTasks = userTasks.filter(t => t.category === condition.category);
        return categoryTasks.length >= (condition.count ?? 0);
      }

      case 'all-categories': {
        const categories = new Set(userTasks.map(t => t.category));
        return categories.size === 7;
      }

      case 'project-size': {
        const sizedProjects = userProjects.filter(
          p => p.sizeLimit && p.sizeLimit <= (condition.count ?? 0) && p.status === 'released'
        );
        return sizedProjects.length > 0;
      }

      case 'project-released': {
        const releasedProjects = userProjects.filter(p => p.status === 'released');
        return releasedProjects.length > 0;
      }

      case 'specific-party': {
        const partyProjects = userProjects.filter(p =>
          p.partyId?.includes(condition.partyId ?? '') && p.status === 'released'
        );
        return partyProjects.length > 0;
      }

      default:
        return false;
    }
  }
}
