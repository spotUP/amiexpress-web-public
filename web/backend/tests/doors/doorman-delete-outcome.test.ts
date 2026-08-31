/**
 * After a delete, the info panel describes the door that is selected NOW.
 *
 * Reported from the live board on 2026-08-31: "when i delete a door it gets
 * removed from the left panel in doorman, and the next door gets highlighted
 * but it doesnt refresh with the new doors info". refresh() redrew the panel
 * for the new selection and the success message then painted "Deleted" over
 * it, so the panel described the delete until the sysop moved the cursor.
 *
 * A delete that worked has nothing left to say there - the log panel has
 * every step and the header flashes the outcome. A delete that failed, or one
 * that removed the files and left the door registered, does.
 */
import { deleteOutcomeView } from '../../../../Doors/door-manager/delete-outcome';

it('goes back to the selected door when the delete worked', () => {
  const view = deleteOutcomeView({ success: true, stillListed: false, command: 'HDRDROP' });

  expect(view).toEqual({ kind: 'showSelectedDoor' });
});

it('keeps the panel when the files went but the registration did not', () => {
  // The GWWALL report: a success message over a door that is still listed.
  const view = deleteOutcomeView({ success: true, stillListed: true, command: 'GWWALL' });

  expect(view.kind).toBe('message');
  expect(view.kind === 'message' && view.text).toContain('Still registered');
  expect(view.kind === 'message' && view.text).toContain('GWWALL');
});

it('keeps the panel, and the reason, when the delete failed outright', () => {
  const view = deleteOutcomeView({
    success: false,
    stillListed: true,
    command: 'BROKEN',
    message: 'Door command BROKEN not found',
  });

  expect(view.kind).toBe('message');
  expect(view.kind === 'message' && view.text).toContain('Delete failed');
  expect(view.kind === 'message' && view.text).toContain('Door command BROKEN not found');
});

it('still says something when the failure had no message', () => {
  const view = deleteOutcomeView({ success: false, stillListed: false, command: 'BROKEN' });

  expect(view.kind === 'message' && view.text).toContain('unknown error');
});

/**
 * Which name the backend is asked for.
 *
 * A TypeScript door is asked for by its DIRECTORY and an Amiga door by its
 * command, and GWWALL is why that distinction has to be right: it is
 * registered as GWWALL with LOCATION=Doors/bbslinkwall, so the two names
 * differ.
 */
import { deleteIdentifierFor } from '../../../../Doors/door-manager/delete-door-action';

it('asks for a TypeScript door by its directory, not its command', () => {
  const { id, isTS } = deleteIdentifierFor({
    command: 'GWWALL',
    name: 'Global Wall',
    type: 'TS',
    location: 'Doors/bbslinkwall',
  });

  expect(isTS).toBe(true);
  expect(id).toBe('bbslinkwall');
});

it('asks for an Amiga door by its command', () => {
  const { id, isTS } = deleteIdentifierFor({
    command: 'GWALL',
    name: 'GWall',
    type: 'XIM',
    location: 'DOORS:GWall/GWall',
  });

  expect(isTS).toBe(false);
  expect(id).toBe('GWALL');
});

it('falls back to the command when a TypeScript door has no location', () => {
  const { id } = deleteIdentifierFor({ command: 'LONELY', name: 'Lonely', type: 'typescript' });

  expect(id).toBe('LONELY');
});
