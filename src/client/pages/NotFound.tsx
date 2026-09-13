import { Modal } from '../components/Modal.tsx';
import { sprite } from '../assets.ts';
import { useTranslate } from '../i18n/context.tsx';
import { useStore } from '../store.ts';

export function NotFound() {
  const translate = useTranslate();
  const user = useStore(s => s.user);
  const modal = useStore(s => s.modal);
  const btnText = user.loggedIn ? 'okButton' : 'sendYourFilesLink';

  return (
    <main className="main">
      {modal && <Modal />}
      <section className="flex flex-col items-center justify-center h-full w-full p-6 md:p-8 overflow-hidden md:rounded-xl md:shadow-big">
        <h1 className="text-center text-3xl font-bold my-2">
          {translate('expiredTitle')}
        </h1>
        <svg className="text-primary my-12">
          <use xlinkHref={sprite('notFound.svg', 'svg124')} />
        </svg>
        <p
          className={`max-w-md text-center text-grey-80 leading-normal dark:text-grey-40 ${
            user.loggedIn ? 'hidden' : ''
          }`}
        >
          {translate('trySendDescription')}
        </p>
        <p className="my-5">
          <a href="/" className="btn rounded-lg flex items-center">
            {translate(btnText)}
          </a>
        </p>
      </section>
    </main>
  );
}
