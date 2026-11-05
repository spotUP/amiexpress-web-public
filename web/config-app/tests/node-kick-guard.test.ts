/**
 * Kick guard: every kick confirms, service accounts shout.
 *
 * Live 2026-09-11: one stray click kicked discord-bridge (the WHIP feed
 * bridge) and the Discord feed went silent. The Kick button fired with no
 * confirm at all.
 */
import { describe, expect, it } from 'vitest';
import { isServiceAccount, kickConfirmFor } from '../src/pages/node-kick-guard';

describe('isServiceAccount', () => {
  it('names the feed bridge', () => {
    expect(isServiceAccount('discord-bridge')).toBe(true);
    expect(isServiceAccount('Discord-Bridge')).toBe(true);
  });
  it('catches the bridge/bot naming shape', () => {
    expect(isServiceAccount('feed-bridge')).toBe(true);
    expect(isServiceAccount('whip-bot')).toBe(true);
    expect(isServiceAccount('bot-feed')).toBe(true);
  });
  it('leaves callers alone', () => {
    expect(isServiceAccount('sysop')).toBe(false);
    expect(isServiceAccount('spot')).toBe(false);
    expect(isServiceAccount('')).toBe(false);
    expect(isServiceAccount(undefined)).toBe(false);
  });
  it('does not match mid-word', () => {
    expect(isServiceAccount('bridgebuilder')).toBe(false);
    expect(isServiceAccount('mybot')).toBe(false);
  });
});

describe('kickConfirmFor', () => {
  it('a caller gets a plain warning confirm', () => {
    const dialog = kickConfirmFor({ nodeId: 3, username: 'sysop' });
    expect(dialog.type).toBe('warning');
    expect(dialog.confirmText).toBe('Kick');
    expect(dialog.message).toContain('Node 3 (sysop)');
  });
  it('a service account gets the danger dialog naming the cost', () => {
    const dialog = kickConfirmFor({ nodeId: 7, username: 'discord-bridge' });
    expect(dialog.type).toBe('danger');
    expect(dialog.title).toMatch(/service account/i);
    expect(dialog.confirmText).toBe('Kick anyway');
    expect(dialog.message).toMatch(/feed/i);
  });
  it('an unnamed node still names the node', () => {
    const dialog = kickConfirmFor({ nodeId: 2 });
    expect(dialog.message).toContain('Node 2');
  });
});
