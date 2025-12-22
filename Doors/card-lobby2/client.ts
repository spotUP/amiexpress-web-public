/**
 * Card Lobby 2 - Hybrid Door Client Component
 *
 * Forwards web input to the server-side Card Lobby UI and plays
 * lightweight UI sounds locally in the browser.
 */

import { ClientDoor, AudioEngine } from '@amiexpress/bbs-door-sdk/client';
import type { KeyEvent } from '@amiexpress/bbs-door-sdk/client';

const door = new ClientDoor({
  name: 'Card Lobby 2',
  version: '2.0.0',
  author: 'AmiExpress Team',
  description: 'Hybrid wrapper for Card Lobby with web audio',
  runtime: 'hybrid',
  hybrid: true,
});

const audio = new AudioEngine({
  masterVolume: 0.6,
  sfxVolume: 0.8,
});

let audioReady = false;

const KEY_MAP: Record<string, string> = {
  ArrowUp: '\x1b[A',
  ArrowDown: '\x1b[B',
  ArrowRight: '\x1b[C',
  ArrowLeft: '\x1b[D',
  Enter: '\r',
  Escape: '\x1b',
  Tab: '\t',
  Backspace: '\x7f',
  Space: ' ',
  ' ': ' ',
};

const keyToRaw = (key: KeyEvent): string => {
  const raw = (key as any).raw;
  if (typeof raw === 'string' && raw.length > 0) {
    return raw;
  }

  const keyName = (key as any).key ?? '';
  if (typeof keyName === 'string' && keyName.startsWith('{')) {
    return keyName;
  }

  if (typeof keyName === 'string' && KEY_MAP[keyName]) {
    return KEY_MAP[keyName];
  }

  if (typeof keyName === 'string' && keyName.length === 1) {
    return keyName;
  }

  return '';
};

const maybeInitAudio = async (): Promise<void> => {
  if (audioReady) return;
  try {
    await audio.init();
    audioReady = true;
  } catch {
    // Ignore audio init failures.
  }
};

const playUiSound = async (payload?: { type?: string }, keyName?: string): Promise<void> => {
  await maybeInitAudio();
  if (!audioReady) return;

  if (payload?.type === 'mouse-click' || keyName === 'Enter' || keyName === ' ') {
    audio.playSound('card-flap');
  }
};

door.onConnect(async () => {
  // Initialize audio on first interaction instead of on connect.
});

door.onInput((_user, key) => {
  const keyType = (key as any).type;
  if (keyType === 'keyup') {
    return;
  }

  const keyName = (key as any).key ?? '';
  let mousePayload: { type?: string } | undefined;

  if (typeof keyName === 'string' && keyName.startsWith('{')) {
    try {
      mousePayload = JSON.parse(keyName);
    } catch {
      mousePayload = undefined;
    }
  }

  const raw = keyToRaw(key);
  if (raw) {
    void door.rpc('input', { raw }).catch(() => undefined);
  }

  void playUiSound(mousePayload, keyName);
});

door.start();
