/**
 * Frame rate is bought with bytes, so the picture needs a size limit.
 *
 * The encoder was told to match the tile, and the tile grew to fill the
 * panel. On a live session that meant 146x46 - 6,716 cells - producing
 * 21 KB frames; against the client's 48 KB/s pacing budget that is one
 * frame every 442 ms. The video was not slow because the pipeline was
 * inefficient at that size, it was slow because nobody had ever said how
 * large a frame was allowed to be.
 */

import {
  capStreamCells,
  MAX_STREAM_CELLS,
} from '../../../../Doors/livechat/features/video-layout';

describe('capping the video resolution', () => {
  it('leaves a small tile alone', () => {
    expect(capStreamCells(40, 12)).toEqual({ width: 40, height: 12 });
  });

  it('lets a full-height tile through, rather than banding it', () => {
    // 146x46 is 6,716 cells. It USED to be capped to 1,800 - back when a
    // frame cost three bytes a cell - and the picture was then upscaled
    // into the tile, which bands half-block rows. Deltas made that cap
    // obsolete, and encoding at the tile's own size is what removes the
    // banding.
    expect(capStreamCells(146, 46)).toEqual({ width: 146, height: 46 });
  });

  it('still caps something genuinely enormous', () => {
    // The cap has not gone away: a maximised window must not be able to
    // spend the entire budget on resolution again.
    const capped = capStreamCells(400, 120);

    expect(capped.width * capped.height).toBeLessThanOrEqual(MAX_STREAM_CELLS);
    expect(capped.width).toBeLessThan(400);
  });

  it('keeps the tile shape, so the picture is not letterboxed twice', () => {
    // The encoder fits the camera to whatever shape it is given; squaring
    // off a wide tile would waste the space it was trying to fill.
    const capped = capStreamCells(160, 40);
    const before = 160 / 40;
    const after = capped.width / capped.height;

    expect(Math.abs(after - before)).toBeLessThan(0.35);
  });

  it('caps a tall tile as readily as a wide one', () => {
    const capped = capStreamCells(40, 120);
    expect(capped.width * capped.height).toBeLessThanOrEqual(MAX_STREAM_CELLS);
  });

  it('never shrinks below a picture worth looking at', () => {
    const capped = capStreamCells(2000, 2000, 10);

    expect(capped.width).toBeGreaterThanOrEqual(20);
    expect(capped.height).toBeGreaterThanOrEqual(8);
  });

  it('survives an unsized tile', () => {
    expect(capStreamCells(0, 0)).toEqual({ width: 0, height: 0 });
    expect(capStreamCells(-5, 10)).toEqual({ width: 0, height: 0 });
  });

  it('buys a usable frame rate at the measured cost per cell', () => {
    // Measured on a live call AFTER delta encoding: 1,771 cells cost
    // 227-371 bytes a frame, about a fifth of a byte per cell. The cap
    // exists to stop a maximised window spending the whole budget on
    // resolution, so the arithmetic is asserted rather than left in a
    // comment that can quietly rot.
    const bytesPerCell = 0.25;
    const budgetPerSecond = 48 * 1024;
    const framesPerSecond = budgetPerSecond / (MAX_STREAM_CELLS * bytesPerCell);

    expect(framesPerSecond).toBeGreaterThanOrEqual(8);
  });

  it('is big enough not to upscale an ordinary tile', () => {
    // Encoding smaller than the tile means duplicating rows of half-block
    // characters, which already pack two pixels each - seen as horizontal
    // banding across the picture.
    const ordinaryTile = { width: 120, height: 40 };
    const capped = capStreamCells(ordinaryTile.width, ordinaryTile.height);

    expect(capped).toEqual(ordinaryTile);
  });
});
