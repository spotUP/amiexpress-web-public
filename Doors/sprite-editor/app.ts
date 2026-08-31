/** The studio application. Task 3 replaces this shell with the real UI. */
import type { DoorContext } from '@amiexpress/bbs-door-sdk/core/types';
import { createScreen, DoorInputManager } from '@amiexpress/bbs-door-sdk/utils/blessed-helpers';

export class StudioApp {
  private ctx: DoorContext;
  private screen: any = null;
  private inputManager: any = null;

  constructor(ctx: DoorContext) {
    this.ctx = ctx;
  }

  async start(): Promise<void> {
    this.screen = createScreen((this.ctx as any).bbs, {
      title: 'Sprite Studio',
      responsive: true,
    });
    this.inputManager = new DoorInputManager(this.ctx as any, this.screen, {
      enableGameMode: false,
      enableGrabKeys: false,
      enableMouse: true,
    });
    this.screen.key(['q', 'escape', 'C-c'], () => {
      this.destroy();
      void this.ctx.close();
    });
    this.screen.render();
  }

  destroy(): void {
    if (this.inputManager) { this.inputManager.disable(); this.inputManager = null; }
    if (this.screen) { this.screen.destroy(); this.screen = null; }
  }
}
