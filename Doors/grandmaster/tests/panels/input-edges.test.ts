/**
 * The panel modes take input the way the rest of the door does.
 *
 * Reported live on 2026-09-03: "fully playable but it doesn't feel snappy like
 * gmaster". It asked the SDK input manager for held keys; that manager's
 * held-key tracking is off unless a door opts in, this door never did, so the
 * answer was always no and every session fell back to the character stream -
 * inheriting the client's auto-repeat, which is one move, a pause of nearly
 * half a second, then a burst.
 *
 * The door already had real press edges, in the one place both its input paths
 * agree a press happened. These pin that they are offered to anything that
 * asks, on BOTH paths, because a mode with no pieces cannot use the Tetris
 * action names those edges are otherwise dispatched as.
 */

import assert from 'assert';

interface Harness {
  handler: any;
  /** A browser key-down, as game mode delivers it. */
  press(key: string): void;
  release(key: string): void;
  /** A blessed keypress, as telnet delivers it. */
  type(key: string): void;
  edges: string[];
  restore(): void;
}

async function harness(withKeyEvents: boolean): Promise<Harness> {
  const { InputHandler } = await import('../../input/handler');

  const realNow = Date.now;
  let down: ((key: string) => void) | null = null;
  let up: ((key: string) => void) | null = null;
  let keypress: ((ch: string | undefined, key: unknown) => void) | null = null;

  const screen: any = {
    on: (event: string, cb: (ch: string | undefined, key: unknown) => void) => {
      if (event === 'keypress') keypress = cb;
    },
    removeListener: () => {},
  };
  // Without onKeyDown/onKeyUp the handler stays on the character path, which
  // is exactly what a telnet caller gets.
  const session: any = withKeyEvents
    ? {
      bbs: {
        connectionType: 'web',
        onKeyDown: (cb: (key: string) => void) => { down = cb; },
        onKeyUp: (cb: (key: string) => void) => { up = cb; },
      },
    }
    : { bbs: { connectionType: 'telnet' } };

  const handler: any = new InputHandler(screen, session);
  handler.setEnabled(true);

  const edges: string[] = [];
  handler.onKeyEdge((name: string) => edges.push(name));

  return {
    handler,
    edges,
    press: (key: string) => down?.(key),
    release: (key: string) => up?.(key),
    type: (key: string) => keypress?.(key, { name: key, full: key }),
    restore: () => { (Date as any).now = realNow; },
  };
}

/** A browser session: every key-down is an edge, repeats are not. */
export async function everyPressIsAnEdgeInGameMode(): Promise<void> {
  const h = await harness(true);
  try {
    h.press('ArrowLeft');
    h.press('ArrowLeft');   // the client re-sends while the key auto-repeats
    h.release('ArrowLeft');
    h.press('ArrowLeft');

    assert.deepStrictEqual(
      h.edges, ['left', 'left'],
      'two real presses, and the auto-repeat between them is not a third',
    );
  } finally {
    h.restore();
  }
}

/** A telnet session has no key events at all, and still reports edges. */
export async function everyKeypressIsAnEdgeOnTelnet(): Promise<void> {
  const h = await harness(false);
  try {
    h.type('space');
    h.type('space');
    assert.deepStrictEqual(
      h.edges, ['space', 'space'],
      'a caller with no key-up gets one edge per keypress',
    );
  } finally {
    h.restore();
  }
}

/**
 * The thing polling gets wrong: a tap that begins and ends between two polls.
 *
 * A frame samples input once. Press and release inside that gap and a held
 * flag reads false both times - the move never happened. An edge cannot be
 * missed, which is why the panel modes queue them instead.
 */
export async function aTapBetweenTwoPollsIsNotLost(): Promise<void> {
  const h = await harness(true);
  try {
    // No poll happens in here at all; this is the whole gap.
    h.press('ArrowRight');
    h.release('ArrowRight');

    assert.strictEqual(h.handler.heldKeys().has('right'), false, 'nothing is held now');
    assert.deepStrictEqual(h.edges, ['right'], 'but the press was still reported');
  } finally {
    h.restore();
  }
}

/** Unsubscribing stops the reports, so a finished mode leaves nothing behind. */
export async function unsubscribingStopsTheEdges(): Promise<void> {
  const h = await harness(true);
  try {
    const seen: string[] = [];
    const stop = h.handler.onKeyEdge((name: string) => seen.push(name));

    h.press('ArrowLeft');
    h.release('ArrowLeft');
    stop();
    h.press('ArrowLeft');

    assert.deepStrictEqual(seen, ['left'], 'only the press before the unsubscribe');
  } finally {
    h.restore();
  }
}

/** Key-state mode is reported honestly, since telnet must not trust heldKeys. */
export async function keyStateModeSaysWhichTransportThisIs(): Promise<void> {
  const web = await harness(true);
  const telnet = await harness(false);
  try {
    assert.strictEqual(web.handler.isKeyStateMode(), true);
    assert.strictEqual(telnet.handler.isKeyStateMode(), false);
  } finally {
    web.restore();
    telnet.restore();
  }
}
