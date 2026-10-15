/**
 * "Which nodes?" typed by a sysop, turned into node numbers.
 *
 * The share flow asks for nodes as free text because that is how a sysop
 * says it - "1,2,3", "1 2 3", "1, 2 and 3". Anything that is not a number is
 * a separator, which makes every one of those forms mean the same thing.
 *
 * Node 0 is a real node on this board (Node0/ is in the tree), so it is kept;
 * only negatives and unparseable runs are dropped. Duplicates are removed
 * because pointing a node at a directory twice is the same instruction.
 */
export function parseNodeList(raw: string): number[] {
  const seen = new Set<number>();
  for (const piece of raw.split(/[^0-9]+/)) {
    if (!piece) continue;
    const n = parseInt(piece, 10);
    if (Number.isFinite(n) && n >= 0) seen.add(n);
  }
  return [...seen].sort((a, b) => a - b);
}
