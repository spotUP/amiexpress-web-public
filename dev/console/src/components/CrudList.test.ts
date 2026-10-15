import { test } from 'node:test';
import assert from 'node:assert/strict';
import { coerceEditValuesForSubmit, type EditField } from './CrudList.js';

const NUMBER_FIELD: EditField = { key: 'priority', label: 'Priority', type: 'number' };
const STRING_FIELD: EditField = { key: 'name', label: 'Name', type: 'string' };
const BOOL_FIELD: EditField = { key: 'enabled', label: 'Enabled', type: 'bool' };

test('a number field typed as a string (leading-zero accumulation) becomes a real number', () => {
  // startNew() seeds a number field at the JS number 0; the first keypress
  // turns it into the STRING "02" (String(0) + "2") - never coerced back
  // before this fix.
  const out = coerceEditValuesForSubmit([NUMBER_FIELD], { priority: '02' });
  assert.equal(out.priority, 2);
  assert.equal(typeof out.priority, 'number');
});

test('an untouched number field (still a real number) passes through unchanged', () => {
  const out = coerceEditValuesForSubmit([NUMBER_FIELD], { priority: 5 });
  assert.equal(out.priority, 5);
});

test('a negative number typed with the leading "-" coerces correctly', () => {
  const out = coerceEditValuesForSubmit([NUMBER_FIELD], { priority: '-3' });
  assert.equal(out.priority, -3);
});

test('an empty/untyped number field falls back to 0, not NaN', () => {
  const out = coerceEditValuesForSubmit([NUMBER_FIELD], { priority: '' });
  assert.equal(out.priority, 0);
});

test('string and bool fields are left untouched', () => {
  const out = coerceEditValuesForSubmit([STRING_FIELD, BOOL_FIELD], { name: 'x', enabled: true });
  assert.equal(out.name, 'x');
  assert.equal(out.enabled, true);
});

test('a required numeric field with no matching editField key is left alone (nothing to coerce)', () => {
  const out = coerceEditValuesForSubmit([STRING_FIELD], { priority: '02', name: 'x' });
  assert.equal(out.priority, '02'); // untouched - not declared as a number field here
});
