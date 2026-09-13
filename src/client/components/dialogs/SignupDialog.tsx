import { useState } from 'react';
import { bytes } from '../../../core/utils.ts';
import { asset } from '../../assets.ts';
import { LIMITS } from '../../globals.ts';
import { useTranslate } from '../../i18n/context.tsx';
import { useStore } from '../../store.ts';

/** Just a shape check; the server is the one that validates the address. */
function emailish(value: string): boolean {
  const parts = value.split('@');
  return parts.length === 2 && parts.every(part => part.length > 0);
}

export function SignupDialog({ close }: { close: () => void }) {
  const translate = useTranslate();
  const login = useStore(s => s.login);
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const days = Math.floor(LIMITS.MAX_EXPIRE_SECONDS / 86400);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (submitting) {
      return;
    }
    setSubmitting(true);
    login(emailish(email) ? email : undefined);
  }

  return (
    <div className="flex flex-col justify-center my-16 md:my-0 px-8 md:px-24 w-full h-full">
      <img src={asset('master-logo.svg')} alt="" className="h-16 mt-1 mb-4" />
      <section className="flex flex-col flex-shrink-0 self-center">
        <h1 className="text-3xl font-bold text-center">
          {translate('accountBenefitTitle')}
        </h1>
        <ul className="leading-normal list-disc text-grey-80 my-2 mt-4 pl-4 md:self-center dark:text-grey-40">
          <li>
            {translate('accountBenefitLargeFiles', {
              size: bytes(LIMITS.MAX_FILE_SIZE)
            })}
          </li>
          <li>{translate('accountBenefitDownloadCount')}</li>
          <li>{translate('accountBenefitTimeLimit', { count: days })}</li>
          <li>{translate('accountBenefitSync')}</li>
        </ul>
      </section>
      <section className="flex flex-col flex-grow m-4 md:self-center md:w-128">
        <form onSubmit={submit} data-no-csrf>
          {/* Hidden in the original too: sign-in does not need the address. */}
          <input
            id="email-input"
            type="email"
            className="hidden border-default rounded-lg w-full px-2 py-1 h-12 mb-3 text-lg text-grey-70 leading-loose dark:bg-grey-80 dark:text-white"
            placeholder={translate('emailPlaceholder')}
            value={email}
            onChange={event => setEmail(event.target.value)}
          />
          <input
            className="btn rounded-lg w-full flex flex-shrink-0 items-center justify-center"
            value={translate('signInOnlyButton')}
            title={translate('signInOnlyButton')}
            id="email-submit"
            type="submit"
          />
        </form>
        <button
          type="button"
          className="my-3 link-primary font-medium"
          title={translate('deletePopupCancel')}
          onClick={close}
        >
          {translate('deletePopupCancel')}
        </button>
      </section>
    </div>
  );
}
