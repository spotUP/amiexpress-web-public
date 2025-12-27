/**
 * Game Animations
 *
 * Grade-up, COOL/REGRET, line clear flash, lock glow, etc.
 */

/**
 * Animation types
 */
export type AnimationType =
  | 'gradeUp'
  | 'cool'
  | 'regret'
  | 'lineClearFlash'
  | 'lockGlow'
  | 'perfectClear'
  | 'comboCounter'
  | 'tSpin';

/**
 * Animation state
 */
export interface Animation {
  type: AnimationType;
  elapsed: number;
  duration: number;
  data?: any;
}

/**
 * Grade-up animation data
 */
export interface GradeUpData {
  oldGrade: string;
  newGrade: string;
  x: number;
  y: number;
}

/**
 * Section result animation data
 */
export interface SectionResultData {
  result: 'COOL' | 'REGRET';
  section: number;
}

/**
 * Line clear flash data
 */
export interface LineClearFlashData {
  lines: number[];  // Y positions of cleared lines
  intensity: number; // 1-4 (single to tetris)
}

/**
 * Lock glow data
 */
export interface LockGlowData {
  cells: Array<{ x: number; y: number }>;
  color: string;
}

/**
 * Animation manager
 */
export class AnimationManager {
  private animations: Animation[] = [];

  /**
   * Trigger grade-up animation
   */
  gradeUp(oldGrade: string, newGrade: string, x: number, y: number): void {
    this.animations.push({
      type: 'gradeUp',
      elapsed: 0,
      duration: 1000,
      data: { oldGrade, newGrade, x, y } as GradeUpData,
    });
  }

  /**
   * Trigger COOL animation
   */
  cool(section: number): void {
    this.animations.push({
      type: 'cool',
      elapsed: 0,
      duration: 800,
      data: { result: 'COOL', section } as SectionResultData,
    });
  }

  /**
   * Trigger REGRET animation
   */
  regret(section: number): void {
    this.animations.push({
      type: 'regret',
      elapsed: 0,
      duration: 800,
      data: { result: 'REGRET', section } as SectionResultData,
    });
  }

  /**
   * Trigger line clear flash
   */
  lineClearFlash(lines: number[], intensity: number): void {
    this.animations.push({
      type: 'lineClearFlash',
      elapsed: 0,
      duration: 200,
      data: { lines, intensity } as LineClearFlashData,
    });
  }

  /**
   * Trigger lock glow
   */
  lockGlow(cells: Array<{ x: number; y: number }>, color: string): void {
    this.animations.push({
      type: 'lockGlow',
      elapsed: 0,
      duration: 100,
      data: { cells, color } as LockGlowData,
    });
  }

  /**
   * Trigger combo counter animation for milestone achievements
   */
  comboCounter(combo: number, milestone: number): void {
    this.animations.push({
      type: 'comboCounter',
      elapsed: 0,
      duration: 600,
      data: { combo, milestone },
    });
  }

  /**
   * Trigger perfect clear animation
   */
  perfectClear(): void {
    this.animations.push({
      type: 'perfectClear',
      elapsed: 0,
      duration: 1500,
    });
  }

  /**
   * Trigger T-Spin animation
   */
  tSpin(x: number, y: number): void {
    this.animations.push({
      type: 'tSpin',
      elapsed: 0,
      duration: 500,
      data: { x, y },
    });
  }

  /**
   * Update all animations
   */
  update(deltaTime: number): void {
    this.animations = this.animations.filter(anim => {
      anim.elapsed += deltaTime;
      return anim.elapsed < anim.duration;
    });
  }

  /**
   * Get all active animations
   */
  getAnimations(): Animation[] {
    return this.animations;
  }

  /**
   * Get animations of specific type
   */
  getAnimationsByType(type: AnimationType): Animation[] {
    return this.animations.filter(anim => anim.type === type);
  }

  /**
   * Check if animation type is active
   */
  hasAnimation(type: AnimationType): boolean {
    return this.animations.some(anim => anim.type === type);
  }

  /**
   * Clear all animations
   */
  clear(): void {
    this.animations = [];
  }

  /**
   * Clear animations of specific type
   */
  clearType(type: AnimationType): void {
    this.animations = this.animations.filter(anim => anim.type !== type);
  }
}

/**
 * Animation rendering helpers
 */
export class AnimationRenderer {
  /**
   * Render grade-up animation
   */
  static renderGradeUp(anim: Animation): string {
    const data = anim.data as GradeUpData;
    const progress = anim.elapsed / anim.duration;

    // Fade in, hold, fade out
    let alpha = 1;
    if (progress < 0.2) {
      alpha = progress / 0.2;
    } else if (progress > 0.8) {
      alpha = (1 - progress) / 0.2;
    }

    // Pulse effect
    const scale = 1 + Math.sin(progress * Math.PI * 4) * 0.1;

    // Color based on grade
    const color = this.getGradeColor(data.newGrade);

    return `{${color}-fg}{bold}GRADE UP!{/bold}\n${data.oldGrade} → ${data.newGrade}{/${color}-fg}`;
  }

  /**
   * Render COOL/REGRET banner
   */
  static renderSectionResult(anim: Animation): string {
    const data = anim.data as SectionResultData;
    const progress = anim.elapsed / anim.duration;

    // Slide in from right
    const slideX = progress < 0.3
      ? Math.floor((1 - progress / 0.3) * 20)
      : 0;

    // Fade out
    const alpha = progress > 0.7
      ? (1 - progress) / 0.3
      : 1;

    if (data.result === 'COOL') {
      return `{cyan-fg}{bold}${'  '.repeat(slideX)}COOL!{/bold}{/cyan-fg}`;
    } else {
      return `{red-fg}{bold}${'  '.repeat(slideX)}REGRET{/bold}{/red-fg}`;
    }
  }

  /**
   * Get line clear flash intensity
   */
  static getFlashIntensity(anim: Animation): number {
    const progress = anim.elapsed / anim.duration;

    // Quick flash, exponential decay
    return Math.pow(1 - progress, 2);
  }

  /**
   * Get lock glow intensity
   */
  static getLockGlowIntensity(anim: Animation): number {
    const progress = anim.elapsed / anim.duration;

    // Quick bright flash, then fade
    if (progress < 0.2) {
      return 1;
    } else {
      return Math.pow((1 - progress) / 0.8, 2);
    }
  }

  /**
   * Get grade color
   */
  private static getGradeColor(grade: string): string {
    if (grade === 'GM') return 'yellow';
    if (grade.startsWith('M')) return 'red';
    if (grade.startsWith('m')) return 'magenta';
    if (grade.startsWith('S')) return 'cyan';
    return 'white';
  }
}
