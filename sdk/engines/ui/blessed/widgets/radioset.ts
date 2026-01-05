/**
 * RadioSet - Container for managing a group of radio buttons
 */

import { Box } from './box';
import { RadioButton, RadioButtonOptions } from './radiobutton';
import type { ElementOptions, KeyEvent } from '../core/types';

export interface RadioSetOptions extends ElementOptions {
  items?: Array<string | RadioButtonOptions>;
  selected?: number;
  vertical?: boolean;
  spacing?: number;
}

export class RadioSet extends Box {
  private radioButtons: RadioButton[] = [];
  private selectedIndex: number = -1;

  constructor(options: RadioSetOptions = {}) {
    super({
      ...options,
      focusable: true,
    });

    const items = options.items || [];
    const vertical = options.vertical !== false;
    const spacing = options.spacing || 1;
    this.selectedIndex = options.selected ?? -1;

    // Create radio buttons
    items.forEach((item, index) => {
      const radioOptions: RadioButtonOptions = typeof item === 'string'
        ? { text: item, value: item }
        : item;

      const radio = new RadioButton({
        ...radioOptions,
        parent: this,
        top: vertical ? index * spacing : 0,
        left: vertical ? 0 : index * ((radioOptions.text?.length || 3) + 4 + spacing),
        checked: index === options.selected,
      });

      this.radioButtons.push(radio);

      // Handle selection
      radio.on('select', () => {
        this.selectRadio(index);
      });
    });

    // RE-RENDER ON FOCUS/BLUR
    this.on('focus', () => this.screen?.render());
    this.on('blur', () => this.screen?.render());

    this.enableMouse();

    // Arrow key navigation
    this.on('keypress', this._onKeypress.bind(this));
  }

  private _onKeypress(ch: any, key: KeyEvent): boolean {
    if (!this.focused) return false;

    if (key.name === 'up' || key.name === 'left') {
      this.selectPrevious();
      this.screen?.render();
      return true;
    }

    if (key.name === 'down' || key.name === 'right') {
      this.selectNext();
      this.screen?.render();
      return true;
    }

    return false;
  }

  /**
   * Select a radio button by index
   */
  selectRadio(index: number): void {
    if (index < 0 || index >= this.radioButtons.length) return;
    if (this.selectedIndex === index) return;

    // Deselect current
    if (this.selectedIndex >= 0 && this.selectedIndex < this.radioButtons.length) {
      this.radioButtons[this.selectedIndex].deselect();
    }

    // Select new
    this.selectedIndex = index;
    this.radioButtons[index].select();

    this.emit('change', this.getValue(), index);
  }

  /**
   * Select previous radio button
   */
  selectPrevious(): void {
    const newIndex = this.selectedIndex - 1;
    if (newIndex >= 0) {
      this.selectRadio(newIndex);
    }
  }

  /**
   * Select next radio button
   */
  selectNext(): void {
    const newIndex = this.selectedIndex + 1;
    if (newIndex < this.radioButtons.length) {
      this.selectRadio(newIndex);
    }
  }

  /**
   * Get selected radio button index
   */
  getSelectedIndex(): number {
    return this.selectedIndex;
  }

  /**
   * Get selected radio button value
   */
  getValue(): any {
    if (this.selectedIndex >= 0 && this.selectedIndex < this.radioButtons.length) {
      return this.radioButtons[this.selectedIndex].value;
    }
    return null;
  }

  /**
   * Set selected radio button by value
   */
  setValue(value: any): void {
    const index = this.radioButtons.findIndex(radio => radio.value === value);
    if (index >= 0) {
      this.selectRadio(index);
    }
  }

  /**
   * Get all radio buttons
   */
  getRadioButtons(): RadioButton[] {
    return this.radioButtons;
  }

  /**
   * Add a radio button
   */
  addRadio(options: RadioButtonOptions | string): RadioButton {
    const radioOptions: RadioButtonOptions = typeof options === 'string'
      ? { text: options, value: options }
      : options;

    const index = this.radioButtons.length;
    const radio = new RadioButton({
      ...radioOptions,
      parent: this,
      top: index,
    });

    this.radioButtons.push(radio);

    radio.on('select', () => {
      this.selectRadio(index);
    });

    return radio;
  }

  /**
   * Remove a radio button by index
   */
  removeRadio(index: number): void {
    if (index < 0 || index >= this.radioButtons.length) return;

    const radio = this.radioButtons[index];
    radio.destroy();
    this.radioButtons.splice(index, 1);

    // Adjust selected index
    if (this.selectedIndex === index) {
      this.selectedIndex = -1;
    } else if (this.selectedIndex > index) {
      this.selectedIndex--;
    }
  }
}