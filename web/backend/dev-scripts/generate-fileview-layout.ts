/**
 * Write `Prompts/FILEVIEW.40` from the built-in default.
 *
 * The file on the volume and the constant in the code must be byte-identical,
 * because "the file is absent" is a VALID state: a board with no Prompts/
 * prints exactly what a board with the shipped file prints. Generating one
 * from the other is what makes that true rather than hoped for, and
 * `tests/services/fileview-layout-drift.test.ts` fails the moment they part.
 *
 *   npx tsx dev-scripts/generate-fileview-layout.ts [targetDir]
 */
import * as fs from 'fs';
import * as path from 'path';
import { BUILT_IN_FILEVIEW_LAYOUT } from '../src/services/file-layout.service';

const target = process.argv[2] ?? path.join(__dirname, '..', '..', '..', 'Prompts');
fs.mkdirSync(target, { recursive: true });
const file = path.join(target, 'FILEVIEW.40');
fs.writeFileSync(file, BUILT_IN_FILEVIEW_LAYOUT, 'utf8');
console.log(`[fileview-layout] wrote ${file} (${Buffer.byteLength(BUILT_IN_FILEVIEW_LAYOUT, 'utf8')} bytes)`);
