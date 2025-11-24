import { MoiraEmulator, CPURegister } from '../cpu/MoiraEmulator';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

/**
 * icon.library - Amiga Icon/Tooltype Library
 * Provides access to .info files and their tooltypes
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
  private bbsRoot: string;

  constructor(emulator: MoiraEmulator, bbsRoot: string = '~/Code/amiexpress-web') {
    this.emulator = emulator;
    this.bbsRoot = bbsRoot;
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
    let name = this.readString(namePtr);

    console.log(`[icon.library] GetDiskObject("${name}")`);

    // Translate AmigaOS device assignments to Unix paths
    if (name.startsWith('DOORS:')) {
      name = 'doors/' + name.substring(6);
      console.log(`[icon.library]   Translated DOORS: -> ${name}`);
    } else if (name.startsWith('BBS:')) {
      name = name.substring(4);
      console.log(`[icon.library]   Translated BBS: -> ${name}`);
    } else if (name.startsWith('SYS:')) {
      name = 'system/' + name.substring(4);
      console.log(`[icon.library]   Translated SYS: -> ${name}`);
    }

    // Convert to absolute path
    let infoPath = name;
    if (!path.isAbsolute(name)) {
      infoPath = path.join(this.bbsRoot, name);
    }

    // Add .info extension if not present
    if (!infoPath.endsWith('.info')) {
      infoPath += '.info';
    }

    console.log(`[icon.library]   Looking for: ${infoPath}`);

    // Check if file exists
    if (!fs.existsSync(infoPath)) {
      console.log(`[icon.library]   File not found - returning NULL`);
      this.emulator.setRegister(CPURegister.D0, 0);
      return;
    }

    // Parse .info file to extract tooltypes
    const tooltypes = this.parseInfoFile(infoPath);
    if (!tooltypes) {
      console.log(`[icon.library]   Failed to parse .info file - returning NULL`);
      this.emulator.setRegister(CPURegister.D0, 0);
      return;
    }

    console.log(`[icon.library]   Found ${tooltypes.length} tooltypes`);

    // Create DiskObject with actual tooltypes
    const diskObjAddr = this.createFakeDiskObject(tooltypes);

    console.log(`[icon.library]   Returning DiskObject at 0x${diskObjAddr.toString(16)}`);

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

    const typeName = this.readString(typeNamePtr).toUpperCase();

    console.log(`[icon.library] FindToolType(0x${toolTypeArrayPtr.toString(16)}, "${typeName}")`);

    // Loop through NULL-terminated array of string pointers
    let arrayIndex = 0;
    while (true) {
      // Read pointer from array (each entry is 4 bytes)
      const tooltypeStrPtr = this.readLong(toolTypeArrayPtr + (arrayIndex * 4));

      // NULL terminator - not found
      if (tooltypeStrPtr === 0) {
        console.log(`[icon.library]   Tooltype "${typeName}" not found - returning NULL`);
        this.emulator.setRegister(CPURegister.D0, 0);
        return;
      }

      // Read tooltype string
      const tooltypeStr = this.readString(tooltypeStrPtr);

      // Check if it starts with typeName (case-insensitive)
      const upperTooltypeStr = tooltypeStr.toUpperCase();
      if (upperTooltypeStr.startsWith(typeName)) {
        // Check if followed by '=' or end of string (exact match)
        if (tooltypeStr.length === typeName.length || tooltypeStr[typeName.length] === '=') {
          console.log(`[icon.library]   Found "${typeName}" -> "${tooltypeStr}" at 0x${tooltypeStrPtr.toString(16)}`);
          this.emulator.setRegister(CPURegister.D0, tooltypeStrPtr);
          return;
        }
      }

      arrayIndex++;

      // Safety check to prevent infinite loops
      if (arrayIndex > 1000) {
        console.log(`[icon.library]   ERROR: Tooltype array too large (>1000 entries) - returning NULL`);
        this.emulator.setRegister(CPURegister.D0, 0);
        return;
      }
    }
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
   * Create a DiskObject structure in memory with tooltypes
   */
  private createFakeDiskObject(toolTypes: string[]): number {
    const diskObjAddr = this.nextDiskObjectAddr;
    this.nextDiskObjectAddr += 0x1000; // Reserve 4KB per DiskObject (enough for tooltypes)

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

    // ToolTypes array - if we have tooltypes, create the array
    let tooltypesPtr = 0;
    if (toolTypes.length > 0) {
      // Allocate space for tooltype array and strings
      const tooltypesArrayAddr = diskObjAddr + 256; // Start array at +256
      const tooltypeStringsAddr = diskObjAddr + 512; // Start strings at +512

      let stringOffset = 0;
      for (let i = 0; i < toolTypes.length; i++) {
        const tooltypeStr = toolTypes[i];
        const tooltypeAddr = tooltypeStringsAddr + stringOffset;

        // Write pointer to string in array
        this.writeLong(tooltypesArrayAddr + (i * 4), tooltypeAddr);

        // Write string to memory
        for (let j = 0; j < tooltypeStr.length; j++) {
          this.emulator.writeMemory(tooltypeAddr + j, tooltypeStr.charCodeAt(j));
        }
        this.emulator.writeMemory(tooltypeAddr + tooltypeStr.length, 0); // Null terminator

        console.log(`[icon.library]       Tooltype[${i}] at 0x${tooltypeAddr.toString(16)}: "${tooltypeStr}"`);

        stringOffset += tooltypeStr.length + 1;
      }

      // NULL-terminate the tooltype array
      this.writeLong(tooltypesArrayAddr + (toolTypes.length * 4), 0);

      tooltypesPtr = tooltypesArrayAddr;
      console.log(`[icon.library]     ToolTypes array at 0x${tooltypesPtr.toString(16)}, ${toolTypes.length} entries`);
    }

    // ToolTypes pointer
    this.writeLong(diskObjAddr + 53, tooltypesPtr);

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
   * Parse .info file using `strings` command to extract tooltypes
   */
  private parseInfoFile(infoPath: string): string[] | null {
    try {
      // Use strings command to extract text from .info file
      const output = execSync(`strings "${infoPath}"`, { encoding: 'utf-8' });
      const lines = output.split('\n');

      const tooltypes: string[] = [];

      // Look for lines that contain '=' (tooltype format)
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.includes('=') && !trimmed.startsWith('#') && !trimmed.startsWith('/')) {
          console.log(`[icon.library]     Found tooltype: "${trimmed}"`);
          tooltypes.push(trimmed);
        }
      }

      return tooltypes;
    } catch (error) {
      console.log(`[icon.library] Error parsing .info file: ${error}`);
      return null;
    }
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
   * Helper: Read 32-bit big-endian value from memory
   */
  private readLong(address: number): number {
    const b0 = this.emulator.readMemory(address + 0);
    const b1 = this.emulator.readMemory(address + 1);
    const b2 = this.emulator.readMemory(address + 2);
    const b3 = this.emulator.readMemory(address + 3);
    return (b0 << 24) | (b1 << 16) | (b2 << 8) | b3;
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
