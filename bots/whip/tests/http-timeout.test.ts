/**
 * A hung board must not leave a Discord command pending for ever.
 *
 * Node's axios has NO default timeout. Both clients built their instance with
 * `axios.create({ baseURL })` and nothing else, so a board that accepted the
 * connection and then went quiet left the request unsettled: the slash-command
 * handler never returned, the interaction expired, and the user saw "The
 * application did not respond" - or nothing at all.
 */

import assert from 'assert';
import axios from 'axios';

import { WhipApiClient } from '../src/whip-api';
import { BoardApiClient } from '../src/board-api';
import { BOARD_HTTP_TIMEOUT_MS } from '../src/http';

function configsFromBuildingTheClients(): Array<Record<string, unknown>> {
  const seen: Array<Record<string, unknown>> = [];
  const realCreate = axios.create.bind(axios);
  (axios as unknown as { create: (cfg?: unknown) => unknown }).create = (cfg?: unknown) => {
    seen.push((cfg ?? {}) as Record<string, unknown>);
    return realCreate(cfg as never);
  };
  try {
    new WhipApiClient('https://board.test/', 'service-token');
    new BoardApiClient('https://board.test/', 'bot-token');
  } finally {
    (axios as unknown as { create: unknown }).create = realCreate;
  }
  return seen;
}

export async function everyBoardClientBoundsItsRequests(): Promise<void> {
  const configs = configsFromBuildingTheClients();
  assert.strictEqual(configs.length, 2, 'both clients build their own axios instance');
  for (const cfg of configs) {
    assert.strictEqual(
      cfg.timeout,
      BOARD_HTTP_TIMEOUT_MS,
      `a board client was built with timeout=${String(cfg.timeout)}; a request to a hung board never settles without one`
    );
  }
}

export async function theTimeoutIsOneNumberForTheWholeBot(): Promise<void> {
  assert.ok(BOARD_HTTP_TIMEOUT_MS > 0, 'a timeout of zero is no timeout at all');
  // Discord's own deferred-interaction window is minutes; the board answering
  // a read should take seconds. Anything past a minute is a hang, not a wait.
  assert.ok(BOARD_HTTP_TIMEOUT_MS <= 60000, 'the wait is bounded in human terms');
}
