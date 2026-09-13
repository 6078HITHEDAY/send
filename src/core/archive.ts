import type { ArchiveManifest } from './keychain';
import { blobStream, concatStream } from './streams';

function isDupe(newFile: File, array: File[]): boolean {
  for (const file of array) {
    if (
      newFile.name === file.name &&
      newFile.size === file.size &&
      newFile.lastModified === file.lastModified
    ) {
      return true;
    }
  }
  return false;
}

export default class Archive {
  files: File[];
  timeLimit: number;
  dlimit: number;
  password: string | null = null;

  constructor(
    files: File[] = [],
    private readonly defaultTimeLimit = 86400,
    private readonly defaultDownloadLimit = 1
  ) {
    this.files = Array.from(files);
    this.timeLimit = defaultTimeLimit;
    this.dlimit = defaultDownloadLimit;
  }

  get name(): string {
    return this.files.length > 1
      ? 'Send-Archive.zip'
      : ((this.files[0]?.name as string) ?? '');
  }

  get type(): string {
    return this.files.length > 1
      ? 'send-archive'
      : ((this.files[0]?.type as string) ?? '');
  }

  get size(): number {
    return this.files.reduce((total, file) => total + file.size, 0);
  }

  get numFiles(): number {
    return this.files.length;
  }

  get manifest(): ArchiveManifest {
    return {
      files: this.files.map(file => ({
        name: file.name,
        size: file.size,
        type: file.type
      }))
    };
  }

  get stream(): ReadableStream<Uint8Array> {
    return concatStream(this.files.map(file => blobStream(file)));
  }

  /** @throws a Fluent message id (`tooManyFiles` / `fileTooBig`) */
  addFiles(files: File[], maxSize: number, maxFiles: number): boolean {
    if (this.files.length + files.length > maxFiles) {
      throw new Error('tooManyFiles');
    }
    const newFiles = files.filter(
      file => file.size > 0 && !isDupe(file, this.files)
    );
    const newSize = newFiles.reduce((total, file) => total + file.size, 0);
    if (this.size + newSize > maxSize) {
      throw new Error('fileTooBig');
    }
    this.files = this.files.concat(newFiles);
    return true;
  }

  remove(file: File) {
    const index = this.files.indexOf(file);
    if (index > -1) {
      this.files.splice(index, 1);
    }
  }

  clear() {
    this.files = [];
    this.dlimit = this.defaultDownloadLimit;
    this.timeLimit = this.defaultTimeLimit;
    this.password = null;
  }
}
