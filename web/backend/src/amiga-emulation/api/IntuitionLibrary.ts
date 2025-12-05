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
 * -198 = OpenScreen
 * -204 = OpenWindow
 * -276 = SetWindowTitles
 * -282 = RefreshGadgets
 * -348 = AutoRequest
 * -438 = OpenWorkBench
 */

export class IntuitionLibrary {
  private emulator: MoiraEmulator;
  // Window/screen handles must be outside door code range (0x1000-0x80000)
  private nextWindowHandle: number = 0x099000;
  private nextScreenHandle: number = 0x09A000;

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
    // Use screen handle range (0x09A000+) to avoid door code range (0x1000-0x80000)
    this.emulator.setRegister(CPURegister.D0, 0x09A000);
  }

  /**
   * AutoRequest - Display a simple requester dialog (LVO -348)
   * A0 = Window pointer (can be NULL)
   * A1 = BodyText (IntuiText pointer)
   * A2 = PosText (IntuiText for left/positive button)
   * A3 = NegText (IntuiText for right/negative button)
   * D0 = PosFlags (IDCMP flags)
   * D1 = NegFlags (IDCMP flags)
   * D2 = Width
   * D3 = Height
   * Returns: D0 = TRUE if positive clicked, FALSE if negative
   *
   * For BBS doors without GUI, we log the request and return FALSE
   * to indicate the user "dismissed" the dialog.
   */
  AutoRequest(): void {
    const window = this.emulator.getRegister(CPURegister.A0);
    const bodyTextPtr = this.emulator.getRegister(CPURegister.A1);
    const posTextPtr = this.emulator.getRegister(CPURegister.A2);
    const negTextPtr = this.emulator.getRegister(CPURegister.A3);

    // Try to read the body text to log it
    let bodyText = '';
    if (bodyTextPtr !== 0) {
      // IntuiText structure:
      // +0: FrontPen (UBYTE), +1: BackPen (UBYTE), +2: DrawMode (UBYTE),
      // +4: LeftEdge (WORD), +6: TopEdge (WORD), +8: ITextFont (APTR),
      // +12: IText (STRPTR), +16: NextText (APTR)
      const iTextPtr = this.emulator.readMemory32(bodyTextPtr + 12);
      if (iTextPtr !== 0) {
        bodyText = this.readString(iTextPtr);
      }
    }

    console.log(`[intuition.library] AutoRequest(window=0x${window.toString(16)}, body="${bodyText}") - returning FALSE (no GUI)`);

    // Return FALSE (0) to indicate user "cancelled" the dialog
    // This allows the door to continue with error handling
    this.emulator.setRegister(CPURegister.D0, 0);
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
      case -348:
        this.AutoRequest();
        return true;
      default:
        return false; // Unknown function
    }
  }
}
