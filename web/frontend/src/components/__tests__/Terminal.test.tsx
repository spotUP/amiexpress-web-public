/**
 * Terminal Component Tests
 * Terminal is a re-export of @amiexpress/terminal's BBSTerminal.
 * Tests verify the import works and the component exists.
 */

import { describe, it, expect, vi } from 'vitest';
import { BBSTerminal, Terminal } from '../terminal/Terminal';

// Mock the heavy @amiexpress/terminal package — it requires WebSockets,
// xterm.js canvas, and other browser APIs not available in jsdom.
vi.mock('@amiexpress/terminal', () => ({
  BBSTerminal: vi.fn(() => null),
}));

describe('Terminal re-export', () => {
  it('BBSTerminal is exported', () => {
    expect(BBSTerminal).toBeDefined();
  });

  it('Terminal alias is exported', () => {
    expect(Terminal).toBeDefined();
  });

  it('BBSTerminal and Terminal alias point to the same component', () => {
    expect(BBSTerminal).toBe(Terminal);
  });

  it('BBSTerminal is a function (React component)', () => {
    expect(typeof BBSTerminal).toBe('function');
  });
});
