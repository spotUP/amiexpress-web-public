import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stripAnsi } from './strip-ansi.js';

test('stripAnsi removes CSI colour codes but keeps the visible text', () => {
  const input = '\u001B[1;32mHello\u001B[0m World';
  assert.equal(stripAnsi(input), 'Hello World');
});

test('stripAnsi removes a cursor-position sequence', () => {
  const input = '\u001B[10;5HAt row 10 col 5';
  assert.equal(stripAnsi(input), 'At row 10 col 5');
});

test('stripAnsi leaves plain text untouched', () => {
  assert.equal(stripAnsi('nothing to strip here'), 'nothing to strip here');
});
