import { useRef, useState } from 'react';
import { bytes } from '../../../core/utils.ts';
import { sprite } from '../../assets.ts';
import { LIMITS, WEB_UI } from '../../globals.ts';
import { useTranslate } from '../../i18n/context.tsx';
import { useStore } from '../../store.ts';
import { Notice } from '../Notice.tsx';

/** The drop zone shown when no files have been staged yet. */
export function EmptyUploadArea() {
  const translate = useTranslate();
  const user = useStore(s => s.user);
  const capabilities = useStore(s => s.capabilities);
  const addFiles = useStore(s => s.addFiles);
  const signupCta = useStore(s => s.signupCta);
  const inputRef = useRef<HTMLInputElement>(null);
  const [labelFocused, setLabelFocused] = useState(false);

  return (
    <section
      className="flex flex-col items-center justify-center border-2 border-dashed border-grey-transparent rounded-default px-6 py-16 h-full w-full dark:border-grey-60"
      onClick={event => {
        if ((event.target as HTMLElement).tagName !== 'LABEL') {
          inputRef.current?.click();
        }
      }}
      onKeyDown={event => {
        if (event.key === 'Enter') {
          inputRef.current?.click();
        }
      }}
    >
      <svg className="w-10 h-10 link-primary">
        <use xlinkHref={sprite('addfiles.svg', 'plus')} />
      </svg>
      <div className="pt-6 pb-2 text-center text-lg font-bold tracking-wide">
        {translate('dragAndDropFiles')}
      </div>
      <div className="pb-6 text-center text-base">
        {translate('orClickWithSize', { size: bytes(user.maxSize) })}
      </div>
      <input
        id="file-upload"
        ref={inputRef}
        className="opacity-0 w-0 h-0 appearance-none absolute overflow-hidden"
        type="file"
        multiple
        onFocus={() => setLabelFocused(true)}
        onBlur={() => setLabelFocused(false)}
        onClick={event => event.stopPropagation()}
        onChange={event => {
          addFiles(Array.from(event.target.files ?? []));
          event.target.value = '';
        }}
      />
      <label
        htmlFor="file-upload"
        className={`btn rounded-lg flex items-center mt-4 ${
          labelFocused ? 'bg-primary outline' : ''
        }`}
        title={translate('addFilesButton', { size: bytes(user.maxSize) })}
      >
        {translate('addFilesButton')}
      </label>
      {!user.loggedIn && capabilities.account && (
        <button
          type="button"
          className="center font-medium text-sm link-primary mt-4 mb-2"
          onClick={event => {
            event.stopPropagation();
            signupCta('drop');
          }}
        >
          {translate('signInSizeBump', {
            size: bytes(LIMITS.MAX_FILE_SIZE)
          })}
        </button>
      )}
      <Notice html={WEB_UI.UPLOAD_AREA_NOTICE_HTML} className="mt-8" />
    </section>
  );
}
