import { sprite } from '../assets.ts';
import { useTranslate } from '../i18n/context.tsx';
import { useStore } from '../store.ts';

export function DownloadCompleted() {
  const translate = useTranslate();
  const user = useStore(s => s.user);
  const btnText = user.loggedIn ? 'okButton' : 'sendYourFilesLink';

  return (
    <div
      id="download-complete"
      className="flex flex-col items-center justify-center h-full w-full bg-white p-2 dark:bg-grey-90"
    >
      <h1 className="text-center text-3xl font-bold my-2">
        {translate('downloadFinish')}
      </h1>
      <svg className="my-8 h-48 text-primary">
        <use xlinkHref={sprite('completed.svg', 'Page-1')} />
      </svg>
      <p
        className={`text-grey-80 leading-normal dark:text-grey-40 ${
          user.loggedIn ? 'hidden' : ''
        }`}
      >
        {translate('trySendDescription')}
      </p>
      <p className="my-5">
        <a href="/" className="btn rounded-lg flex items-center mt-4">
          {translate(btnText)}
        </a>
      </p>
    </div>
  );
}
