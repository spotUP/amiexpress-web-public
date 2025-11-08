/**
 * Unit Tests for Input Engine
 */

import { InputEngine } from '../../engines/input/input-engine';
import { KeyEvent } from '../../core/types';

describe('InputEngine', () => {
  let input: InputEngine;

  beforeEach(() => {
    input = new InputEngine();
  });

  describe('Key Mapping', () => {
    test('should map key to another key', () => {
      input.mapKey('w', 'ArrowUp');

      const event: KeyEvent = {
        key: 'w',
        ctrl: false,
        alt: false,
        shift: false,
        code: 119
      };

      const mapped = input.processInput(event);
      expect(mapped.key).toBe('ArrowUp');
    });

    test('should map multiple keys', () => {
      input.mapKey('w', 'ArrowUp');
      input.mapKey('a', 'ArrowLeft');
      input.mapKey('s', 'ArrowDown');
      input.mapKey('d', 'ArrowRight');

      const eventW: KeyEvent = { key: 'w', ctrl: false, alt: false, shift: false, code: 119 };
      const eventA: KeyEvent = { key: 'a', ctrl: false, alt: false, shift: false, code: 97 };

      expect(input.processInput(eventW).key).toBe('ArrowUp');
      expect(input.processInput(eventA).key).toBe('ArrowLeft');
    });

    test('should clear key mapping', () => {
      input.mapKey('w', 'ArrowUp');
      input.clearMapping('w');

      const event: KeyEvent = {
        key: 'w',
        ctrl: false,
        alt: false,
        shift: false,
        code: 119
      };

      const processed = input.processInput(event);
      expect(processed.key).toBe('w');
    });

    test('should clear all mappings', () => {
      input.mapKey('w', 'ArrowUp');
      input.mapKey('a', 'ArrowLeft');
      input.clearAllMappings();

      const event: KeyEvent = {
        key: 'w',
        ctrl: false,
        alt: false,
        shift: false,
        code: 119
      };

      expect(input.processInput(event).key).toBe('w');
    });
  });

  describe('Keyboard Macros', () => {
    test('should add keyboard macro', () => {
      input.addMacro('konami', [
        'ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown',
        'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight',
        'b', 'a'
      ], 500);

      // Macro should be added
    });

    test('should trigger macro on sequence', () => {
      input.addMacro('test', ['a', 'b', 'c'], 1000);

      const eventA: KeyEvent = { key: 'a', ctrl: false, alt: false, shift: false, code: 65 };
      const eventB: KeyEvent = { key: 'b', ctrl: false, alt: false, shift: false, code: 66 };
      const eventC: KeyEvent = { key: 'c', ctrl: false, alt: false, shift: false, code: 67 };

      input.processInput(eventA);
      input.processInput(eventB);
      input.processInput(eventC);

      expect(input.isMacroTriggered('test')).toBe(true);
    });

    test('should reset triggered macro', () => {
      input.addMacro('test', ['x', 'y'], 500);

      const eventX: KeyEvent = { key: 'x', ctrl: false, alt: false, shift: false, code: 88 };
      const eventY: KeyEvent = { key: 'y', ctrl: false, alt: false, shift: false, code: 89 };

      input.processInput(eventX);
      input.processInput(eventY);

      expect(input.isMacroTriggered('test')).toBe(true);

      input.resetMacro('test');
      expect(input.isMacroTriggered('test')).toBe(false);
    });

    test('should timeout macro sequence', (done) => {
      input.addMacro('timeout', ['a', 'b'], 100);

      const eventA: KeyEvent = { key: 'a', ctrl: false, alt: false, shift: false, code: 65 };
      input.processInput(eventA);

      // Wait longer than timeout
      setTimeout(() => {
        const eventB: KeyEvent = { key: 'b', ctrl: false, alt: false, shift: false, code: 66 };
        input.processInput(eventB);

        expect(input.isMacroTriggered('timeout')).toBe(false);
        done();
      }, 200);
    });

    test('should clear macro', () => {
      input.addMacro('test', ['a', 'b'], 500);
      input.clearMacro('test');

      const eventA: KeyEvent = { key: 'a', ctrl: false, alt: false, shift: false, code: 65 };
      const eventB: KeyEvent = { key: 'b', ctrl: false, alt: false, shift: false, code: 66 };

      input.processInput(eventA);
      input.processInput(eventB);

      expect(input.isMacroTriggered('test')).toBe(false);
    });
  });

  describe('Action Binding', () => {
    test('should bind action to key', () => {
      let called = false;
      input.bindAction('jump', ' ', () => { called = true; });

      const event: KeyEvent = { key: ' ', ctrl: false, alt: false, shift: false, code: 32 };
      input.processInput(event);

      expect(called).toBe(true);
    });

    test('should bind action to key combination', () => {
      let called = false;
      input.bindAction('save', 's', () => { called = true; }, { ctrl: true });

      const event: KeyEvent = { key: 's', ctrl: true, alt: false, shift: false, code: 83 };
      input.processInput(event);

      expect(called).toBe(true);
    });

    test('should not trigger without modifier', () => {
      let called = false;
      input.bindAction('test', 's', () => { called = true; }, { ctrl: true });

      const event: KeyEvent = { key: 's', ctrl: false, alt: false, shift: false, code: 83 };
      input.processInput(event);

      expect(called).toBe(false);
    });

    test('should unbind action', () => {
      let called = false;
      input.bindAction('test', 'x', () => { called = true; });
      input.unbindAction('test');

      const event: KeyEvent = { key: 'x', ctrl: false, alt: false, shift: false, code: 88 };
      input.processInput(event);

      expect(called).toBe(false);
    });

    test('should clear all actions', () => {
      let count = 0;
      input.bindAction('action1', 'a', () => { count++; });
      input.bindAction('action2', 'b', () => { count++; });
      input.clearAllActions();

      const eventA: KeyEvent = { key: 'a', ctrl: false, alt: false, shift: false, code: 65 };
      const eventB: KeyEvent = { key: 'b', ctrl: false, alt: false, shift: false, code: 66 };

      input.processInput(eventA);
      input.processInput(eventB);

      expect(count).toBe(0);
    });
  });

  describe('Input Recording', () => {
    test('should start recording', () => {
      input.startRecording();
      expect(input.isRecording()).toBe(true);
    });

    test('should stop recording', () => {
      input.startRecording();
      input.stopRecording();
      expect(input.isRecording()).toBe(false);
    });

    test('should record input sequence', () => {
      input.startRecording();

      const event1: KeyEvent = { key: 'a', ctrl: false, alt: false, shift: false, code: 65 };
      const event2: KeyEvent = { key: 'b', ctrl: false, alt: false, shift: false, code: 66 };

      input.processInput(event1);
      input.processInput(event2);

      const recording = input.stopRecording();
      expect(recording).toHaveLength(2);
      expect(recording[0].input.key).toBe('a');
      expect(recording[1].input.key).toBe('b');
    });

    test('should playback recording', (done) => {
      let keys: string[] = [];

      input.bindAction('a', 'a', () => keys.push('a'));
      input.bindAction('b', 'b', () => keys.push('b'));

      input.startRecording();

      const event1: KeyEvent = { key: 'a', ctrl: false, alt: false, shift: false, code: 65 };
      const event2: KeyEvent = { key: 'b', ctrl: false, alt: false, shift: false, code: 66 };

      input.processInput(event1);

      setTimeout(() => {
        input.processInput(event2);
        const recording = input.stopRecording();

        keys = [];
        input.playbackRecording(recording);

        // Give playback time to execute
        setTimeout(() => {
          expect(keys).toEqual(['a', 'b']);
          done();
        }, 100);
      }, 50);
    });

    test('should clear recording', () => {
      input.startRecording();

      const event: KeyEvent = { key: 'a', ctrl: false, alt: false, shift: false, code: 65 };
      input.processInput(event);
      input.clearRecording();

      const recording = input.stopRecording();
      expect(recording).toHaveLength(0);
    });
  });

  describe('Mouse Emulation', () => {
    test('should emulate mouse click', () => {
      const mouseEvent = input.emulateMouseClick(40, 12);

      expect(mouseEvent.position.x).toBe(40);
      expect(mouseEvent.position.y).toBe(12);
      expect(mouseEvent.button).toBe(1);
      expect(mouseEvent.type).toBe('click');
    });

    test('should emulate mouse movement', () => {
      const mouseEvent = input.emulateMouseMove(10, 5);

      expect(mouseEvent.position.x).toBe(10);
      expect(mouseEvent.position.y).toBe(5);
      expect(mouseEvent.type).toBe('move');
    });
  });
});
