/**
 * Background File Checking Utilities
 * 1:1 port from AmiExpress express.e:18474-19650
 *
 * In the original AmiExpress (Amiga OS):
 * - doBgCheck() runs file checking in background via message ports
 * - This was necessary because Amiga had slow disk I/O and limited multitasking
 * - Users shouldn't wait for virus scanning, FILE_ID.DIZ extraction, etc.
 *
 * In our modern implementation:
 * - We use async/await which provides non-blocking operations
 * - File operations are fast enough to complete during upload
 * - We already perform all checks synchronously in the upload handler:
 *   1. FILE_ID.DIZ extraction (file-diz.util.ts)
 *   2. File integrity testing (file-test.util.ts)
 *   3. Moving to HOLD on failure (file-hold.util.ts)
 *
 * This utility provides a framework for true background processing if needed
 * in the future (e.g., for expensive virus scanning, large file processing, etc.)
 */

import { extractAndReadDiz } from './file-diz.util';
import { testFile, TestResult } from './file-test.util';
import { moveUploadedFile } from './file-hold.util';

/**
 * Background check task
 */
interface BackgroundCheckTask {
  taskId: string;
  filename: string;
  filepath: string;
  conferenceId: number;
  userId: number;
  status: 'pending' | 'running' | 'completed' | 'failed';
  result?: BackgroundCheckResult;
}

/**
 * Background check result
 */
interface BackgroundCheckResult {
  dizExtracted: boolean;
  dizContent?: string[];
  testStatus: TestResult;
  finalStatus: 'active' | 'hold' | 'lcfiles' | 'private';
  error?: string;
}

/**
 * Background check queue
 * Express.e uses Amiga message ports for async processing
 * We use a simple in-memory queue with async processing
 */
class BackgroundCheckQueue {
  private queue: BackgroundCheckTask[] = [];
  private processing: boolean = false;

  /**
   * Add file to background check queue
   * Express.e:16825 - doBgCheck() called after upload
   *
   * @param task Background check task
   */
  async enqueue(task: BackgroundCheckTask): Promise<void> {
    console.log(`[BgCheck] Enqueued: ${task.filename}`);
    this.queue.push(task);

    // Start processing if not already running
    if (!this.processing) {
      this.processQueue();
    }
  }

  /**
   * Process background check queue
   * Express.e:18474-19650 - PROC doBgCheck()
   */
  private async processQueue(): Promise<void> {
    if (this.processing) return;
    this.processing = true;

    while (this.queue.length > 0) {
      const task = this.queue.shift();
      if (!task) continue;

      task.status = 'running';
      console.log(`[BgCheck] Processing: ${task.filename}`);

      try {
        const result = await this.performBackgroundCheck(task);
        task.result = result;
        task.status = 'completed';
        console.log(`[BgCheck] Completed: ${task.filename}, status: ${result.finalStatus}`);
      } catch (error: any) {
        task.status = 'failed';
        task.result = {
          dizExtracted: false,
          testStatus: TestResult.FAILURE,
          finalStatus: 'hold',
          error: error.message
        };
        console.error(`[BgCheck] Failed: ${task.filename}, error: ${error.message}`);
      }
    }

    this.processing = false;
  }

  /**
   * Perform background check on uploaded file
   * Express.e:19567-19650 - Background check implementation
   *
   * @param task Background check task
   * @returns Check result
   */
  private async performBackgroundCheck(task: BackgroundCheckTask): Promise<BackgroundCheckResult> {
    const result: BackgroundCheckResult = {
      dizExtracted: false,
      testStatus: TestResult.NOT_TESTED,
      finalStatus: 'active'
    };

    // 1. Extract FILE_ID.DIZ (express.e:19578-19594)
    try {
      const nodeWorkDir = `/tmp/bbs-bg-check-${task.taskId}`;
      const dizLines = await extractAndReadDiz(task.filepath, nodeWorkDir, [], 10);

      if (dizLines && dizLines.length > 0) {
        result.dizExtracted = true;
        result.dizContent = dizLines;
        console.log(`[BgCheck] Extracted FILE_ID.DIZ for ${task.filename}`);
      }
    } catch (error: any) {
      console.log(`[BgCheck] No FILE_ID.DIZ for ${task.filename}`);
    }

    // 2. Test file integrity (express.e:19609-19610)
    try {
      const nodeWorkDir = `/tmp/bbs-bg-check-${task.taskId}`;
      result.testStatus = await testFile(task.filepath, nodeWorkDir);
      console.log(`[BgCheck] Test result for ${task.filename}: ${result.testStatus}`);
    } catch (error: any) {
      result.testStatus = TestResult.FAILURE;
      console.error(`[BgCheck] Test error for ${task.filename}: ${error.message}`);
    }

    // 3. Determine final status (express.e:19614-19636)
    if (result.testStatus === TestResult.FAILURE) {
      result.finalStatus = 'hold';  // Move to HOLD for review
    } else if (result.testStatus === TestResult.SUCCESS) {
      result.finalStatus = 'active';  // Normal upload
    } else {
      result.finalStatus = 'active';  // Not tested but allow
    }

    return result;
  }

  /**
   * Get queue status
   */
  getStatus(): { pending: number; processing: boolean } {
    return {
      pending: this.queue.length,
      processing: this.processing
    };
  }
}

/**
 * Global background check queue instance
 * Express.e uses global bgChecking flag
 */
export const bgCheckQueue = new BackgroundCheckQueue();

/**
 * Enqueue file for background checking
 * Express.e:16825 - doBgCheck()
 *
 * Note: In our current implementation, we do all checking synchronously
 * during upload. This function is provided for future use if we want
 * to defer expensive operations (e.g., large file virus scanning).
 *
 * @param filename Uploaded filename
 * @param filepath Full path to uploaded file
 * @param conferenceId Conference ID
 * @param userId User ID
 */
export async function doBgCheck(
  filename: string,
  filepath: string,
  conferenceId: number,
  userId: number
): Promise<void> {
  const task: BackgroundCheckTask = {
    taskId: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    filename,
    filepath,
    conferenceId,
    userId,
    status: 'pending'
  };

  await bgCheckQueue.enqueue(task);
}

/**
 * Get background check queue status
 */
export function getBgCheckStatus(): { pending: number; processing: boolean } {
  return bgCheckQueue.getStatus();
}

/**
 * Implementation Notes:
 *
 * Express.e doBgCheck() flow:
 * 1. Called after file upload completes (zmuploadcompleted)
 * 2. Runs in background via Amiga message ports
 * 3. Extracts FILE_ID.DIZ
 * 4. Runs EXAMINE commands (virus scan, etc.)
 * 5. Tests file integrity
 * 6. Moves to HOLD if failed
 * 7. Updates DIR files
 *
 * Our implementation:
 * 1. All operations already done synchronously in upload handler
 * 2. Modern async/await provides non-blocking behavior
 * 3. File operations fast enough for real-time processing
 * 4. Background queue available for future expensive operations
 *
 * Migration path (if needed):
 * - Move file testing to background for large files
 * - Defer virus scanning to background
 * - Process multiple uploads in parallel
 * - Implement progress notifications
 */
