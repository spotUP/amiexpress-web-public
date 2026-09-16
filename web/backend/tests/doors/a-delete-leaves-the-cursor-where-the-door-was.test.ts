/**
 * AFTER A DELETE, THE CURSOR IS ON THE DOOR THAT TOOK THE DELETED ONE'S PLACE.
 *
 * "when i delete more than one door in doorman the list and descriptions gets
 * offset" (the sysop, 2026-09-16).
 *
 * Removing the row at index i slides the row that was at i+1 down into i, so i
 * is where the cursor belongs. DOORMAN handed the view `i - 1`, which steps
 * backwards OVER the row that moved up - so every delete walked the selection
 * one further up the list from where the sysop was working, and the info panel,
 * which follows the selection, described that row instead. One delete looks
 * like the list merely moved; several and it is plainly off.
 *
 * `performDoorDelete` takes all its collaborators as dependencies, so these
 * cases drive the real function and read the index it hands back.
 */
const { performDoorDelete } = require('../../../../Doors/door-manager/delete-door-action');

interface FakeDoor { id: string; command: string; name: string; type: string; enabled?: boolean }

const door = (n: string): FakeDoor => ({ id: n, command: n, name: n, type: 'TS', enabled: true });

/** Drive one delete of `target` from a list, and report what the view was told. */
async function deleteFrom(list: string[], target: string) {
  const selectedIndex = list.indexOf(target);
  const remaining = list.filter((n) => n !== target).map(door);
  const handed: Array<{ doors: FakeDoor[]; selectIndex: number }> = [];

  await performDoorDelete({
    door: door(target),
    selectedIndex,
    bbs: {
      deleteDoor: async () => ({ success: true }),
    },
    setInfo: () => {},
    render: () => {},
    setStatus: () => {},
    refreshRegistry: async () => {},
    fetchDoors: async () => remaining,
    onDoorsChanged: (doors: FakeDoor[], selectIndex: number) => { handed.push({ doors, selectIndex }); },
    showSelectedDoor: () => {},
  });

  return handed;
}

describe('the selection DOORMAN asks for after a delete', () => {
  it('is the row the next door slid into, not the one before it', async () => {
    const handed = await deleteFrom(['A', 'B', 'C', 'D'], 'B');

    expect(handed).toHaveLength(1);
    // B was at 1; C is at 1 now, and C is what the sysop should be looking at.
    expect(handed[0].selectIndex).toBe(1);
    expect(handed[0].doors[handed[0].selectIndex].command).toBe('C');
  });

  it('does not walk up the list when doors are deleted one after another', async () => {
    // Delete B, then C - the cursor should stay put at index 1 both times,
    // which is where the survivors keep arriving.
    const first = await deleteFrom(['A', 'B', 'C', 'D'], 'B');
    expect(first[0].selectIndex).toBe(1);
    expect(first[0].doors[first[0].selectIndex].command).toBe('C');

    const second = await deleteFrom(['A', 'C', 'D'], 'C');
    expect(second[0].selectIndex).toBe(1);
    expect(second[0].doors[second[0].selectIndex].command).toBe('D');
  });

  it('deleting the first door leaves the cursor on the new first door', async () => {
    const handed = await deleteFrom(['A', 'B', 'C'], 'A');
    expect(handed[0].selectIndex).toBe(0);
    expect(handed[0].doors[handed[0].selectIndex].command).toBe('B');
  });

  it('deleting the last door hands back an index the view clamps', async () => {
    // Nothing slid into the last slot, so the index is one past the end and
    // the view's own clamp puts it on the new last row. The action must not
    // pre-empt that by guessing a length it was never given.
    const handed = await deleteFrom(['A', 'B', 'C'], 'C');
    expect(handed[0].selectIndex).toBe(2);
    expect(handed[0].doors).toHaveLength(2);
  });
});
