import { useTranslate } from '../../i18n/context.tsx';

export function ShareDialog({
  name,
  url,
  close
}: {
  name: string;
  url: string;
  close: () => void;
}) {
  const translate = useTranslate();

  async function share() {
    try {
      await navigator.share({
        title: translate('-send-brand'),
        text: translate('shareMessage', { name }),
        url
      });
    } catch (e) {
      if ((e as DOMException).name === 'AbortError') {
        return;
      }
      console.error(e);
    }
    close();
  }

  return (
    <div className="flex flex-col items-center text-center p-4 max-w-sm m-auto">
      <h1 className="text-3xl font-bold my-4">
        {translate('notifyUploadEncryptDone')}
      </h1>
      <p className="font-normal leading-normal text-grey-80 word-break-all dark:text-grey-40">
        {translate('shareLinkDescription')}
        <br />
        {name}
      </p>
      <input
        type="text"
        id="share-url"
        className="w-full my-4 border-default rounded-lg leading-loose h-12 px-2 py-1 dark:bg-grey-80"
        value={url}
        readOnly
      />
      <button
        type="button"
        className="btn rounded-lg w-full flex-shrink-0 focus:outline"
        onClick={share}
        title={translate('shareLinkButton')}
      >
        {translate('shareLinkButton')}
      </button>
      <button
        type="button"
        className="link-primary my-4 font-medium cursor-pointer focus:outline"
        onClick={close}
        title={translate('okButton')}
      >
        {translate('okButton')}
      </button>
    </div>
  );
}
