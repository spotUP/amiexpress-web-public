declare module 'express' {
  import * as http from 'http';

  export interface Request extends http.IncomingMessage {
    body: any;
    params: any;
    query: any;
    headers: any;
    method: string;
    url: string;
    path: string;
    file?: any; // For multer
    files?: any; // For multer
    user?: any;
    session?: any;
  }

  export interface Response extends http.ServerResponse {
    status(code: number): Response;
    json(data: any): void;
    send(data: any): void;
    sendFile(path: string): void;
    redirect(url: string): void;
    setHeader(name: string, value: string): void;
  }

  export interface NextFunction {
    (err?: any): void;
  }

  export interface RequestHandler {
    (req: Request, res: Response, next: NextFunction): void | Promise<void>;
  }

  export interface Application extends Function {
    (req: http.IncomingMessage, res: http.ServerResponse): void;
    use(...handlers: any[]): Application;
    get(path: string, ...handlers: RequestHandler[]): Application;
    post(path: string, ...handlers: RequestHandler[]): Application;
    put(path: string, ...handlers: RequestHandler[]): Application;
    delete(path: string, ...handlers: RequestHandler[]): Application;
    listen(port: number, callback?: () => void): http.Server;
    set(name: string, value: any): Application;
  }

  export interface Express {
    (): Application;
    json(options?: any): any;
    urlencoded(options?: any): any;
    static(path: string, options?: any): any;
    Router(options?: any): any;
  }

  const express: Express;
  export default express;
}

declare module 'multer' {
  export interface File {
    fieldname: string;
    originalname: string;
    encoding: string;
    mimetype: string;
    size: number;
    destination: string;
    filename: string;
    path: string;
    buffer: Buffer;
  }

  export interface StorageEngine {
    _handleFile(req: any, file: any, cb: (error?: any, info?: any) => void): void;
    _removeFile(req: any, file: any, cb: (error?: any) => void): void;
  }

  export interface Options {
    dest?: string;
    storage?: StorageEngine;
    limits?: {
      fileSize?: number;
    };
  }

  export interface Multer {
    single(fieldname: string): any;
    array(fieldname: string, maxCount?: number): any;
    fields(fields: Array<{ name: string; maxCount?: number }>): any;
    any(): any;
    diskStorage(options: {
      destination?: string | ((req: any, file: any, cb: (error: any, destination: string) => void) => void);
      filename?: (req: any, file: any, cb: (error: any, filename: string) => void) => void;
    }): StorageEngine;
  }

  interface MulterConstructor extends Multer {
    (options?: Options): Multer;
    diskStorage(options: {
      destination?: string | ((req: any, file: any, cb: (error: any, destination: string) => void) => void);
      filename?: (req: any, file: any, cb: (error: any, filename: string) => void) => void;
    }): StorageEngine;
  }

  const multer: MulterConstructor;
  export default multer;
}
