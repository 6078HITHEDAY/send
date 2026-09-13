/** The Redis hash for a file, normalised into typed fields. */
export class Metadata {
  readonly dl: number;
  readonly dlimit: number;
  readonly pwd: boolean;
  readonly owner: string;
  readonly metadata: string;
  readonly auth: string;
  readonly nonce: string;

  constructor(obj: Record<string, string>) {
    this.dl = +(obj.dl as string) || 0;
    this.dlimit = +(obj.dlimit as string) || 1;
    this.pwd = String(obj.pwd) === 'true';
    this.owner = obj.owner as string;
    this.metadata = obj.metadata as string;
    this.auth = obj.auth as string;
    this.nonce = obj.nonce as string;
  }
}

export default Metadata;
