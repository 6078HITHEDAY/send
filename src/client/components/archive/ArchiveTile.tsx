import { useState } from 'react';
import type OwnedFile from '../../../core/ownedFile.ts';
import { copyToClipboard } from '../../clipboard.ts';
import { asset, sprite } from '../../assets.ts';
import { useTranslate } from '../../i18n/context.tsx';
import { useStore } from '../../store.ts';
import { ArchiveDetails } from '../ArchiveDetails.tsx';
import { ArchiveInfo } from '../FileEntry.tsx';
import { expiryInfo } from './expiryInfo.ts';

/** One completed upload in the uploads list. */
export function ArchiveTile({ archive }: { archive: OwnedFile }) {
  const translate = useTranslate();
  const capabilities = useStore(s => s.capabilities);
  const deleteFile = useStore(s => s.deleteFile);
  const [copied, setCopied] = useState(false);

  async function share() {
    try {
      await navigator.share({
        title: translate('-send-brand'),
        text: translate('shareMessage', { name: archive.name }),
        url: archive.url
      });
    } catch {
      // the user dismissed the sheet
    }
  }

  function copy() {
    copyToClipboard(archive.url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1000);
  }

  return (
    <div
      id={`archive-${archive.id}`}
      className="flex flex-col items-start rounded-default shadow-light bg-white p-4 w-full dark:bg-grey-90 dark:border-default dark:border-grey-70"
    >
      <ArchiveInfo
        archive={archive}
        action={
          <input
            type="image"
            className="self-start flex-shrink-0 text-white hover:opacity-75 focus:outline"
            alt={translate('deleteButtonHover')}
            title={translate('deleteButtonHover')}
            src={asset('close-16.svg')}
            onClick={() => deleteFile(archive)}
          />
        }
      />
      <div className="text-sm opacity-75 w-full mt-2 mb-2">
        {expiryInfo(translate, archive)}
      </div>
      <ArchiveDetails manifest={archive.manifest} />
      <hr className="w-full border-t my-4 dark:border-grey-70" />
      <div className="flex justify-between w-full">
        <a
          className="flex items-baseline link-primary"
          href={archive.url}
          title={translate('downloadButtonLabel')}
        >
          <svg className="h-4 w-3 mr-2">
            <use xlinkHref={sprite('dl.svg', 'icon')} />
          </svg>
          {translate('downloadButtonLabel')}
        </a>
        {capabilities.share ? (
          <button
            type="button"
            className="link-primary self-end flex items-start"
            onClick={share}
            title={translate('shareLinkButton')}
          >
            <svg className="h-4 w-4 mr-2">
              <use xlinkHref={sprite('share-24.svg', 'icon')} />
            </svg>
            {translate('shareLinkButton')}
          </button>
        ) : (
          <button
            type="button"
            className="link-primary focus:outline self-end flex items-center"
            onClick={copy}
            title={translate('copyLinkButton')}
          >
            <svg className="h-4 w-4 mr-2">
              <use xlinkHref={sprite('copy-16.svg', 'icon')} />
            </svg>
            {translate(copied ? 'copiedUrl' : 'copyLinkButton')}
          </button>
        )}
      </div>
    </div>
  );
}
