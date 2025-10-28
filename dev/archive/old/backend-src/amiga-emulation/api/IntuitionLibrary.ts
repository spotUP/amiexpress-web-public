import { MoiraEmulator, CPURegister } from '../cpu/MoiraEmulator';

/**
 * intuition.library - Amiga Intuition Library (Stub Implementation)
 * Provides window, screen, and gadget management
 *
 * NOTE: This is a STUB implementation for console-based doors.
 * Most functions are no-ops or return dummy values.
 *
 * Function offsets (negative values):
 * -72 = CloseWindow
 * -78 = CloseScreen
 * -204 = OpenWindow
 * -198 = OpenScreen
 * -276 = SetWindowTitles
 * -282 = RefreshGadgets
 * -438 = OpenWorkBench
 */

export class IntuitionLibrary {
  private emulator: MoiraEmulator;
  private nextWindowHandle: number = 0x10000;
  private nextScreenHandle: number = 0x20000;

  constructor(emulator: MoiraEmulator) {
    this.emulator = emulator;
  }

  /**
   * OpenWindow - Open a window
   * A0 = pointer to NewWindow structure
   * Returns: D0 = window pointer (or 0 if failed)
   */
  OpenWindow(): void {
    const newWindowPtr = this.emulator.getRegister(CPURegister.A0);
    console.log(`[intuition.library] OpenWindow(newWindow=0x${newWindowPtr.toString(16)}) - returning dummy handle`);

    // Return dummy window handle
    const handle = this.nextWindowHandle++;
    this.emulator.setRegister(CPURegister.D0, handle);
  }

  /**
   * CloseWindow - Close a window
   * A0 = window pointer
   */
  CloseWindow(): void {
    const window = this.emulator.getRegister(CPURegister.A0);
    console.log(`[intuition.library] CloseWindow(window=0x${window.toString(16)}) - no-op`);
  }

  /**
   * OpenScreen - Open a screen
   * A0 = pointer to NewScreen structure
   * Returns: D0 = screen pointer (or 0 if failed)
   */
  OpenScreen(): void {
    const newScreenPtr = this.emulator.getRegister(CPURegister.A0);
    console.log(`[intuition.library] OpenScreen(newScreen=0x${newScreenPtr.toString(16)}) - returning dummy handle`);

    // Return dummy screen handle
    const handle = this.nextScreenHandle++;
    this.emulator.setRegister(CPURegister.D0, handle);
  }

  /**
   * CloseScreen - Close a screen
   * A0 = screen pointer
   * Returns: D0 = TRUE if successful
   */
  CloseScreen(): void {
    const screen = this.emulator.getRegister(CPURegister.A0);
    console.log(`[intuition.library] CloseScreen(screen=0x${screen.toString(16)}) - no-op`);
    this.emulator.setRegister(CPURegister.D0, -1); // TRUE
  }

  /**
   * SetWindowTitles - Set window title
   * A0 = window pointer
   * A1 = window title
   * A2 = screen title
   */
  SetWindowTitles(): void {
    const window = this.emulator.getRegister(CPURegister.A0);
    const windowTitlePtr = this.emulator.getRegister(CPURegister.A1);
    const screenTitlePtr = this.emulator.getRegister(CPURegister.A2);

    let windowTitle = '';
    let screenTitle = '';

    if (windowTitlePtr !== 0 && windowTitlePtr !== 0xFFFFFFFF) {
      windowTitle = this.readString(windowTitlePtr);
    }
    if (screenTitlePtr !== 0 && screenTitlePtr !== 0xFFFFFFFF) {
      screenTitle = this.readString(screenTitlePtr);
    }

    console.log(`[intuition.library] SetWindowTitles(window="${windowTitle}", screen="${screenTitle}") - no-op`);
  }

  /**
   * RefreshGadgets - Refresh gadgets in a window
   * A0 = gadget list
   * A1 = window pointer
   * A2 = requester pointer
   */
  RefreshGadgets(): void {
    console.log('[intuition.library] RefreshGadgets() - no-op');
  }

  /**
   * OpenWorkBench - Open Workbench screen
   * Returns: D0 = screen pointer
   */
  OpenWorkBench(): void {
    console.log('[intuition.library] OpenWorkBench() - returning dummy screen handle');
    this.emulator.setRegister(CPURegister.D0, 0x30000);
  }

  /**
   * Helper: Read null-terminated string from memory
   */
  private readString(address: number, maxLen: number = 256): string {
    const bytes: number[] = [];
    for (let i = 0; i < maxLen; i++) {
      const byte = this.emulator.readMemory(address + i);
      if (byte === 0) break;
      bytes.push(byte);
    }
    return String.fromCharCode(...bytes);
  }

  /**
   * Handle library function call by offset
   */
  handleCall(offset: number): boolean {
    switch (offset) {
      case -72:
        this.CloseWindow();
        return true;
      case -78:
        this.CloseScreen();
        return true;
      case -198:
        this.OpenScreen();
        return true;
      case -204:
        this.OpenWindow();
        return true;
      case -276:
        this.SetWindowTitles();
        return true;
      case -282:
        this.RefreshGadgets();
        return true;
      case -438:
        this.OpenWorkBench();
        return true;
      default:
        return false; // Unknown function
    }
  }
}
