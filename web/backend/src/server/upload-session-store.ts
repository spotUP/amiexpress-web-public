import { UploadSessionContext } from '../index';

const uploadSessionMap = new Map<string, UploadSessionContext>();

export function storeUploadContext(sessionId: string, context: UploadSessionContext): void {
  uploadSessionMap.set(sessionId, context);
}

export function getUploadContextById(sessionId: string): UploadSessionContext | undefined {
  return uploadSessionMap.get(sessionId);
}

export function deleteUploadContextById(sessionId: string): void {
  uploadSessionMap.delete(sessionId);
}
