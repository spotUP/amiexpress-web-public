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
import { KEY_PRESETS } from '../input/config';

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
    const names: Record<string, string> = {
      A: 'A', B: 'B', X: 'X', Y: 'Y',
      L1: 'L1', R1: 'R1', L2: 'L2', R2: 'R2',
      L3: 'L3', R3: 'R3',
      SELECT: 'Sel', START: 'Start', HOME: 'Home',
    };
    return names[btn] ?? `Btn-${btn}`;
  }
  if (t.startsWith('dpad:')) {
    const dir = t.slice(5);
    return `D-${dir.charAt(0).toUpperCase()}${dir.slice(1)}`;
  }
  if (t.startsWith('axis:')) {
    const parts = t.split(':');
    // Legacy named sticks keep their labels; a raw axis number is shown as
    // itself rather than being dressed up as a stick it may not be.
    const axisDisplay: Record<string, string> = { 'left-x': 'LS-X', 'left-y': 'LS-Y', 'right-x': 'RS-X', 'right-y': 'RS-Y' };
    const label = axisDisplay[parts[1]] ?? (/^\d+$/.test(parts[1]) ? `Axis ${parts[1]}` : parts[1]);
    return `${label}${parts[2] === 'negative' ? '-' : '+'}`;
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
        // Check for Save & Exit (last item, index 30)
        if (index === 30) {
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
      `Bind Keys:         {yellow-fg}[Enter to run wizard]{/yellow-fg}`,
      `Key Preset:        {yellow-fg}[Enter to pick layout]{/yellow-fg}`,
      `Clear Keys:        {yellow-fg}[Enter to clear]{/yellow-fg}`,
      '',
      '{cyan-fg}--- JOYPAD BINDINGS ---{/cyan-fg}',
      `Bind Joypad:       {yellow-fg}[Enter to run wizard]{/yellow-fg}`,
      `Joypad Preset:     {yellow-fg}[Enter to pick layout]{/yellow-fg}`,
      `Clear Joypad:      {yellow-fg}[Enter to clear all]{/yellow-fg}`,
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
      'Open wizard to bind all keys in sequence',
      'Pick a key layout preset (TGM Classic, WASD, Modern)',
      'Clear all key bindings',
      '',
      '',  // JOYPAD BINDINGS header
      'Open wizard to bind all joypad buttons in sequence',
      'Pick a joypad layout preset (Standard, Stick)',
      'Clear all joypad bindings (restores defaults)',
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
      // Key bindings (index 20 = header, 21 = wizard, 22 = preset, 23 = clear)
      case 21: await this.bindAllKeys(); break;
      case 22: await this.pickKeyPreset(); break;
      case 23: this.clearKeyBindings(); break;
      // Joypad bindings (index 25 = header, 26 = wizard, 27 = preset, 28 = clear)
      case 26: await this.editAllGamepadBindings(0); break;
      case 27: await this.pickGamepadPreset(); break;
      case 28: this.clearGamepadBindings(); break;
      // Note: Save & Exit (case 30) is handled directly in menu.on('select')
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

      // Defer one tick so the Enter that opened this dialog is not captured
      setImmediate(() => this.screen.on('keypress', keyHandler));
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

      // Defer one tick so the Enter that opened this dialog is not captured
      setImmediate(() => this.screen.on('keypress', keyHandler));
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

      // Defer one tick so the Enter that opened this dialog is not captured
      setImmediate(() => this.screen.on('keypress', keyHandler));
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
   * Key binding wizard — same UX as joypad wizard but captures keypresses.
   * Enter=skip, Escape=done, any other key=bind and auto-advance.
   */
  private async bindAllKeys(): Promise<void> {
    const ACTIONS: { key: keyof KeyBindings; name: string }[] = [
      { key: 'left',      name: 'Move Left' },
      { key: 'right',     name: 'Move Right' },
      { key: 'rotateCW',  name: 'Rotate CW' },
      { key: 'rotateCCW', name: 'Rotate CCW' },
      { key: 'rotate180', name: 'Rotate 180' },
      { key: 'softDrop',  name: 'Soft Drop' },
      { key: 'hardDrop',  name: 'Hard Drop' },
      { key: 'hold',      name: 'Hold' },
      { key: 'pause',     name: 'Pause' },
    ];

    const kb = this.state.settings.keyBindings;
    let currentIdx = 0;
    let waiting = false;

    const bindingBox = createBox({
      parent: this.screen,
      top: 'center',
      left: 'center',
      width: 57,
      height: 14,
      border: { type: 'line' },
      style: { border: { fg: 'cyan' } },
      content: '',
      fixed: true,
      focusable: true,
    } as any);

    const updateDisplay = (feedback?: string) => {
      const action = ACTIONS[currentIdx];
      const cur = (kb[action.key] as string[])?.[0];
      const n = currentIdx + 1;
      const total = ACTIONS.length;
      const bar = '#'.repeat(n) + '-'.repeat(total - n);
      bindingBox.setContent(
        `{cyan-fg}Key Wizard (${n}/${total}){/cyan-fg}\n\n` +
        `Action:  {yellow-fg}${action.name}{/yellow-fg}\n` +
        `Current: {white-fg}${cur ? (KEY_DISPLAY_NAMES[cur] ?? cur) : '(unbound)'}{/white-fg}\n\n` +
        (feedback
          ? `{green-fg}${feedback}{/green-fg}\n\n`
          : `{gray-fg}Press a key to bind{/gray-fg}\n` +
            `{gray-fg}Enter=skip  Escape=done{/gray-fg}\n\n`) +
        `{gray-fg}[${bar}] ${n}/${total}{/gray-fg}`
      );
      this.screen.render();
    };

    return new Promise((resolve) => {
      const done = () => {
        this.screen.removeListener('keypress', keyHandler);
        bindingBox.destroy();
        this.screen.render();
        resolve();
      };

      const advance = () => {
        waiting = false;
        currentIdx++;
        if (currentIdx >= ACTIONS.length) done();
        else updateDisplay();
      };

      const keyHandler = (_ch: any, key: any) => {
        if (!key || waiting) return;
        const k = key.full || key.name;
        if (k === 'escape') { done(); return; }
        if (k === 'return' || k === 'enter') { advance(); return; }
        waiting = true;
        (kb[ACTIONS[currentIdx].key] as string[]) = [k];
        updateDisplay(`Bound: ${KEY_DISPLAY_NAMES[k] ?? k}`);
        setTimeout(advance, 600);
      };

      setImmediate(() => this.screen.on('keypress', keyHandler));
      updateDisplay();
      bindingBox.focus();
    });
  }

  /** Clear all key bindings. */
  private clearKeyBindings(): void {
    const kb = this.state.settings.keyBindings;
    (Object.keys(kb) as (keyof KeyBindings)[]).forEach(k => { (kb as any)[k] = []; });
  }

  /** Show a preset picker and apply the chosen key layout. */
  private async pickKeyPreset(): Promise<void> {
    const presetKeys = Object.keys(KEY_PRESETS);
    const items = presetKeys.map(k => KEY_PRESETS[k].name);

    return new Promise((resolve) => {
      const list = createList({
        parent: this.screen,
        top: 'center',
        left: 'center',
        width: 36,
        height: items.length + 4,
        label: ' Key Preset ',
        tags: true,
        keys: true,
        vi: true,
        mouse: true,
        border: { type: 'line' },
        style: {
          border: { fg: 'cyan' },
          selected: { bg: 'blue', fg: 'white' },
        },
        items,
      } as any);

      list.focus();

      const done = (idx: number | null) => {
        list.destroy();
        this.screen.render();
        if (idx !== null) {
          const preset = KEY_PRESETS[presetKeys[idx]];
          const kb = this.state.settings.keyBindings;
          (Object.keys(preset) as (keyof typeof preset)[]).forEach(k => {
            if (k !== 'name' && k in kb) (kb as any)[k] = [...(preset as any)[k]];
          });
        }
        resolve();
      };

      // 'select' fires when Enter is pressed on a focused List (idiomatic blessed)
      (list as any).on('select', (_item: any, index: number) => done(index));
      (list as any).key(['escape', 'q'], () => done(null));
      this.screen.render();
    });
  }

  /** Show a preset picker and apply the chosen joypad layout. */
  private async pickGamepadPreset(): Promise<void> {
    const GAMEPAD_PRESETS: Record<string, { name: string; bindings: Record<string, string[]> }> = {
      standard: {
        // Matches GAMEPAD_MAPPING defaults in app.ts exactly.
        // Dpad + left stick for movement; face buttons for rotation.
        name: 'Standard (dpad + left stick)',
        bindings: {
          left:       ['dpad:left',  'axis:left-x:negative'],
          right:      ['dpad:right', 'axis:left-x:positive'],
          soft_drop:  ['dpad:down',  'axis:left-y:positive'],
          hard_drop:  ['dpad:up',    'button:a'],   // up = instant drop (Guideline)
          rotate_cw:  ['button:b',   'button:r1'],  // B = right face, R1 = right shoulder
          rotate_ccw: ['button:x',   'button:l1'],  // X = left face,  L1 = left shoulder
          rotate_180: ['button:y'],                  // Y = top face
          hold:       ['button:l2',  'button:r2'],  // Both triggers = hold
          pause:      ['button:start'],
        },
      },
      stick: {
        // Arcade / fighting-stick layout.
        // Stick/dpad for movement; button rows map to rotations.
        // No shoulder buttons for primary actions (sticks often lack them).
        name: 'Arcade Stick / Fighting',
        bindings: {
          left:       ['axis:left-x:negative', 'dpad:left'],
          right:      ['axis:left-x:positive',  'dpad:right'],
          soft_drop:  ['axis:left-y:positive',  'dpad:down'],
          hard_drop:  ['dpad:up',               'button:a'],   // up-lever or A = drop
          rotate_cw:  ['button:b',  'button:r1'],              // B / R1
          rotate_ccw: ['button:x',  'button:l1'],              // X / L1
          rotate_180: ['button:y'],                             // Y (top face, NOT r2/l2)
          hold:       ['button:l2', 'button:r2', 'button:select'],
          pause:      ['button:start'],
        },
      },
    };

    const presetKeys = Object.keys(GAMEPAD_PRESETS);
    const items = presetKeys.map(k => GAMEPAD_PRESETS[k].name);

    return new Promise((resolve) => {
      const list = createList({
        parent: this.screen,
        top: 'center',
        left: 'center',
        width: 44,
        height: items.length + 4,
        label: ' Joypad Preset ',
        tags: true,
        keys: true,
        vi: true,
        mouse: true,
        border: { type: 'line' },
        style: {
          border: { fg: 'cyan' },
          selected: { bg: 'blue', fg: 'white' },
        },
        items,
      } as any);

      list.focus();

      const done = (idx: number | null) => {
        list.destroy();
        this.screen.render();
        if (idx !== null) {
          const preset = GAMEPAD_PRESETS[presetKeys[idx]];
          this.state.settings.gamepadBindings = { ...preset.bindings };
        }
        resolve();
      };

      (list as any).on('select', (_item: any, index: number) => done(index));
      (list as any).key(['escape', 'q'], () => done(null));
      this.screen.render();
    });
  }

  /**
   * Clear all joypad bindings (resets to defaults, which are handled by the
   * GAMEPAD_MAPPING in app.ts — storing an empty object means "use defaults").
   */
  private clearGamepadBindings(): void {
    this.state.settings.gamepadBindings = {};
  }

  /**
   * Joypad binding wizard — steps through all 9 actions in order starting from
   * startIndex. Pressing a button/dpad/axis auto-saves and advances. Enter skips,
   * Escape exits the wizard.
   */
  private async editAllGamepadBindings(startIndex: number = 0): Promise<void> {
    if (!this.bbsSession) return;
    if (!this.state.settings.gamepadBindings) this.state.settings.gamepadBindings = {};
    const gp = this.state.settings.gamepadBindings;

    const ACTIONS = [
      { key: 'left',       name: 'Move Left' },
      { key: 'right',      name: 'Move Right' },
      { key: 'rotate_cw',  name: 'Rotate CW' },
      { key: 'rotate_ccw', name: 'Rotate CCW' },
      { key: 'rotate_180', name: 'Rotate 180' },
      { key: 'soft_drop',  name: 'Soft Drop' },
      { key: 'hard_drop',  name: 'Hard Drop' },
      { key: 'hold',       name: 'Hold' },
      { key: 'pause',      name: 'Pause' },
    ];

    // Reorder so the chosen action is first; wrap around at the end
    const ordered = [...ACTIONS.slice(startIndex), ...ACTIONS.slice(0, startIndex)];
    let currentIdx = 0;
    let waiting = false;  // Block double-binding during the 600ms auto-advance delay

    const bindingBox = createBox({
      parent: this.screen,
      top: 'center',
      left: 'center',
      width: 57,
      height: 14,
      border: { type: 'line' },
      style: { border: { fg: 'cyan' } },
      content: '',
      fixed: true,
      focusable: true,
    });

    const updateDisplay = (feedback?: string) => {
      const action = ordered[currentIdx];
      const cur = gp[action.key]?.[0];
      const n = currentIdx + 1;
      const total = ordered.length;
      const bar = '#'.repeat(n) + '-'.repeat(total - n);
      bindingBox.setContent(
        `{cyan-fg}Joypad Wizard (${n}/${total}){/cyan-fg}\n\n` +
        `Action:  {yellow-fg}${action.name}{/yellow-fg}\n` +
        `Current: {white-fg}${cur ? formatTriggerStr(cur) : '(unbound)'}{/white-fg}\n\n` +
        (feedback
          ? `{green-fg}${feedback}{/green-fg}\n\n`
          : `{gray-fg}Press a button/stick to bind{/gray-fg}\n` +
            `{gray-fg}Enter=skip  Escape=done{/gray-fg}\n\n`) +
        `{gray-fg}[${bar}] ${n}/${total}{/gray-fg}`
      );
      this.screen.render();
    };

    return new Promise((resolve) => {
      const gim = new GamepadInputManager(this.bbsSession);

      const done = () => {
        this.screen.removeListener('keypress', keyHandler);
        gim.destroy();
        bindingBox.destroy();
        this.screen.render();
        resolve();
      };

      const advance = () => {
        waiting = false;
        currentIdx++;
        if (currentIdx >= ordered.length) {
          done();
        } else {
          updateDisplay();
        }
      };

      const bindTrigger = (triggerStr: string) => {
        if (waiting) return;
        waiting = true;
        const action = ordered[currentIdx];
        gp[action.key] = [triggerStr];
        updateDisplay(`Bound: ${formatTriggerStr(triggerStr)}`);
        setTimeout(advance, 600);
      };

      const keyHandler = (_ch: any, key: any) => {
        if (!key || waiting) return;
        const k = key.full || key.name;
        if (k === 'return' || k === 'enter') {
          advance();
        } else if (k === 'escape') {
          done();
        }
      };

      // Generic button event — catches any button regardless of mapping
      gim.on('button', (button: number, pressed: boolean) => {
        console.log(`[wizard] generic button event: btn=${button} pressed=${pressed}`);
      });

      // Button events (named)
      for (const btn of ['a', 'b', 'x', 'y', 'l1', 'r1', 'l2', 'r2', 'select', 'start', 'l3', 'r3', 'home']) {
        gim.on(`button:${btn}`, (pressed: boolean) => {
          console.log(`[wizard] button:${btn} pressed=${pressed}`);
          if (pressed) bindTrigger(`button:${btn}`);
        });
      }

      // DPad events
      gim.on('dpad', (direction: string) => {
        console.log(`[wizard] dpad direction=${direction}`);
        if (direction && direction !== 'none' && direction !== 'neutral') bindTrigger(`dpad:${direction}`);
      });

      // Analog stick events — require high deflection to avoid accidental binding
      const axisNames: Record<number, string> = {
        [GamepadAxis.LEFT_STICK_X]: 'left-x',
        [GamepadAxis.LEFT_STICK_Y]: 'left-y',
        [GamepadAxis.RIGHT_STICK_X]: 'right-x',
        [GamepadAxis.RIGHT_STICK_Y]: 'right-y',
      };
      gim.on('axis', (axis: GamepadAxis, value: number) => {
        const name = axisNames[axis];
        if (!name || Math.abs(value) < 0.85) return;
        bindTrigger(`axis:${name}:${value > 0 ? 'positive' : 'negative'}`);
      });

      setImmediate(() => this.screen.on('keypress', keyHandler));
      updateDisplay();
      bindingBox.focus();
    });
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
      // Defer one tick so the Enter that opened this dialog is not captured
      setImmediate(() => this.screen.on('keypress', keyHandler));

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
        if (Math.abs(value) < 0.85) return;
        // Always the RAW axis number. Stick names are a standard-layout idea
        // and are fiction on a pad the browser reports as "mapping: n/a" -
        // an 8BitDo NES30 Pro puts D-pad directions on axes 3 and 4, so a
        // bound D-pad read back as "RS-Y+" (reported 2026-08-25). Older
        // saved bindings that use names still parse.
        addTrigger(`axis:${axis}:${value > 0 ? 'positive' : 'negative'}`);
      });
    });
  }
}
