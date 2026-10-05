/**
 * The computer types a caller chooses from - express.e's chooseComputer
 * (11318-11344), asked at sign-up (30265) and by W (26032). ONE list and ONE
 * layout for both: they were two copies, with different fallbacks and the
 * column fix (83eae6df5) in only one.
 */
import { isNarrow, narrowClip } from './table-format.util';

/** Used when ComputerList.info offers nothing. */
const FALLBACK_COMPUTER_TYPES = ['AMiGA 500', 'AMiGA 2000', 'AMiGA 3000', 'AMiGA 4000', 'AMiGA 1200', 'PC', 'mAC', 'OTHER!'];

/**
 * ComputerList.info, through the service the admin uses - the file the sysop
 * edits and express.e reads (TOOLTYPE_COMPUTERLIST). Read each time it is
 * asked for: a sysop's edit shows at the next prompt.
 */
export async function computerTypeChoices(db: unknown): Promise<string[]> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { ComputerConfigService } = require('../services/config-services/computer-config.service');
    const records = await new ComputerConfigService(db).getAllComputerTypes();
    if (Array.isArray(records) && records.length > 0) {
      const names = records
        .filter((c: { enabled?: boolean }) => c.enabled !== false)
        .sort((a: { computer_number: number }, b: { computer_number: number }) => a.computer_number - b.computer_number)
        .map((c: { computer_name: string }) => c.computer_name);
      if (names.length > 0) return names;
    }
  } catch (error) {
    console.warn('[computer-types] Unable to load computer types:', error);
  }
  return [...FALLBACK_COMPUTER_TYPES];
}

/**
 * express.e:11321-11331: two to a row, '\d[2]> \l\s[34] ' then
 * '\d[2]> \l\s[34]\b\n' (a 34-column field, cut and padded); an odd last one
 * alone. A 40-column screen gets one per row. Each string is one row with its
 * CR LF; express.e then prints '\b\n' and 'Choose computer type: ' (11335-11337).
 */
export function computerTypeRows(choices: string[], session: unknown): string[] {
  const label = (i: number) => `${String(i + 1).padStart(2, ' ')}> `;
  if (isNarrow(session as never)) return choices.map((c, i) => narrowClip(`${label(i)}${c}`) + '\r\n');
  const field = (c: string) => c.slice(0, 34).padEnd(34, ' ');
  const rows: string[] = [];
  for (let i = 0; i < choices.length; i += 2) {
    rows.push(i + 1 < choices.length
      ? `${label(i)}${field(choices[i])} ${label(i + 1)}${field(choices[i + 1])}\r\n`
      : `${label(i)}${field(choices[i])} \r\n`);
  }
  return rows;
}
