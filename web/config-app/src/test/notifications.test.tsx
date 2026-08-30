import { describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NotificationProvider, useNotification } from '../contexts/NotificationContext';

/**
 * The 28 pages call showSuccess / showError / confirm and act on what confirm
 * resolves to. These drive that contract through the rendered dialog, because
 * a confirmation that resolves the wrong way deletes the wrong thing.
 */

function Harness({
  requireTypedConfirmation,
  onAnswer,
}: {
  requireTypedConfirmation?: string;
  onAnswer: (answer: boolean) => void;
}) {
  const { confirm, showSuccess } = useNotification();

  return (
    <div>
      <button
        type="button"
        onClick={async () => {
          const answer = await confirm({
            title: 'Delete door',
            message: 'This removes Commands/BBSCmd/WALL.info.',
            confirmText: 'Delete',
            type: 'danger',
            requireTypedConfirmation,
          });
          onAnswer(answer);
        }}
      >
        Ask
      </button>
      <button type="button" onClick={() => showSuccess('Saved to disk')}>
        Save
      </button>
    </div>
  );
}

function renderHarness(props: { requireTypedConfirmation?: string } = {}) {
  const answers: boolean[] = [];
  render(
    <NotificationProvider>
      <Harness {...props} onAnswer={(answer) => answers.push(answer)} />
    </NotificationProvider>
  );
  return answers;
}

describe('NotificationProvider', () => {
  it('resolves confirm with true when the action is confirmed', async () => {
    const user = userEvent.setup();
    const answers = renderHarness();

    await user.click(screen.getByRole('button', { name: 'Ask' }));
    await user.click(await screen.findByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(answers).toEqual([true]));
  });

  it('resolves confirm with false when it is cancelled', async () => {
    const user = userEvent.setup();
    const answers = renderHarness();

    await user.click(screen.getByRole('button', { name: 'Ask' }));
    await user.click(await screen.findByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(answers).toEqual([false]));
  });

  it('holds an irreversible action until the name is typed back', async () => {
    const user = userEvent.setup();
    const answers = renderHarness({ requireTypedConfirmation: 'WALL' });

    await user.click(screen.getByRole('button', { name: 'Ask' }));
    const confirmButton = await screen.findByRole('button', { name: 'Delete' });
    expect(confirmButton).toBeDisabled();

    await user.type(screen.getByLabelText('Type WALL to confirm'), 'WAL');
    expect(confirmButton).toBeDisabled();

    await user.type(screen.getByLabelText('Type WALL to confirm'), 'L');
    expect(confirmButton).toBeEnabled();

    await user.click(confirmButton);
    await waitFor(() => expect(answers).toEqual([true]));
  });

  it('announces a toast and lets it be dismissed', async () => {
    const user = userEvent.setup();
    renderHarness();

    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Saved to disk')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Dismiss' }));
    await waitFor(() => expect(screen.queryByText('Saved to disk')).toBeNull());
  });
});
