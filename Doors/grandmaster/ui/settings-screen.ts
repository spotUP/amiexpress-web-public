/**
 * Settings Configuration Screen
 *
 * Interactive settings editor with real-time preview
 */

import type { Screen } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { createBox, createList } from '@amiexpress/bbs-door-sdk/utils/blessed-helpers';
import type { AppState, PlayerSettings, RotationSystem, KeyBindings } from '../core/types';

/**
 * Friendly names for key bindings
 */
const KEY_DISPLAY_NAMES: Record<string, string> = {
  'left': 'Left Arrow',
  'right': 'Right Arrow',
  'up': 'Up Arrow',
  'down': 'Down Arrow',
  'a': 'A',
  'd': 'D',
  's': 'S',
  'w': 'W',
  'z': 'Z',
  'x': 'X',
  'c': 'C',
  'space': 'Space',
  'return': 'Enter',
  'enter': 'Enter',
  'escape': 'Escape',
  'p': 'P',
  'lshift': 'Left Shift',
  'rshift': 'Right Shift',
  'lcontrol': 'Left Ctrl',
  'rcontrol': 'Right Ctrl',
  'pageup': 'Page Up',
  'pagedown': 'Page Down',
};

function formatKeyBinding(keys: string[]): string {
  return keys.map(k => KEY_DISPLAY_NAMES[k] || k.toUpperCase()).join(' / ');
}

/**
 * Settings screen
 */
export class SettingsScreen {
  constructor(
    private screen: Screen,
    private state: AppState
  ) {}

  /**
   * Show settings editor and wait for exit
   */
  async show(): Promise<void> {
    return new Promise((resolve) => {
      // Clear screen
      this.screen.children.forEach(child => child.destroy());

      // Title box
      const title = createBox({
        parent: this.screen,
        top: 0,
        left: 'center',
        width: 60,
        height: 3,
        content: '{bold}{yellow-fg}SETTINGS{/yellow-fg}{/bold}',
        style: { fg: 'white', bg: 'black' },
      });

      // Settings menu
      const menu = createList({
        parent: this.screen,
        top: 3,
        left: 10,
        width: 60,
        height: 15,
        border: { type: 'line' },
        style: {
          border: { fg: 'cyan' },
          selected: { bg: 'cyan', fg: 'black' },
          item: { fg: 'white' },
        },
        keys: true,
        vi: true,
        mouse: true,
        items: this.getMenuItems(),
      });

      // Description box
      const descBox = createBox({
        parent: this.screen,
        top: 18,
        left: 10,
        width: 60,
        height: 5,
        border: { type: 'line' },
        style: { border: { fg: 'gray' }, fg: 'gray' },
        content: this.getDescription(0),
      });

      // Update description on selection change
      menu.on('select item', (_item: any, index: number) => {
        descBox.setContent(this.getDescription(index));
        this.screen.render();
      });

      // Handle item selection - wrap async handler for blessed's sync event requirement
      menu.on('select', (_item: any, index: number) => {
        this.handleSelection(index, menu).then(() => {
          this.screen.render();
        });
      });

      // Handle quit key
      menu.key(['q', 'Q', 'escape'], () => {
        title.destroy();
        menu.destroy();
        descBox.destroy();
        this.screen.render();
        resolve();
      });

      // Focus and render
      menu.focus();
      this.screen.render();
    });
  }

  /**
   * Get menu items
   */
  private getMenuItems(): string[] {
    const s = this.state.settings;
    const kb = s.keyBindings;
    return [
      `Rotation System:   {yellow-fg}${s.rotationSystem}{/yellow-fg}`,
      `DAS (ms):          {yellow-fg}${s.das}{/yellow-fg}`,
      `ARR (ms):          {yellow-fg}${s.arr}{/yellow-fg}`,
      `Soft Drop Speed:   {yellow-fg}${s.softDropSpeed}x{/yellow-fg}`,
      `Ghost Piece:       {yellow-fg}${s.ghostPiece ? 'ON' : 'OFF'}{/yellow-fg}`,
      `Lock Delay (ms):   {yellow-fg}${s.lockDelay}{/yellow-fg}`,
      `Preview Count:     {yellow-fg}${s.previewCount}{/yellow-fg}`,
      `Music Volume:      {yellow-fg}${Math.floor(s.musicVolume * 100)}%{/yellow-fg}`,
      `SFX Volume:        {yellow-fg}${Math.floor(s.sfxVolume * 100)}%{/yellow-fg}`,
      '',
      '{cyan-fg}--- KEY BINDINGS ---{/cyan-fg}',
      `Move Left:         {yellow-fg}${formatKeyBinding(kb.left)}{/yellow-fg}`,
      `Move Right:        {yellow-fg}${formatKeyBinding(kb.right)}{/yellow-fg}`,
      `Rotate CW (X):     {yellow-fg}${formatKeyBinding(kb.rotateCW)}{/yellow-fg}`,
      `Rotate CCW (Z):    {yellow-fg}${formatKeyBinding(kb.rotateCCW)}{/yellow-fg}`,
      `Rotate 180:        {yellow-fg}${formatKeyBinding(kb.rotate180)}{/yellow-fg}`,
      `Soft Drop:         {yellow-fg}${formatKeyBinding(kb.softDrop)}{/yellow-fg}`,
      `Hard Drop:         {yellow-fg}${formatKeyBinding(kb.hardDrop)}{/yellow-fg}`,
      `Hold:              {yellow-fg}${formatKeyBinding(kb.hold)}{/yellow-fg}`,
      `Pause:             {yellow-fg}${formatKeyBinding(kb.pause)}{/yellow-fg}`,
      '',
      '{green-fg}Save & Exit{/green-fg}',
    ];
  }

  /**
   * Get description for menu item
   */
  private getDescription(index: number): string {
    const descriptions = [
      'Rotation system (SRS, ARS, NRS, BARS)',
      'Delayed Auto-Shift: time before auto-repeat starts',
      'Auto-Repeat Rate: time between repeats',
      'Soft drop speed multiplier',
      'Show ghost piece at drop position',
      'Lock delay: time before piece locks',
      'Number of next pieces to preview',
      'Background music volume',
      'Sound effects volume',
      '',
      '',  // KEY BINDINGS header
      'Press any key to rebind Move Left',
      'Press any key to rebind Move Right',
      'Press any key to rebind Rotate Clockwise',
      'Press any key to rebind Rotate Counter-Clockwise',
      'Press any key to rebind Rotate 180',
      'Press any key to rebind Soft Drop',
      'Press any key to rebind Hard Drop',
      'Press any key to rebind Hold',
      'Press any key to rebind Pause',
      '',
      'Save changes and return to menu',
    ];
    return `${descriptions[index] || ''}`;
  }

  /**
   * Handle menu selection
   */
  private async handleSelection(index: number, menu: any): Promise<void> {
    const s = this.state.settings;

    switch (index) {
      case 0:  // Rotation System
        await this.cycleRotationSystem();
        break;
      case 1:  // DAS
        await this.adjustValue('das', 10, 50, 300, 10);
        break;
      case 2:  // ARR
        await this.adjustValue('arr', 0, 1, 50, 1);
        break;
      case 3:  // Soft Drop Speed
        await this.adjustValue('softDropSpeed', 1, 1, 40, 1);
        break;
      case 4:  // Ghost Piece
        s.ghostPiece = !s.ghostPiece;
        break;
      case 5:  // Lock Delay
        await this.adjustValue('lockDelay', 100, 100, 2000, 50);
        break;
      case 6:  // Preview Count
        await this.adjustValue('previewCount', 1, 1, 6, 1);
        break;
      case 7:  // Music Volume
        await this.adjustVolume('musicVolume');
        break;
      case 8:  // SFX Volume
        await this.adjustVolume('sfxVolume');
        break;
      // Key bindings (index 10 = header, 11-19 = bindings)
      case 11:  // Move Left
        await this.editKeyBinding('left', 'Move Left');
        break;
      case 12:  // Move Right
        await this.editKeyBinding('right', 'Move Right');
        break;
      case 13:  // Rotate CW
        await this.editKeyBinding('rotateCW', 'Rotate Clockwise');
        break;
      case 14:  // Rotate CCW
        await this.editKeyBinding('rotateCCW', 'Rotate Counter-Clockwise');
        break;
      case 15:  // Rotate 180
        await this.editKeyBinding('rotate180', 'Rotate 180');
        break;
      case 16:  // Soft Drop
        await this.editKeyBinding('softDrop', 'Soft Drop');
        break;
      case 17:  // Hard Drop
        await this.editKeyBinding('hardDrop', 'Hard Drop');
        break;
      case 18:  // Hold
        await this.editKeyBinding('hold', 'Hold');
        break;
      case 19:  // Pause
        await this.editKeyBinding('pause', 'Pause');
        break;
      case 21:  // Save & Exit
        menu.emit('keypress', null, { name: 'escape' });
        return;
    }

    // Update menu items
    menu.setItems(this.getMenuItems());
  }

  /**
   * Cycle rotation system
   */
  private async cycleRotationSystem(): Promise<void> {
    const systems: RotationSystem[] = ['SRS', 'ARS', 'NRS', 'BARS'];
    const current = systems.indexOf(this.state.settings.rotationSystem);
    const next = (current + 1) % systems.length;
    this.state.settings.rotationSystem = systems[next];
  }

  /**
   * Adjust numeric value
   */
  private async adjustValue(
    key: keyof PlayerSettings,
    value: number,
    min: number,
    max: number,
    step: number
  ): Promise<void> {
    const current = this.state.settings[key] as number;

    // Show input dialog
    const inputBox = createBox({
      parent: this.screen,
      top: 'center',
      left: 'center',
      width: 50,
      height: 8,
      border: { type: 'line' },
      style: { border: { fg: 'yellow' } },
      content: `{bold}${key.toUpperCase()}{/bold}\n\n` +
        `Current: {yellow-fg}${current}{/yellow-fg}\n` +
        `Range: ${min} - ${max}\n\n` +
        `{gray-fg}Use Left/Right arrows to adjust{/gray-fg}\n` +
        `{gray-fg}Press Enter to confirm{/gray-fg}`,
    });

    let newValue = current;

    return new Promise((resolve) => {
      const keyHandler = (_ch: any, key: any) => {
        if (key.name === 'left') {
          newValue = Math.max(min, newValue - step);
          inputBox.setContent(`{bold}${key.toUpperCase()}{/bold}\n\n` +
            `Current: {yellow-fg}${newValue}{/yellow-fg}\n` +
            `Range: ${min} - ${max}\n\n` +
            `{gray-fg}Use Left/Right arrows to adjust{/gray-fg}\n` +
            `{gray-fg}Press Enter to confirm{/gray-fg}`);
          this.screen.render();
        } else if (key.name === 'right') {
          newValue = Math.min(max, newValue + step);
          inputBox.setContent(`{bold}${key.toUpperCase()}{/bold}\n\n` +
            `Current: {yellow-fg}${newValue}{/yellow-fg}\n` +
            `Range: ${min} - ${max}\n\n` +
            `{gray-fg}Use Left/Right arrows to adjust{/gray-fg}\n` +
            `{gray-fg}Press Enter to confirm{/gray-fg}`);
          this.screen.render();
        } else if (key.name === 'return' || key.name === 'enter') {
          (this.state.settings as any)[key] = newValue;
          this.screen.removeListener('keypress', keyHandler);
          inputBox.destroy();
          this.screen.render();
          resolve();
        } else if (key.name === 'escape') {
          this.screen.removeListener('keypress', keyHandler);
          inputBox.destroy();
          this.screen.render();
          resolve();
        }
      };

      this.screen.on('keypress', keyHandler);
      this.screen.render();
    });
  }

  /**
   * Adjust volume (0.0 - 1.0)
   */
  private async adjustVolume(settingKey: 'musicVolume' | 'sfxVolume'): Promise<void> {
    const current = Math.floor(this.state.settings[settingKey] * 100);

    // Show volume bar
    const volumeBox = createBox({
      parent: this.screen,
      top: 'center',
      left: 'center',
      width: 50,
      height: 7,
      border: { type: 'line' },
      style: { border: { fg: 'yellow' } },
      content: '',
    });

    let volume = current;

    const updateDisplay = () => {
      const bar = '='.repeat(Math.floor(volume / 5)) + ' '.repeat(20 - Math.floor(volume / 5));
      volumeBox.setContent(`{bold}${settingKey === 'musicVolume' ? 'MUSIC' : 'SFX'} VOLUME{/bold}\n\n` +
        `[${bar}] {yellow-fg}${volume}%{/yellow-fg}\n\n` +
        `{gray-fg}Left/Right: Adjust | Enter: Confirm{/gray-fg}`);
    };

    updateDisplay();

    return new Promise((resolve) => {
      const keyHandler = (_ch: any, key: any) => {
        if (key.name === 'left') {
          volume = Math.max(0, volume - 5);
          updateDisplay();
          this.screen.render();
        } else if (key.name === 'right') {
          volume = Math.min(100, volume + 5);
          updateDisplay();
          this.screen.render();
        } else if (key.name === 'return' || key.name === 'enter') {
          this.state.settings[settingKey] = volume / 100;
          this.screen.removeListener('keypress', keyHandler);
          volumeBox.destroy();
          this.screen.render();
          resolve();
        } else if (key.name === 'escape') {
          this.screen.removeListener('keypress', keyHandler);
          volumeBox.destroy();
          this.screen.render();
          resolve();
        }
      };

      this.screen.on('keypress', keyHandler);
      this.screen.render();
    });
  }

  /**
   * Edit a key binding
   */
  private async editKeyBinding(bindingKey: keyof KeyBindings, displayName: string): Promise<void> {
    const kb = this.state.settings.keyBindings;
    const currentKeys = kb[bindingKey];

    // Show key binding dialog
    const bindingBox = createBox({
      parent: this.screen,
      top: 'center',
      left: 'center',
      width: 55,
      height: 12,
      border: { type: 'line' },
      style: { border: { fg: 'cyan' } },
      content: '',
    });

    const keys = [...currentKeys];

    const updateDisplay = () => {
      bindingBox.setContent(
        `{bold}{cyan-fg}${displayName.toUpperCase()}{/cyan-fg}{/bold}\n\n` +
        `Current: {yellow-fg}${formatKeyBinding(keys)}{/yellow-fg}\n\n` +
        `{gray-fg}Press a key to add it to the binding{/gray-fg}\n` +
        `{gray-fg}Press Backspace to remove last key{/gray-fg}\n` +
        `{gray-fg}Press Delete to clear all keys{/gray-fg}\n` +
        `{gray-fg}Press Enter to save, Escape to cancel{/gray-fg}`
      );
    };

    updateDisplay();
    this.screen.render();

    return new Promise((resolve) => {
      const keyHandler = (_ch: any, key: any) => {
        if (!key) return;

        const keyName = key.full || key.name;

        if (keyName === 'return' || keyName === 'enter') {
          // Save binding
          if (keys.length > 0) {
            kb[bindingKey] = keys;
          }
          this.screen.removeListener('keypress', keyHandler);
          bindingBox.destroy();
          this.screen.render();
          resolve();
        } else if (keyName === 'escape') {
          // Cancel
          this.screen.removeListener('keypress', keyHandler);
          bindingBox.destroy();
          this.screen.render();
          resolve();
        } else if (keyName === 'backspace') {
          // Remove last key
          if (keys.length > 0) {
            keys.pop();
            updateDisplay();
            this.screen.render();
          }
        } else if (keyName === 'delete') {
          // Clear all keys
          keys.length = 0;
          updateDisplay();
          this.screen.render();
        } else {
          // Add key if not already present
          if (!keys.includes(keyName) && keys.length < 4) {
            keys.push(keyName);
            updateDisplay();
            this.screen.render();
          }
        }
      };

      this.screen.on('keypress', keyHandler);
    });
  }
}
