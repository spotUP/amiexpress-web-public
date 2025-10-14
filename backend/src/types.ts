export interface User {
  id: string;
  username: string;
  useRealName: boolean;
  realname: string;
  expert?: string; // "Y" or "N" - mirrors AmiExpress expert mode
  lastLogin?: Date; // For "N" command - new files since last login
  uploads?: number; // Number of files uploaded
  bytesUpload?: number; // Total bytes uploaded
  downloads?: number; // Number of files downloaded
  bytesDownload?: number; // Total bytes downloaded
  secLevel?: number; // Security level (mirrors AmiExpress secStatus)
  // Add other properties as needed based on the project
}