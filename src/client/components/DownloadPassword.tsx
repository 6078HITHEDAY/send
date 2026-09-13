import { useEffect, useRef, useState } from 'react';
import type { FileInfo } from '../../core/fileReceiver.ts';
import { useTranslate } from '../i18n/context.tsx';
import { useStore } from '../store.ts';

/**
 * A controlled form. The old version toggled the red border classes directly on
 * the DOM nodes and guarded its `focus()` with an `instanceof String` check
 * against the server render, neither of which is needed now.
 */
export function DownloadPassword({ fileInfo }: { fileInfo: FileInfo }) {
  const translate = useTranslate();
  const getMetadata = useStore(s => s.getMetadata);
  const inputRef = useRef<HTMLInputElement>(null);
  const [password, setPassword] = useState('');
  // `password === null` is how the receiver reports a rejected password.
  const [invalid, setInvalid] = useState(fileInfo.password === null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (fileInfo.password === null) {
      setInvalid(true);
      setSubmitting(false);
    }
  }, [fileInfo.password]);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (password.length === 0 || submitting) {
      return;
    }
    setSubmitting(true);
    // Strip any query string sitting between the id and the fragment: the
    // password key is derived from the URL, and it must match what the uploader
    // used.
    fileInfo.url = window.location.href.replace(/\?.+#/, '#');
    fileInfo.password = password;
    getMetadata();
  }

  return (
    <div className="h-full w-full flex flex-col items-center justify-center bg-white py-8 max-w-md mx-auto dark:bg-grey-90">
      <h1 className="text-3xl font-bold mb-4">{translate('downloadTitle')}</h1>
      <p className="w-full mb-4 text-center text-grey-80 dark:text-grey-40 leading-normal">
        {translate('downloadDescription')}
      </p>
      <form
        className="flex flex-row flex-nowrap w-full md:w-4/5"
        onSubmit={submit}
        data-no-csrf
      >
        {/* Keeps password managers from filling the real field. */}
        <input
          id="autocomplete-decoy"
          className="hidden"
          type="password"
          defaultValue="lol"
        />
        <input
          id="password-input"
          ref={inputRef}
          className={`w-full border-l border-t border-b rounded-l-lg rounded-r-none ${
            invalid ? 'border-red dark:border-red-40' : 'border-grey'
          } leading-loose px-2 py-1 dark:bg-grey-80`}
          maxLength={4096}
          autoComplete="off"
          placeholder={translate('unlockInputPlaceholder')}
          type="password"
          value={password}
          onChange={event => {
            setPassword(event.target.value);
            setInvalid(false);
          }}
        />
        <input
          type="submit"
          id="password-btn"
          className={`btn rounded-r-lg rounded-l-none ${
            invalid ? 'bg-red hover:bg-red focus:bg-red dark:bg-red-40' : ''
          }`}
          value={translate('unlockButtonLabel')}
          title={translate('unlockButtonLabel')}
          disabled={submitting}
        />
      </form>
      <label
        id="password-error"
        className={`${
          invalid ? '' : 'invisible'
        } text-red dark:text-red-40 my-4`}
        htmlFor="password-input"
      >
        {translate('passwordTryAgain')}
      </label>
    </div>
  );
}
