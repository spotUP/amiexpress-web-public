/**
 * Creating a conference has to satisfy the database's own rule about order.
 *
 * "Failed to create conference: FOREIGN KEY constraint failed", on the first
 * Add Conference after the mirror was cleaned up.
 *
 * conference_config.conference_id REFERENCES conferences(id)
 * (database.ts:1650), and create inserted the conference_config row FIRST.
 * It only ever worked because the mirror still carried rows for conferences
 * that had been deleted - id 13 and 14 on this board - so the constraint
 * found something to point at. Pruning those stale rows removed the crutch
 * and the real ordering bug surfaced immediately.
 *
 * The order is disk, then mirror, then config row. Disk is the source of
 * truth, the mirror is derived from it, and the config row references the
 * mirror.
 */

process.env.SKIP_DB_INIT = '1';

// Twelve conferences on disk, so the one creatable id is 13. The service
// reads the real loadConfConfig; the board it sees is pinned here.
jest.mock('../../src/services/conf-config.service', () => ({
  loadConfConfig: jest.fn(() => ({
    confCount: 12,
    entries: Array.from({ length: 12 }, (_, i) => ({
      name: `Conference ${i + 1}`,
      location: `BBS:Conf${i + 1}/`,
    })),
  })),
}));

import { ConferenceConfigService } from '../../src/services/config-services/conference-config.service';

/** Records the order the create path touches things. */
function makeService() {
  const order: string[] = [];

  const configRepo = {
    createConferenceConfig: jest.fn((config: Record<string, unknown>) => {
      order.push('config-row');
      return { id: 1, ...config };
    }),
    logConfigChange: jest.fn(),
  };

  const database = {
    getConfigRepository: () => configRepo,
    ensureConferenceRow: jest.fn(() => {
      order.push('mirror-row');
    }),
  };

  const service = new ConferenceConfigService(database as never);

  (service as never as { conferenceSetup: unknown }).conferenceSetup = {
    setupConference: jest.fn(async () => {
      order.push('disk-files');
    }),
    updateConfConfig: jest.fn(async () => {
      order.push('disk-confconfig');
    }),
  };

  return { service, order, configRepo, database };
}

const context = { userId: 1, username: 'sysop', ipAddress: '127.0.0.1', userAgent: 'test' };

describe('creating a conference', () => {
  it('writes the disk, then the mirror row, then the config row that references it', async () => {
    const { service, order } = makeService();

    await service.createConferenceConfig(
      { conference_id: 13, name: 'Testzone', ndirs: 1 } as never,
      context as never
    );

    expect(order).toEqual(['disk-files', 'disk-confconfig', 'mirror-row', 'config-row']);
  });

  it('mirrors the conference under the name the sysop typed', async () => {
    const { service, database } = makeService();

    await service.createConferenceConfig(
      { conference_id: 13, name: 'Testzone', ndirs: 1 } as never,
      context as never
    );

    // The location is whatever ConfConfig.info already says for this slot,
    // falling back to Conf<n> - either way it is the same string handed to
    // setupConference, so the mirror and the disk agree.
    expect(database.ensureConferenceRow).toHaveBeenCalledWith(13, 'Testzone', 'BBS:Conf13/');
  });

  it('does not write a config row for a conference that never reached the disk', async () => {
    const { service, configRepo } = makeService();
    (service as never as { conferenceSetup: { setupConference: jest.Mock } }).conferenceSetup.setupConference =
      jest.fn(async () => {
        throw new Error('ConfConfig.info not found');
      });

    // Swallowing this and carrying on is how a conference ends up in the
    // admin that the BBS has never heard of.
    await expect(
      service.createConferenceConfig({ conference_id: 13, name: 'Testzone', ndirs: 1 } as never, context as never)
    ).rejects.toThrow(/ConfConfig.info not found/);

    expect(configRepo.createConferenceConfig).not.toHaveBeenCalled();
  });
});

describe('what a create refuses, before touching anything', () => {
  it('an id that is not NCONFS+1 - lower ids are existing conferences', async () => {
    const { service, order } = makeService();

    await expect(
      service.createConferenceConfig({ conference_id: 7, name: 'Sneaky', ndirs: 1 } as never, context as never)
    ).rejects.toThrow(/next conference is 13/);
    await expect(
      service.createConferenceConfig({ conference_id: 50, name: 'Far', ndirs: 1 } as never, context as never)
    ).rejects.toThrow(/next conference is 13/);

    // And nothing ran: no disk write, no mirror row, no config row.
    expect(order).toEqual([]);
  });

  it('a board whose Conf<id> directory belongs to another conference', async () => {
    // After a middle removal, numbers renumber and directories stay: here
    // conference 12 lives in Conf13, so creating 13 would post its messages
    // into conference 12's base - the number-keyed runtime demands the
    // directory match the number.
    const { loadConfConfig } = jest.requireMock('../../src/services/conf-config.service');
    (loadConfConfig as jest.Mock).mockReturnValueOnce({
      confCount: 12,
      entries: Array.from({ length: 12 }, (_, i) => ({
        name: `Conference ${i + 1}`,
        location: i === 11 ? 'BBS:Conf13/' : `BBS:Conf${i + 1}/`,
      })),
    });
    const { service, order } = makeService();

    await expect(
      service.createConferenceConfig({ conference_id: 13, name: 'Testzone', ndirs: 1 } as never, context as never)
    ).rejects.toThrow(/conference 12 .*'s home|drifted/);
    expect(order).toEqual([]);
  });
});
