/**
 * Modal Component Tests
 * Tests the reusable modal dialog component.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Modal, ModalButton, ModalButtons } from '../Modal';

describe('Modal', () => {
  describe('visibility', () => {
    it('renders nothing when isOpen=false', () => {
      const { container } = render(
        <Modal isOpen={false}>Content</Modal>
      );
      expect(container.firstChild).toBeNull();
    });

    it('renders content when isOpen=true', () => {
      render(<Modal isOpen={true}>Test Content</Modal>);
      expect(screen.getByText('Test Content')).toBeInTheDocument();
    });
  });

  describe('title', () => {
    it('renders title when provided', () => {
      render(<Modal isOpen={true} title="My Title">Content</Modal>);
      expect(screen.getByText('My Title')).toBeInTheDocument();
    });

    it('does not render title heading when omitted', () => {
      render(<Modal isOpen={true}>Content</Modal>);
      expect(screen.queryByRole('heading')).toBeNull();
    });
  });

  describe('close button', () => {
    it('renders close button by default when onClose provided', () => {
      render(<Modal isOpen={true} onClose={vi.fn()}>Content</Modal>);
      expect(screen.getByLabelText('Close')).toBeInTheDocument();
    });

    it('calls onClose when close button clicked', () => {
      const onClose = vi.fn();
      render(<Modal isOpen={true} onClose={onClose}>Content</Modal>);
      fireEvent.click(screen.getByLabelText('Close'));
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('does not render close button when showCloseButton=false', () => {
      render(
        <Modal isOpen={true} onClose={vi.fn()} showCloseButton={false}>
          Content
        </Modal>
      );
      expect(screen.queryByLabelText('Close')).toBeNull();
    });
  });

  describe('overlay click', () => {
    it('calls onClose when overlay clicked', () => {
      const onClose = vi.fn();
      const { container } = render(
        <Modal isOpen={true} onClose={onClose}>Content</Modal>
      );
      // Click the overlay (first child of container)
      const overlay = container.querySelector('.modal-overlay');
      if (overlay) fireEvent.click(overlay);
      expect(onClose).toHaveBeenCalled();
    });

    it('does NOT call onClose when container itself clicked', () => {
      const onClose = vi.fn();
      const { container } = render(
        <Modal isOpen={true} onClose={onClose}>Content</Modal>
      );
      const modalContainer = container.querySelector('.modal-container');
      if (modalContainer) fireEvent.click(modalContainer);
      expect(onClose).not.toHaveBeenCalled();
    });
  });

  describe('Escape key', () => {
    it('calls onClose on Escape keydown', () => {
      const onClose = vi.fn();
      render(<Modal isOpen={true} onClose={onClose}>Content</Modal>);
      fireEvent.keyDown(document, { key: 'Escape' });
      expect(onClose).toHaveBeenCalled();
    });

    it('does NOT call onClose when modal is closed', () => {
      const onClose = vi.fn();
      render(<Modal isOpen={false} onClose={onClose}>Content</Modal>);
      fireEvent.keyDown(document, { key: 'Escape' });
      expect(onClose).not.toHaveBeenCalled();
    });
  });
});

describe('ModalButton', () => {
  it('renders children', () => {
    render(<ModalButton onClick={vi.fn()}>Click me</ModalButton>);
    expect(screen.getByText('Click me')).toBeInTheDocument();
  });

  it('calls onClick when clicked', () => {
    const onClick = vi.fn();
    render(<ModalButton onClick={onClick}>Click</ModalButton>);
    fireEvent.click(screen.getByText('Click'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('is disabled when disabled=true', () => {
    render(<ModalButton onClick={vi.fn()} disabled>Disabled</ModalButton>);
    expect(screen.getByText('Disabled')).toBeDisabled();
  });

  it('applies variant class', () => {
    const { container } = render(
      <ModalButton onClick={vi.fn()} variant="danger">Del</ModalButton>
    );
    expect(container.querySelector('.modal-button-danger')).toBeInTheDocument();
  });
});

describe('ModalButtons', () => {
  it('renders children in a container', () => {
    render(
      <ModalButtons>
        <button>A</button>
        <button>B</button>
      </ModalButtons>
    );
    expect(screen.getByText('A')).toBeInTheDocument();
    expect(screen.getByText('B')).toBeInTheDocument();
  });
});
