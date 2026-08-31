/**
 * The app binds the pure model - it does not reimplement it.
 *
 * A source-shape check, deliberately: the UI cannot run without a
 * terminal, but the two faults worth guarding are (1) the app growing its
 * own selection logic beside the tested model, and (2) the playback timer
 * surviving destroy() - the leak class that made LiveChat's video flip
 * between two modes. Both are visible in the source.
 */

import assert from 'assert';
import { readFileSync } from 'fs';
import { join } from 'path';

const app = readFileSync(join(__dirname, '..', 'app.ts'), 'utf8');

export async function theAppUsesTheTestedModel(): Promise<void> {
  for (const name of ['initialState', 'moveSelection', 'cyclePane', 'selection']) {
    assert.ok(app.includes(name), `app.ts should call ${name} from browser-model`);
  }
  assert.ok(app.includes('previewLines'), 'and render through previewLines');
}

export async function destroyStopsThePlaybackTimer(): Promise<void> {
  assert.ok(/clearInterval\(this\.playback/.test(app),
    'destroy() must clear the playback interval - a door is unloaded by ' +
    'removing its script, which stops nothing it started');
}

export async function theLayoutIsPercentageBased(): Promise<void> {
  // Responsive like livechat: the panes flex with the terminal, so a
  // resize event re-flows rather than clipping.
  const percents = (app.match(/width: '\d+%'/g) || []).length +
                   (app.match(/height: '\d+%'/g) || []).length;
  assert.ok(percents >= 3, `expected percentage-sized panes, found ${percents}`);
}
