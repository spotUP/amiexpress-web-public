/**
 * Settings Configuration Screen
 *
 * Interactive settings editor with real-time preview
 */

import type { Screen } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { createBox, createList } from '@amiexpress/bbs-door-sdk/utils/blessed-helpers';
import { GamepadInputManager, GamepadAxis } from '@amiexpress/bbs-door-sdk';
import type { AppState, PlayerSettings, RotationSystem, KeyBindings, GamepadBindings } from '../core/types';
import type { SoundEngine } from '../audio/sounds';

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

function formatTriggerStr(t: string): string {
  if (t.startsWith('button:')) {
    const btn = t.slice(7).toUpperCase();
    const names: Record<string, string> = { L1: 'L1', R1: 'R1', L2: 'L2', R2: 'R2', L3: 'L3', R3: 'R3', SELECT: 'Sel', START: 'Start', HOME: 'Home' };
    return names[btn] ?? `Btn-${btn}`;
  }
  if (t.startsWith('dpad:')) {
    const dir = t.slice(5);
    return `D-${dir.charAt(0).toUpperCase()}${dir.slice(1)}`;
  }
  if (t.startsWith('axis:')) {
    const parts = t.split(':');
    const axisDisplay: Record<string, string> = { 'left-x': 'LS-X', 'left-y': 'LS-Y', 'right-x': 'RS-X', 'right-y': 'RS-Y' };
    return `${axisDisplay[parts[1]] ?? parts[1]}${parts[2] === 'negative' ? '-' : '+'}`;
  }
  return t;
}

function formatGamepadBinding(triggers: string[]): string {
  if (!triggers.length) return '(unbound)';
  return triggers.map(formatTriggerStr).join(' / ');
}

/**
 * Settings screen
 */
export class SettingsScreen {
  constructor(
    private screen: Screen,
    private state: AppState,
    private sounds: SoundEngine,
    private bbsSession: any = null
  ) {}

  /**
   * Show settings editor and wait for exit
   */
  async show(): Promise<void> {
    // Enable mouse control for settings interaction
    this.screen.program.enableMouse();

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
        label: ' Settings ',
        scrollable: true,
        alwaysScroll: true,
        scrollbar: {
          ch: ' ',
          style: { bg: 'cyan' },
        },
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
        fixed: true,
      });

      // Cleanup function for exiting settings
      const exitSettings = () => {
        title.destroy();
        menu.destroy();
        descBox.destroy();
        this.screen.render();
        resolve();
      };

      // Update description on selection change
      menu.on('select item', (_item: any, index: number) => {
        // Play navigation sound when scrolling through settings
        this.sounds.playSfx('menu_select');
        descBox.setContent(this.getDescription(index));
        this.screen.render();
      });

      // Handle item selection - wrap async handler for blessed's sync event requirement
      menu.on('select', (_item: any, index: number) => {
        // Check for Save & Exit (last item, index 42)
        if (index === 42) {
          this.sounds.playSfx('menu_ok');
          exitSettings();
          return;
        }
        // Play selection sound when opening a setting
        this.sounds.playSfx('menu_ok');
        this.handleSelection(index, menu).then(() => {
          menu.focus();
          this.screen.render();
        });
      });

      // Handle quit key
      menu.key(['q', 'Q', 'escape'], () => {
        exitSettings();
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
    const gp = s.gamepadBindings ?? {};
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
      '{cyan-fg}--- VISUAL EFFECTS ---{/cyan-fg}',
      `Block Glow:        {yellow-fg}${s.blockGlow ? 'ON' : 'OFF'}{/yellow-fg}`,
      `Glow Intensity:    {yellow-fg}${Math.floor(s.glowIntensity * 100)}%{/yellow-fg}`,
      `Clear Style:       {yellow-fg}${s.clearStyle.toUpperCase()}{/yellow-fg}`,
      `Clear Direction:   {yellow-fg}${s.clearDirection.toUpperCase()}{/yellow-fg}`,
      `Placement Effects: {yellow-fg}${s.placementEffects ? 'ON' : 'OFF'}{/yellow-fg}`,
      `Floating Text:     {yellow-fg}${s.floatTextMode.toUpperCase()}{/yellow-fg}`,
      `B2B Glow:          {yellow-fg}${s.b2bGlowEnabled ? 'ON' : 'OFF'}{/yellow-fg}`,
      `Connected Blocks:  {yellow-fg}${s.connectedBlocks ? 'ON' : 'OFF'}{/yellow-fg}`,
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
      '{cyan-fg}--- JOYPAD BINDINGS ---{/cyan-fg}',
      `Move Left:         {yellow-fg}${formatGamepadBinding(gp['left'] ?? [])}{/yellow-fg}`,
      `Move Right:        {yellow-fg}${formatGamepadBinding(gp['right'] ?? [])}{/yellow-fg}`,
      `Rotate CW:         {yellow-fg}${formatGamepadBinding(gp['rotate_cw'] ?? [])}{/yellow-fg}`,
      `Rotate CCW:        {yellow-fg}${formatGamepadBinding(gp['rotate_ccw'] ?? [])}{/yellow-fg}`,
      `Rotate 180:        {yellow-fg}${formatGamepadBinding(gp['rotate_180'] ?? [])}{/yellow-fg}`,
      `Soft Drop:         {yellow-fg}${formatGamepadBinding(gp['soft_drop'] ?? [])}{/yellow-fg}`,
      `Hard Drop:         {yellow-fg}${formatGamepadBinding(gp['hard_drop'] ?? [])}{/yellow-fg}`,
      `Hold:              {yellow-fg}${formatGamepadBinding(gp['hold'] ?? [])}{/yellow-fg}`,
      `Pause:             {yellow-fg}${formatGamepadBinding(gp['pause'] ?? [])}{/yellow-fg}`,
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
      '',  // VISUAL EFFECTS header
      'Enable/disable block glow effects',
      'Glow intensity (0-100%)',
      'Line clear animation style (inward/outward/instant/directional)',
      'Clear direction for directional style (in/out)',
      'Enable/disable piece placement effects',
      'Floating text mode (off/offboard/all)',
      'Enable/disable back-to-back glow bonus',
      'Enable/disable connected block rendering',
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
      '',  // JOYPAD BINDINGS header
      'Press a joypad button to bind Move Left',
      'Press a joypad button to bind Move Right',
      'Press a joypad button to bind Rotate Clockwise',
      'Press a joypad button to bind Rotate Counter-Clockwise',
      'Press a joypad button to bind Rotate 180',
      'Press a joypad button to bind Soft Drop',
      'Press a joypad button to bind Hard Drop',
      'Press a joypad button to bind Hold',
      'Press a joypad button to bind Pause',
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
      // Visual Effects (index 10 = header, 11-18 = settings)
      case 11:  // Block Glow
        s.blockGlow = !s.blockGlow;
        break;
      case 12:  // Glow Intensity
        await this.adjustGlowIntensity();
        break;
      case 13:  // Clear Style
        await this.cycleClearStyle();
        break;
      case 14:  // Clear Direction
        s.clearDirection = s.clearDirection === 'in' ? 'out' : 'in';
        break;
      case 15:  // Placement Effects
        s.placementEffects = !s.placementEffects;
        break;
      case 16:  // Floating Text
        await this.cycleFloatTextMode();
        break;
      case 17:  // B2B Glow
        s.b2bGlowEnabled = !s.b2bGlowEnabled;
        break;
      case 18:  // Connected Blocks
        s.connectedBlocks = !s.connectedBlocks;
        break;
      // Key bindings (index 20 = header, 21-29 = bindings)
      case 21:  // Move Left
        await this.editKeyBinding('left', 'Move Left');
        break;
      case 22:  // Move Right
        await this.editKeyBinding('right', 'Move Right');
        break;
      case 23:  // Rotate CW
        await this.editKeyBinding('rotateCW', 'Rotate Clockwise');
        break;
      case 24:  // Rotate CCW
        await this.editKeyBinding('rotateCCW', 'Rotate Counter-Clockwise');
        break;
      case 25:  // Rotate 180
        await this.editKeyBinding('rotate180', 'Rotate 180');
        break;
      case 26:  // Soft Drop
        await this.editKeyBinding('softDrop', 'Soft Drop');
        break;
      case 27:  // Hard Drop
        await this.editKeyBinding('hardDrop', 'Hard Drop');
        break;
      case 28:  // Hold
        await this.editKeyBinding('hold', 'Hold');
        break;
      case 29:  // Pause
        await this.editKeyBinding('pause', 'Pause');
        break;
      // Joypad bindings (index 31 = header, 32-40 = bindings)
      case 32: await this.editGamepadBinding('left', 'Move Left'); break;
      case 33: await this.editGamepadBinding('right', 'Move Right'); break;
      case 34: await this.editGamepadBinding('rotate_cw', 'Rotate Clockwise'); break;
      case 35: await this.editGamepadBinding('rotate_ccw', 'Rotate Counter-Clockwise'); break;
      case 36: await this.editGamepadBinding('rotate_180', 'Rotate 180'); break;
      case 37: await this.editGamepadBinding('soft_drop', 'Soft Drop'); break;
      case 38: await this.editGamepadBinding('hard_drop', 'Hard Drop'); break;
      case 39: await this.editGamepadBinding('hold', 'Hold'); break;
      case 40: await this.editGamepadBinding('pause', 'Pause'); break;
      // Note: Save & Exit (case 42) is handled directly in menu.on('select')
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
      fixed: true,
      focusable: true,  // Steal focus from menu so Enter doesn't re-trigger menu.on('select')
    });
    inputBox.focus();

    let newValue = current;

    return new Promise((resolve) => {
      const settingKey = key;  // Capture the setting key before it gets shadowed
      const keyHandler = (_ch: any, keyEvent: any) => {
        if (keyEvent.name === 'left') {
          newValue = Math.max(min, newValue - step);
          this.sounds.playSfx('menu_select');
          inputBox.setContent(`{bold}${settingKey.toUpperCase()}{/bold}\n\n` +
            `Current: {yellow-fg}${newValue}{/yellow-fg}\n` +
            `Range: ${min} - ${max}\n\n` +
            `{gray-fg}Use Left/Right arrows to adjust{/gray-fg}\n` +
            `{gray-fg}Press Enter to confirm{/gray-fg}`);
          this.screen.render();
        } else if (keyEvent.name === 'right') {
          newValue = Math.min(max, newValue + step);
          this.sounds.playSfx('menu_select');
          inputBox.setContent(`{bold}${settingKey.toUpperCase()}{/bold}\n\n` +
            `Current: {yellow-fg}${newValue}{/yellow-fg}\n` +
            `Range: ${min} - ${max}\n\n` +
            `{gray-fg}Use Left/Right arrows to adjust{/gray-fg}\n` +
            `{gray-fg}Press Enter to confirm{/gray-fg}`);
          this.screen.render();
        } else if (keyEvent.name === 'return' || keyEvent.name === 'enter') {
          (this.state.settings as any)[settingKey] = newValue;  // Use settingKey, not keyEvent
          this.sounds.playSfx('menu_ok');
          this.screen.removeListener('keypress', keyHandler);
          inputBox.destroy();
          this.screen.render();
          resolve();
        } else if (keyEvent.name === 'escape') {
          this.sounds.playSfx('menu_select');
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
      fixed: true,
      focusable: true,  // Steal focus from menu so Enter doesn't re-trigger menu.on('select')
    });

    let volume = current;

    const updateDisplay = () => {
      const bar = '='.repeat(Math.floor(volume / 5)) + ' '.repeat(20 - Math.floor(volume / 5));
      volumeBox.setContent(`{bold}${settingKey === 'musicVolume' ? 'MUSIC' : 'SFX'} VOLUME{/bold}\n\n` +
        `[${bar}] {yellow-fg}${volume}%{/yellow-fg}\n\n` +
        `{gray-fg}Left/Right: Adjust | Enter: Confirm{/gray-fg}`);
    };

    updateDisplay();
    volumeBox.focus();

    return new Promise((resolve) => {
      const keyHandler = (_ch: any, keyEvent: any) => {
        if (keyEvent.name === 'left') {
          volume = Math.max(0, volume - 5);
          this.sounds.playSfx('menu_select');
          updateDisplay();
          this.screen.render();
        } else if (keyEvent.name === 'right') {
          volume = Math.min(100, volume + 5);
          this.sounds.playSfx('menu_select');
          updateDisplay();
          this.screen.render();
        } else if (keyEvent.name === 'return' || keyEvent.name === 'enter') {
          this.state.settings[settingKey] = volume / 100;
          this.sounds.playSfx('menu_ok');
          this.screen.removeListener('keypress', keyHandler);
          volumeBox.destroy();
          this.screen.render();
          resolve();
        } else if (keyEvent.name === 'escape') {
          this.sounds.playSfx('menu_select');
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
      fixed: true,
      focusable: true,  // Steal focus from menu so Enter doesn't re-trigger menu.on('select')
    });

    const keys = [...(currentKeys || [])];

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
    bindingBox.focus();
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

  /**
   * Adjust glow intensity
   */
  private async adjustGlowIntensity(): Promise<void> {
    const current = Math.floor(this.state.settings.glowIntensity * 100);
    const min = 0;
    const max = 100;
    const step = 10;

    // Cycle through values
    let next = current + step;
    if (next > max) next = min;

    this.state.settings.glowIntensity = next / 100;
  }

  /**
   * Cycle clear style
   */
  private async cycleClearStyle(): Promise<void> {
    const styles: Array<'inward' | 'outward' | 'instant' | 'directional'> = ['inward', 'outward', 'instant', 'directional'];
    const current = styles.indexOf(this.state.settings.clearStyle);
    const next = (current + 1) % styles.length;
    this.state.settings.clearStyle = styles[next];
  }

  /**
   * Cycle floating text mode
   */
  private async cycleFloatTextMode(): Promise<void> {
    const modes: Array<'off' | 'offboard' | 'all'> = ['off', 'offboard', 'all'];
    const current = modes.indexOf(this.state.settings.floatTextMode);
    const next = (current + 1) % modes.length;
    this.state.settings.floatTextMode = modes[next];
  }

  /**
   * Edit a joypad binding — listen for the next gamepad button/axis/dpad press.
   * Up to 3 triggers per action. Enter saves, Escape cancels, Backspace removes last.
   */
  private async editGamepadBinding(bindingKey: string, displayName: string): Promise<void> {
    if (!this.bbsSession) {
      // No session available (unlikely but guard it)
      return;
    }

    if (!this.state.settings.gamepadBindings) {
      this.state.settings.gamepadBindings = {};
    }
    const gp = this.state.settings.gamepadBindings;
    const triggers = [...(gp[bindingKey] ?? [])];

    const bindingBox = createBox({
      parent: this.screen,
      top: 'center',
      left: 'center',
      width: 55,
      height: 12,
      border: { type: 'line' },
      style: { border: { fg: 'cyan' } },
      content: '',
      fixed: true,
      focusable: true,
    });

    const updateDisplay = () => {
      const current = triggers.length
        ? triggers.map(formatTriggerStr).join(' / ')
        : '(none)';
      bindingBox.setContent(
        `{cyan-fg}${displayName.toUpperCase()}{/cyan-fg}\n\n` +
        `Current: {yellow-fg}${current}{/yellow-fg}\n\n` +
        `{gray-fg}Press a joypad button/stick to add (max 3){/gray-fg}\n` +
        `{gray-fg}Backspace = remove last   Delete = clear all{/gray-fg}\n` +
        `{gray-fg}Enter = save              Escape = cancel{/gray-fg}`
      );
      this.screen.render();
    };

    updateDisplay();
    bindingBox.focus();

    return new Promise((resolve) => {
      const gim = new GamepadInputManager(this.bbsSession);

      const cleanup = () => {
        this.screen.removeListener('keypress', keyHandler);
        gim.destroy();
        bindingBox.destroy();
        this.screen.render();
        resolve();
      };

      const addTrigger = (t: string) => {
        if (!triggers.includes(t) && triggers.length < 3) {
          triggers.push(t);
          updateDisplay();
        }
      };

      // Keyboard controls for the dialog
      const keyHandler = (_ch: any, key: any) => {
        if (!key) return;
        const k = key.full || key.name;
        if (k === 'return' || k === 'enter') {
          gp[bindingKey] = [...triggers];
          cleanup();
        } else if (k === 'escape') {
          cleanup();
        } else if (k === 'backspace') {
          triggers.pop();
          updateDisplay();
        } else if (k === 'delete') {
          triggers.length = 0;
          updateDisplay();
        }
      };
      this.screen.on('keypress', keyHandler);

      // Detect button presses
      for (const btn of ['a', 'b', 'x', 'y', 'l1', 'r1', 'l2', 'r2', 'select', 'start', 'l3', 'r3', 'home']) {
        gim.on(`button:${btn}`, (pressed: boolean) => {
          if (pressed) addTrigger(`button:${btn}`);
        });
      }

      // Detect dpad
      gim.on('dpad', (direction: string) => {
        if (direction && direction !== 'none') addTrigger(`dpad:${direction}`);
      });

      // Detect analog axes — require high deflection (0.85) to avoid accidental binding
      const axisNames: Record<number, string> = {
        [GamepadAxis.LEFT_STICK_X]: 'left-x',
        [GamepadAxis.LEFT_STICK_Y]: 'left-y',
        [GamepadAxis.RIGHT_STICK_X]: 'right-x',
        [GamepadAxis.RIGHT_STICK_Y]: 'right-y',
      };
      gim.on('axis', (axis: GamepadAxis, value: number) => {
        const name = axisNames[axis];
        if (!name || Math.abs(value) < 0.85) return;
        addTrigger(`axis:${name}:${value > 0 ? 'positive' : 'negative'}`);
      });
    });
  }
}
