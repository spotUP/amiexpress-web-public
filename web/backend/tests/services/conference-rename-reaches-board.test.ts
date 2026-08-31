/**
 * A rename has to reach the running board, not just the disk.
 *
 * The sysop renamed "Lamer Zone" to "Lamer Zonen". ConfConfig.info took it -
 * NAME.1=Lamer Zonen, verified on the live volume - and J on the board went
 * on saying "Lamer Zone". The conference list every handler holds is built
 * from that file ONCE, in initializeData, and nothing rebuilt it, so the name
 * would not have changed until the next deploy restarted the container.
 *
 * The fix is invalidation, not a second copy of the loader: initializeData's
 * conference section became refreshConferencesFromDisk, boot calls it and
 * subscribes to conference-change-bus, and every admin write that changes what
 * conferences exist or what they are called rings that bus. This test is about
 * the wiring - that the write path actually rings it - because a refresh
 * nothing invokes is the same bug with more code.
 */

process.env.SKIP_DB_INIT = '1';

const notifyConferencesChanged = jest.fn(async () => undefined);
jest.mock('../../src/services/conference-change-bus', () => ({
  notifyConferencesChanged: () => notifyConferencesChanged(),
  onConferencesChanged: jest.fn(),
  clearConferencesChangedListener: jest.fn(),
}));

import { ConferenceConfigService } from '../../src/services/config-services/conference-config.service';

const context = {
  userId: 1,
  username: 'sysop',
  ipAddress: '127.0.0.1',
  userAgent: 'test',
};

/** Enough of the repository and the setup service to run the write paths. */
function makeService(existing: Record<string, unknown>) {
  const configRepo = {
    getConferenceConfig: jest.fn(() => existing),
    updateConferenceConfig: jest.fn(() => ({ ...existing, name: 'Lamer Zonen' })),
    logConfigChange: jest.fn(),
  };
  const service = new ConferenceConfigService({
    getConfigRepository: () => configRepo,
  } as never);

  // The disk half is exercised by conference-delete.test.ts; here it is stubbed
  // so the test is about who gets told afterwards.
  (service as never as { conferenceSetup: unknown }).conferenceSetup = {
    updateConferenceInfoFile: jest.fn(async () => undefined),
    updateConfConfig: jest.fn(async () => undefined),
  };
  (service as never as { getConferenceConfig: unknown }).getConferenceConfig = jest.fn(
    async () => existing
  );

  return { service, configRepo };
}

describe('renaming a conference', () => {
  beforeEach(() => {
    notifyConferencesChanged.mockClear();
  });

  it('rebuilds the board\'s conference list, so J shows the new name', async () => {
    const { service } = makeService({
      id: 1,
      conference_id: 1,
      name: 'Lamer Zone',
      ndirs: 1,
    });

    await service.updateConferenceConfig(1, { name: 'Lamer Zonen' }, context as never);

    expect(notifyConferencesChanged).toHaveBeenCalledTimes(1);
  });

  it('still returns the saved conference when the refresh throws', async () => {
    notifyConferencesChanged.mockRejectedValueOnce(new Error('handlers not wired'));

    const { service } = makeService({
      id: 1,
      conference_id: 1,
      name: 'Lamer Zone',
      ndirs: 1,
    });

    // A stale name in memory must not fail a write that already reached disk.
    await expect(
      service.updateConferenceConfig(1, { name: 'Lamer Zonen' }, context as never)
    ).resolves.toBeDefined();
  });
});

/**
 * The bus itself, unmocked: the half that carries the message.
 */
describe('the conference-change bus', () => {
  const bus = jest.requireActual<typeof import('../../src/services/conference-change-bus')>(
    '../../src/services/conference-change-bus'
  );

  afterEach(() => bus.clearConferencesChangedListener());

  it('delivers to the listener the server registered at boot', async () => {
    const rebuild = jest.fn(async () => undefined);
    bus.onConferencesChanged(rebuild);

    await bus.notifyConferencesChanged();

    expect(rebuild).toHaveBeenCalledTimes(1);
  });

  it('is silent when nothing has subscribed', async () => {
    await expect(bus.notifyConferencesChanged()).resolves.toBeUndefined();
  });
});
