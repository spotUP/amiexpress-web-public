/**
 * The live preview: one frame of one animation as blessed-tag lines.
 *
 * Pure in (sprite, animation, tick, scale). The playback loop upstairs
 * only advances the tick; everything visible is decided - and tested -
 * here. Scale 2 doubles each cell horizontally: half-block art reads as
 * fat pixels, the way a sprite editor should show it.
 */

import {
  Sprite, frameAt, rowToTags, Cell, CellRow,
} from '@amiexpress/bbs-door-sdk/engines/graphics/cell-art';

export function previewLines(
  sprite: Sprite,
  animation: string,
  tick: number,
  scale: 1 | 2
): string[] {
  const anim = sprite.animations[animation];
  if (!anim) {
    throw new Error(
      `sprite ${sprite.name} has no animation '${animation}' ` +
      `(has: ${Object.keys(sprite.animations).join(', ')})`
    );
  }
  const frame = frameAt(anim, tick);
  return frame.map(row => {
    const out: CellRow = [];
    for (const cell of row) {
      out.push(cell ? { ...(cell as Cell) } : null);
      if (scale === 2) out.push(cell ? { ...(cell as Cell) } : null);
    }
    return rowToTags(out);
  });
}
