/**
 * An editing dialog must be a dialog.
 *
 * Nine pages hand-rolled thirteen of them: a `fixed inset-0` div over a
 * dimmed backdrop, with no `role="dialog"`, no focus trap, no Escape handler
 * and nothing telling assistive technology the rest of the page had gone
 * away. A keyboard user could tab straight out of the form into the table
 * behind it and never get back.
 *
 * ConfirmDialog and Toast moved to Radix for exactly this reason. This is the
 * same move for the editing dialogs.
 */

import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Modal } from '../components/ui/Modal';

describe('the shared Modal', () => {
  it('announces itself as a dialog, by name', () => {
    render(
      <Modal open title="Edit Computer Type" onClose={() => {}}>
        <p>body</p>
      </Modal>
    );

    expect(screen.getByRole('dialog', { name: 'Edit Computer Type' })).toBeInTheDocument();
  });

  it('is still named when the page draws its own header', () => {
    render(
      <Modal open title="Edit Door" onClose={() => {}} showHeader={false}>
        <h2>Edit Door</h2>
      </Modal>
    );

    expect(screen.getByRole('dialog', { name: 'Edit Door' })).toBeInTheDocument();
  });

  it('closes on Escape', async () => {
    const onClose = vi.fn();
    render(
      <Modal open title="Edit User" onClose={onClose}>
        <input aria-label="Username" />
      </Modal>
    );

    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });

  it('renders nothing when closed', () => {
    render(
      <Modal open={false} title="Edit User" onClose={() => {}}>
        <p>body</p>
      </Modal>
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('no page hand-rolls one any more', () => {
  it('has no `fixed inset-0` dialog left in pages/', () => {
    const dir = path.join(__dirname, '..', 'pages');
    const offenders = fs
      .readdirSync(dir)
      .filter((name) => name.endsWith('.tsx'))
      .filter((name) => /className="fixed inset-0[^"]*z-50/.test(fs.readFileSync(path.join(dir, name), 'utf8')))
      .sort();

    // Vitest's expect takes no message, so the report goes in the value.
    expect(offenders.join(', ')).toBe('');
  });
});
