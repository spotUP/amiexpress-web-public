/**
 * Disconnection Modal for ChatOnly Mode - uses SDK ConfirmModal widget
 */
import { Screen, ConfirmModal } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';

export interface DisconnectionModalOptions {
  screen: Screen;
  onRetry: () => void;
  onCancel: () => void;
}

export class DisconnectionModal {
  private modal: ConfirmModal;

  constructor(options: DisconnectionModalOptions) {
    this.modal = new ConfirmModal({
      parent: options.screen,
      title: 'Connection Error',
      borderColor: 'red',
      confirmText: '[ Retry ]',
      cancelText: '[ Cancel ]',
      confirmColor: 'green',
      cancelColor: 'red',
      overlay: true,
      overlayOpacity: 0.5,
      zIndex: 9990,
      onConfirm: () => {
        options.onRetry();
      },
      onCancel: () => {
        options.onCancel();
      },
    });
  }

  public showError(message: string) {
    this.modal.setMessage(message);
    this.modal.display();
  }

  public show() {
    this.modal.display();
  }

  public hide() {
    this.modal.hide();
  }

  public destroy() {
    this.modal.destroy();
  }
}

export function createDisconnectionModal(options: DisconnectionModalOptions): DisconnectionModal {
  return new DisconnectionModal(options);
}
