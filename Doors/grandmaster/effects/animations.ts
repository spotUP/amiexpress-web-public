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
  | 'tSpin'
  | 'floatingText'
  | 'placementEffect'
  | 'backToBackGlow';

/**
 * Floating text mode configuration
 */
export type FloatTextMode = 'off' | 'offboard' | 'all';

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
 * Floating text animation data
 */
export interface FloatingTextData {
  text: string[];          // Multi-line support
  x: number;               // Board X coordinate
  y: number;               // Current Y position
  originY: number;         // Starting Y
  timer: number;           // 0-100 frames
  maxTimer: number;        // 100 frames (1.67s at 60 FPS)
  color: string;
  size: 'small' | 'normal' | 'large';
  mode: 'offboard' | 'all'; // Where to show
}

/**
 * Piece placement effect data
 */
export interface PlacementEffectData {
  piece: string;           // Piece type (I, O, T, S, Z, J, L)
  cells: Array<{ x: number; y: number }>;
  rotation: 0 | 1 | 2 | 3;
  frame: number;
  color: string;
}

/**
 * Back-to-back glow data
 */
export interface BackToBackGlowData {
  cells: Array<{ x: number; y: number }>;
  count: number;
  type: 'tetris' | 'tspin';
}

/**
 * Animation manager
 */
export class AnimationManager {
  private animations: Animation[] = [];
  private placementEffects: PlacementEffectData[] = [];
  private floatingTexts: FloatingTextData[] = [];
  private readonly MAX_PLACEMENT_EFFECTS = 3;
  private readonly MAX_FLOATING_TEXTS = 5;

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
   * Trigger piece placement effect
   */
  placementEffect(piece: string, cells: Array<{x: number; y: number}>, rotation: number, color: string): void {
    // FIFO enforcement - remove oldest effect if at limit
    if (this.placementEffects.length >= this.MAX_PLACEMENT_EFFECTS) {
      this.placementEffects.shift();
    }

    this.placementEffects.push({
      piece,
      cells,
      rotation: rotation as 0 | 1 | 2 | 3,
      frame: 0,
      color
    });
  }

  /**
   * Trigger floating text animation
   */
  floatingText(
    text: string | string[],
    x: number,
    y: number,
    color: string,
    mode: FloatTextMode
  ): void {
    if (mode === 'off') return;

    // FIFO enforcement - remove oldest text if at limit
    if (this.floatingTexts.length >= this.MAX_FLOATING_TEXTS) {
      this.floatingTexts.shift();
    }

    const textLines = Array.isArray(text) ? text : [text];
    this.floatingTexts.push({
      text: textLines,
      x,
      y,
      originY: y,
      timer: 0,
      maxTimer: 100,
      color,
      size: 'normal',
      mode: mode === 'all' ? 'all' : 'offboard'
    });
  }

  /**
   * Trigger back-to-back glow animation
   */
  backToBackGlow(cells: Array<{x: number; y: number}>, count: number, type: 'tetris' | 'tspin'): void {
    this.animations.push({
      type: 'backToBackGlow',
      elapsed: 0,
      duration: 300, // 18 frames at 60 FPS = 300ms
      data: { cells, count, type } as BackToBackGlowData
    });
  }

  /**
   * Update all animations
   */
  update(deltaTime: number): void {
    // Update standard animations
    this.animations = this.animations.filter(anim => {
      anim.elapsed += deltaTime;
      return anim.elapsed < anim.duration;
    });

    // Update placement effects
    this.placementEffects = this.placementEffects.filter(effect => {
      effect.frame++;
      return effect.frame < 15; // 15-frame duration (250ms at 60 FPS)
    });

    // Update floating texts
    this.floatingTexts = this.floatingTexts.filter(text => {
      text.timer++;

      // Calculate Y position with easing
      const progress = text.timer / text.maxTimer;
      if (progress < 0.66) { // Rise stage (frames 0-66)
        const riseProgress = progress / 0.66;
        text.y = text.originY - (15 * this.easeOutCubic(riseProgress));
      } else { // Fall stage (frames 67-100)
        const fallProgress = (progress - 0.66) / 0.34;
        const peakY = text.originY - 15;
        text.y = peakY + (5 * this.easeInCubic(fallProgress));
      }

      return text.timer < text.maxTimer;
    });
  }

  /**
   * Ease-out cubic function for floating text rise
   */
  private easeOutCubic(t: number): number {
    return 1 - Math.pow(1 - t, 3);
  }

  /**
   * Ease-in cubic function for floating text fall
   */
  private easeInCubic(t: number): number {
    return t * t * t;
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
   * Get all active placement effects
   */
  getPlacementEffects(): PlacementEffectData[] {
    return this.placementEffects;
  }

  /**
   * Get all active floating texts
   */
  getFloatingTexts(): FloatingTextData[] {
    return this.floatingTexts;
  }

  /**
   * Clear all animations
   */
  clear(): void {
    this.animations = [];
    this.placementEffects = [];
    this.floatingTexts = [];
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

  /**
   * Render placement effect
   *
   * Returns the character to render for a specific cell in the placement effect.
   * Scale and alpha based on frame progression.
   */
  static renderPlacementEffect(
    effect: PlacementEffectData,
    x: number,
    y: number
  ): string | null {
    const { frame, color, cells } = effect;
    const progress = frame / 15;

    // Check if this cell is part of the effect
    const isEffectCell = cells.some(cell => cell.x === x && cell.y === y);
    if (!isEffectCell) return null;

    // Calculate scale and alpha
    const scale = this.calculateScale(progress);
    const alpha = this.calculateAlpha(progress);

    // Render based on scale and alpha
    if (alpha < 0.33) {
      return '  '; // Nearly invisible
    } else if (alpha < 0.66) {
      return `{${color}-fg}░░{/${color}-fg}`; // Faded
    } else if (scale > 1.1) {
      const bright = this.getBrightColor(color);
      return `{${bright}-bg}{white-fg}██{/white-fg}{/${bright}-bg}`; // Bright + scaled
    } else {
      return `{${color}-fg}██{/${color}-fg}`; // Normal
    }
  }

  /**
   * Calculate scale for placement effect
   *
   * Frames 0-4: Scale up 0.8 → 1.2
   * Frames 5-9: Hold at 1.2
   * Frames 10-14: Scale down 1.2 → 1.0
   */
  private static calculateScale(progress: number): number {
    if (progress < 0.27) { // Frames 0-4
      return 0.8 + (progress / 0.27) * 0.4;
    } else if (progress < 0.6) { // Frames 5-9
      return 1.2;
    } else { // Frames 10-14
      return 1.2 - ((progress - 0.6) / 0.4) * 0.2;
    }
  }

  /**
   * Calculate alpha for placement effect
   *
   * Frames 0-9: Alpha 1.0
   * Frames 10-14: Fade out 1.0 → 0.0
   */
  private static calculateAlpha(progress: number): number {
    return progress < 0.67 ? 1.0 : 1.0 - ((progress - 0.67) / 0.33);
  }

  /**
   * Render back-to-back glow overlay
   *
   * Returns the character to render for B2B glow effect.
   */
  static renderBackToBackGlow(
    data: BackToBackGlowData,
    elapsed: number,
    duration: number,
    x: number,
    y: number
  ): string | null {
    const progress = elapsed / duration;

    // Check if this cell is part of the B2B effect
    const isB2BCell = data.cells.some(cell => cell.x === x && cell.y === y);
    if (!isB2BCell) return null;

    // Quick flash then exponential fade
    let intensity = 0;
    if (progress < 0.3) { // Frames 0-5
      intensity = progress / 0.3;
    } else { // Frames 6-18
      intensity = Math.exp(-((progress - 0.3) / 0.7) * 3);
    }

    // Color based on type
    const primaryColor = data.type === 'tetris' ? 'yellow' : 'magenta';
    const secondaryColor = data.type === 'tetris' ? 'white' : 'cyan';

    // Alternate between colors for double outline effect
    const color = Math.floor(elapsed / 100) % 2 === 0 ? primaryColor : secondaryColor;

    // Apply glow based on intensity
    if (intensity > 0.5) {
      return `{${color}-bg}{white-fg}██{/white-fg}{/${color}-bg}`;
    } else if (intensity > 0.2) {
      return `{${color}-fg}██{/${color}-fg}`;
    } else {
      return null; // Too faint, don't render
    }
  }

  /**
   * Get bright version of color for glow effects
   */
  private static getBrightColor(color: string): string {
    const brightMap: Record<string, string> = {
      'red': 'lightred',
      'green': 'lightgreen',
      'yellow': 'lightyellow',
      'blue': 'lightblue',
      'magenta': 'lightmagenta',
      'cyan': 'lightcyan',
      'white': 'white',
      'gray': 'white'
    };
    return brightMap[color] || color;
  }

  /**
   * Extract color from blessed-tagged string
   *
   * Example: "{cyan-fg}██{/cyan-fg}" → "cyan"
   */
  static extractColor(taggedString: string): string {
    const match = taggedString.match(/\{([a-z]+)-fg\}/);
    return match ? match[1] : 'white';
  }
}
