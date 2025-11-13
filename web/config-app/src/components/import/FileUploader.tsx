/**
 * File Uploader Component
 *
 * Handles archive file upload for BBS import.
 * Supports LHA, LZX, ZIP, TAR formats.
 */

import { useState, useRef } from 'react';

interface FileUploaderProps {
  onFileUploaded: (sessionId: string) => void;
}

export function FileUploader({ onFileUploaded }: FileUploaderProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
    }
  };

  const handleFile = async (file: File) => {
    // Validate file type
    const validExtensions = ['.lha', '.lzx', '.zip', '.tar', '.gz', '.tgz'];
    const extension = file.name.toLowerCase().substring(file.name.lastIndexOf('.'));

    if (!validExtensions.includes(extension)) {
      setError(`Invalid file type. Supported: ${validExtensions.join(', ')}`);
      return;
    }

    // Validate file size (100MB limit)
    if (file.size > 100 * 1024 * 1024) {
      setError('File too large. Maximum size: 100MB');
      return;
    }

    setUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('archive', file);

      const response = await fetch('/api/import/upload', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
        body: formData,
      });

      if (response.ok) {
        const data = await response.json();
        onFileUploaded(data.sessionId);
      } else {
        const errorData = await response.json();
        setError(errorData.message || 'Upload failed');
      }
    } catch (err: any) {
      setError(`Upload error: ${err.message}`);
    } finally {
      setUploading(false);
    }
  };

  const onButtonClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="file-uploader">
      <h2>Upload BBS Archive</h2>
      <p>Select an Amiga BBS archive file to import</p>

      <div
        className={`upload-area ${dragActive ? 'drag-active' : ''}`}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".lha,.lzx,.zip,.tar,.gz,.tgz"
          onChange={handleChange}
          style={{ display: 'none' }}
          disabled={uploading}
        />

        {uploading ? (
          <div className="uploading">
            <div className="spinner"></div>
            <p>Uploading...</p>
          </div>
        ) : (
          <>
            <div className="upload-icon">📦</div>
            <p className="upload-text">
              Drag and drop archive file here<br />
              or
            </p>
            <button onClick={onButtonClick} className="btn-primary">
              Choose File
            </button>
            <p className="upload-hint">
              Supported formats: LHA, LZX, ZIP, TAR (max 100MB)
            </p>
          </>
        )}
      </div>

      {error && (
        <div className="error-message">
          {error}
        </div>
      )}
    </div>
  );
}
