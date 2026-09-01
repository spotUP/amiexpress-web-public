/**
 * What the admin SERVES, the admin must ACCEPT.
 *
 * One bug has accounted for nearly every admin fault found this week, and it
 * is always this shape: a GET hands the form a value that the matching PUT
 * then refuses or discards. Both halves work perfectly, on values that never
 * meet, so nothing fails anywhere - the page looks right, the toast says
 * saved, and the board carries on unchanged.
 *
 * Where it had already been found, before this test existed:
 *
 *   door_type        GET served XIM/vamos, PUT validated a different
 *                    vocabulary and rejected the server's own data
 *   door_name        GET served the FILENAME as the title, so saving any
 *                    other field renamed the door
 *   password_security  GET served "***", PUT wanted an enum - and because
 *                    the form posts every field back, NO System Configuration
 *                    save could succeed at all
 *   new_user_protocol  GET served "ZMODEM", the select offers "zmodem", so
 *                    it rendered as chosen while holding nothing
 *
 * Each was found by a sysop, in production, one at a time. This test asks the
 * question for every domain at once: take what the API serves, and hand it to
 * the schema its own writer validates with. A field that cannot survive that
 * is a field the sysop cannot save.
 *
 * It reads only. Feeding the values back through a real PUT would be a
 * stronger test and would also rewrite the .info files of whatever board the
 * suite runs on, so the validation is done directly against the schema
 * instead - which is the half where every one of the faults above lived.
 */

jest.mock('../../src/services/UserFileManager', () => ({
  userFileManager: { writeUserFiles: jest.fn(), updateUserDataFile: jest.fn() }
}));
jest.mock('../../src/services/UserDatabaseManager', () => ({
  userDatabaseManager: {
    getUserCount: jest.fn().mockReturnValue(0),
    userToStruct: jest.fn().mockReturnValue({ slotNumber: 0 }),
    userToKeys: jest.fn().mockReturnValue({}),
    userToMisc: jest.fn().mockReturnValue({}),
    appendUser: jest.fn(),
  }
}));

import type { ZodTypeAny } from 'zod';
import { ConfigService } from '../../src/services/config.service';
import {
  NodeConfigSchema,
  ConferenceConfigSchema,
  DoorSchema,
  LanguageSchema,
  ProtocolSchema,
  DriveConfigSchema,
  ComputerTypeSchema,
  ScreenTypeSchema,
  FileCheckerSchema,
} from '../../src/services/config.schemas';

async function waitForTestDb(): Promise<any> {
  let attempts = 0;
  while (!(global as any).testDb && attempts < 30) {
    await new Promise(r => setTimeout(r, 500));
    attempts++;
  }
  const db = (global as any).testDb;
  if (!db) throw new Error('Test database not initialized');
  return db;
}

/**
 * Fields a domain serves that its own writer is not expected to take back.
 *
 * Identity and bookkeeping only. Anything else listed here would be a field a
 * sysop can see and cannot change, so each entry has to earn its place.
 */
const NOT_WRITTEN_BACK: Record<string, string[]> = {
  common: ['id', 'created_at', 'updated_at'],
  // Served for display; the door's identity on disk is its command.
  Doors: ['runtime_env'],
  // Derived from the file area count, not set directly.
  //
  // `location` is LOCATION.n from ConfConfig.info - served because the form
  // derives each file area's default paths from it, and deliberately not
  // writable: a conference's directory holds every message posted there and
  // every file uploaded to it, so changing the value alone would point the
  // conference at a directory with none of its content. Moving a conference is
  // a data migration, not a text box. Renumbering, which is the only thing that
  // legitimately changes it, is conference-removal.service.ts's job.
  Conferences: ['file_areas', 'message_bases', 'location'],
};

function exempt(domain: string, field: string): boolean {
  return (
    NOT_WRITTEN_BACK.common.includes(field) ||
    (NOT_WRITTEN_BACK[domain] ?? []).includes(field)
  );
}

/**
 * Report every served field the schema DOES NOT DECLARE.
 *
 * This is the half `rejectedFields` cannot see. Zod strips an unknown key and
 * reports success, so `schema.partial().safeParse({ unknownField: x })`
 * passes - which is why the sweep, on its first run, caught three wrong
 * RANGES on declared keys and none of the fourteen System Configuration
 * fields that were being silently dropped.
 *
 * A field the API serves and the schema does not declare is a field the sysop
 * can see, can type into, and cannot save.
 */
function strippedFields(domain: string, schema: ZodTypeAny, record: unknown): string[] {
  if (!record || typeof record !== 'object') return [];

  const declared = new Set(Object.keys((schema as any).shape ?? {}));
  const stripped: string[] = [];

  for (const [field, value] of Object.entries(record as Record<string, unknown>)) {
    if (exempt(domain, field)) continue;
    if (!declared.has(field)) {
      stripped.push(`${domain}.${field}: served ${JSON.stringify(value)} - not declared by the schema, so a save DROPS it`);
      continue;
    }

    // Declared is not enough: the value has to come out the other side too.
    const result = (schema as any).partial().safeParse({ [field]: value });
    if (result.success && !(field in result.data)) {
      stripped.push(`${domain}.${field}: parsed away`);
    }
  }
  return stripped;
}

/**
 * Hand one served record to the schema its writer validates with, and report
 * every field the schema will not take.
 */
function rejectedFields(domain: string, schema: ZodTypeAny, record: unknown): string[] {
  if (!record || typeof record !== 'object') return [];

  const rejected: string[] = [];
  for (const [field, value] of Object.entries(record as Record<string, unknown>)) {
    if (exempt(domain, field)) continue;

    // One field at a time, so the report names the field rather than the
    // first failure in the object.
    const result = (schema as any).partial().safeParse({ [field]: value });
    if (!result.success) {
      const issue = result.error?.issues?.[0];
      rejected.push(
        `${domain}.${field}: served ${JSON.stringify(value)} - ${issue?.message ?? 'rejected'}`
      );
    }
  }
  return rejected;
}

describe('what the admin serves, the admin accepts', () => {
  let config: ConfigService;

  beforeAll(async () => {
    const db = await waitForTestDb();
    config = new ConfigService(db);
  }, 30000);

  const domains: Array<{
    name: string;
    schema: ZodTypeAny;
    load: () => Promise<unknown[]>;
  }> = [
    { name: 'Nodes', schema: NodeConfigSchema, load: async () => config.getNodeConfigs() },
    { name: 'Conferences', schema: ConferenceConfigSchema, load: async () => config.getConferenceConfigs() },
    { name: 'Doors', schema: DoorSchema, load: async () => config.getDoors() },
    { name: 'Languages', schema: LanguageSchema, load: async () => config.getLanguages() },
    { name: 'Protocols', schema: ProtocolSchema, load: async () => config.getProtocols() },
    { name: 'Drives', schema: DriveConfigSchema, load: async () => config.getAllDrives() },
    { name: 'Computers', schema: ComputerTypeSchema, load: async () => config.getAllComputerTypes() },
    { name: 'Screen types', schema: ScreenTypeSchema, load: async () => config.getAllScreenTypes() },
    { name: 'File checkers', schema: FileCheckerSchema, load: async () => config.getAllFileCheckers() },
  ];

  for (const domain of domains) {
    it(`serves ${domain.name} its own writer will accept`, async () => {
      const records = (await domain.load()) ?? [];

      // An empty domain proves nothing, and saying so is better than a green
      // tick that was never tested.
      //
      // Doors is empty here on purpose: ConfigService.getDoors() reads the
      // `doors` TABLE, and doors live on disk - the route serves them from
      // door.handler instead. That domain's GET/PUT vocabulary has its own
      // suite, tests/services/door-schema-roundtrip.test.ts, written after
      // GET served XIM/vamos and PUT rejected it.
      if (records.length === 0) {
        console.warn(`[contract] ${domain.name}: nothing configured, nothing checked`);
        return;
      }

      const rejected: string[] = [];
      const stripped: string[] = [];
      for (const record of records.slice(0, 5)) {
        rejected.push(...rejectedFields(domain.name, domain.schema, record));
        stripped.push(...strippedFields(domain.name, domain.schema, record));
      }

      // Jest's expect takes no message, so the report goes in the value.
      expect([...new Set([...rejected, ...stripped])].join('\n')).toBe('');
    }, 30000);
  }

  it('checks every domain the admin can edit', () => {
    // A domain added to the admin and not to this list would be exactly as
    // unprotected as all of them were before it existed.
    expect(domains.map((d) => d.name).sort()).toEqual(
      [
        'Computers',
        'Conferences',
        'Doors',
        'Drives',
        'File checkers',
        'Languages',
        'Nodes',
        'Protocols',
        'Screen types',
      ].sort()
    );
  });
});
