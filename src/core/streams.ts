export interface StreamTransformer<I = Uint8Array, O = Uint8Array> {
  start?(controller: TransformStreamDefaultController<O>): unknown;
  transform(chunk: I, controller: TransformStreamDefaultController<O>): unknown;
  flush?(controller: TransformStreamDefaultController<O>): unknown;
}

/**
 * Wraps `pipeThrough(new TransformStream(...))`. The optional `oncancel`
 * callback is what the service worker uses to abort the upstream download when
 * the browser cancels the response body.
 */
export function transformStream<I, O>(
  readable: ReadableStream<I>,
  transformer: StreamTransformer<I, O>,
  oncancel?: (reason?: unknown) => void
): ReadableStream<O> {
  const transform = new TransformStream<I, O>(
    transformer as Transformer<I, O>
  );
  if (!oncancel) {
    return readable.pipeThrough(transform);
  }
  // Own the reader so we can observe cancel; pipeThrough alone would not call
  // back into the download's abort path.
  const reader = readable.getReader();
  const cancelable = new ReadableStream<I>({
    async pull(controller) {
      const { done, value } = await reader.read();
      if (done) {
        controller.close();
        return;
      }
      controller.enqueue(value);
    },
    cancel(reason) {
      reader.cancel(reason);
      oncancel(reason);
    }
  });
  return cancelable.pipeThrough(transform);
}

class BlobStreamController implements UnderlyingDefaultSource<Uint8Array> {
  private index = 0;
  private readonly chunkSize: number;

  constructor(
    private readonly blob: Blob,
    size?: number
  ) {
    this.chunkSize = size || 1024 * 64;
  }

  async pull(controller: ReadableStreamDefaultController<Uint8Array>) {
    const bytesLeft = this.blob.size - this.index;
    if (bytesLeft <= 0) {
      controller.close();
      return;
    }
    const size = Math.min(this.chunkSize, bytesLeft);
    const slice = this.blob.slice(this.index, this.index + size);
    this.index += size;
    controller.enqueue(new Uint8Array(await slice.arrayBuffer()));
  }
}

export function blobStream(
  blob: Blob,
  size?: number
): ReadableStream<Uint8Array> {
  return new ReadableStream(new BlobStreamController(blob, size));
}

class ConcatStreamController implements UnderlyingDefaultSource<Uint8Array> {
  private index = 0;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;

  constructor(private readonly streams: ReadableStream<Uint8Array>[]) {
    this.nextReader();
  }

  private nextReader() {
    const next = this.streams[this.index++];
    this.reader = next ? next.getReader() : null;
  }

  async pull(
    controller: ReadableStreamDefaultController<Uint8Array>
  ): Promise<void> {
    if (!this.reader) {
      controller.close();
      return;
    }
    const data = await this.reader.read();
    if (data.done) {
      this.nextReader();
      return this.pull(controller);
    }
    controller.enqueue(data.value);
  }
}

export function concatStream(
  streams: ReadableStream<Uint8Array>[]
): ReadableStream<Uint8Array> {
  return new ReadableStream(new ConcatStreamController(streams));
}

/**
 * Wraps a stream so that every chunk passing through is reported, and a
 * cancellation of the wrapped stream propagates to `oncancel`. Used by the
 * service worker to track download progress.
 */
export function observeStream(
  readable: ReadableStream<Uint8Array>,
  onchunk: (chunk: Uint8Array) => void,
  oncancel?: (reason: unknown) => void
): ReadableStream<Uint8Array> {
  const reader = readable.getReader();
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const data = await reader.read();
      if (data.done) {
        controller.close();
        return;
      }
      onchunk(data.value);
      controller.enqueue(data.value);
    },
    cancel(reason) {
      reader.cancel(reason);
      oncancel?.(reason);
    }
  });
}

export async function streamToArrayBuffer(
  stream: ReadableStream<Uint8Array>,
  size?: number
): Promise<ArrayBuffer> {
  const reader = stream.getReader();
  let state = await reader.read();

  if (size) {
    const result = new Uint8Array(size);
    let offset = 0;
    while (!state.done) {
      result.set(state.value, offset);
      offset += state.value.length;
      state = await reader.read();
    }
    return result.buffer as ArrayBuffer;
  }

  const parts: Uint8Array[] = [];
  let len = 0;
  while (!state.done) {
    parts.push(state.value);
    len += state.value.length;
    state = await reader.read();
  }
  let offset = 0;
  const result = new Uint8Array(len);
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result.buffer as ArrayBuffer;
}
