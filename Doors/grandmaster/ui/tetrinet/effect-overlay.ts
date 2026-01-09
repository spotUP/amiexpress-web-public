/**
 * TetriNET Effect Overlay
 *
 * Visual overlays for continuous effects:
 * - Darkness: Hides the piece preview
 * - Confusion: Shows scrambled controls indicator
 * - Immunity: Shows protective shield effect
 * - Mutation: Shows piece randomization warning
 */

import type { Screen } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { createBox } from '@amiexpress/bbs-door-sdk/utils/blessed-helpers';
import type { ContinuousEffectManager } from '../../core/tetrinet/continuous-effects';

/**
 * Effect Overlay options
 */
export interface EffectOverlayOptions {
  parent: Screen;
  boardTop: number;
  boardLeft: number;
  boardWidth: number;
  boardHeight: number;
}

/**
 * Effect Overlay component
 */
export class EffectOverlay {
  private parent: Screen;
  private darknessOverlay: any;
  private confusionIndicator: any;
  private immunityBorder: any;
  private mutationIndicator: any;
  private statusBar: any;

  private boardTop: number;
  private boardLeft: number;
  private boardWidth: number;
  private boardHeight: number;

  constructor(options: EffectOverlayOptions) {
    this.parent = options.parent;
    this.boardTop = options.boardTop;
    this.boardLeft = options.boardLeft;
    this.boardWidth = options.boardWidth;
    this.boardHeight = options.boardHeight;

    this.createOverlays();
  }

  /**
   * Create all overlay elements
   */
  private createOverlays(): void {
    // Darkness overlay - covers piece preview area
    this.darknessOverlay = createBox({
      parent: this.parent,
      top: this.boardTop,
      right: 0,
      width: 16,
      height: 8,
      hidden: true,
      style: { bg: 'black' },
      content: '{gray-fg}\n  DARKNESS\n\n  Preview\n  Hidden{/gray-fg}',
    });

    // Confusion indicator - shows reversed controls warning
    this.confusionIndicator = createBox({
      parent: this.parent,
      top: 0,
      left: 'center',
      width: 20,
      height: 1,
      hidden: true,
      content: '{magenta-fg}{bold}CONTROLS REVERSED{/bold}{/magenta-fg}',
    });

    // Immunity border - glowing border around board
    this.immunityBorder = createBox({
      parent: this.parent,
      top: this.boardTop - 1,
      left: this.boardLeft - 1,
      width: this.boardWidth + 2,
      height: this.boardHeight + 2,
      hidden: true,
      border: { type: 'line' },
      style: { border: { fg: 'cyan' }, transparent: true },
    });

    // Mutation indicator - shows remaining pieces
    this.mutationIndicator = createBox({
      parent: this.parent,
      top: 0,
      right: 0,
      width: 16,
      height: 1,
      hidden: true,
      content: '{red-fg}MUTATION: 5{/red-fg}',
    });

    // Status bar for all active effects
    this.statusBar = createBox({
      parent: this.parent,
      bottom: 0,
      left: 0,
      width: '100%',
      height: 1,
      hidden: true,
      content: '',
    });
  }

  /**
   * Update overlays based on effect manager state
   */
  update(effects: ContinuousEffectManager): void {
    // Update darkness
    if (effects.hasDarkness()) {
      this.darknessOverlay.show();
      const remaining = Math.ceil(effects.getTimeRemaining('darkness') / 1000);
      this.darknessOverlay.setContent(
        `{gray-fg}\n  DARKNESS\n\n  Preview\n  Hidden\n\n  ${remaining}s{/gray-fg}`
      );
    } else {
      this.darknessOverlay.hide();
    }

    // Update confusion
    if (effects.hasConfusion()) {
      this.confusionIndicator.show();
      const remaining = Math.ceil(effects.getTimeRemaining('confusion') / 1000);
      this.confusionIndicator.setContent(
        `{magenta-fg}{bold}CONTROLS REVERSED (${remaining}s){/bold}{/magenta-fg}`
      );
    } else {
      this.confusionIndicator.hide();
    }

    // Update immunity
    if (effects.hasImmunity()) {
      this.immunityBorder.show();
      // Animate border color
      const time = Date.now() % 1000;
      const color = time < 500 ? 'cyan' : 'white';
      this.immunityBorder.style.border.fg = color;
    } else {
      this.immunityBorder.hide();
    }

    // Update mutation
    if (effects.hasMutation()) {
      this.mutationIndicator.show();
      const remaining = effects.getMutationRemaining();
      this.mutationIndicator.setContent(
        `{red-fg}MUTATION: ${remaining} pieces{/red-fg}`
      );
    } else {
      this.mutationIndicator.hide();
    }

    // Update status bar with all active effects
    this.updateStatusBar(effects);
  }

  /**
   * Update status bar with all active effects summary
   */
  private updateStatusBar(effects: ContinuousEffectManager): void {
    const activeEffects: string[] = [];

    if (effects.hasImmunity()) {
      const remaining = Math.ceil(effects.getTimeRemaining('immunity') / 1000);
      activeEffects.push(`{cyan-fg}[I]${remaining}s{/cyan-fg}`);
    }

    if (effects.hasDarkness()) {
      const remaining = Math.ceil(effects.getTimeRemaining('darkness') / 1000);
      activeEffects.push(`{gray-fg}[D]${remaining}s{/gray-fg}`);
    }

    if (effects.hasConfusion()) {
      const remaining = Math.ceil(effects.getTimeRemaining('confusion') / 1000);
      activeEffects.push(`{magenta-fg}[F]${remaining}s{/magenta-fg}`);
    }

    if (effects.hasMutation()) {
      const remaining = effects.getMutationRemaining();
      activeEffects.push(`{red-fg}[M]${remaining}pc{/red-fg}`);
    }

    if (activeEffects.length > 0) {
      this.statusBar.show();
      this.statusBar.setContent(`Effects: ${activeEffects.join(' ')}`);
    } else {
      this.statusBar.hide();
    }
  }

  /**
   * Show incoming attack warning
   */
  showIncomingWarning(attackType: string): void {
    const warningBox = createBox({
      parent: this.parent,
      top: 'center',
      left: 'center',
      width: 30,
      height: 5,
      border: { type: 'line' },
      style: { border: { fg: 'red' }, bg: 'black' },
      content: `{red-fg}{bold}INCOMING ATTACK!\n\n${attackType.toUpperCase()}{/bold}{/red-fg}`,
    });

    // Remove after animation
    setTimeout(() => {
      warningBox.destroy();
    }, 1000);
  }

  /**
   * Show immunity blocked message
   */
  showImmunityBlocked(): void {
    const messageBox = createBox({
      parent: this.parent,
      top: 'center',
      left: 'center',
      width: 20,
      height: 3,
      border: { type: 'line' },
      style: { border: { fg: 'cyan' }, bg: 'black' },
      content: '{cyan-fg}{bold}BLOCKED!{/bold}{/cyan-fg}',
    });

    setTimeout(() => {
      messageBox.destroy();
    }, 500);
  }

  /**
   * Show sudden death warning
   */
  showSuddenDeathWarning(): void {
    const warningBox = createBox({
      parent: this.parent,
      top: 2,
      left: 'center',
      width: 30,
      height: 3,
      border: { type: 'line' },
      style: { border: { fg: 'red' }, bg: 'black' },
      content: '{red-fg}{bold}SUDDEN DEATH ACTIVE!{/bold}{/red-fg}',
    });

    // Flash and then hide
    let flashes = 6;
    const flashInterval = setInterval(() => {
      if (flashes <= 0) {
        clearInterval(flashInterval);
        warningBox.destroy();
        return;
      }
      warningBox.hidden = !warningBox.hidden;
      flashes--;
    }, 250);
  }

  /**
   * Show sudden death line addition
   */
  showSuddenDeathLine(totalLines: number): void {
    const messageBox = createBox({
      parent: this.parent,
      top: 5,
      left: 'center',
      width: 20,
      height: 1,
      content: `{red-fg}+1 LINE (${totalLines} total){/red-fg}`,
    });

    setTimeout(() => {
      messageBox.destroy();
    }, 1500);
  }

  /**
   * Hide darkness overlay (for preview)
   */
  hideDarkness(): void {
    this.darknessOverlay.hide();
  }

  /**
   * Show darkness overlay
   */
  showDarkness(): void {
    this.darknessOverlay.show();
  }

  /**
   * Check if darkness is active
   */
  isDarknessActive(): boolean {
    return !this.darknessOverlay.hidden;
  }

  /**
   * Destroy all overlays
   */
  destroy(): void {
    this.darknessOverlay.destroy();
    this.confusionIndicator.destroy();
    this.immunityBorder.destroy();
    this.mutationIndicator.destroy();
    this.statusBar.destroy();
  }
}
