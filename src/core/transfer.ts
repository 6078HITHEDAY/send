export type TransferEventName =
  | 'progress'
  | 'encrypting'
  | 'decrypting'
  | 'complete';

/**
 * Replaces Nanobus. The crypto core is imperative and fires progress events at
 * a high rate, so consumers subscribe directly rather than going through React.
 */
export abstract class TransferEmitter extends EventTarget {
  /** Fluent message id describing the current step. */
  msg = '';
  /** `[done, total]` */
  progress: [number, number] = [0, 1];

  protected emit(name: TransferEventName) {
    this.dispatchEvent(new Event(name));
  }

  /** @returns an unsubscribe function */
  on(name: TransferEventName, listener: () => void): () => void {
    this.addEventListener(name, listener);
    return () => this.removeEventListener(name, listener);
  }

  get progressRatio(): number {
    return this.progress[0] / this.progress[1];
  }

  abstract get progressIndefinite(): boolean;

  abstract cancel(): void;
}
