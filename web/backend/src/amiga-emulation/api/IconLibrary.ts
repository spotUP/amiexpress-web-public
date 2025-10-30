import { MoiraEmulator, CPURegister } from '../cpu/MoiraEmulator';

/**
 * icon.library - Amiga Icon/Tooltype Library
 * Provides access to .info files and their tooltypes
 *
 * This is a STUB implementation that returns fake data to allow doors to initialize.
 * Real icon.library would parse .info files from disk.
 *
 * Function offsets (negative values):
 * -30 = GetDiskObject
 * -36 = PutDiskObject
 * -42 = FreeDiskObject
 * -48 = FindToolType
 * -54 = MatchToolValue
 */

interface DiskObject {
  address: number;        // Memory address of structure
  toolTypes: string[];    // Array of tooltype strings
}

export class IconLibrary {
  private emulator: MoiraEmulator;
  private diskObjects: Map<number, DiskObject> = new Map();
  private nextDiskObjectAddr: number = 0x60000; // DiskObjects at 384KB

  constructor(emulator: MoiraEmulator) {
    this.emulator = emulator;
  }

  /**
   * GetDiskObject - Load icon from disk
   * A0 = name (C-string pointer to filename)
   * Returns: D0 = DiskObject pointer (0 if failed)
   *
   * Offset: -30 (0xFFFFFFE2)
   */
  GetDiskObject(): void {
    const namePtr = this.emulator.getRegister(CPURegister.A0);
    const name = this.readString(namePtr);

    console.log(`[icon.library] GetDiskObject("${name}")`);

    // For now, return a fake DiskObject with no tooltypes
    // Real implementation would load from disk
    const diskObjAddr = this.createFakeDiskObject([]);

    console.log(`  Returning fake DiskObject at 0x${diskObjAddr.toString(16)}`);

    this.emulator.setRegister(CPURegister.D0, diskObjAddr);
  }

  /**
   * PutDiskObject - Save icon to disk
   * A0 = name (C-string pointer)
   * A1 = DiskObject pointer
   * Returns: D0 = success (non-zero) or failure (0)
   *
   * Offset: -36 (0xFFFFFFDC)
   */
  PutDiskObject(): void {
    const namePtr = this.emulator.getRegister(CPURegister.A0);
    const diskObjPtr = this.emulator.getRegister(CPURegister.A1);

    const name = this.readString(namePtr);

    console.log(`[icon.library] PutDiskObject("${name}", 0x${diskObjPtr.toString(16)})`);
    console.log(`  Stub: pretending to save (not implemented)`);

    // Pretend success
    this.emulator.setRegister(CPURegister.D0, 1);
  }

  /**
   * FreeDiskObject - Free DiskObject memory
   * A0 = DiskObject pointer
   *
   * Offset: -42 (0xFFFFFFD6)
   */
  FreeDiskObject(): void {
    const diskObjPtr = this.emulator.getRegister(CPURegister.A0);

    console.log(`[icon.library] FreeDiskObject(0x${diskObjPtr.toString(16)})`);

    // Remove from our registry
    this.diskObjects.delete(diskObjPtr);
  }

  /**
   * FindToolType - Find a tooltype in DiskObject
   * A0 = toolTypeArray (pointer to NULL-terminated array of strings)
   * A1 = typeName (C-string pointer to tooltype name)
   * Returns: D0 = pointer to tooltype value (0 if not found)
   *
   * Offset: -48 (0xFFFFFFD0)
   */
  FindToolType(): void {
    const toolTypeArrayPtr = this.emulator.getRegister(CPURegister.A0);
    const typeNamePtr = this.emulator.getRegister(CPURegister.A1);

    const typeName = this.readString(typeNamePtr);

    console.log(`[icon.library] FindToolType(0x${toolTypeArrayPtr.toString(16)}, "${typeName}")`);

    // For now, return NULL (not found)
    // Real implementation would search the tooltype array
    console.log(`  Stub: returning NULL (tooltype not found)`);

    this.emulator.setRegister(CPURegister.D0, 0);
  }

  /**
   * MatchToolValue - Match tooltype value
   * A0 = typeString (C-string pointer)
   * Returns: D0 = TRUE if match, FALSE otherwise
   *
   * Offset: -54 (0xFFFFFFCA)
   */
  MatchToolValue(): void {
    const typeStringPtr = this.emulator.getRegister(CPURegister.A0);
    const typeString = this.readString(typeStringPtr);

    console.log(`[icon.library] MatchToolValue("${typeString}")`);
    console.log(`  Stub: returning FALSE (no match)`);

    this.emulator.setRegister(CPURegister.D0, 0);
  }

  /**
   * Create a fake DiskObject structure in memory
   */
  private createFakeDiskObject(toolTypes: string[]): number {
    const diskObjAddr = this.nextDiskObjectAddr;
    this.nextDiskObjectAddr += 256; // Reserve 256 bytes per DiskObject

    // DiskObject structure (simplified):
    // struct DiskObject {
    //   UWORD do_Magic;           // 0xWB13 (0xe310) magic number
    //   UWORD do_Version;         // version
    //   struct Gadget do_Gadget;  // 44 bytes
    //   UBYTE do_Type;            // type (WBDISK, WBDRAWER, WBTOOL, etc.)
    //   char *do_DefaultTool;     // default tool
    //   char **do_ToolTypes;      // tooltypes array
    //   LONG do_CurrentX;         // current X position
    //   LONG do_CurrentY;         // current Y position
    //   struct DrawerData *do_DrawerData; // drawer data
    //   char *do_ToolWindow;      // tool window
    //   LONG do_StackSize;        // stack size
    // };

    // Write magic number (0xe310 = WB13)
    this.writeWord(diskObjAddr + 0, 0xe310);

    // Write version
    this.writeWord(diskObjAddr + 2, 0);

    // Skip gadget structure (44 bytes)
    // Write type (WBTOOL = 2)
    this.emulator.writeMemory(diskObjAddr + 48, 2);

    // DefaultTool pointer (NULL)
    this.writeLong(diskObjAddr + 49, 0);

    // ToolTypes pointer (NULL for now - could create array if needed)
    this.writeLong(diskObjAddr + 53, 0);

    // Other fields (zeros)
    this.writeLong(diskObjAddr + 57, 0); // CurrentX
    this.writeLong(diskObjAddr + 61, 0); // CurrentY
    this.writeLong(diskObjAddr + 65, 0); // DrawerData
    this.writeLong(diskObjAddr + 69, 0); // ToolWindow
    this.writeLong(diskObjAddr + 73, 4096); // StackSize (default)

    // Register the DiskObject
    const diskObj: DiskObject = {
      address: diskObjAddr,
      toolTypes: toolTypes
    };
    this.diskObjects.set(diskObjAddr, diskObj);

    return diskObjAddr;
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
   * Helper: Write 32-bit big-endian value to memory
   */
  private writeLong(address: number, value: number): void {
    this.emulator.writeMemory(address + 0, (value >> 24) & 0xFF);
    this.emulator.writeMemory(address + 1, (value >> 16) & 0xFF);
    this.emulator.writeMemory(address + 2, (value >> 8) & 0xFF);
    this.emulator.writeMemory(address + 3, value & 0xFF);
  }

  /**
   * Helper: Write 16-bit big-endian value to memory
   */
  private writeWord(address: number, value: number): void {
    this.emulator.writeMemory(address + 0, (value >> 8) & 0xFF);
    this.emulator.writeMemory(address + 1, value & 0xFF);
  }

  /**
   * Handle library function call by offset
   */
  handleCall(offset: number): boolean {
    switch (offset) {
      case -30:  // GetDiskObject
        this.GetDiskObject();
        return true;

      case -36:  // PutDiskObject
        this.PutDiskObject();
        return true;

      case -42:  // FreeDiskObject
        this.FreeDiskObject();
        return true;

      case -48:  // FindToolType
        this.FindToolType();
        return true;

      case -54:  // MatchToolValue
        this.MatchToolValue();
        return true;

      default:
        return false; // Unknown function
    }
  }
}
