import { describe, expect, test } from 'bun:test';
import {
  isLimitExceeded,
  LimitExceededError,
  limitStream
} from '../../src/server/limiter.ts';

async function readAll(
  stream: ReadableStream<Uint8Array>
): Promise<{ total: number; error?: unknown }> {
  const reader = stream.getReader();
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return { total };
      total += value.byteLength;
    }
  } catch (error) {
    return { total, error };
  }
}

describe('limitStream', () => {
  test('passes through bytes under the limit', async () => {
    const source = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(100));
        controller.enqueue(new Uint8Array(100));
        controller.close();
      }
    });
    const { total, error } = await readAll(
      source.pipeThrough(limitStream(250))
    );
    expect(error).toBeUndefined();
    expect(total).toBe(200);
  });

  test('errors with LimitExceededError once the limit is crossed', async () => {
    const source = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(100));
        controller.enqueue(new Uint8Array(100));
        controller.close();
      }
    });
    const { error } = await readAll(source.pipeThrough(limitStream(150)));
    expect(isLimitExceeded(error)).toBe(true);
    expect(error).toBeInstanceOf(LimitExceededError);
  });
});
