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
    expect(database.ensureConferenceRow).toHaveBeenCalledWith(
      13,
      'Testzone',
      expect.stringContaining('Conf13')
    );
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
