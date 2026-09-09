/**
 * THE `W` ROW ROUND-TRIPS THROUGH THE USER RECORD.
 *
 * COSYSOP is a settings door - the same shape as SCREENTHEME, and listed
 * beside it under `W` - so what a caller picks in it has to reach
 * `users.ai_persona` and come back. These are the three seams the door speaks
 * through, and nothing else stands between the picker and the chat.
 *
 * The board decides what may be chosen, not the door: a slug nothing
 * recognises is REFUSED rather than stored, because a stored preference the
 * chat would not honour is a caller who pages and gets a stranger while the
 * picker says otherwise.
 */
process.env.SKIP_DB_INIT = '1';

/*
 * The mocks are BUILT INSIDE the factory and handed back on the module.
 * `import` is hoisted above `const`, so a factory that closes over a
 * module-level `const jest.fn()` reads it before it exists - the suite failed
 * to run at all with "Cannot access 'updateUser' before initialization".
 */
jest.mock('../../src/database', () => {
  const listPersonas = jest.fn(() => [] as unknown[]);
  return {
    db: {
      updateUser: jest.fn(async () => undefined),
      getOperatorChatRepository: () => ({ listPersonas }),
      __listPersonas: listPersonas,
    },
  };
});

import { db } from '../../src/database';
import { BBSApi } from '../../src/doors/BBSApi';
import { PRESET_PERSONAS } from '../../src/handlers/sysop-ai/personas';

const updateUser = (db as unknown as { updateUser: jest.Mock }).updateUser;
const listPersonas = (db as unknown as { __listPersonas: jest.Mock }).__listPersonas;

function apiFor(aiPersona = ''): BBSApi {
  const session: any = {
    user: { id: 'u-1', username: 'Caller', secLevel: 50, aiPersona },
    nodeId: 1,
  };
  const socket: any = { id: 's1', emit() {}, on() {} };
  return new BBSApi(socket, session);
}

describe('the co-sysop the caller picks', () => {
  beforeEach(() => {
    updateUser.mockClear();
    listPersonas.mockReset();
    listPersonas.mockReturnValue([]);
  });

  it('offers the whole cast', () => {
    const roster = apiFor().listCoSysopPersonas();
    expect(roster).toHaveLength(PRESET_PERSONAS.length);
    expect(roster.map((p) => p.slug)).toContain('sable');
    // Every row has something to show for itself in the picker.
    for (const row of roster) {
      expect(row.handle.trim()).not.toBe('');
      expect(row.blurb.trim()).not.toBe('');
    }
  });

  it('offers the personas the sysop wrote too', () => {
    listPersonas.mockReturnValue([
      { slug: 'nixie', handle: 'NIXIE', name: 'Nina Ek', blurb: 'One the sysop wrote.', systemPrompt: 'x', openingLines: [], fallbackLines: [] },
    ]);
    expect(apiFor().listCoSysopPersonas().map((p) => p.slug)).toContain('nixie');
  });

  it('still answers with the cast when the personas table cannot be read', () => {
    listPersonas.mockImplementation(() => { throw new Error('no such table'); });
    expect(apiFor().listCoSysopPersonas().length).toBe(PRESET_PERSONAS.length);
  });

  it('writes the choice onto the user record and reads it back', async () => {
    const api = apiFor();
    expect(api.getCoSysopPersona()).toBe('');

    expect(await api.setCoSysopPersona('SABLE')).toBe('sable');
    expect(updateUser).toHaveBeenCalledWith('u-1', { aiPersona: 'sable' });
    // The session carries it immediately, so the next page uses it without a
    // re-login - the chat reads `session.user.aiPersona`.
    expect(api.getCoSysopPersona()).toBe('sable');
  });

  it('accepts Random, which is a stored choice like any other', async () => {
    const api = apiFor();
    expect(await api.setCoSysopPersona('random')).toBe('random');
    expect(updateUser).toHaveBeenCalledWith('u-1', { aiPersona: 'random' });
  });

  it("accepts the empty choice, which is how a caller goes back to the board's", async () => {
    const api = apiFor('sable');
    expect(await api.setCoSysopPersona('')).toBe('');
    expect(updateUser).toHaveBeenCalledWith('u-1', { aiPersona: '' });
  });

  it('REFUSES a persona the board does not have, and keeps what he had', async () => {
    const api = apiFor('doc');
    expect(await api.setCoSysopPersona('nobody-at-all')).toBe('doc');
    expect(updateUser).not.toHaveBeenCalled();
  });

  it('accepts a persona the sysop wrote', async () => {
    listPersonas.mockReturnValue([
      { slug: 'nixie', handle: 'NIXIE', name: 'Nina Ek', blurb: '', systemPrompt: 'x', openingLines: [], fallbackLines: [] },
    ]);
    expect(await apiFor().setCoSysopPersona('nixie')).toBe('nixie');
  });
});
