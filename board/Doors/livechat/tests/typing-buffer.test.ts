/**
 * LiveChat D3: a hub `typing` event carries the sender's whole input buffer;
 * setTypingBuffer replaces the preview in one call and "" removes it.
 */
import assert from 'assert';
import { setTypingBuffer, renderTypingPreview, isAnyoneTyping } from '../ui/typing-preview';
import type { TypingBuffer } from '../ui/typing-preview';

export async function setTypingBufferReplacesAndClears(): Promise<void> {
  const buffers = new Map<number, TypingBuffer>();
  setTypingBuffer(buffers, 7, 'bob@OTHER', 'hel', 'cyan');
  setTypingBuffer(buffers, 7, 'bob@OTHER', 'hello', 'cyan');
  assert.strictEqual(buffers.get(7)?.buffer, 'hello', 'a later snapshot replaces, never appends');
  assert.ok(isAnyoneTyping(buffers));
  assert.ok(renderTypingPreview(buffers).includes('hello'));
  setTypingBuffer(buffers, 7, 'bob@OTHER', '', 'cyan');
  assert.strictEqual(buffers.has(7), false, 'empty text removes the typer');
  assert.strictEqual(renderTypingPreview(buffers), '');
}
