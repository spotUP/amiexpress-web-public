import html2canvas from 'html2canvas';

export interface ScreenshotOptions {
  element: HTMLElement;
  filename?: string;
  doorName?: string;
  format?: 'png' | 'jpg';
  quality?: number;
}

/**
 * Capture an element as a screenshot and download it
 */
export async function captureScreenshot(options: ScreenshotOptions): Promise<string | null> {
  const {
    element,
    filename,
    doorName = 'door',
    format = 'png',
    quality = 0.95,
  } = options;

  try {
    const canvas = await html2canvas(element, {
      backgroundColor: '#1E1E1E',
      scale: 2, // High DPI
      logging: false,
      useCORS: true,
    });

    // Generate filename with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const finalFilename = filename || `${doorName}_${timestamp}.${format}`;

    // Convert canvas to blob
    const mimeType = format === 'png' ? 'image/png' : 'image/jpeg';
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, mimeType, quality);
    });

    if (!blob) {
      throw new Error('Failed to create image blob');
    }

    // Create download link
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = finalFilename;
    link.click();

    // Cleanup
    setTimeout(() => URL.revokeObjectURL(url), 100);

    return url;
  } catch (error) {
    console.error('Failed to capture screenshot:', error);
    return null;
  }
}

/**
 * Capture screenshot and return as data URL (for preview)
 */
export async function captureScreenshotPreview(element: HTMLElement): Promise<string | null> {
  try {
    const canvas = await html2canvas(element, {
      backgroundColor: '#1E1E1E',
      scale: 1,
      logging: false,
      useCORS: true,
    });

    return canvas.toDataURL('image/png');
  } catch (error) {
    console.error('Failed to capture screenshot preview:', error);
    return null;
  }
}
