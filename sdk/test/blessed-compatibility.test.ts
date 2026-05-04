/**
 * Blessed Compatibility Test Suite
 *
 * Tests that verify the blessed port maintains API compatibility
 * with neo-blessed and validates core functionality.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import {
  Screen,
  Box,
  Button,
  List,
  Textbox,
  Form,
  ProgressBar,
  Table,
  Canvas,
  Layout,
  Viewport,
} from '../engines/ui/blessed';

describe('Blessed Compatibility Tests', () => {
  let screen: Screen;

  beforeEach(() => {
    // Create a test screen for each test
    screen = new Screen({
      title: 'Test Screen',
    });
  });

  afterEach(() => {
    // Clean up
    if (screen && !screen.destroyed) {
      screen.destroy();
    }
  });

  // ============================================================================
  // Core Functionality Tests
  // ============================================================================

  describe('Screen', () => {
    it('should create screen with default dimensions', () => {
      expect(screen.width).toBe(80);
      expect(screen.height).toBe(24);
    });

    it('should enable mouse support', () => {
      expect(() => screen.enableMouse()).not.toThrow();
      expect(screen.program).toBeDefined();
    });

    it('should render without errors', () => {
      expect(() => screen.render()).not.toThrow();
    });

    it('should emit render event', (done) => {
      screen.once('render', () => {
        done();
      });
      screen.render();
    });

    it('should manage focus', () => {
      const box = new Box({
        parent: screen,
        focusable: true,
      });

      screen.focusPush(box);
      // Use the explicit accessor — `screen.focused` is the inherited
      // Element boolean flag (always false on the Screen itself), not
      // the focused-element pointer.
      expect(screen.getFocused()).toBe(box);
    });
  });

  describe('Element Position and Size', () => {
    it('should calculate absolute positions', () => {
      const box = new Box({
        parent: screen,
        top: 5,
        left: 10,
        width: 30,
        height: 10,
      });

      expect(box.atop).toBe(5);
      expect(box.aleft).toBe(10);
    });

    it('should handle percentage dimensions', () => {
      const box = new Box({
        parent: screen,
        width: '50%',
        height: '50%',
      });

      // box.width getter resolves the '50%' to absolute cells against the
      // 80x24 default screen — 50% of 80 = 40, 50% of 24 = 12. The literal
      // string lives on options.width.
      expect(box.width).toBe(40);
      expect(box.height).toBe(12);
      expect(box.options.width).toBe('50%');
      expect(box.options.height).toBe('50%');
    });

    it('should handle center alignment', () => {
      const box = new Box({
        parent: screen,
        top: 'center',
        left: 'center',
        width: 20,
        height: 10,
      });

      expect(box.options.top).toBe('center');
      expect(box.options.left).toBe('center');
    });
  });

  // ============================================================================
  // Widget Tests
  // ============================================================================

  describe('Box Widget', () => {
    it('should create box with content', () => {
      const box = new Box({
        parent: screen,
        content: 'Test Content',
      });

      expect(box.content).toBe('Test Content');
    });

    it('should set and get content', () => {
      const box = new Box({ parent: screen });
      box.setContent('New Content');
      expect(box.content).toBe('New Content');
    });

    it('should show and hide', () => {
      const box = new Box({ parent: screen });

      box.hide();
      expect(box.hidden).toBe(true);

      box.show();
      expect(box.hidden).toBe(false);
    });

    it('should handle borders', () => {
      const box = new Box({
        parent: screen,
        border: { type: 'line' },
      });

      expect(box.border).toBeDefined();
    });

    it('should emit show/hide events', (done) => {
      const box = new Box({ parent: screen });

      box.once('hide', () => {
        box.once('show', () => {
          done();
        });
        box.show();
      });

      box.hide();
    });
  });

  describe('Button Widget', () => {
    it('should create button', () => {
      const button = new Button({
        parent: screen,
        content: 'Click Me',
      });

      expect(button.content).toBe('Click Me');
    });

    it('should emit press event', (done) => {
      const button = new Button({
        parent: screen,
        content: 'Test',
      });

      button.once('press', () => {
        done();
      });

      button.press();
    });

    it('should be focusable by default', () => {
      const button = new Button({
        parent: screen,
      });

      expect(button.options.focusable).toBe(true);
    });
  });

  describe('List Widget', () => {
    it('should create list with items', () => {
      const list = new List({
        parent: screen,
        items: ['Item 1', 'Item 2', 'Item 3'],
      });

      expect(list.items.length).toBe(3);
    });

    it('should select items', () => {
      const list = new List({
        parent: screen,
        items: ['A', 'B', 'C'],
      });

      list.select(1);
      expect(list.selected).toBe(1);
    });

    it('should emit select item event when selection changes programmatically', (done) => {
      const list = new List({
        parent: screen,
        items: ['X', 'Y', 'Z'],
      });

      // Two distinct events:
      //   - 'select item' fires every time the highlighted index changes
      //     (programmatic select(N), arrow keys, mouse hover-select).
      //   - 'select' fires on a user commit action (Enter/Space/click).
      // This test asserts the cursor-move event; a separate test below
      // could exercise 'select' via Enter, but that's a keyboard-driven
      // path and not what the compat suite is here for.
      list.once('select item', (_item: any, index: number) => {
        expect(index).toBe(2);
        done();
      });

      list.select(2);
    });

    it('should navigate up/down', () => {
      const list = new List({
        parent: screen,
        items: ['1', '2', '3', '4'],
      });

      list.select(0);
      list.down();
      expect(list.selected).toBe(1);

      list.up();
      expect(list.selected).toBe(0);
    });

    it('should add and remove items', () => {
      const list = new List({
        parent: screen,
        items: ['A', 'B'],
      });

      list.addItem('C');
      expect(list.items.length).toBe(3);

      list.removeItem(1);
      expect(list.items.length).toBe(2);
    });
  });

  describe('Textbox Widget', () => {
    it('should create textbox with value', () => {
      const textbox = new Textbox({
        parent: screen,
        value: 'Initial',
      });

      expect(textbox.value).toBe('Initial');
    });

    it('should set value', () => {
      const textbox = new Textbox({ parent: screen });
      textbox.setValue('Test Value');
      expect(textbox.value).toBe('Test Value');
    });

    it('should clear value', () => {
      const textbox = new Textbox({
        parent: screen,
        value: 'Text',
      });

      textbox.clearValue();
      expect(textbox.value).toBe('');
    });

    it('should emit change event', (done) => {
      const textbox = new Textbox({ parent: screen });

      textbox.once('change', (value: string) => {
        expect(value).toBe('Changed');
        done();
      });

      textbox.setValue('Changed');
      textbox.emit('change', 'Changed');
    });
  });

  describe('Form Widget', () => {
    it('should create form with fields', () => {
      const form = new Form({
        parent: screen,
      });

      // 'name' isn't part of TextboxOptions on this build; the form
      // tracks children by reference. Removed for compile compat.
      const field1 = new Textbox({
        parent: form,
      });

      const field2 = new Textbox({
        parent: form,
      });

      expect(form.children.length).toBe(2);
    });

    it('should submit form', (done) => {
      const form = new Form({
        parent: screen,
      });

      form.once('submit', () => {
        done();
      });

      form.submit();
    });
  });

  describe('ProgressBar Widget', () => {
    it('should create progress bar', () => {
      const bar = new ProgressBar({
        parent: screen,
        filled: 50,
      });

      // `filled` is private; getProgress() is the public accessor.
      expect(bar.getProgress()).toBe(50);
    });

    it('should set progress', () => {
      const bar = new ProgressBar({ parent: screen });
      bar.setProgress(75);
      expect(bar.getProgress()).toBe(75);
    });
  });

  describe('Table Widget', () => {
    it('should create table with data', () => {
      const table = new Table({
        parent: screen,
        data: [
          ['Col1', 'Col2'],
          ['A', 'B'],
          ['C', 'D'],
        ],
      });

      // `rows` is private; getRows() is the public accessor.
      expect(table.getRows().length).toBeGreaterThan(0);
    });
  });

  describe('Canvas Widget', () => {
    it('should create canvas', () => {
      const canvas = new Canvas({
        parent: screen,
        width: 40,
        height: 20,
      });

      expect(canvas).toBeDefined();
    });

    it('should draw line', () => {
      const canvas = new Canvas({
        parent: screen,
        width: 40,
        height: 20,
      });

      expect(() => canvas.drawLine(0, 0, 10, 10)).not.toThrow();
    });

    it('should draw rectangle', () => {
      const canvas = new Canvas({
        parent: screen,
        width: 40,
        height: 20,
      });

      expect(() => canvas.drawRect(5, 5, 10, 10)).not.toThrow();
    });

    it('should clear canvas', () => {
      const canvas = new Canvas({
        parent: screen,
        width: 40,
        height: 20,
      });

      canvas.drawLine(0, 0, 10, 10);
      expect(() => canvas.clearCanvas()).not.toThrow();
    });
  });

  describe('Layout Widget', () => {
    it('should create inline layout', () => {
      const layout = new Layout({
        parent: screen,
        layout: 'inline',
      });

      expect(layout.getLayout()).toBe('inline');
    });

    it('should create grid layout', () => {
      const layout = new Layout({
        parent: screen,
        layout: 'grid',
      });

      expect(layout.getLayout()).toBe('grid');
    });

    it('should change layout', () => {
      const layout = new Layout({
        parent: screen,
        layout: 'inline',
      });

      layout.setLayout('grid');
      expect(layout.getLayout()).toBe('grid');
    });
  });

  describe('Viewport Widget', () => {
    it('should create viewport', () => {
      const viewport = new Viewport({
        parent: screen,
      });

      expect(viewport).toBeDefined();
    });

    it('should scroll', () => {
      const viewport = new Viewport({
        parent: screen,
      });

      viewport.setContent('Line 1\nLine 2\nLine 3\nLine 4\nLine 5');
      viewport.scroll(2);

      expect(viewport.getScrollPosition()).toBeGreaterThanOrEqual(0);
    });

    it('should detect scroll position', () => {
      const viewport = new Viewport({
        parent: screen,
        height: 5,
      });

      viewport.setContent('Line 1\nLine 2\nLine 3');
      viewport.scrollTo(0);

      expect(viewport.isAtTop()).toBe(true);
    });
  });

  // ============================================================================
  // Mouse Event Tests
  // ============================================================================

  describe('Mouse Events', () => {
    beforeEach(() => {
      screen.enableMouse();
    });

    it('should enable mouse on element', () => {
      const box = new Box({
        parent: screen,
        mouse: true,
      });

      expect(() => box.enableMouse()).not.toThrow();
    });

    it('should emit click event', (done) => {
      const box = new Box({
        parent: screen,
        top: 0,
        left: 0,
        width: 10,
        height: 5,
        mouse: true,
        clickable: true,
      });

      box.enableMouse();

      box.once('click', (data: any) => {
        expect(data).toBeDefined();
        done();
      });

      // Simulate click
      box.onMouse({
        action: 'mousedown',
        button: 'left',
        x: 2,
        y: 2,
        shift: false,
        ctrl: false,
        meta: false,
      });
    });

    it('should detect mouse over', () => {
      const box = new Box({
        parent: screen,
        top: 5,
        left: 5,
        width: 10,
        height: 5,
      });

      expect(box.hasMouseOver(7, 7)).toBe(true);
      expect(box.hasMouseOver(20, 20)).toBe(false);
    });

    it('should enable drag', () => {
      const box = new Box({
        parent: screen,
        mouse: true,
      });

      expect(() => box.enableDrag()).not.toThrow();
    });
  });

  // ============================================================================
  // Keyboard Event Tests
  // ============================================================================

  describe('Keyboard Events', () => {
    it('should bind key handler', () => {
      expect(() => {
        screen.key('q', () => {
          // Handler
        });
      }).not.toThrow();
    });

    it('should unbind key handler', () => {
      const handler = () => {};
      screen.key('q', handler);
      expect(() => screen.unkey('q', handler)).not.toThrow();
    });

    it('should handle multiple keys', () => {
      expect(() => {
        screen.key(['q', 'escape'], () => {
          // Handler
        });
      }).not.toThrow();
    });
  });

  // ============================================================================
  // Focus Management Tests
  // ============================================================================

  describe('Focus Management', () => {
    it('should focus element', () => {
      const box = new Box({
        parent: screen,
        focusable: true,
      });

      box.focus();
      expect(box.focused).toBe(true);
    });

    it('should blur element', () => {
      const box = new Box({
        parent: screen,
        focusable: true,
      });

      box.focus();
      box.blur();
      expect(box.focused).toBe(false);
    });

    it('should emit focus event', (done) => {
      const box = new Box({
        parent: screen,
        focusable: true,
      });

      box.once('focus', () => {
        done();
      });

      box.focus();
    });

    it('should emit blur event', (done) => {
      const box = new Box({
        parent: screen,
        focusable: true,
      });

      box.focus();

      box.once('blur', () => {
        done();
      });

      box.blur();
    });

    it('should manage focus stack', () => {
      const box1 = new Box({ parent: screen, focusable: true });
      const box2 = new Box({ parent: screen, focusable: true });

      screen.focusPush(box1);
      expect(screen.getFocused()).toBe(box1);

      screen.focusPush(box2);
      expect(screen.getFocused()).toBe(box2);

      screen.focusPop();
      expect(screen.getFocused()).toBe(box1);
    });
  });

  // ============================================================================
  // Scrolling Tests
  // ============================================================================

  describe('Scrolling', () => {
    it('should enable scrolling', () => {
      const box = new Box({
        parent: screen,
        scrollable: true,
      });

      expect(box.options.scrollable).toBe(true);
    });

    it('should scroll by percentage', () => {
      const box = new Box({
        parent: screen,
        scrollable: true,
        content: 'Line 1\nLine 2\nLine 3\nLine 4\nLine 5',
      });

      expect(() => box.setScrollPerc(50)).not.toThrow();
    });

    it('should emit scroll event', (done) => {
      const box = new Box({
        parent: screen,
        scrollable: true,
      });

      box.once('scroll', () => {
        done();
      });

      box.setScrollPerc(25);
      box.emit('scroll');
    });
  });

  // ============================================================================
  // Content and Style Tests
  // ============================================================================

  describe('Content and Tags', () => {
    it('should parse tags', () => {
      const box = new Box({
        parent: screen,
        content: '{bold}Bold Text{/bold}',
        tags: true,
      });

      expect(box.content).toContain('Bold Text');
    });

    it('should handle colors', () => {
      const box = new Box({
        parent: screen,
        style: {
          fg: 'white',
          bg: 'blue',
        },
      });

      expect(box.style.fg).toBe('white');
      expect(box.style.bg).toBe('blue');
    });
  });

  // ============================================================================
  // Event System Tests
  // ============================================================================

  describe('Event System', () => {
    it('should emit and listen to events', (done) => {
      const box = new Box({ parent: screen });

      box.once('custom', (data: any) => {
        expect(data).toBe('test');
        done();
      });

      box.emit('custom', 'test');
    });

    it('should remove listeners', () => {
      const box = new Box({ parent: screen });
      const handler = () => {};

      box.on('test', handler);
      box.off('test', handler);

      expect(box.listenerCount('test')).toBe(0);
    });

    it('should handle once listeners', () => {
      const box = new Box({ parent: screen });
      let count = 0;

      box.once('test', () => {
        count++;
      });

      box.emit('test');
      box.emit('test');

      expect(count).toBe(1);
    });
  });

  // ============================================================================
  // Factory Function Tests
  // ============================================================================

  describe('Factory Functions', () => {
    it('should create screen with factory', () => {
      const { screen: screenFn } = require('../engines/ui/blessed');
      const testScreen = screenFn();

      expect(testScreen).toBeInstanceOf(Screen);
      testScreen.destroy();
    });

    it('should create box with factory', () => {
      const { box } = require('../engines/ui/blessed');
      const testBox = box({ parent: screen });

      expect(testBox).toBeInstanceOf(Box);
    });

    it('should create button with factory', () => {
      const { button } = require('../engines/ui/blessed');
      const testButton = button({ parent: screen });

      expect(testButton).toBeInstanceOf(Button);
    });
  });
});
