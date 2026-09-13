import { useParams } from 'react-router-dom';
import { Modal } from '../components/Modal.tsx';
import { useTranslate } from '../i18n/context.tsx';
import { useStore } from '../store.ts';

const NEW_FIREFOX_URL =
  'https://www.mozilla.org/firefox/new/?utm_campaign=send-acquisition&utm_medium=referral&utm_source=send.firefox.com';
const UPDATE_FIREFOX_URL =
  'https://support.mozilla.org/kb/update-firefox-latest-version';
const FAQ_URL =
  'https://github.com/timvisee/send/blob/master/docs/faq.md#why-is-my-browser-not-supported';

export function Unsupported() {
  const translate = useTranslate();
  const { reason } = useParams<{ reason: string }>();
  const modal = useStore(s => s.modal);
  const outdated = reason === 'outdated';

  return (
    <main className="main">
      {modal && <Modal />}
      <section className="flex flex-col items-center justify-center text-center bg-white m-6 px-6 py-8 border-default border-grey-30 md:border-none md:px-12 md:py-16 shadow-default w-full md:h-full dark:bg-grey-90">
        <h1 className="text-3xl font-bold">
          {translate('notSupportedHeader')}
        </h1>
        <p className="mt-4 mb-8 max-w-md leading-normal">
          {translate(
            outdated ? 'notSupportedOutdatedDetail' : 'notSupportedDescription'
          )}
        </p>
        {!outdated && (
          <a className="text-primary" href={FAQ_URL}>
            {translate('notSupportedLink')}
          </a>
        )}
        <a
          href={outdated ? UPDATE_FIREFOX_URL : NEW_FIREFOX_URL}
          className="btn rounded-lg mt-8 px-8"
        >
          {translate(outdated ? 'updateFirefox' : 'downloadFirefox')}
        </a>
      </section>
    </main>
  );
}
