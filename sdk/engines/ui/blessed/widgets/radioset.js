/**
 * RadioSet - Container for managing a group of radio buttons
 */
import { Box } from './box';
import { RadioButton } from './radiobutton';
export class RadioSet extends Box {
    constructor(options = {}) {
        super({
            ...options,
            focusable: true,
        });
        this.radioButtons = [];
        this.selectedIndex = -1;
        const items = options.items || [];
        const vertical = options.vertical !== false;
        const spacing = options.spacing || 1;
        // Create radio buttons
        items.forEach((item, index) => {
            const radioOptions = typeof item === 'string'
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
            if (index === options.selected) {
                this.selectedIndex = index;
            }
        });
        // Arrow key navigation
        this.key(['up', 'left'], () => {
            this.selectPrevious();
        });
        this.key(['down', 'right'], () => {
            this.selectNext();
        });
    }
    /**
     * Select a radio button by index
     */
    selectRadio(index) {
        if (index < 0 || index >= this.radioButtons.length)
            return;
        if (this.selectedIndex === index)
            return;
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
    selectPrevious() {
        const newIndex = this.selectedIndex - 1;
        if (newIndex >= 0) {
            this.selectRadio(newIndex);
        }
    }
    /**
     * Select next radio button
     */
    selectNext() {
        const newIndex = this.selectedIndex + 1;
        if (newIndex < this.radioButtons.length) {
            this.selectRadio(newIndex);
        }
    }
    /**
     * Get selected radio button index
     */
    getSelectedIndex() {
        return this.selectedIndex;
    }
    /**
     * Get selected radio button value
     */
    getValue() {
        if (this.selectedIndex >= 0 && this.selectedIndex < this.radioButtons.length) {
            return this.radioButtons[this.selectedIndex].value;
        }
        return null;
    }
    /**
     * Set selected radio button by value
     */
    setValue(value) {
        const index = this.radioButtons.findIndex(radio => radio.value === value);
        if (index >= 0) {
            this.selectRadio(index);
        }
    }
    /**
     * Get all radio buttons
     */
    getRadioButtons() {
        return this.radioButtons;
    }
    /**
     * Add a radio button
     */
    addRadio(options) {
        const radioOptions = typeof options === 'string'
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
    removeRadio(index) {
        if (index < 0 || index >= this.radioButtons.length)
            return;
        const radio = this.radioButtons[index];
        radio.destroy();
        this.radioButtons.splice(index, 1);
        // Adjust selected index
        if (this.selectedIndex === index) {
            this.selectedIndex = -1;
        }
        else if (this.selectedIndex > index) {
            this.selectedIndex--;
        }
    }
}
