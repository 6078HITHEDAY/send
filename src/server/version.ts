import path from 'node:path';
import { DIST_DIR } from './assets';
import { createLogger } from './log';

export interface VersionInfo {
  version: string;
  commit: string;
  source: string;
}

export const VERSION_PATH = path.join(DIST_DIR, 'version.json');

const FALLBACK: VersionInfo = {
  version: 'unknown',
  commit: 'unknown',
  source: 'https://github.com/timvisee/send'
};

let version: VersionInfo = FALLBACK;

try {
  version = (await Bun.file(VERSION_PATH).json()) as VersionInfo;
} catch {
  createLogger('send.version').warn({
    message: 'dist/version.json missing; run bun run prebuild'
  });
}

export default version;
