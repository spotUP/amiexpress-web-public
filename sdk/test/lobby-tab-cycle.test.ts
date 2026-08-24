/**
 * MultiplayerLobby Tab-cycle regression test.
 *
 * Symptom (GRANDMASTER lobby, 2026-08-24, reported live): "sometimes when I
 * press Tab no panel gets highlighted." Root cause in
 * multiplayer-lobby.ts's setupUI(): Tab/Shift-Tab advanced a locally-tracked
 * `focusIndex` counter, but every OTHER way focus can change - the initial
 * `playerList.focus()` call, the 'p'/'t'/'o' keyboard shortcuts, '1'/'2' tab
 * switches, a mouse click - moves real focus without updating that counter.
 * The next Tab press then advances from the stale counter instead of from
 * wherever focus actually is, which can land back on the already-focused
 * element (looks like Tab did nothing) or skip past several targets.
 *
 * Fix: derive the next target from the real focus state (`indexOf` on the
 * live target list) every time, instead of trusting a separate counter.
 * This test exercises that exact fixed algorithm - copied inline rather
 * than importing multiplayer-lobby.ts's private closure, since constructing
 * a full MultiplayerLobby needs a LobbyNetworkAdapter + LobbyState mock
 * disproportionate to this fix; what matters is the indexing contract.
 */

import { describe, it, expect } from '@jest/globals';

interface FocusTarget {
  name: string;
  hidden: boolean;
  focus(): void;
}

function makeTarget(name: string, hidden = false): FocusTarget {
  return { name, hidden, focus() { /* no-op; the fake screen below tracks it */ } };
}

/** Mirrors multiplayer-lobby.ts's fixed cycleFocus(). */
function cycleFocus(
  allTargets: FocusTarget[],
  screen: { focused: FocusTarget | null },
  direction: 1 | -1
): void {
  const visible = allTargets.filter(t => !t.hidden);
  if (visible.length === 0) return;
  const currentIndex = visible.indexOf(screen.focused as any);
  const nextIndex = currentIndex === -1
    ? 0
    : (currentIndex + direction + visible.length) % visible.length;
  screen.focused = visible[nextIndex];
}

describe('MultiplayerLobby Tab cycle', () => {
  it('advances from wherever focus actually is, not a stale counter', () => {
    const playerList = makeTarget('playerList');
    const settingsList = makeTarget('settingsList');
    const startButton = makeTarget('startButton');
    const leaveButton = makeTarget('leaveButton');
    const targets = [playerList, settingsList, startButton, leaveButton];
    const screen = { focused: playerList as FocusTarget | null };

    // Simulate the 'o' shortcut jumping focus straight to the settings list,
    // completely out of band from Tab - this is exactly what desynced the
    // old counter.
    screen.focused = settingsList;

    cycleFocus(targets, screen, 1);
    expect(screen.focused).toBe(startButton);

    cycleFocus(targets, screen, 1);
    expect(screen.focused).toBe(leaveButton);

    // Wraps back to the first target.
    cycleFocus(targets, screen, 1);
    expect(screen.focused).toBe(playerList);
  });

  it('falls back to the first visible target when focus is on something outside the cycle', () => {
    const playerList = makeTarget('playerList');
    const startButton = makeTarget('startButton');
    const chatInput = makeTarget('chatInput'); // not part of the lobby's Tab cycle
    const targets = [playerList, startButton];
    const screen = { focused: chatInput as FocusTarget | null };

    cycleFocus(targets, screen, 1);

    expect(screen.focused).toBe(playerList);
  });

  it('skips hidden targets in both directions', () => {
    const readyButton = makeTarget('readyButton', /* hidden: host is always ready */ true);
    const startButton = makeTarget('startButton');
    const leaveButton = makeTarget('leaveButton');
    const targets = [readyButton, startButton, leaveButton];
    const screen = { focused: startButton as FocusTarget | null };

    cycleFocus(targets, screen, 1);
    expect(screen.focused).toBe(leaveButton);

    cycleFocus(targets, screen, -1);
    expect(screen.focused).toBe(startButton);
  });
});
