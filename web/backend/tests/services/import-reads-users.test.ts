/**
 * The importer reads a board's callers.
 *
 * It never had. `parseUserDataBinary` walked the fields from the 239-byte
 * struct listing in axobjects.e:11-68, at the 232-byte stride a door actually
 * uses (mtop.e - Amiga E alignment is why the two differ). Every record after
 * the first was skewed by seven bytes, and the LAST one ran past the end of
 * the file:
 *
 *   Error parsing user binary files: The value of "offset" is out of range.
 *   It must be >= 0 and <= 463. Received 464
 *
 * The catch swallowed it and returned an empty array, so the importer produced
 * ZERO users from every board it was ever pointed at - the one thing an
 * importer most has to do. Nothing caught it because nothing had run it
 * against a real board.
 *
 * The fixture is a genuine excerpt of the reference-boardBBS reference tree in this
 * repo (Documentation/7-Reference Sources/reference-boardBBS), copied byte for byte
 * rather than invented, because a fixture written from the same wrong
 * understanding as the code proves only that they agree. Its first record
 * annotates its own layout - `-------------30` after the name marks a 31-byte
 * field, and bytes 224-231 read `Padding` - which is independent confirmation
 * that a record ends at 232 and not at 239.
 */

import * as path from 'path';
import { AmigaParserService } from '../../src/services/amiga-parser.service';

const BOARD = path.join(__dirname, '..', 'fixtures', 'amiga-board');

describe('importing the callers of a real Amiga board', () => {
  test('reads every record, including the last one', async () => {
    const users = await new AmigaParserService().parseUserFiles(BOARD);

    expect(users).toHaveLength(2);
  });

  test('reads the caller\'s own details, not bytes from the next record', async () => {
    const [first] = await new AmigaParserService().parseUserFiles(BOARD);

    expect(first.username).toBe('Xavier Madison');
    expect(first.location).toBe('UNKNOWN');
  });

  test('the fields line up at the stride a door reads, so a name is a name', async () => {
    // At 239 the second record started seven bytes early and its name came
    // back as the tail of the first record's fields.
    const users = await new AmigaParserService().parseUserFiles(BOARD);

    expect(users[1].username).toBe('User Name-------------------30');
  });

  test('an empty slot is a deleted account and is not imported as a caller', async () => {
    const users = await new AmigaParserService().parseUserFiles(BOARD);

    expect(users.every(u => u.username.trim().length > 0)).toBe(true);
  });

  test('a board with no user files imports no users rather than throwing', async () => {
    const users = await new AmigaParserService().parseUserFiles(path.join(__dirname, 'nowhere'));

    expect(users).toEqual([]);
  });
});
