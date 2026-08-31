/**
 * A decision that belongs to the action goes in the dialog that asks about it.
 *
 * Deleting a conference can take its files with it. That switch first lived
 * above the table - page state to set BEFORE pressing delete - and the sysop's
 * report was "i dont se any switch", which is what a control nowhere near the
 * thing it affects earns.
 *
 * So ConfirmDialog carries it, and answers with it. The result is
 * {confirmed, checked} rather than a bare boolean on purpose: "confirmed with
 * the box unticked" and "cancelled" are different answers and collapsing them
 * would either delete nothing while reporting success or delete files nobody
 * asked to lose.
 */

import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';

const CHECKBOX = {
  label: "Delete the conference's files too",
  description: 'Every message posted there and every file uploaded to it.',
};

describe('a confirmation that carries a decision', () => {
  it('shows the box, unticked, with what it means', () => {
    render(
      <ConfirmDialog
        open
        title="Delete Conference"
        message="Remove conference 3?"
        checkbox={CHECKBOX}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    const box = screen.getByRole('checkbox');
    expect(box).not.toBeChecked();
    expect(screen.getByText(CHECKBOX.label)).toBeInTheDocument();
    expect(screen.getByText(CHECKBOX.description)).toBeInTheDocument();
  });

  it('answers false when the box was left alone', async () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog
        open
        title="Delete Conference"
        message="Remove conference 3?"
        checkbox={CHECKBOX}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />
    );

    await userEvent.click(screen.getByRole('button', { name: /confirm/i }));

    expect(onConfirm).toHaveBeenCalledWith(false);
  });

  it('answers true when it was ticked', async () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog
        open
        title="Delete Conference"
        message="Remove conference 3?"
        checkbox={CHECKBOX}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />
    );

    await userEvent.click(screen.getByRole('checkbox'));
    await userEvent.click(screen.getByRole('button', { name: /confirm/i }));

    expect(onConfirm).toHaveBeenCalledWith(true);
  });

  it('still blocks on the typed confirmation, box or no box', async () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog
        open
        title="Delete Conference"
        message="Remove conference 3?"
        requireTypedConfirmation="3"
        checkbox={CHECKBOX}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />
    );

    await userEvent.click(screen.getByRole('checkbox'));
    await userEvent.click(screen.getByRole('button', { name: /confirm/i }));
    expect(onConfirm).not.toHaveBeenCalled();

    await userEvent.type(screen.getByLabelText(/type 3 to confirm/i), '3');
    await userEvent.click(screen.getByRole('button', { name: /confirm/i }));
    expect(onConfirm).toHaveBeenCalledWith(true);
  });

  it('does not inherit the last answer when reopened', async () => {
    const onConfirm = vi.fn();
    const { rerender } = render(
      <ConfirmDialog open title="One" message="?" checkbox={CHECKBOX} onConfirm={onConfirm} onCancel={vi.fn()} />
    );
    await userEvent.click(screen.getByRole('checkbox'));

    rerender(
      <ConfirmDialog open={false} title="One" message="?" checkbox={CHECKBOX} onConfirm={onConfirm} onCancel={vi.fn()} />
    );
    rerender(
      <ConfirmDialog open title="Two" message="?" checkbox={CHECKBOX} onConfirm={onConfirm} onCancel={vi.fn()} />
    );

    expect(screen.getByRole('checkbox')).not.toBeChecked();
  });

  it('renders no box when the action has no such decision', () => {
    render(
      <ConfirmDialog open title="Delete" message="Sure?" onConfirm={vi.fn()} onCancel={vi.fn()} />
    );

    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });
});
