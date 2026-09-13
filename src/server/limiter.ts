/**
 * Thrown when an upload exceeds its size budget. Callers match on the class
 * rather than the message: the old code compared the *string* `'limit'`
 * against an `Error` instance, so oversized uploads always reported 500
 * instead of 413.
 */
export class LimitExceededError extends Error {
  constructor(readonly limit: number) {
    super('limit');
    this.name = 'LimitExceededError';
  }
}

/**
 * Passes bytes through, failing the stream once more than `limit` bytes have
 * been seen.
 */
export function limitStream(
  limit: number
): TransformStream<Uint8Array, Uint8Array> {
  let length = 0;
  return new TransformStream({
    transform(chunk, controller) {
      length += chunk.length;
      controller.enqueue(chunk);
      if (length > limit) {
        throw new LimitExceededError(limit);
      }
    }
  });
}

export function isLimitExceeded(e: unknown): boolean {
  return e instanceof LimitExceededError || (e as Error)?.message === 'limit';
}
