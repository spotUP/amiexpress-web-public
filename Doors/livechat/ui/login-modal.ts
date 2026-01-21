/**
 * Login Modal for ChatOnly Mode - uses SDK LoginModal widget
 */
import { Screen, LoginModal as SDKLoginModal } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import type { LoginCredentials } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';

export { LoginCredentials };

export interface LoginModalOptions {
  screen: Screen;
  onSubmit: (credentials: LoginCredentials) => void;
  onError?: (message: string) => void;
}

export class LoginModal {
  private modal: SDKLoginModal;
  private onError?: (message: string) => void;

  constructor(options: LoginModalOptions) {
    this.onError = options.onError;

    this.modal = new SDKLoginModal({
      parent: options.screen,
      title: 'LiveChat Login',
      overlay: true,
      overlayOpacity: 0.5,
      zIndex: 9990,
      onSubmit: options.onSubmit,
    });
  }

  public showError(message: string): void {
    this.modal.showError(message);
    if (this.onError) {
      this.onError(message);
    }
  }

  public hideError(): void {
    this.modal.hideError();
  }

  public show(): void {
    this.modal.display();
  }

  public hide(): void {
    this.modal.hide();
  }

  public destroy(): void {
    this.modal.destroy();
  }

  public clearInputs(): void {
    this.modal.clearInputs();
  }
}

export function createLoginModal(options: LoginModalOptions): LoginModal {
  return new LoginModal(options);
}
