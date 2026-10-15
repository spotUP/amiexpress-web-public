/**
 * "i havent managed to reach an ai it has failed 4 times now" - the sysop, on
 * his own board, 2026-09-13.
 *
 * The log said why, and it was not the models. OpenRouter offered nineteen
 * tool-capable free ones; the board tried TWO and gave up:
 *
 *   Trying OpenRouter (inclusionai/ling-3.0-flash-vl:free) ... 429 (470ms)
 *   Trying next OpenRouter model...
 *   Trying OpenRouter (nex-agi/nex-n2.5-mini:free) ... 400
 *   No provider answered - saying so
 *
 * Two defects behind that. The attempt cap was a COUNT standing in for a time
 * budget, and a refusal is cheap - those 429s came back in under half a
 * second, with seventeen models untried and seconds of budget left. And
 * nothing RECORDED the failure, so the model that had just refused was still
 * the fastest thing on the list and was picked first again on the next
 * message: the same two models, failing in the same order, message after
 * message.
 */
process.env.SKIP_DB_INIT = '1';

import {
  rankFreeModels, noteModelCost, modelCostMs, resetModelCosts,
} from '../../src/handlers/grumpy-sysop-bot.handler';

const free = (id: string) => ({
  id, name: id,
  pricing: { prompt: '0', completion: '0' },
  supported_parameters: ['tools'],
  context_length: 8000,
});

const REFUSED = 'inclusionai/ling-3.0-flash-vl:free';
const NEXT = 'nex-agi/nex-n2.5-pro:free';

describe('a model that just refused', () => {
  beforeEach(() => resetModelCosts());

  it('is not the first choice on the very next message', () => {
    // Both untried: the refused one happens to sort first.
    expect(rankFreeModels([free(REFUSED), free(NEXT)])[0]).toBe(REFUSED);

    // It 429s in 470ms - exactly what the live log measured.
    noteModelCost(REFUSED, 470, false);

    expect(rankFreeModels([free(REFUSED), free(NEXT)])[0]).toBe(NEXT);
  });

  it('wears the refusal rather than looking like the fastest thing available', () => {
    noteModelCost(REFUSED, 470, false);
    noteModelCost(NEXT, 4000, true);
    // A fast failure must not read as a fast model.
    expect(modelCostMs(REFUSED)).toBeGreaterThan(modelCostMs(NEXT));
  });

  it('comes back once the penalty has passed', () => {
    noteModelCost(REFUSED, 470, false);
    const later = Date.now() + 11 * 60 * 1000;
    expect(rankFreeModels([free(REFUSED), free(NEXT)], later)[0]).toBe(REFUSED);
  });
});
