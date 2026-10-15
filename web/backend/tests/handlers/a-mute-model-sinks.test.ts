/**
 * A MODEL THAT ANSWERS WITH NO WORDS.
 *
 * The board measured how FAST each free model was and nothing else, and among
 * models nothing had measured yet it deliberately leaned SMALL (the giants are
 * the slow ones). That walked straight into liquid/lfm-2.5-2.6b:free, which is
 * fast, tool-capable, and cannot write a sentence: asked about Fairlight's C64
 * era it called three tools correctly and then wrote nothing, and the caller
 * got sixty lines of raw Demozoo (live, 2026-09-13).
 *
 * Speed is not the thing that matters. Whether it ANSWERS is.
 */
process.env.SKIP_DB_INIT = '1';

import {
  rankFreeModels, noteModelCost, noteModelMute, modelIsMute, resetModelCosts,
  probeAnUnmeasuredModel, primeModelCatalogue,
} from '../../src/handlers/grumpy-sysop-bot.handler';

const free = (id: string, context = 8000) => ({
  id, name: id,
  pricing: { prompt: '0', completion: '0' },
  supported_parameters: ['tools'],
  context_length: context,
});

const TINY = 'liquid/lfm-2.5-2.6b:free';
const REAL = 'some/proper-model:free';

describe('a model that runs tools and writes nothing', () => {
  beforeEach(() => resetModelCosts());

  // The handler probes an unmeasured model in the background after a message
  // (probeAnUnmeasuredModel, fire and forget). With the environment torn down
  // the moment the test returns, that lands as "import after the Jest
  // environment has been torn down" - and jest charges it to whichever suite is
  // unlucky, not to this one. Let it settle inside the test.
  afterEach(async () => { resetModelCosts(); await new Promise((r) => setTimeout(r, 60)); });


  it('sinks below a slower model that does answer', () => {
    // The mute one is measurably FASTER - that used to be the whole ranking.
    noteModelCost(TINY, 300, true);
    noteModelCost(REAL, 4000, true);
    expect(rankFreeModels([free(TINY), free(REAL)])[0]).toBe(TINY);

    noteModelMute(TINY, true);
    expect(rankFreeModels([free(TINY), free(REAL)])[0]).toBe(REAL);
  });

  it('is let back up the moment it does answer', () => {
    noteModelCost(TINY, 300, true);
    noteModelMute(TINY, true);
    expect(modelIsMute(TINY)).toBe(true);

    noteModelMute(TINY, false);
    expect(modelIsMute(TINY)).toBe(false);
    noteModelCost(REAL, 4000, true);
    expect(rankFreeModels([free(TINY), free(REAL)])[0]).toBe(TINY);
  });

  it('stays mute when a later call only updates its speed', () => {
    noteModelMute(TINY, true);
    noteModelCost(TINY, 250, true);
    expect(modelIsMute(TINY)).toBe(true);
  });

  it('is found by the probe, before any caller meets it', async () => {
    primeModelCatalogue([free(TINY) as any, free(REAL) as any]);
    resetModelCosts();
    // The probe asks a five-token question off the caller's path. This model
    // answers it with an empty string, instantly.
    const probed = await probeAnUnmeasuredModel(
      { openRouterApiKey: 'k' } as any,
      async () => ({ choices: [{ message: { role: 'assistant', content: '' } }] }),
    );
    expect(probed).not.toBeNull();
    expect(modelIsMute(probed!)).toBe(true);
  });

  it('and a model that does answer the probe is not marked', async () => {
    primeModelCatalogue([free(REAL) as any]);
    resetModelCosts();
    const probed = await probeAnUnmeasuredModel(
      { openRouterApiKey: 'k' } as any,
      async () => ({ choices: [{ message: { role: 'assistant', content: 'hi' } }] }),
    );
    expect(modelIsMute(probed!)).toBe(false);
  });
});
