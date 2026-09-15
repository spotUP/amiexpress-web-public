import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseNodeList } from './node-list.js';

test('reads a comma-separated list', () => {
  assert.deepEqual(parseNodeList('1,2,3'), [1, 2, 3]);
});

test('reads the same list written any other way a sysop writes it', () => {
  assert.deepEqual(parseNodeList('1 2 3'), [1, 2, 3]);
  assert.deepEqual(parseNodeList('1, 2 and 3'), [1, 2, 3]);
  assert.deepEqual(parseNodeList('  1;2 / 3 '), [1, 2, 3]);
});

test('keeps node 0, which is a real node on this board', () => {
  assert.deepEqual(parseNodeList('0,1'), [0, 1]);
});

test('drops a repeat instead of sharing to the same node twice', () => {
  assert.deepEqual(parseNodeList('2,2,2'), [2]);
});

test('sorts, so the dry run reads in node order however it was typed', () => {
  assert.deepEqual(parseNodeList('10,2,1'), [1, 2, 10]);
});

test('answers nothing for text with no numbers in it, rather than [NaN]', () => {
  assert.deepEqual(parseNodeList('all of them'), []);
  assert.deepEqual(parseNodeList(''), []);
});

test('ignores a negative sign rather than asking for node -1', () => {
  // The minus is a separator, so "-1" is node 1. What must never come back
  // is a negative node number, which the share endpoint has no meaning for.
  assert.ok(parseNodeList('-1').every((n) => n >= 0));
});
