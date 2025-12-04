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
  private doorDirectory: string = ''; // Set by AmigaDoorSession for PROGDIR: device
  private doorCommand: string = ''; // The command used to launch this door (e.g., "N", "FR")

  constructor(emulator: MoiraEmulator, bbsRoot: string = '~/Code/amiexpress-web') {
    this.emulator = emulator;
    this.bbsRoot = bbsRoot;
  }

  /**
   * Set the door command (used for DOORUSE.* lookups)
   * Called by AmigaDoorSession when starting a door
   */
  setDoorCommand(command: string): void {
    this.doorCommand = command.toUpperCase();
    console.log(`[icon.library] Door command set to: ${this.doorCommand}`);
  }

  /**
   * Set the door directory for PROGDIR: device
   * Called by LibraryManager when starting a door
   */
  setDoorDirectory(doorPath: string): void {
    this.doorDirectory = doorPath;
    console.log(`[icon.library] PROGDIR: device set to ${doorPath}`);
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

    console.log(`[icon.library] *** GetDiskObject CALLED *** namePtr=0x${namePtr.toString(16)}, name="${name}"`);

    // Translate AmigaOS device assignments to Unix paths
    const upperName = name.toUpperCase();
    if (upperName.startsWith('PROGDIR:')) {
      // PROGDIR: - door's own directory (e.g., PROGDIR:AquaScan -> /path/to/Doors/AquaScan/AquaScan)
      const relativePath = name.substring(8); // Skip "PROGDIR:"
      if (this.doorDirectory) {
        name = path.join(this.doorDirectory, relativePath);
        console.log(`[icon.library]   Translated PROGDIR: -> ${name}`);
      } else {
        console.log(`[icon.library]   WARNING: PROGDIR: used but doorDirectory not set`);
        name = relativePath;
      }
    } else if (upperName.startsWith('DOORS:')) {
      name = 'Doors/' + name.substring(6);
      console.log(`[icon.library]   Translated DOORS: -> ${name}`);
    } else if (upperName.startsWith('BBS:')) {
      name = name.substring(4);
      console.log(`[icon.library]   Translated BBS: -> ${name}`);
    } else if (upperName.startsWith('SYS:')) {
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

    // WORKAROUND: Version compatibility check (DOORUSE.V5.6, DOORUSE.V4.0, etc.)
    // Some doors check DOORUSE.<version> to verify BBS compatibility.
    // These tooltypes don't exist in icons - return the actual command mode instead.
    // Pattern: DOORUSE.V followed by a version number (e.g., V5.6, V4.0, V3.1)
    let searchTypeName = typeName;
    if (typeName.match(/^DOORUSE\.V\d+\.?\d*/)) {
      if (this.doorCommand) {
        // Redirect version check to command-specific entry
        searchTypeName = `DOORUSE.${this.doorCommand}`;
        console.log(`[icon.library]   Version check "${typeName}" -> searching for "${searchTypeName}" instead`);
      } else {
        // No door command - search for any DOORUSE.* entry
        searchTypeName = 'DOORUSE.';
        console.log(`[icon.library]   Version check "${typeName}" -> searching for any DOORUSE.* entry`);
      }
    }

    // Validate pointer is in valid memory range (not NULL or in ROM/reserved areas)
    if (toolTypeArrayPtr === 0 || toolTypeArrayPtr < 0x1000) {
      console.log(`[icon.library]   ERROR: Invalid tooltype array pointer - returning NULL`);
      this.emulator.setRegister(CPURegister.D0, 0);
      return;
    }

    // Loop through NULL-terminated array of string pointers
    // NOTE: The array can be anywhere in memory - doors like AquaScan read their own
    // config file and build tooltype arrays in their own allocated memory
    let arrayIndex = 0;

    // Check if first entry points to raw icon data (starts with 0xe310 = WB13 magic)
    // Some doors like AquaScan pass raw icon binary data instead of a parsed array
    const firstPtr = this.readLong(toolTypeArrayPtr);
    if (firstPtr !== 0) {
      const magic = (this.emulator.readMemory(firstPtr) << 8) | this.emulator.readMemory(firstPtr + 1);
      if (magic === 0xe310) {
        console.log(`[icon.library]   Detected raw icon data at 0x${firstPtr.toString(16)} (magic 0xe310)`);
        const result = this.searchIconBinaryForTooltype(firstPtr, typeName);
        if (result !== 0) {
          console.log(`[icon.library]   Found "${typeName}" in raw icon at 0x${result.toString(16)}`);
          this.emulator.setRegister(CPURegister.D0, result);
          return;
        }
        console.log(`[icon.library]   Tooltype "${typeName}" not found in raw icon data`);
        this.emulator.setRegister(CPURegister.D0, 0);
        return;
      }
    }

    while (true) {
      // Read pointer from array (each entry is 4 bytes)
      const tooltypeStrPtr = this.readLong(toolTypeArrayPtr + (arrayIndex * 4));

      // NULL terminator - not found
      if (tooltypeStrPtr === 0) {
        console.log(`[icon.library]   Tooltype "${searchTypeName}" not found after ${arrayIndex} entries - returning NULL`);
        this.emulator.setRegister(CPURegister.D0, 0);
        return;
      }

      // Read tooltype string
      const tooltypeStr = this.readString(tooltypeStrPtr);

      // Check if it starts with searchTypeName (case-insensitive)
      const upperTooltypeStr = tooltypeStr.toUpperCase();
      if (upperTooltypeStr.startsWith(searchTypeName)) {
        // Standard match: exact name or NAME=value pattern
        if (tooltypeStr.length === searchTypeName.length || tooltypeStr[searchTypeName.length] === '=') {
          // FindToolType returns pointer to VALUE (after '='), not the whole string
          const equalsPos = tooltypeStr.indexOf('=');
          if (equalsPos >= 0) {
            // Return pointer to character after '='
            const valuePtr = tooltypeStrPtr + equalsPos + 1;
            const value = tooltypeStr.substring(equalsPos + 1);
            console.log(`[icon.library]   Found "${searchTypeName}" -> value "${value}" at 0x${valuePtr.toString(16)}`);
            this.emulator.setRegister(CPURegister.D0, valuePtr);
          } else {
            // No '=' means boolean tooltype, return pointer to empty string (null terminator)
            console.log(`[icon.library]   Found "${searchTypeName}" (boolean) at 0x${(tooltypeStrPtr + tooltypeStr.length).toString(16)}`);
            this.emulator.setRegister(CPURegister.D0, tooltypeStrPtr + tooltypeStr.length);
          }
          return;
        }
        // Prefix search: if searchTypeName ends with '.', match any continuation
        // For DOORUSE. prefix, we know the door command and can find the exact match
        if (searchTypeName.endsWith('.')) {
          // Check if this is a DOORUSE lookup and we know the door command
          if (searchTypeName === 'DOORUSE.' && this.doorCommand) {
            // Look for DOORUSE.<command>= in this tooltype
            const expectedPrefix = `DOORUSE.${this.doorCommand}=`;
            if (upperTooltypeStr.startsWith(expectedPrefix)) {
              // Found the matching DOORUSE entry! Return pointer to VALUE
              const equalsPos = tooltypeStr.indexOf('=');
              if (equalsPos >= 0) {
                const valuePtr = tooltypeStrPtr + equalsPos + 1;
                const value = tooltypeStr.substring(equalsPos + 1);
                console.log(`[icon.library]   Found DOORUSE.${this.doorCommand} -> value "${value}" at 0x${valuePtr.toString(16)}`);
                this.emulator.setRegister(CPURegister.D0, valuePtr);
                return;
              }
            }
            // This entry doesn't match our command, continue searching
          } else {
            // Generic prefix search - return first match
            console.log(`[icon.library]   Prefix match "${searchTypeName}" -> full string "${tooltypeStr}" at 0x${tooltypeStrPtr.toString(16)}`);
            this.emulator.setRegister(CPURegister.D0, tooltypeStrPtr);
            return;
          }
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
   * Lazy load tooltypes from command .info file when FindToolType is called with invalid pointer
   * This handles doors that expect tooltypes to be pre-populated but the memory was overwritten
   */
  private lazyLoadCommandTooltypes(pointerAddr: number, tooltypeName: string): number {
    console.log(`[icon.library]   Searching through ${this.diskObjects.size} loaded DiskObjects for "${tooltypeName}"`);

    // WORKAROUND: Some doors check DOORUSE.V5.6 but expect the mode value from DOORUSE.<cmd>
    // If looking for DOORUSE.V5.6, try DOORUSE.FR, DOORUSE.CS, etc. FIRST (prefer mode over version)
    const altNames: string[] = [];
    if (tooltypeName.toUpperCase().startsWith('DOORUSE.V')) {
      // Try DOORUSE.FR, DOORUSE.CS, etc. FIRST (these have the mode value like "REVSCAN")
      altNames.push('DOORUSE.FR', 'DOORUSE.CS', 'DOORUSE.NSU', 'DOORUSE.N');
      altNames.push(tooltypeName); // Try original as last resort
    } else {
      altNames.push(tooltypeName);
    }

    // Search through all loaded DiskObjects to find one with the requested tooltype
    for (const [addr, diskObj] of this.diskObjects.entries()) {
      const toolTypesPtr = this.emulator.readMemory32(addr + 54); // do_ToolTypes at offset 54
      if (toolTypesPtr === 0) continue;

      // Try each alternative name
      for (const searchName of altNames) {
        let index = 0;
        while (index < 1000) {
          const tooltypeStrPtr = this.emulator.readMemory32(toolTypesPtr + (index * 4));
          if (tooltypeStrPtr === 0) break; // End of array

          const tooltypeStr = this.readString(tooltypeStrPtr);
          const upperTooltypeStr = tooltypeStr.toUpperCase();

          if (upperTooltypeStr.startsWith(searchName.toUpperCase())) {
            if (tooltypeStr.length === searchName.length || tooltypeStr[searchName.length] === '=') {
              console.log(`[icon.library]   ✓ Found "${searchName}" (searching for "${tooltypeName}") in DiskObject at 0x${addr.toString(16)}`);
              console.log(`[icon.library]   ✓ Returning tooltype string at 0x${tooltypeStrPtr.toString(16)}: "${tooltypeStr}"`);
              return tooltypeStrPtr;
            }
          }
          index++;
        }
      }
    }

    console.log(`[icon.library]   Lazy load failed - tooltype "${tooltypeName}" not found in any loaded DiskObject`);
    return 0;
  }

  /**
   * MatchToolValue - Match tooltype value
   * A0 = typeString (C-string pointer to tooltype, e.g., "FILETYPE=TEXT")
   * A1 = value (C-string pointer to value to match, e.g., "TEXT")
   * Returns: D0 = TRUE if typeString contains value, FALSE otherwise
   *
   * Offset: -54 (0xFFFFFFCA)
   *
   * NOTE: Some doors like AquaScan pass a file path with empty value
   * as an icon file existence check. We handle this by checking if
   * the path looks like a file path and if the .info file exists.
   */
  MatchToolValue(): void {
    const typeStringPtr = this.emulator.getRegister(CPURegister.A0);
    const valuePtr = this.emulator.getRegister(CPURegister.A1);

    const typeString = this.readString(typeStringPtr);
    const value = valuePtr !== 0 ? this.readString(valuePtr) : '';

    console.log(`[icon.library] MatchToolValue(A0=0x${typeStringPtr.toString(16)}, A1=0x${valuePtr.toString(16)})`);
    console.log(`[icon.library]   typeString="${typeString}", value="${value}"`);

    // Special case: If A0 points to a DiskObject we created, and value is empty,
    // the door is checking if the icon is valid. Return TRUE.
    if (this.diskObjects.has(typeStringPtr) && !value) {
      console.log(`[icon.library]   A0 is a DiskObject pointer - returning TRUE (icon valid)`);
      this.emulator.setRegister(CPURegister.D0, 1);
      return;
    }

    // Special case: If typeString is a pure numeric string (conference/node number) and value is empty,
    // the door is checking if a conference or node icon exists. Try "Conf<number>" then "Node<number>".
    if (!value && /^\d+$/.test(typeString)) {
      const num = typeString;
      console.log(`[icon.library]   Detected numeric icon check: ${num}`);

      // Try Conf<N> first, then Node<N>
      const prefixes = ['Conf', 'Node'];
      for (const prefix of prefixes) {
        const iconPath = path.join(this.bbsRoot, `${prefix}${num}.info`);

        // Case-insensitive file lookup
        const dir = path.dirname(iconPath);
        const baseName = path.basename(iconPath).toLowerCase();
        let realPath: string | null = null;
        try {
          const files = fs.readdirSync(dir);
          const found = files.find(f => f.toLowerCase() === baseName);
          if (found) {
            realPath = path.join(dir, found);
          }
        } catch (e) {
          // Directory doesn't exist
        }

        if (realPath) {
          console.log(`[icon.library]   Loading ${prefix}${num} icon from: ${realPath}`);
          const tooltypes = this.parseInfoFile(realPath);
          if (tooltypes && tooltypes.length > 0) {
            const diskObjAddr = this.createFakeDiskObject(tooltypes);
            console.log(`[icon.library]   Created DiskObject at 0x${diskObjAddr.toString(16)} with ${tooltypes.length} tooltypes`);
            this.emulator.setRegister(CPURegister.D0, diskObjAddr);
            return;
          }
        }
      }

      console.log(`[icon.library]   Icon for number ${num} NOT found (tried Conf${num} and Node${num})`);
      this.emulator.setRegister(CPURegister.D0, 0); // NULL - doesn't exist
      return;
    }

    // Special case: If typeString looks like a file path and value is empty,
    // some doors like AquaScan use this as a combined existence check + load.
    // We load the icon and return the DiskObject pointer (not just TRUE/FALSE).
    if (!value && (typeString.includes(':') || typeString.includes('/'))) {
      console.log(`[icon.library]   Detected file path - loading icon`);

      // Try to resolve the path and load the .info file
      let iconPath = typeString;
      const upperPath = iconPath.toUpperCase();

      if (upperPath.startsWith('DOORS:')) {
        iconPath = path.join(this.bbsRoot, 'Doors', iconPath.substring(6));
      } else if (upperPath.startsWith('PROGDIR:')) {
        iconPath = path.join(this.doorDirectory || this.bbsRoot, iconPath.substring(8));
      } else if (upperPath.startsWith('BBS:')) {
        // BBS: resolves to BBS root directory
        iconPath = path.join(this.bbsRoot, iconPath.substring(4));
      } else if (!path.isAbsolute(iconPath)) {
        iconPath = path.join(this.bbsRoot, iconPath);
      }

      // Add .info extension if not present
      if (!iconPath.toLowerCase().endsWith('.info')) {
        iconPath += '.info';
      }

      // Case-insensitive file lookup
      const dir = path.dirname(iconPath);
      const baseName = path.basename(iconPath).toLowerCase();
      let realPath: string | null = null;
      try {
        const files = fs.readdirSync(dir);
        const found = files.find(f => f.toLowerCase() === baseName);
        if (found) {
          realPath = path.join(dir, found);
        }
      } catch (e) {
        // Directory doesn't exist
      }

      if (realPath) {
        console.log(`[icon.library]   Loading icon from: ${realPath}`);
        // Parse the icon file and create a DiskObject
        const tooltypes = this.parseInfoFile(realPath);
        if (tooltypes && tooltypes.length > 0) {
          const diskObjAddr = this.createFakeDiskObject(tooltypes);
          console.log(`[icon.library]   Created DiskObject at 0x${diskObjAddr.toString(16)} with ${tooltypes.length} tooltypes`);
          this.emulator.setRegister(CPURegister.D0, diskObjAddr);
          return;
        }
      }

      console.log(`[icon.library]   Icon file NOT found or empty: ${iconPath}`);
      this.emulator.setRegister(CPURegister.D0, 0); // NULL - not found
      return;
    }

    // Standard behavior: Check if typeString contains value after '='
    // e.g., "FILETYPE=TEXT|IMAGE" should match "TEXT" or "IMAGE"
    const equalsPos = typeString.indexOf('=');
    if (equalsPos >= 0 && value) {
      const typeValue = typeString.substring(equalsPos + 1).toUpperCase();
      const searchValue = value.toUpperCase();

      // Values can be separated by '|'
      const values = typeValue.split('|');
      for (const v of values) {
        if (v.trim() === searchValue) {
          console.log(`[icon.library]   Match found: "${v}" == "${searchValue}"`);
          this.emulator.setRegister(CPURegister.D0, 1); // TRUE
          return;
        }
      }
    }

    console.log(`[icon.library]   No match found`);
    this.emulator.setRegister(CPURegister.D0, 0); // FALSE
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
    // DiskObject layout after Gadget (44 bytes at offset 4):
    //   offset 48: do_Type (UBYTE, 1 byte)
    //   offset 49: padding (1 byte for word alignment)
    //   offset 50: do_DefaultTool (LONG, 4 bytes)
    //   offset 54: do_ToolTypes (LONG, 4 bytes)
    //   offset 58: do_CurrentX (LONG, 4 bytes)
    //   offset 62: do_CurrentY (LONG, 4 bytes)
    //   offset 66: do_DrawerData (LONG, 4 bytes)
    //   offset 70: do_ToolWindow (LONG, 4 bytes)
    //   offset 74: do_StackSize (LONG, 4 bytes)

    // Write type (WBTOOL = 2)
    this.emulator.writeMemory(diskObjAddr + 48, 2);

    // DefaultTool pointer (NULL) - at offset 50 (word-aligned)
    this.writeLong(diskObjAddr + 50, 0);

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

    // ToolTypes pointer - at offset 54 (word-aligned)
    this.writeLong(diskObjAddr + 54, tooltypesPtr);

    // Other fields (zeros) - all word-aligned
    this.writeLong(diskObjAddr + 58, 0); // CurrentX
    this.writeLong(diskObjAddr + 62, 0); // CurrentY
    this.writeLong(diskObjAddr + 66, 0); // DrawerData
    this.writeLong(diskObjAddr + 70, 0); // ToolWindow
    this.writeLong(diskObjAddr + 74, 4096); // StackSize (default)

    // Register the DiskObject
    const diskObj: DiskObject = {
      address: diskObjAddr,
      toolTypes: toolTypes
    };
    this.diskObjects.set(diskObjAddr, diskObj);

    return diskObjAddr;
  }

  /**
   * Search within raw icon binary data for a tooltype string
   * Icons store tooltypes as null-terminated strings in a specific format
   * This handles the case where doors pass raw icon data to FindToolType
   */
  private searchIconBinaryForTooltype(iconDataPtr: number, typeName: string): number {
    const upperTypeName = typeName.toUpperCase();

    // Scan through memory looking for the tooltype string
    // Icon files embed tooltypes as null-terminated strings
    // We'll search up to 4KB from the start of the icon data
    const maxSearchBytes = 4096;

    // Debug: show first 32 bytes of icon data
    const firstBytes: string[] = [];
    for (let i = 0; i < 32; i++) {
      firstBytes.push(this.emulator.readMemory(iconDataPtr + i).toString(16).padStart(2, '0'));
    }
    console.log(`[icon.library]   Icon data at 0x${iconDataPtr.toString(16)}: ${firstBytes.join(' ')}`);

    // Find where ASCII strings start (after binary header and image data)
    // Look for sequences of printable ASCII characters
    let foundStrings = 0;
    for (let offset = 0; offset < maxSearchBytes && foundStrings < 10; offset++) {
      const str = this.readString(iconDataPtr + offset, 256);

      // Skip non-printable or too short
      if (str.length < 4) continue;

      // Check if it looks like a tooltype (contains = and is mostly printable)
      if (str.includes('=') || str.startsWith('(')) {
        console.log(`[icon.library]   searchIconBinary: offset 0x${offset.toString(16)} -> "${str.substring(0, 50)}"`);
        foundStrings++;
      }

      // Check if the string starts with our tooltype name (case-insensitive)
      const upperStr = str.toUpperCase();
      if (upperStr.startsWith(upperTypeName)) {
        // Verify it's a proper tooltype match:
        // - Either exact match (same length)
        // - Or followed by '=' (tooltype with value)
        const isExactMatch = str.length === typeName.length;
        const isToolTypeMatch = str[typeName.length] === '=';
        if (isExactMatch || isToolTypeMatch) {
          const returnAddr = iconDataPtr + offset;
          const verifyStr = this.readString(returnAddr, 64);
          console.log(`[icon.library]   searchIconBinary: MATCH! Found "${str}" at offset 0x${offset.toString(16)}`);
          console.log(`[icon.library]   Returning address 0x${returnAddr.toString(16)} which contains: "${verifyStr}"`);
          return returnAddr;
        }
      }
    }

    return 0; // Not found
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
