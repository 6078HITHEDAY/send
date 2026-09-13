import type { ReactNode } from 'react';
import { bytes } from '../../core/utils.ts';
import { sprite } from '../assets.ts';

export interface NamedFile {
  name: string;
  size: number;
}

/** One row inside the archive's expanded file list. */
export function FileEntry({
  file,
  action
}: {
  file: NamedFile;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-row items-center p-3 w-full">
      <svg className="h-8 w-8 text-primary">
        <use xlinkHref={sprite('blue_file.svg', 'icon')} />
      </svg>
      <div className="ml-4 w-full">
        <h1 className="text-base font-medium word-break-all">{file.name}</h1>
        <div className="text-sm font-normal opacity-75 pt-1">
          {bytes(file.size)}
        </div>
      </div>
      {action}
    </div>
  );
}

/** The archive's own header row, shown above the details and progress. */
export function ArchiveInfo({
  archive,
  action
}: {
  archive: NamedFile;
  action?: ReactNode;
}) {
  return (
    <div className="w-full flex items-center">
      <svg className="h-8 w-6 mr-3 flex-shrink-0 text-primary">
        <use xlinkHref={sprite('blue_file.svg', 'icon')} />
      </svg>
      <div className="flex-grow">
        <h1 className="text-base font-medium word-break-all">{archive.name}</h1>
        <div className="text-sm font-normal opacity-75 pt-1">
          {bytes(archive.size)}
        </div>
      </div>
      {action}
    </div>
  );
}
