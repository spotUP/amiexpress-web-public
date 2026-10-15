/**
 * Register SCREENTHEME as a BBS command, and nothing else.
 *
 * Through `applyTooltypes`, which edits the icon IN PLACE. An `.info` is an
 * Amiga binary with an image in it: rewriting it from a Map produces something
 * AmiExpress cannot read, and an editor's UTF-8 round trip eats its high-bit
 * bytes. Kept beside the other dev-scripts so the registration is repeatable
 * rather than a thing somebody did once by hand.
 */
import * as path from 'path';

import { applyTooltypes, readTooltypeMap } from '../src/utils/info-file.util';

const file = path.resolve(__dirname, '../../../Commands/BBSCmd/SCREENTHEME.info');

applyTooltypes(file, [
  ['BBSCMD', 'SCREENTHEME'],
  ['LOCATION', 'Doors/screen-theme-picker'],
  ['DESCRIPTION', "Pick which set of the board's art you are shown"],
]);

for (const [key, value] of readTooltypeMap(file).entries()) {
  console.log(`${key}=${value}`);
}
