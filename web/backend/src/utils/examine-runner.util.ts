/**
 * EXAMINE Command Runner
 *
 * Unified implementation for running EXAMINE commands (file testing/extraction).
 * Consolidates duplicate logic from file-diz.util.ts and file-test.util.ts.
 *
 * Express.e behavior (lines 18500-18600):
 * - Runs EXAMINE, then EXAMINE1, EXAMINE2, etc. in sequence
 * - Replaces placeholders: %f (file), %p (path), %w (work dir), %n (name)
 * - Executes with timeout
 * - For testing: stops on first failure
 * - For extraction: continues until success or all fail
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as fs from 'fs/promises';

const execAsync = promisify(exec);

/**
 * Placeholder replacements for EXAMINE commands
 */
export interface ExaminePlaceholders {
  /** %f - Full file path */
  filepath: string;
  /** %p - Parent directory path */
  parentDir?: string;
  /** %w - Work directory */
  workDir?: string;
  /** %n - File basename */
  basename?: string;
}

/**
 * Validation callback - called after each command execution
 * Return true to stop execution (success), false to continue
 */
export type ExamineValidator = () => Promise<boolean>;

/**
 * Run EXAMINE commands with custom validation
 *
 * @param examineCommands Array of commands (EXAMINE, EXAMINE1, EXAMINE2, etc.)
 * @param placeholders Placeholder values for substitution
 * @param validator Optional validation callback after each command
 * @param stopOnFailure If true, stop on first failure (testing mode). If false, continue until success (extraction mode)
 * @param timeout Timeout in milliseconds (default: 60000 for testing, 30000 for extraction)
 * @returns true if any command succeeded, false if all failed
 */
export async function runExamineCommands(
  examineCommands: string[],
  placeholders: ExaminePlaceholders,
  validator?: ExamineValidator,
  stopOnFailure: boolean = false,
  timeout: number = 60000
): Promise<boolean> {
  if (examineCommands.length === 0) {
    return false;
  }

  let anySuccess = false;

  // Auto-fill placeholders if not provided
  const {
    filepath,
    parentDir = path.dirname(filepath),
    workDir = parentDir,
    basename = path.basename(filepath),
  } = placeholders;

  // Express.e runs EXAMINE, then EXAMINE1, EXAMINE2, etc.
  for (const examineCmd of examineCommands) {
    if (!examineCmd || examineCmd.trim().length === 0) {
      continue;
    }

    try {
      // Replace placeholders in command
      const command = examineCmd
        .replace(/%f/g, filepath)
        .replace(/%p/g, parentDir)
        .replace(/%w/g, workDir)
        .replace(/%n/g, basename);

      console.log(`[EXAMINE] Running: ${command}`);
      await execAsync(command, { timeout });

      // Run custom validation if provided
      if (validator) {
        const isValid = await validator();
        if (isValid) {
          console.log(`[EXAMINE] Validation succeeded`);
          return true; // Success!
        }
      } else {
        // No validator means command success = overall success
        anySuccess = true;
      }
    } catch (error: any) {
      console.error(`[EXAMINE] Command failed: ${examineCmd}, error: ${error.message}`);

      if (stopOnFailure) {
        // Testing mode: stop on first failure (express.e behavior)
        return false;
      }
      // Extraction mode: continue to next command
    }
  }

  return anySuccess;
}

/**
 * Helper: Check if a file exists
 */
export async function fileExists(filepath: string): Promise<boolean> {
  try {
    await fs.access(filepath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Run EXAMINE commands for FILE_ID.DIZ extraction
 * Continues until FILE_ID.DIZ is extracted or all commands fail
 *
 * @param uploadedFilePath Path to uploaded file
 * @param nodeWorkDir Work directory for extraction
 * @param examineCommands Array of EXAMINE commands
 * @returns true if FILE_ID.DIZ was extracted
 */
export async function runExamineCommandsForDiz(
  uploadedFilePath: string,
  nodeWorkDir: string,
  examineCommands: string[]
): Promise<boolean> {
  // Ensure work directory exists
  await fs.mkdir(nodeWorkDir, { recursive: true });

  const dizPath = path.join(nodeWorkDir, 'FILE_ID.DIZ');

  // Validator: check if FILE_ID.DIZ was extracted
  const validator: ExamineValidator = async () => {
    const exists = await fileExists(dizPath);
    if (exists) {
      console.log(`[FILE_ID.DIZ] Successfully extracted to ${dizPath}`);
    }
    return exists;
  };

  return runExamineCommands(
    examineCommands,
    {
      filepath: uploadedFilePath,
      workDir: nodeWorkDir,
    },
    validator,
    false, // Don't stop on failure - continue until success
    30000 // 30 second timeout for extraction
  );
}

/**
 * Run EXAMINE commands for file testing (virus scan, validation, etc.)
 * Stops on first failure (express.e behavior)
 *
 * @param filepath Path to file being tested
 * @param examineCommands Array of EXAMINE commands
 * @returns true if all commands succeeded, false if any failed
 */
export async function runExamineCommandsForTesting(
  filepath: string,
  examineCommands: string[]
): Promise<boolean> {
  if (examineCommands.length === 0) {
    return true; // No tests = success
  }

  return runExamineCommands(
    examineCommands,
    { filepath },
    undefined, // No validator - command success = test success
    true, // Stop on first failure
    60000 // 60 second timeout for virus scans
  );
}
