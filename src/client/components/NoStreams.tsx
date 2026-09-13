import { useState } from 'react';
import type { FileInfo } from '../../core/fileReceiver.ts';
import { bytes } from '../../core/utils.ts';
import { sprite } from '../assets.ts';
import { copyToClipboard } from '../clipboard.ts';
import { useTranslate } from '../i18n/context.tsx';
import { useStore } from '../store.ts';

const FIREFOX_URL =
  'https://www.mozilla.org/firefox/new/?utm_campaign=send-acquisition&utm_medium=referral&utm_source=send.firefox.com';

type Choice = 'copy' | 'firefox' | 'download';

/**
 * Offered when the browser cannot stream a service-worker response and the file
 * is too large to buffer in memory.
 */
export function NoStreams({ fileInfo }: { fileInfo: FileInfo }) {
  const translate = useTranslate();
  const download = useStore(s => s.download);
  const [choice, setChoice] = useState<Choice>('copy');
  const [copied, setCopied] = useState(false);

  const buttonLabels: Record<Choice, string> = {
    copy: translate('copyLinkButton'),
    firefox: translate('downloadFirefox'),
    download: translate('downloadButtonLabel')
  };

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    switch (choice) {
      case 'copy':
        await copyToClipboard(window.location.href);
        setCopied(true);
        break;
      case 'firefox':
        window.open(FIREFOX_URL);
        break;
      case 'download':
        await download();
        break;
    }
  }

  return (
    <div className="flex flex-col w-full max-w-md h-full mx-auto items-center justify-center">
      <h1 className="mb-4 text-3xl font-bold">{translate('downloadTitle')}</h1>
      <p className="w-full p-2 border-default border-yellow-50 rounded-default md:w-4/5 text-orange-60 bg-yellow-40 text-center leading-normal">
        ⚠️ {translate('noStreamsWarning')} ⚠️
      </p>
      <form className="md:w-128" onSubmit={submit}>
        <fieldset className="border-default rounded-default p-4 my-4">
          <div className="flex items-center mb-2">
            <svg className="h-8 w-6 mr-3 flex-shrink-0 text-primary">
              <use xlinkHref={sprite('blue_file.svg', 'icon')} />
            </svg>
            <div className="flex-grow">
              <h1 className="text-base font-medium word-break-all">
                {fileInfo.name}
              </h1>
              <div className="text-sm font-normal opacity-75 pt-1">
                {bytes(fileInfo.size ?? 0)}
              </div>
            </div>
          </div>
          {(
            [
              ['copy', 'noStreamsOptionCopy'],
              ['firefox', 'noStreamsOptionFirefox'],
              ['download', 'noStreamsOptionDownload']
            ] as [Choice, string][]
          ).map(([value, label]) => (
            <div key={value} className="my-3">
              <input
                className="mx-2"
                type="radio"
                name="noStreamsChoice"
                id={value}
                value={value}
                checked={choice === value}
                onChange={() => {
                  setChoice(value);
                  setCopied(false);
                }}
              />
              <label htmlFor={value}>{translate(label)}</label>
            </div>
          ))}
        </fieldset>
        <input
          className="btn rounded-lg w-full flex flex-shrink-0 items-center justify-center"
          value={copied ? translate('copiedUrl') : buttonLabels[choice]}
          title={buttonLabels[choice]}
          type="submit"
        />
        <p className="text-grey-80 leading-normal dark:text-grey-40 font-semibold text-center md:my-8 md:text-left">
          {translate('downloadConfirmDescription')}
        </p>
      </form>
    </div>
  );
}
