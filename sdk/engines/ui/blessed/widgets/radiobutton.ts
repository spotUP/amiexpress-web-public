/**
 * RadioButton - Single radio button (usually used within RadioSet)
 *
 * Responsive features:
 * - Touch-friendly height on mobile (min 3 rows)
 * - Visual tap feedback
 */

import { Box, BoxOptions } from './box';
import type { ResponsiveState } from '../core/responsive-mixin';
import type { BreakpointName } from '../core/responsive-constants';
import { MIN_TOUCH_HEIGHT } from '../core/responsive-constants';

export interface RadioButtonOptions extends BoxOptions {
  checked?: boolean;
  text?: string;
  checkChar?: string;
  uncheckChar?: string;
  value?: any;
  /** Enable tap feedback (default: true) */
  tapFeedback?: boolean;
  /** Mobile height (default: MIN_TOUCH_HEIGHT) */
  mobileHeight?: number;
}

export class RadioButton extends Box {
  private _checked: boolean = false;
  private _text: string;
  private checkChar: string;
  private uncheckChar: string;
  public value: any;
  private _tapFeedback: boolean;
  private _desktopHeight: number | string | undefined;
  private _mobileHeight: number;

  constructor(options: RadioButtonOptions = {}) {
    const baseStyle = options.style || {};
    const focusStyle = {
      fg: 'black',
      bg: 'yellow',
      ...(baseStyle.focus || {}),
    };
    const hoverStyle = {
      fg: 'black',
      bg: 'cyan',
      ...(baseStyle.hover || {}),
    };

    super({
      ...options,
      focusable: options.focusable ?? true,
      clickable: true,
      touchFriendly: true,
      height: options.height || 1,
      width: options.width || (options.text ? options.text.length + 4 : 3),
      tabIndex: -1,  // Exclude from Tab cycling - RadioSet handles navigation
      style: {
        ...baseStyle,
        focus: focusStyle,
        hover: hoverStyle,
      },
    });

    this._checked = options.checked || false;
    this._text = options.text || '';
    this.checkChar = options.checkChar || 'O';
    this.uncheckChar = options.uncheckChar || ' ';
    this.value = options.value !== undefined ? options.value : this._text;
    this._tapFeedback = options.tapFeedback !== false;
    this._desktopHeight = options.height || 1;
    this._mobileHeight = options.mobileHeight ?? MIN_TOUCH_HEIGHT;

    this.enableMouse();
    this.enableKeys();

    // Update display
    this.updateContent();

    // Select on click
    this.on('click', () => {
      this.select();
    });

    // Select on space/enter
    this.key(['space', 'enter'], () => {
      this.select();
      return true;
    });

    // Focus/blur handlers
    this.on('focus', () => {
      this.screen?.render();
    });

    this.on('blur', () => {
      this.screen?.render();
    });
  }

  /**
   * Override focus() to prevent RadioButton from stealing keyboard focus.
   * When clicked, focus is delegated to the parent RadioSet instead.
   * This prevents double-highlight (yellow border on parent + yellow bg on button).
   */
  override focus(): void {
    // Delegate keyboard focus to parent so RadioSet handles navigation
    if (this.parent && typeof (this.parent as any).focus === 'function') {
      (this.parent as any).focus();
      return;
    }
    super.focus();
  }

  /**
   * Update radio button display
   */
  private updateContent(): void {
    const radio = `(${this._checked ? this.checkChar : this.uncheckChar})`;
    this.setContent(this._text ? `${radio} ${this._text}` : radio);
  }

  /**
   * Select this radio button
   */
  select(): void {
    if (this._checked) return;
    this._showTapFeedback();
    this._checked = true;
    this.updateContent();
    this.emit('select');
    this.emit('change', true);
    if (this.screen) {
      this.screen.render();
    }
  }

  /**
   * Deselect this radio button
   */
  deselect(): void {
    if (!this._checked) return;
    this._checked = false;
    this.updateContent();
    this.emit('deselect');
    this.emit('change', false);
    if (this.screen) {
      this.screen.render();
    }
  }

  /**
   * Get selected state
   */
  isSelected(): boolean {
    return this._checked;
  }

  /**
   * Set selected state
   */
  setSelected(selected: boolean): void {
    if (selected) {
      this.select();
    } else {
      this.deselect();
    }
  }

  /**
   * Get radio button value
   */
  getValue(): any {
    return this._checked ? this.value : null;
  }

  /**
   * Get radio button text/label
   */
  getText(): string {
    return this._text;
  }

  // ============================================================================
  // Responsive Lifecycle Hooks
  // ============================================================================

  /**
   * Handle breakpoint change - adjust height for touch targets
   */
  protected _handleBreakpointChange(
    breakpoint: BreakpointName,
    previousBreakpoint: BreakpointName,
    state: ResponsiveState
  ): void {
    super._handleBreakpointChange(breakpoint, previousBreakpoint, state);
    if (state.isMobile) {
      this._setMobileHeight();
    } else {
      this._setDesktopHeight();
    }
    this.emit('breakpoint-change', breakpoint, previousBreakpoint);
  }

  protected _enterMobileMode(): void {
    this._setMobileHeight();
    this.emit('enter-mobile');
  }

  protected _exitMobileMode(): void {
    this._setDesktopHeight();
    this.emit('exit-mobile');
  }

  private _setMobileHeight(): void {
    const currentHeight = typeof this.height === 'number' ? this.height : 1;
    if (currentHeight < this._mobileHeight) {
      this.height = this._mobileHeight;
      if (this.screen) this.screen.render();
    }
  }

  private _setDesktopHeight(): void {
    if (this._desktopHeight !== undefined) {
      this.height = this._desktopHeight;
      if (this.screen) this.screen.render();
    }
  }

  private _showTapFeedback(): void {
    if (!this._tapFeedback) return;
    const currentBg = this.style.bg;
    this.style.bg = 'white';
    if (this.screen) this.screen.render();
    setTimeout(() => {
      this.style.bg = currentBg;
      if (this.screen) this.screen.render();
    }, 100);
  }
}
