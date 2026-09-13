import { useState } from 'react';
import type { ArchiveManifest } from '../../core/keychain.ts';
import { useTranslate } from '../i18n/context.tsx';
import { FileEntry } from './FileEntry.tsx';

/** The collapsible file list, only shown for multi-file archives. */
export function ArchiveDetails({
  manifest,
  defaultOpen = false
}: {
  manifest: ArchiveManifest | Record<string, never> | undefined;
  defaultOpen?: boolean;
}) {
  const translate = useTranslate();
  const [open, setOpen] = useState(defaultOpen);
  const files = (manifest as ArchiveManifest | undefined)?.files;

  if (!files || files.length <= 1) {
    return null;
  }

  return (
    <details
      className="w-full pb-1"
      open={open}
      onToggle={event => setOpen((event.currentTarget as HTMLDetailsElement).open)}
    >
      <summary className="flex items-center link-primary text-sm cursor-pointer outline-none">
        <svg
          className="fill-current w-4 h-4 mr-1"
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
        >
          <path d="M12.95 10.707l.707-.707L8 4.343 6.586 5.757 10.828 10l-4.242 4.243L8 15.657l4.95-4.95z" />
        </svg>
        {translate('fileCount', { num: files.length })}
      </summary>
      <ul>
        {files.map(file => (
          <li key={`${file.name}-${file.size}`}>
            <FileEntry file={file} />
          </li>
        ))}
      </ul>
    </details>
  );
}
