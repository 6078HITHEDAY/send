/**
 * Blob backends deal in web streams so the same value can be piped straight
 * into a Hono `Response` or read from the upload WebSocket.
 */
export interface BlobStorage {
  length(id: string): Promise<number>;
  getStream(id: string): Promise<ReadableStream<Uint8Array>>;
  set(id: string, stream: ReadableStream<Uint8Array>): Promise<void>;
  del(id: string): Promise<void>;
  ping(): Promise<unknown>;
}
