/**
 * The DIZ fallback ladder, and the measurement that justifies its shape.
 *
 * SIX fixtures: three MEASURED - copied from real FILE_ID.DIZ files in this
 * tree, named so anyone can go and look - and three SYNTHETIC, labelled as
 * such because no file on this board exercises those rows and pretending
 * otherwise would be the "sold as fixing something it does not touch" the
 * design warns about.
 */
import { looksLikeAsciiArt } from '../../src/utils/ascii-art.util';
import {
  DIZ_ART_SKIPPED_NOTICE,
  dizArtSkipEnabled,
  dizBlockFor,
  squeezeIfProse,
  squeezeProse,
} from '../../src/utils/diz-fallback.util';

// --- MEASURED: Documentation/.../AmiExpressEDoorSources/MultiRelayChat/file_id.diz
const MEASURED_MRC = [
  'Multi-Relay-Chat ported to AmiExpress.',   // 38 columns - the widest prose row
  'Cross platform bbs chat client from',
  'Phenom Productions, ported by',
  'Darren Coles.',
];

// --- MEASURED: Documentation/.../AmiExpressEDoorSources/BBSLink/file_id.diz
const MEASURED_BBSLINK = [
  'BBSLink and linkwall connectors',
  'for Ami-Express. Connects to the',
  'bbslink server to allow you to',
  'play over 30 dos bbs games.',
];

// --- MEASURED: Documentation/.../ASMSources/Source/SDC/dvn-skip/FILE_ID.DIZ
// The row that matters is 43 columns wide and is a picture.
// Row 1, verbatim, 43 columns:
const MEASURED_ART_ROW = '_______ (__\u00a1) __!   _ /__)________  _______';

// --- SYNTHETIC: no DIZ on this board has a prose row over 40 columns.
const SYNTHETIC_PADDED_PROSE =
  'The  quick  brown  fox  jumps  over  the  lazy  dog  and  keeps  going';
// --- SYNTHETIC: the design's own counter-example, an art row squeezing "fits".
const SYNTHETIC_ART = '|NEW    ____________   ____________  BRINGS|';
// --- SYNTHETIC: an indented line, to pin that the indent survives.
const SYNTHETIC_INDENTED = '        centred  text  that  is  much  too  wide  for  forty';

describe('the measurement the rung is built on', () => {
  it('MEASURED: every prose row of a real DIZ already fits 40', () => {
    // This is the spec's finding, as an executable fact: the squeeze rung
    // fires ZERO times on the DIZ files this board actually contains.
    for (const line of [...MEASURED_MRC, ...MEASURED_BBSLINK]) {
      expect(line.length).toBeLessThanOrEqual(40);
      expect(squeezeIfProse(line, 40)).toBe(line);
    }
  });

  it('MEASURED: the row that IS too wide is art, and is left alone', () => {
    expect(MEASURED_ART_ROW.length).toBeGreaterThan(40);
    expect(looksLikeAsciiArt(MEASURED_ART_ROW)).toBe(true);
    expect(squeezeIfProse(MEASURED_ART_ROW, 40)).toBe(MEASURED_ART_ROW);
  });
});

describe('the squeeze', () => {
  it('SYNTHETIC: collapses runs inside a padded sentence', () => {
    expect(squeezeProse(SYNTHETIC_PADDED_PROSE))
      .toBe('The quick brown fox jumps over the lazy dog and keeps going');
  });

  it('SYNTHETIC: keeps the indent, which is the only thing positioning the line', () => {
    expect(squeezeProse(SYNTHETIC_INDENTED)).toBe('        centred text that is much too wide for forty');
  });

  it('SYNTHETIC: refuses to touch art, even though squeezing would make it "fit"', () => {
    // 44 columns down to 37 - and the picture destroyed. The gate is the point.
    expect(SYNTHETIC_ART.length).toBeGreaterThan(40);
    expect(squeezeProse(SYNTHETIC_ART).length).toBeLessThan(40);
    expect(squeezeIfProse(SYNTHETIC_ART, 40)).toBe(SYNTHETIC_ART);
  });

  it('leaves a row that already fits exactly as it is', () => {
    expect(squeezeIfProse('short  enough', 40)).toBe('short  enough');
  });
});

describe('DIZ_ART_SKIP - the sysop who would rather see nothing than half a picture', () => {
  it('is OFF when the tooltype is absent, so no existing .info changes behaviour', () => {
    // A tooltype boolean cannot default to true on this board: every
    // registration that predates it would read as having opted in.
    expect(dizArtSkipEnabled(undefined)).toBe(false);
    expect(dizArtSkipEnabled({})).toBe(false);
    expect(dizArtSkipEnabled({ toolTypes: {} })).toBe(false);
  });

  it('is ON only when the .info says so', () => {
    expect(dizArtSkipEnabled({ toolTypes: { DIZ_ART_SKIP: 'YES' } })).toBe(true);
    expect(dizArtSkipEnabled({ doorInfo: { toolTypes: { DIZ_ART_SKIP: 'yes' } } })).toBe(true);
    expect(dizArtSkipEnabled({ toolTypes: { DIZ_ART_SKIP: 'NO' } })).toBe(false);
  });

  it('replaces the whole block with one ASCII token', () => {
    const block = dizBlockFor([MEASURED_ART_ROW, 'and a caption'], 40, true);
    expect(block).toEqual([DIZ_ART_SKIPPED_NOTICE]);
    expect(DIZ_ART_SKIPPED_NOTICE).toBe('[ART - SKIPPED]');
  });

  it('leaves a block with no over-wide art alone even when set', () => {
    const block = dizBlockFor(MEASURED_MRC, 40, true);
    expect(block).toEqual(MEASURED_MRC);
  });

  it('crops rather than skips when the tooltype is off - decision 15', () => {
    const block = dizBlockFor([MEASURED_ART_ROW], 40, false);
    expect(block).toEqual([MEASURED_ART_ROW]);   // the CROP rung owns the cut
  });
});
