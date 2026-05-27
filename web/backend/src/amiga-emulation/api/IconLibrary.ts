import { MoiraEmulator, CPURegister } from '../cpu/MoiraEmulator';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import * as amigafs from '../../utils/amigafs';

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
  private doorBinaryName: string = ''; // Basename of the door executable (e.g., "ByteComment")

  constructor(emulator: MoiraEmulator, bbsRoot: string = process.env.BBS_DATA_DIR || process.cwd()) {
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
   * Set the door binary name (basename without .info extension).
   * Used by GetDiskObject() as the fallback when the caller passes an
   * empty/NULL name — doors like ByteComment read their own .info by
   * passing WBStartup.sm_ArgList[0] which we haven't fully populated.
   * On real Amiga the name would be the process name; our fallback is
   * the executable basename which is the same thing in practice.
   */
  setDoorBinaryName(name: string): void {
    this.doorBinaryName = name;
console.log(`[icon.library] Door binary name set to: ${this.doorBinaryName}`);
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

    // Empty/NULL name → door is asking for its own .info by reading
    // WBStartup.sm_ArgList[0].wa_Name (the launch name). We don't fully
    // populate that struct, so legacy doors like ByteComment pass
    // through an empty string and fail with "Can't find .Icon". Fall
    // back to the door's binary name in its own directory — that's the
    // effective match for what real AmigaOS would resolve.
    if (!name || name.length === 0) {
      if (this.doorBinaryName && this.doorDirectory) {
        name = path.join(this.doorDirectory, this.doorBinaryName);
console.log(`[icon.library]   Empty name → falling back to door binary: ${name}`);
      }
    }

    // Translate AmigaOS device assignments to Unix paths
    const upperName = name.toUpperCase();
    let hasDevicePrefix = false;

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
      hasDevicePrefix = true;
    } else if (upperName.startsWith('DOORS:')) {
      name = 'Doors/' + name.substring(6);
console.log(`[icon.library]   Translated DOORS: -> ${name}`);
      hasDevicePrefix = true;
    } else if (upperName.startsWith('BBS:')) {
      name = name.substring(4);
console.log(`[icon.library]   Translated BBS: -> ${name}`);
      hasDevicePrefix = true;
    } else if (upperName.startsWith('SYS:')) {
      name = 'system/' + name.substring(4);
console.log(`[icon.library]   Translated SYS: -> ${name}`);
      hasDevicePrefix = true;
    }

    // Build candidate paths to try.
    // Per AmigaOS semantics, bare filenames resolve against the process's CurrentDir.
    // For BBS doors launched from BBS root, CurrentDir is BBS root — try that first.
    // Fall back to door directory for doors that pass bare filenames for their own data.
    const candidates: string[] = [];
    if (path.isAbsolute(name)) {
      candidates.push(name);
    } else if (hasDevicePrefix) {
      candidates.push(path.join(this.bbsRoot, name));
    } else {
      candidates.push(path.join(this.bbsRoot, name));
      if (this.doorDirectory) {
        candidates.push(path.join(this.doorDirectory, name));
      }
    }

    // Add .info extension if not present
    const candidatesWithExt = candidates.map(c =>
      c.endsWith('.info') ? c : c + '.info'
    );

console.log(`[icon.library]   Candidates: ${candidatesWithExt.join(', ')}`);

    // Try each candidate with case-insensitive resolution
    let infoPath = '';
    for (const candidate of candidatesWithExt) {
      const resolved = amigafs.resolvePath(candidate);
      if (resolved) {
        infoPath = resolved;
        break;
      }
    }

    if (!infoPath) {
      // If the door asked for "ACP", synthesize tooltypes from the running BBS
      // state. AmiExpress-Web renames ACP.info to bbsConfig.info, but legacy doors
      // (bytekiller etc.) still call GetDiskObject("ACP").
      if (upperName === 'ACP' || upperName.endsWith('/ACP') || upperName === 'BBS:ACP') {
        const synthetic = this.synthesizeACPTooltypes();
        if (synthetic.length > 0) {
console.log(`[icon.library]   Synthesized ACP DiskObject with ${synthetic.length} tooltypes`);
          const diskObjAddr = this.createFakeDiskObject(synthetic);
          this.emulator.setRegister(CPURegister.D0, diskObjAddr);
          return;
        }
      }
console.log(`[icon.library]   File not found (case-insensitive) - returning NULL`);
      this.emulator.setRegister(CPURegister.D0, 0);
      return;
    }
console.log(`[icon.library]   Resolved (case-insensitive) to: ${infoPath}`);

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

      // NULL terminator - not found in provided array
      if (tooltypeStrPtr === 0) {
console.log(`[icon.library]   Tooltype "${searchTypeName}" not found after ${arrayIndex} entries`);

        // GENERIC FALLBACK: For DOORUSE.* lookups, try the door's main .info file
        // Many doors load config icons without tooltypes, but DOORUSE entries are in the main door icon
        if (searchTypeName.startsWith('DOORUSE.') && this.doorDirectory) {
          const result = this.findTooltypeInDoorMainIcon(searchTypeName);
          if (result !== 0) {
            this.emulator.setRegister(CPURegister.D0, result);
            return;
          }
        }

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

            // Debug: Verify memory at valuePtr matches expected value
            const memVerify: string[] = [];
            for (let i = 0; i < Math.min(value.length + 1, 16); i++) {
              const byte = this.emulator.readMemory(valuePtr + i);
              memVerify.push(byte.toString(16).padStart(2, '0'));
            }
console.log(`[icon.library]   Memory at 0x${valuePtr.toString(16)}: [${memVerify.join(' ')}] = "${this.readString(valuePtr, 16)}"`);

            this.emulator.setRegister(CPURegister.D0, valuePtr);

            // Debug: Verify D0 was set correctly
            const d0After = this.emulator.getRegister(CPURegister.D0);
console.log(`[icon.library]   D0 set to 0x${d0After.toString(16)} (expected 0x${valuePtr.toString(16)})`);
            if (d0After !== valuePtr) {
console.error(`[icon.library]   ERROR: D0 mismatch! Got 0x${d0After.toString(16)}, expected 0x${valuePtr.toString(16)}`);
            }
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

    // When doors check DOORUSE.V5.6 (version check), they actually want the mode value
    // from any DOORUSE.* entry. Dynamically find ALL DOORUSE.* entries instead of
    // hardcoding specific command codes (FR, CS, NSU, etc.) - that would be door-specific.
    const altNames: string[] = [];
    if (tooltypeName.toUpperCase().startsWith('DOORUSE.V')) {
      // Collect all DOORUSE.* entries from loaded DiskObjects dynamically
      const dooruseEntries = this.findAllDoortypeEntries('DOORUSE.');
      altNames.push(...dooruseEntries);
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
   * Dynamically find all tooltype entries matching a prefix (e.g., "DOORUSE.")
   * This avoids hardcoding specific door command codes like FR, CS, NSU, etc.
   * Returns unique tooltype names found across all loaded DiskObjects.
   */
  private findAllDoortypeEntries(prefix: string): string[] {
    const found = new Set<string>();
    const upperPrefix = prefix.toUpperCase();

    for (const [addr] of this.diskObjects.entries()) {
      const toolTypesPtr = this.emulator.readMemory32(addr + 54); // do_ToolTypes at offset 54
      if (toolTypesPtr === 0) continue;

      let index = 0;
      while (index < 1000) {
        const tooltypeStrPtr = this.emulator.readMemory32(toolTypesPtr + (index * 4));
        if (tooltypeStrPtr === 0) break; // End of array

        const tooltypeStr = this.readString(tooltypeStrPtr);
        const upperTooltypeStr = tooltypeStr.toUpperCase();

        // Match prefix (e.g., "DOORUSE.FR" matches "DOORUSE.")
        if (upperTooltypeStr.startsWith(upperPrefix)) {
          // Extract just the tooltype name (before =)
          const eqPos = tooltypeStr.indexOf('=');
          const name = eqPos > 0 ? tooltypeStr.substring(0, eqPos) : tooltypeStr;
          found.add(name);
        }
        index++;
      }
    }

    const result = Array.from(found);
    if (result.length > 0) {
console.log(`[icon.library]   Found ${result.length} ${prefix}* entries: ${result.join(', ')}`);
    }
    return result;
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

        // Case-insensitive file lookup using amigafs
        const realPath = amigafs.resolvePath(iconPath);

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

    // Special case: If typeString looks like a file path with an Amiga device prefix,
    // some doors (AquaScan, JoinCnf) use this as a combined existence check + load.
    // We load the icon and return the DiskObject pointer (not just TRUE/FALSE).
    // NOTE: Some doors pass a value like "0." which we should ignore for path lookups.
    const upperTypeString = typeString.toUpperCase();
    const isAmigaDevicePath = upperTypeString.startsWith('BBS:') ||
                               upperTypeString.startsWith('DOORS:') ||
                               upperTypeString.startsWith('PROGDIR:') ||
                               upperTypeString.startsWith('SYS:') ||
                               upperTypeString.startsWith('LIBS:') ||
                               upperTypeString.startsWith('ENV:') ||
                               upperTypeString.startsWith('ENVARC:');

    if (isAmigaDevicePath || (!value && (typeString.includes(':') || typeString.includes('/')))) {
console.log(`[icon.library]   Detected file path - loading icon (isAmigaDevicePath=${isAmigaDevicePath}, value="${value}")`);

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

      // Case-insensitive file lookup using amigafs
      const realPath = amigafs.resolvePath(iconPath);

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
   * Synthesize ACP.info tooltypes from the running BBS state.
   * AmiExpress-Web doesn't ship a real ACP.info — config lives in bbsConfig.info
   * and per-conference ConfConfig.info files. Legacy doors still call
   * GetDiskObject("ACP") to read BBS paths; this assembles the tooltypes they expect.
   */
  private synthesizeACPTooltypes(): string[] {
    const tooltypes: string[] = [];
    try {
      // BBS_LOCATION — required; "BBS:" is the Amiga-style root.
      tooltypes.push('BBS_LOCATION=BBS:');

      // NODE<n>_LOCATION — one per existing Node<n>/ directory.
      const entries = fs.readdirSync(this.bbsRoot, { withFileTypes: true });
      const nodeDirs = entries
        .filter(e => e.isDirectory() && /^Node\d+$/i.test(e.name))
        .map(e => {
          const m = e.name.match(/\d+/);
          return m ? parseInt(m[0], 10) : 0;
        })
        .filter(n => n > 0)
        .sort((a, b) => a - b);
      for (const n of nodeDirs) {
        tooltypes.push(`NODE${n}_LOCATION=BBS:Node${n}/`);
      }

      // Per-conference ULPATH.<n>, DLPATH.<n>, NDIRS — read from ConfN/ConfConfig.info.
      // PathManager aliases BBSn: → BBS: so paths like BBS2:Conf1/Upload/ imported
      // from multi-drive installations resolve cleanly; no filtering needed here.
      let maxNdirs = 0;
      const confDirs = entries
        .filter(e => e.isDirectory() && /^Conf\d+$/i.test(e.name))
        .map(e => {
          const m = e.name.match(/\d+/);
          return m ? parseInt(m[0], 10) : 0;
        })
        .filter(n => n > 0)
        .sort((a, b) => a - b);
      for (const confNum of confDirs) {
        let ulpath = '';
        let dlpath = '';
        let ndirs = 0;

        const confInfoPath = path.join(this.bbsRoot, `Conf${confNum}`, 'ConfConfig.info');
        const resolved = amigafs.resolvePath(confInfoPath);
        if (resolved) {
          const confTools = this.parseInfoFile(resolved);
          if (confTools) {
            for (const tt of confTools) {
              const eq = tt.indexOf('=');
              if (eq < 0) continue;
              const key = tt.substring(0, eq).toUpperCase();
              const value = tt.substring(eq + 1);
              if (key === 'UPLOADS' || key === 'ULPATH' || key === 'UPLOAD') {
                ulpath = value;
              } else if (key === 'DOWNLOADS' || key === 'DLPATH' || key === 'DOWNLOAD') {
                dlpath = value;
              } else if (key === 'NDIRS') {
                const n = parseInt(value, 10);
                if (!isNaN(n)) ndirs = n;
              }
            }
          }
        }

        // Count actual numbered DIR files on disk — ConfConfig.info NDIRS is often stale
        // (e.g. set to 1 at install time and never updated as uploads create new directories).
        // Use whichever value is higher so AquaScan always sees all real directories.
        try {
          const confDir = path.join(this.bbsRoot, `Conf${confNum}`);
          const confEntries = fs.readdirSync(confDir);
          let highestDir = 0;
          for (const name of confEntries) {
            const m = name.match(/^[Dd][Ii][Rr](\d+)$/);
            if (m) {
              const n = parseInt(m[1], 10);
              if (n > highestDir) highestDir = n;
            }
          }
          if (highestDir > ndirs) ndirs = highestDir;
        } catch {
          // Conference directory unreadable — keep ndirs from ConfConfig.info
        }

        // Fall back to conventional Upload/ directory if ConfConfig.info missing or incomplete
        if (!ulpath) {
          const uploadDir = path.join(this.bbsRoot, `Conf${confNum}`, 'Upload');
          if (amigafs.existsSync(uploadDir)) {
            ulpath = `BBS:Conf${confNum}/Upload/`;
          }
        }
        if (!dlpath && ulpath) {
          dlpath = ulpath;
        }

        if (ulpath) tooltypes.push(`ULPATH.${confNum}=${ulpath}`);
        if (dlpath) tooltypes.push(`DLPATH.${confNum}=${dlpath}`);
        if (ndirs > maxNdirs) maxNdirs = ndirs;
      }
      if (maxNdirs === 0) maxNdirs = 20;
      tooltypes.push(`NDIRS=${maxNdirs}`);

      // USER_DATA — path to user.data database file
      tooltypes.push('USER_DATA=BBS:user.data');
    } catch (err) {
console.error('[icon.library] synthesizeACPTooltypes failed:', err);
    }
    return tooltypes;
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
   * GENERIC FALLBACK: Find a DOORUSE.* tooltype in the door's main .info file
   * This handles doors that call GetDiskObject on config files (which may not have tooltypes)
   * but still need DOORUSE entries from the main door executable's icon.
   */
  private findTooltypeInDoorMainIcon(tooltypeName: string): number {
    if (!this.doorDirectory) {
console.log(`[icon.library]   Fallback: No door directory set`);
      return 0;
    }

    // Find the door's main executable .info file
    // doorDirectory is like /path/to/Doors/AquaScan, look for AquaScan.info (or AquaScan.020.info, etc.)
    const doorName = path.basename(this.doorDirectory);
    const possibleInfoFiles = [
      path.join(this.doorDirectory, `${doorName}.info`),
      path.join(this.doorDirectory, `${doorName}.020.info`),
      path.join(this.doorDirectory, `${doorName}.000.info`),
    ];

console.log(`[icon.library]   Fallback: Searching for ${tooltypeName} in door's main icon...`);

    for (const infoPath of possibleInfoFiles) {
      const resolvedPath = amigafs.resolvePath(infoPath);
      if (!resolvedPath) continue;

console.log(`[icon.library]   Fallback: Checking ${resolvedPath}`);

      const tooltypes = this.parseInfoFile(resolvedPath);
      if (!tooltypes || tooltypes.length === 0) continue;

      // Search for the requested tooltype
      for (const tooltype of tooltypes) {
        const upperTooltype = tooltype.toUpperCase();
        const searchUpper = tooltypeName.toUpperCase();

        if (upperTooltype.startsWith(searchUpper)) {
          // Check for exact match or NAME=VALUE pattern
          if (tooltype.length === tooltypeName.length || tooltype[tooltypeName.length] === '=') {
            const equalsPos = tooltype.indexOf('=');
            if (equalsPos >= 0) {
              const value = tooltype.substring(equalsPos + 1);
console.log(`[icon.library]   Fallback: Found ${tooltypeName} = "${value}" in ${path.basename(resolvedPath)}`);

              // Allocate memory for the value string and return pointer to it
              // Use a fixed location in memory for tooltype values (0xf2000+ area)
              const valueAddr = 0xf2000 + (this.tooltypeValueOffset || 0);
              this.tooltypeValueOffset = (this.tooltypeValueOffset || 0) + value.length + 1;
              if (this.tooltypeValueOffset > 0x1000) this.tooltypeValueOffset = 0; // Wrap around

              // Write the value to memory
              for (let i = 0; i < value.length; i++) {
                this.emulator.writeMemory(valueAddr + i, value.charCodeAt(i));
              }
              this.emulator.writeMemory(valueAddr + value.length, 0); // Null terminator

console.log(`[icon.library]   Fallback: Returning value at 0x${valueAddr.toString(16)}`);
              return valueAddr;
            }
          }
        }
      }
    }

console.log(`[icon.library]   Fallback: ${tooltypeName} not found in any door icon`);
    return 0;
  }

  // Track offset for allocating tooltype value strings in memory
  private tooltypeValueOffset: number = 0;

  private parseInfoFile(infoPath: string): string[] | null {
    try {
      if (!fs.existsSync(infoPath)) return null;

      const buffer = fs.readFileSync(infoPath);
      const tooltypes: string[] = [];


      // Amiga .info files store tooltypes as length-prefixed strings near the end.
      // We look for patterns that match valid tooltypes (KEY=VALUE or single keywords).
      // The format typically has 4-byte length prefix (big-endian) followed by the string.

      // Strategy: Scan backwards from end of file to find tooltype section
      // Look for consecutive length-prefixed strings that look like tooltypes

      // First approach: Look for known tooltype patterns to find the section
      let tooltypeStart = -1;

      // Search for first occurrence of a tooltype pattern (KEY=VALUE where KEY is uppercase)
      for (let i = 0; i < buffer.length - 10; i++) {
        // Check if this could be a length byte followed by valid tooltype chars
        const possibleLen = buffer.readUInt32BE(i);
        if (possibleLen > 0 && possibleLen < 512 && i + 4 + possibleLen <= buffer.length) {
          // Check if this looks like a valid tooltype
          const strStart = i + 4;
          let isValid = true;
          let hasEquals = false;

          // First char should be uppercase letter or underscore
          const firstChar = buffer[strStart];
          if (!((firstChar >= 65 && firstChar <= 90) || firstChar === 95)) { // A-Z or _
            continue;
          }

          // Scan the string for validity.
          // CRITICAL: Amiga .info length-prefixed strings INCLUDE the null terminator in
          // the length. We must stop scanning at null (not treat it as invalid).
          let actualLen = possibleLen;
          for (let j = 0; j < possibleLen; j++) {
            const c = buffer[strStart + j];
            if (c === 0) { actualLen = j; break; } // null terminator — end of string
            if (c === 61) hasEquals = true; // '='
            // Allow printable ASCII
            if (c < 32 || c > 126) {
              // Allow ANSI escape codes (0x1b) in values
              if (c === 0x1b) continue;
              isValid = false;
              break;
            }
          }

          // Valid tooltype should have uppercase key and either be a flag or KEY=VALUE
          // Require at least 1 char (actualLen, not possibleLen, to exclude the null)
          if (isValid && actualLen >= 1 && (hasEquals || actualLen <= 32)) {
            // Additional validation: for flags without '=', allow tooltype-style names
            // (uppercase, digits, underscores, dots — e.g. "CONF.1", "ICONFACE")
            if (!hasEquals) {
              let validFlag = true;
              for (let j = 0; j < actualLen; j++) {
                const c = buffer[strStart + j];
                if (!((c >= 65 && c <= 90) || (c >= 48 && c <= 57) || c === 95 || c === 46)) {
                  // A-Z, 0-9, _, . (dot for CONF.N style tooltypes)
                  validFlag = false;
                  break;
                }
              }
              if (!validFlag) continue;
              // Reject pure-numeric strings and single-char strings as false positives
              const flagStr = buffer.toString('latin1', strStart, strStart + actualLen);
              if (/^\d+$/.test(flagStr) || actualLen < 2) continue;
            }
            tooltypeStart = i;
            break;
          }
        }
      }

      if (tooltypeStart < 0) {
        // Fallback: Just extract any valid-looking strings with '=' in them
        let currentString = '';
        for (let i = 0; i < buffer.length; i++) {
          const charCode = buffer[i];
          // Allow printable ASCII (32-126) plus ESC (0x1B) for ANSI codes in values
          if ((charCode >= 32 && charCode <= 126) || charCode === 0x1b) {
            currentString += String.fromCharCode(charCode);
          } else {
            if (currentString.length >= 4 && currentString.includes('=')) {
              // Remove any leading garbage (length bytes that got included)
              const equalsPos = currentString.indexOf('=');
              if (equalsPos > 0) {
                // Find the start of the KEY (first uppercase letter)
                let keyStart = 0;
                for (let j = 0; j < equalsPos; j++) {
                  const c = currentString.charCodeAt(j);
                  if ((c >= 65 && c <= 90) || c === 95) { // A-Z or _
                    keyStart = j;
                    break;
                  }
                }
                if (keyStart > 0) {
                  currentString = currentString.substring(keyStart);
                }
                tooltypes.push(currentString);
              }
            } else if (currentString.length >= 2 && /^[A-Z][A-Z0-9_.]*$/.test(currentString)) {
              // Standalone flag (no =) — must start with uppercase, allow dots (CONF.1 etc)
              tooltypes.push(currentString);
            }
            currentString = '';
          }
        }
        return tooltypes.length > 0 ? tooltypes : null;
      }

      // Parse length-prefixed strings starting from tooltypeStart
      let offset = tooltypeStart;
      while (offset + 4 < buffer.length) {
        const len = buffer.readUInt32BE(offset);

        // Sanity check: length should be reasonable
        if (len === 0 || len > 512 || offset + 4 + len > buffer.length) {
          break;
        }

        // Read the string (use latin1/binary to preserve ESC and other control chars)
        // Strip trailing null terminator — Amiga includes it in the length
        let rawStr = buffer.toString('latin1', offset + 4, offset + 4 + len);
        const nullPos = rawStr.indexOf('\0');
        if (nullPos >= 0) rawStr = rawStr.substring(0, nullPos);

        // Validate it looks like a tooltype
        if (rawStr.length >= 1) {
          // Find start of actual key (skip any non-tooltype binary prefix)
          let keyStart = 0;
          for (let j = 0; j < rawStr.length; j++) {
            const c = rawStr.charCodeAt(j);
            if ((c >= 65 && c <= 90) || c === 95) { // A-Z or _
              keyStart = j;
              break;
            }
          }
          const cleanStr = keyStart > 0 ? rawStr.substring(keyStart) : rawStr;
          // Accept KEY=VALUE, or flag-style tooltypes (uppercase letters, digits, underscore, dot)
          const isFlagLike = /^[A-Z][A-Z0-9_.]*$/.test(cleanStr);
          if (cleanStr.includes('=') || isFlagLike) {
            tooltypes.push(cleanStr);
          } else {
            // Might be end of tooltypes section
            break;
          }
        }

        // Move to next entry (length + string + padding to word boundary)
        // Amiga .info tooltype entries are packed contiguously (no inter-entry padding)
        offset += 4 + len;
      }

      return tooltypes.length > 0 ? tooltypes : null;
    } catch (e) {
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
        // COMPREHENSIVE STUB IMPLEMENTATION FOR ALL UNIMPLEMENTED FUNCTIONS
console.warn(`[icon.library] STUB: Unimplemented function at LVO ${offset}`);
        this.emulator.setRegister(CPURegister.D0, 0);

        const d0 = this.emulator.getRegister(CPURegister.D0);
        const d1 = this.emulator.getRegister(CPURegister.D1);
        const a0 = this.emulator.getRegister(CPURegister.A0);
console.warn(`[icon.library]   Context: D0=0x${d0.toString(16)} D1=0x${d1.toString(16)} A0=0x${a0.toString(16)}`);
console.warn(`[icon.library]   Returning D0=0 (failure) - door should handle gracefully`);

        return true; // Return true to indicate we handled it (with a stub)
    }
  }
}
