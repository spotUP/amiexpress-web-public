/**
 * TabPanel Widget
 * Manages multiple views with a horizontal tab bar
 */
import { Box } from './box';
import { Button } from './button';
export class TabPanel extends Box {
    constructor(options) {
        super({
            ...options,
        });
        this.tabButtons = [];
        this.tabContents = [];
        this.activeTabIndex = 0;
        this.barHeight = options.barHeight || 1;
        this.tabStyle = options.style?.tab || { fg: 'white', bg: 'black' };
        this.activeTabStyle = options.style?.activeTab || { fg: 'black', bg: 'cyan', bold: true };
        // Initialize tabs
        if (options.tabs) {
            options.tabs.forEach((tab, index) => {
                this.addTab(tab.label, tab.content);
            });
        }
        this.selectTab(options.activeTab || 0);
        // Keyboard navigation: Alt + 1-9 to select tabs
        this.on('keypress', (ch, key) => {
            if (key.meta && /^[1-9]$/.test(key.name)) {
                const index = parseInt(key.name) - 1;
                this.selectTab(index);
                return true;
            }
            return false;
        });
    }
    /**
     * Add a new tab
     */
    addTab(label, content) {
        const index = this.tabButtons.length;
        // Calculate button position
        let left = 0;
        if (index > 0) {
            const prevButton = this.tabButtons[index - 1];
            left = (prevButton.aleft - this.aleft) + prevButton.width + 1;
        }
        // Create tab button
        const button = new Button({
            parent: this,
            top: 0,
            left,
            height: this.barHeight,
            width: label.length + 2,
            content: ` ${label} `,
            padding: 0,
            style: this.tabStyle,
            border: undefined,
        });
        button.on('press', () => {
            this.selectTab(index);
        });
        this.tabButtons.push(button);
        // Create or prepare content element
        let contentElement;
        if (typeof content === 'string') {
            contentElement = new Box({
                parent: this,
                top: this.barHeight,
                left: 0,
                right: 0,
                bottom: 0,
                content,
                hidden: true,
            });
        }
        else {
            contentElement = content;
            contentElement.parent = this;
            contentElement.top = this.barHeight;
            contentElement.left = 0;
            contentElement.right = 0;
            contentElement.bottom = 0;
            contentElement.hide();
            this.append(contentElement);
        }
        this.tabContents.push(contentElement);
    }
    /**
     * Select a tab by index
     */
    selectTab(index) {
        if (index < 0 || index >= this.tabButtons.length)
            return;
        // Update active index
        const prevIndex = this.activeTabIndex;
        this.activeTabIndex = index;
        // Update styles
        if (this.tabButtons[prevIndex]) {
            this.tabButtons[prevIndex].setStyle(this.tabStyle);
            this.tabContents[prevIndex].hide();
        }
        this.tabButtons[index].setStyle(this.activeTabStyle);
        this.tabContents[index].show();
        this.emit('tab-change', index, prevIndex);
        this.screen?.render();
    }
    /**
     * Get active tab index
     */
    getActiveTab() {
        return this.activeTabIndex;
    }
    /**
     * Get number of tabs
     */
    getTabCount() {
        return this.tabButtons.length;
    }
    get type() {
        return 'tabpanel';
    }
}
/**
 * Factory function
 */
export function tabpanel(options) {
    return new TabPanel(options);
}
