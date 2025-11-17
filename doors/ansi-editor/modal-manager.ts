/**
 * Centralized Modal Manager for ANSI Editor
 * 
 * Provides safe modal dialog management with proper input handler cleanup.
 * Prevents crashes from modal overlap, nested modals, and failed restoration.
 */

import { Socket } from 'socket.io';

export interface ModalInstance {
  id: string;
  title: string;
  render: () => string;
  handleInput: (key: string) => ModalResult;
  cleanup?: () => void;
}

export interface ModalResult {
  action: 'close' | 'continue' | 'error';
  data?: any;
  error?: string;
}

interface ModalState {
  stack: ModalInstance[];
  originalHandler: ((key: string) => void) | null;
  isActive: boolean;
}

class ModalManager {
  private state: ModalState = {
    stack: [],
    originalHandler: null,
    isActive: false
  };
  
  private static instance: ModalManager;

  static getInstance(): ModalManager {
    if (!ModalManager.instance) {
      ModalManager.instance = new ModalManager();
    }
    return ModalManager.instance;
  }

  /**
   * Show a modal dialog - safely manages input handler
   */
  async showModal(
    socket: Socket, 
    modal: ModalInstance, 
    bbsSession: any
  ): Promise<ModalResult> {
    console.log(`[ModalManager] Opening modal: ${modal.title} (stack size: ${this.state.stack.length})`);

    try {
      // If this is the first modal, save the original handler
      if (this.state.stack.length === 0) {
        this.state.originalHandler = bbsSession.doorInputHandler || null;
        this.state.isActive = true;
        console.log('[ModalManager] Saved original handler');
      }

      // Push modal to stack
      this.state.stack.push(modal);

      // Render the modal
      socket.emit('ansi-output', modal.render());

      // Create promise that resolves when modal closes
      return new Promise<ModalResult>((resolve) => {
        const handleInput = (key: string) => {
          try {
            const result = modal.handleInput(key);
            
            if (result.action === 'close') {
              // Modal wants to close
              console.log(`[ModalManager] Modal "${modal.title}" closing with data:`, result.data);
              
              // Remove from stack
              this.state.stack.pop();
              
              // Call modal cleanup
              if (modal.cleanup) {
                try {
                  modal.cleanup();
                } catch (cleanupError) {
                  console.error(`[ModalManager] Cleanup error for "${modal.title}":`, cleanupError);
                }
              }
              
              // If stack is empty, restore original handler
              if (this.state.stack.length === 0) {
                console.log('[ModalManager] Restoring original handler');
                bbsSession.doorInputHandler = this.state.originalHandler;
                this.state.isActive = false;
                this.state.originalHandler = null;
              } else {
                // Re-render the now-top modal
                const topModal = this.state.stack[this.state.stack.length - 1];
                socket.emit('ansi-output', topModal.render());
              }
              
              resolve(result);
              return;
            } else if (result.action === 'continue') {
              // Modal wants to continue - re-render if needed
              if (result.data?.refresh) {
                socket.emit('ansi-output', modal.render());
              }
              return; // Keep listening
            } else if (result.action === 'error') {
              console.error(`[ModalManager] Modal "${modal.title}" error:`, result.error);
              // Treat error as close
              this.state.stack.pop();
              if (this.state.stack.length === 0) {
                bbsSession.doorInputHandler = this.state.originalHandler;
                this.state.isActive = false;
                this.state.originalHandler = null;
              }
              resolve(result);
              return;
            }
          } catch (error) {
            console.error(`[ModalManager] Error in modal "${modal.title}":`, error);
            // Force close modal on error
            this.state.stack.pop();
            if (this.state.stack.length === 0) {
              bbsSession.doorInputHandler = this.state.originalHandler;
              this.state.isActive = false;
              this.state.originalHandler = null;
            }
            resolve({ action: 'close', error: String(error) });
          }
        };

        // Install modal handler
        bbsSession.doorInputHandler = handleInput;
        console.log(`[ModalManager] Installed handler for modal: ${modal.title}`);
      });

    } catch (error) {
      console.error(`[ModalManager] Failed to show modal "${modal.title}":`, error);
      
      // Clean up on failure
      this.state.stack = [];
      this.state.isActive = false;
      this.state.originalHandler = null;
      
      if (bbsSession.doorInputHandler) {
        // Don't restore - let the main editor handle recovery
        delete bbsSession.doorInputHandler;
      }
      
      return { action: 'error', error: String(error) };
    }
  }

  /**
   * Force close all modals (for emergency recovery)
   */
  forceCloseAll(bbsSession: any): void {
    console.log('[ModalManager] Force closing all modals');
    
    // Call cleanup on all modals
    for (const modal of this.state.stack) {
      if (modal.cleanup) {
        try {
          modal.cleanup();
        } catch (error) {
          console.error(`[ModalManager] Cleanup error for "${modal.title}":`, error);
        }
      }
    }
    
    // Clear state
    this.state.stack = [];
    this.state.isActive = false;
    
    // Restore original handler
    bbsSession.doorInputHandler = this.state.originalHandler;
    this.state.originalHandler = null;
    
    console.log('[ModalManager] All modals closed');
  }

  /**
   * Check if any modal is active
   */
  isModalActive(): boolean {
    return this.state.isActive;
  }

  /**
   * Get current stack depth (for debugging)
   */
  getStackDepth(): number {
    return this.state.stack.length;
  }

  /**
   * Check if handler is modal handler
   */
  isModalHandler(handler: any): boolean {
    if (!this.state.isActive || this.state.stack.length === 0) {
      return false;
    }
    return true; // Any handler installed while stack not empty is modal handler
  }

  /**
   * Emergency recovery - clear handler if corrupted
   */
  recoverHandler(bbsSession: any): void {
    console.log('[ModalManager] Emergency handler recovery');
    this.forceCloseAll(bbsSession);
    
    // Try to restore a basic handler that returns to main editor
    bbsSession.doorInputHandler = (key: string) => {
      console.log('[ModalManager] Recovered handler received key:', key);
      // Basic handler - just return to main editor behavior
      // This will be overridden by the main editor when it runs
    };
  }
}

export default ModalManager;