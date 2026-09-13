import { useRef, useState } from 'react';
import { bytes } from '../../../core/utils.ts';
import { asset, sprite } from '../../assets.ts';
import { useTranslate } from '../../i18n/context.tsx';
import { useStore } from '../../store.ts';
import { ExpiryOptions } from '../ExpiryOptions.tsx';
import { FileEntry } from '../FileEntry.tsx';
import { UploadPassword } from '../UploadPassword.tsx';

/** The staged file list, shown once at least one file has been added. */
export function UploadWip() {
  const translate = useTranslate();
  const archive = useStore(s => s.archive);
  const addFiles = useStore(s => s.addFiles);
  const removeUpload = useStore(s => s.removeUpload);
  const upload = useStore(s => s.upload);
  const uploading = useStore(s => s.uploading);
  const listRef = useRef<HTMLUListElement>(null);
  const [labelFocused, setLabelFocused] = useState(false);

  const files = Array.from(archive.files).reverse();

  function add(event: React.ChangeEvent<HTMLInputElement>) {
    addFiles(Array.from(event.target.files ?? []));
    event.target.value = '';
    requestAnimationFrame(() => {
      listRef.current?.firstElementChild?.scrollIntoView({ block: 'center' });
    });
  }

  return (
    <div
      className="flex flex-col bg-white h-full w-full dark:bg-grey-90"
      id="wip"
    >
      <ul
        ref={listRef}
        className="flex-shrink bg-grey-10 rounded-t overflow-y-auto px-6 py-4 md:h-full md:max-h-half-screen dark:bg-black"
      >
        {files.map(file => (
          <li
            key={`${file.name}-${file.size}-${file.lastModified}`}
            className="bg-white px-2 my-2 shadow-light rounded-default dark:bg-grey-90 dark:border-default dark:border-grey-80"
          >
            <FileEntry
              file={file}
              action={
                <input
                  type="image"
                  className="self-center text-white ml-4 h-4 hover:opacity-75 focus:outline"
                  alt={translate('deleteButtonHover')}
                  title={translate('deleteButtonHover')}
                  src={asset('close-16.svg')}
                  onClick={() => removeUpload(file)}
                />
              }
            />
          </li>
        ))}
      </ul>
      <div className="flex-shrink-0 flex-grow flex items-end p-4 bg-grey-10 rounded-b mb-1 font-medium dark:bg-grey-90">
        <input
          id="file-upload"
          className="opacity-0 w-0 h-0 appearance-none absolute overflow-hidden"
          type="file"
          multiple
          onFocus={() => setLabelFocused(true)}
          onBlur={() => setLabelFocused(false)}
          onChange={add}
        />
        <div className="flex flex-row items-center justify-between w-full p-2">
          <label
            htmlFor="file-upload"
            className={`flex items-center cursor-pointer ${labelFocused ? 'outline' : ''}`}
            title={translate('addFilesButton')}
          >
            <svg className="w-6 h-6 mr-2 link-primary">
              <use xlinkHref={sprite('addfiles.svg', 'plus')} />
            </svg>
            {translate('addFilesButton')}
          </label>
          <div className="font-normal text-sm text-grey-70 dark:text-grey-40">
            {translate('totalSize', { size: bytes(archive.size) })}
          </div>
        </div>
      </div>
      <ExpiryOptions />
      <UploadPassword />
      <button
        type="button"
        id="upload-btn"
        className="btn rounded-lg flex-shrink-0 focus:outline"
        title={translate('uploadButton')}
        disabled={uploading}
        onClick={() => {
          window.scrollTo(0, 0);
          upload();
        }}
      >
        {translate('uploadButton')}
      </button>
    </div>
  );
}
