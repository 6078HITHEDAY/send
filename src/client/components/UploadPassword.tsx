import { useRef, useState } from 'react';
import { asset } from '../assets.ts';
import { useTranslate } from '../i18n/context.tsx';
import { useStore } from '../store.ts';

const MAX_LENGTH = 4096;

/**
 * Optional password for the upload. The old version toggled `invisible` classes
 * by hand and wrote straight into `archive.password`; the visibility is state
 * here, and the archive is still the source of truth for the value itself.
 */
export function UploadPassword() {
  const translate = useTranslate();
  const archive = useStore(s => s.archive);
  const touch = useStore(s => s.touch);
  const inputRef = useRef<HTMLInputElement>(null);
  const [enabled, setEnabled] = useState(archive.password !== null);
  const [revealed, setRevealed] = useState(false);
  const password = archive.password ?? '';

  function toggle(checked: boolean) {
    setEnabled(checked);
    if (checked) {
      inputRef.current?.focus();
    } else {
      archive.password = null;
      setRevealed(false);
      touch();
    }
  }

  const hidden = enabled ? '' : 'invisible';

  return (
    <div className="mb-2 px-1">
      {/* Keeps password managers from filling the real field. */}
      <input
        id="autocomplete-decoy"
        className="hidden"
        type="password"
        defaultValue="lol"
      />
      <div className="checkbox inline-block mr-3">
        <input
          id="add-password"
          type="checkbox"
          checked={enabled}
          autoComplete="off"
          onChange={event => toggle(event.target.checked)}
        />
        <label htmlFor="add-password">{translate('addPassword')}</label>
      </div>
      <div className="relative inline-block my-1">
        <input
          id="password-input"
          ref={inputRef}
          className={`${hidden} border-default rounded-default focus:border-primary leading-normal my-1 py-1 px-2 h-8 dark:bg-grey-80`}
          autoComplete="off"
          maxLength={MAX_LENGTH}
          type={revealed ? 'text' : 'password'}
          placeholder={translate('unlockInputPlaceholder')}
          value={password}
          onChange={event => {
            archive.password = event.target.value;
            touch();
          }}
        />
        <button
          id="password-preview-button"
          type="button"
          className={`${hidden} absolute top-0 right-0 w-8 h-8`}
          onClick={event => {
            event.preventDefault();
            setRevealed(!revealed);
            inputRef.current?.focus();
          }}
        >
          <img
            src={asset(revealed ? 'eye-off.svg' : 'eye.svg')}
            width="22"
            height="22"
            alt=""
            className="m-auto mt-2"
          />
        </button>
      </div>
      <label
        id="password-msg"
        htmlFor="password-input"
        className="block text-xs text-grey-70"
      >
        {password.length === MAX_LENGTH
          ? translate('maxPasswordLength', { length: MAX_LENGTH })
          : ''}
      </label>
    </div>
  );
}
