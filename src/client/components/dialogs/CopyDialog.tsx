import { useState } from 'react';
import { copyToClipboard } from '../../clipboard.ts';
import { useTranslate } from '../../i18n/context.tsx';
import { QrCode } from '../QrCode.tsx';

export function CopyDialog({
  name,
  url,
  close
}: {
  name: string;
  url: string;
  close: () => void;
}) {
  const translate = useTranslate();
  const [showQr, setShowQr] = useState(false);
  const [copied, setCopied] = useState(false);

  async function copy() {
    await copyToClipboard(url);
    setCopied(true);
    setTimeout(close, 1000);
  }

  return (
    <div className="flex flex-col items-center text-center p-4 max-w-sm m-auto">
      <h1 className="text-3xl font-bold my-4">
        {translate('notifyUploadEncryptDone')}
      </h1>
      <p className="font-normal leading-normal text-grey-80 word-break-all dark:text-grey-40">
        {translate('copyLinkDescription')} <br />
        {name}
      </p>
      <div className="flex flex-row items-center justify-center w-full">
        <input
          type="text"
          id="share-url"
          className={`${
            showQr ? 'hidden' : 'block'
          } w-full my-4 border-default rounded-lg leading-loose h-12 px-2 py-1 dark:bg-grey-80`}
          value={url}
          readOnly
        />
        <button
          type="button"
          id="qr-btn"
          className={`${showQr ? 'w-48' : 'w-16'} m-1 p-1`}
          onClick={() => setShowQr(!showQr)}
          title="QR code"
        >
          <QrCode url={url} />
        </button>
      </div>
      <button
        type="button"
        className="btn rounded-lg w-full flex-shrink-0 focus:outline"
        onClick={copy}
        title={translate('copyLinkButton')}
      >
        {translate(copied ? 'copiedUrl' : 'copyLinkButton')}
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
