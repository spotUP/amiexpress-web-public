/**
 * Pressing Delete has to close the dialog and say what happened.
 *
 * The sysop deleted conference 9: it worked on the board - NCONFS dropped,
 * the backup was written - and the admin said nothing at all. The dialog sat
 * there and no toast appeared, so the only way to know the delete had
 * happened was to go and look at the conference list.
 *
 * Two things are being asserted here, through the REAL provider rather than a
 * mocked one, because both live in the wiring between them: the dialog
 * unmounts when the action is confirmed, and a toast raised right afterwards
 * is actually on screen.
 */

import { describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NotificationProvider, useNotification } from '../contexts/NotificationContext';

function DeleteButton() {
  const { confirm, showSuccess } = useNotification();

  return (
    <button
      type="button"
      onClick={async () => {
        const { confirmed, checked } = await confirm({
          title: 'Delete Conference',
          message: 'Remove conference 9?',
          confirmText: 'Delete',
          requireTypedConfirmation: '9',
          checkbox: { label: "Delete the conference's files too" },
        });
        if (confirmed) {
          showSuccess(checked ? 'Conference removed, files deleted' : 'Conference removed, files kept');
        }
      }}
    >
      Delete conference 9
    </button>
  );
}

function renderHarness() {
  return render(
    <NotificationProvider>
      <DeleteButton />
    </NotificationProvider>
  );
}

describe('confirming a delete', () => {
  it('closes the dialog and raises a toast that says what happened', async () => {
    renderHarness();

    await userEvent.click(screen.getByRole('button', { name: /delete conference 9/i }));
    expect(await screen.findByText('Remove conference 9?')).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText(/type 9 to confirm/i), '9');
    await userEvent.click(screen.getByRole('button', { name: /^delete$/i }));

    // The dialog is gone.
    await waitFor(() => {
      expect(screen.queryByText('Remove conference 9?')).not.toBeInTheDocument();
    });

    // And the answer is on screen.
    expect(await screen.findByText('Conference removed, files kept')).toBeInTheDocument();
  });

  it('reports the other outcome when the box was ticked', async () => {
    renderHarness();

    await userEvent.click(screen.getByRole('button', { name: /delete conference 9/i }));
    await userEvent.click(await screen.findByRole('checkbox'));
    await userEvent.type(screen.getByLabelText(/type 9 to confirm/i), '9');
    await userEvent.click(screen.getByRole('button', { name: /^delete$/i }));

    expect(await screen.findByText('Conference removed, files deleted')).toBeInTheDocument();
  });

  it('says nothing when the dialog was cancelled', async () => {
    renderHarness();

    await userEvent.click(screen.getByRole('button', { name: /delete conference 9/i }));
    await userEvent.click(await screen.findByRole('button', { name: /cancel/i }));

    await waitFor(() => {
      expect(screen.queryByText('Remove conference 9?')).not.toBeInTheDocument();
    });
    expect(screen.queryByText(/Conference removed/)).not.toBeInTheDocument();
  });
});
